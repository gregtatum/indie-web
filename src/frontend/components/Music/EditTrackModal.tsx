import * as React from 'react';
import { $$, A, Hooks, T } from 'frontend';
import { Modal } from 'frontend/components/Modal';
import { Tabs } from 'frontend/components/Tabs';
import { ArtworkTab } from './ArtworkTab';
import { TagsTab } from './TagsTab';
import {
  DETAIL_FIELDS,
  emptyDetailFieldValues,
  detailFieldValues,
  isSplitField,
  type TrackTagsLoadState,
  type DetailFieldValues,
} from 'frontend/logic/music/tags';
import type {
  TrackTagsResponse,
  WriteTrackTagsResponse,
} from 'shared/@types/shared';
import './EditTrackModal.css';

const GROUP_LABELS: Record<string, string> = {
  core: 'Identity',
  position: 'Position',
  classification: 'Classification',
  credits: 'Credits',
};

const BULK_LIVE_TAGS_CUTOFF = 200;
const BULK_TAG_FETCH_CONCURRENCY = 8;
const TEXT_MIXED_PLACEHOLDER = 'Mixed';
const NUMBER_MIXED_PLACEHOLDER = '–';

interface Props {
  trackPath: string | null;
  onClose: () => void;
}

type SaveStatus = 'idle' | 'saving' | 'error';
type BulkTagsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; tagsByPath: Map<string, TrackTagsResponse> }
  | { status: 'skipped' }
  | { status: 'error'; message: string };

interface DetailFormPresentation {
  values: DetailFieldValues;
  placeholders: DetailFieldValues;
}

function aggregateDetailFieldValues(
  tracks: T.TrackMetadata[],
  tagsByPath: Map<string, TrackTagsResponse> | null,
): DetailFormPresentation {
  const values = emptyDetailFieldValues();
  const placeholders = emptyDetailFieldValues();

  if (tracks.length === 0) {
    return { values, placeholders };
  }

  const perTrackValues = tracks.map((track) =>
    detailFieldValues(track, tagsByPath?.get(track.path) ?? null),
  );

  for (const field of DETAIL_FIELDS) {
    const keys = isSplitField(field)
      ? [field.key, field.totalKey]
      : [field.key];
    for (const key of keys) {
      const first = perTrackValues[0][key] ?? '';
      const isMixed = perTrackValues.some((trackValues) => {
        return (trackValues[key] ?? '') !== first;
      });
      if (isMixed) {
        values[key] = '';
        placeholders[key] = isSplitField(field)
          ? NUMBER_MIXED_PLACEHOLDER
          : TEXT_MIXED_PLACEHOLDER;
      } else {
        values[key] = first;
        placeholders[key] = '';
      }
    }
  }

  return { values, placeholders };
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const item = items[nextIndex] as T;
        nextIndex++;
        await fn(item);
      }
    },
  );
  await Promise.all(workers);
}

export function EditTrackModal({ trackPath, onClose }: Props) {
  const tracks = $$.getMusicTracks();
  const track = tracks.find((t) => t.path === trackPath) ?? null;
  const selectedTrackPaths = $$.getMusicSelectedTrackPaths();
  const isBulkEdit = selectedTrackPaths.length > 1;
  let editTracks: T.TrackMetadata[];
  if (isBulkEdit) {
    editTracks = tracks.filter((t) => selectedTrackPaths.includes(t.path));
  } else if (track) {
    editTracks = [track];
  } else {
    editTracks = [];
  }
  const server = $$.getCurrentServer();
  const activeTab = $$.getMusicEditTab();
  const needsRescan = $$.getMusicNeedsRescan();
  const dispatch = Hooks.useDispatch();

  const [formState, setFormState] = React.useState<DetailFieldValues>(
    emptyDetailFieldValues,
  );
  const [tagsState, setTagsState] = React.useState<TrackTagsLoadState>({
    status: 'loading',
  });
  const [baselineFormState, setBaselineFormState] =
    React.useState<DetailFieldValues>(emptyDetailFieldValues);
  const [formPlaceholders, setFormPlaceholders] =
    React.useState<DetailFieldValues>(emptyDetailFieldValues);
  const [bulkTagsState, setBulkTagsState] = React.useState<BulkTagsState>({
    status: 'idle',
  });
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>('idle');
  const [closeConfirmPending, setCloseConfirmPending] = React.useState(false);
  const tagRequestId = React.useRef(0);

  function setField(key: string, value: string) {
    setCloseConfirmPending(false);
    setFormState((prev) => ({ ...prev, [key]: value }));
  }

  const loadTrackTags = React.useCallback(async () => {
    if (!trackPath || isBulkEdit) {
      return;
    }
    const requestId = ++tagRequestId.current;
    setTagsState({ status: 'loading' });
    try {
      const res = await fetch(
        `${server.url}/music/track-tags?path=${encodeURIComponent(trackPath)}`,
      );
      if (!res.ok) {
        throw new Error(`${res.status} ${res.statusText}`);
      }
      const data = (await res.json()) as TrackTagsResponse;
      if (requestId === tagRequestId.current) {
        setTagsState({ status: 'loaded', data });
      }
    } catch (err: unknown) {
      if (requestId === tagRequestId.current) {
        setTagsState({
          status: 'error',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }
  }, [trackPath, server.url, isBulkEdit]);

  const bulkTrackKey = selectedTrackPaths.join('\0');

  const loadBulkTrackTags = React.useCallback(async () => {
    if (!isBulkEdit) {
      return;
    }
    const requestId = ++tagRequestId.current;
    const currentTracks = editTracks;

    if (currentTracks.length > BULK_LIVE_TAGS_CUTOFF) {
      const presentation = aggregateDetailFieldValues(currentTracks, null);
      setBulkTagsState({ status: 'skipped' });
      setBaselineFormState(presentation.values);
      setFormState(presentation.values);
      setFormPlaceholders(presentation.placeholders);
      return;
    }

    setBulkTagsState({ status: 'loading' });
    try {
      const tagsByPath = new Map<string, TrackTagsResponse>();
      await mapWithConcurrency(
        currentTracks,
        BULK_TAG_FETCH_CONCURRENCY,
        async (selectedTrack) => {
          const res = await fetch(
            `${server.url}/music/track-tags?path=${encodeURIComponent(
              selectedTrack.path,
            )}`,
          );
          if (!res.ok) {
            throw new Error(`${res.status} ${res.statusText}`);
          }
          tagsByPath.set(
            selectedTrack.path,
            (await res.json()) as TrackTagsResponse,
          );
        },
      );
      if (requestId === tagRequestId.current) {
        const presentation = aggregateDetailFieldValues(
          currentTracks,
          tagsByPath,
        );
        setBulkTagsState({ status: 'loaded', tagsByPath });
        setBaselineFormState(presentation.values);
        setFormState(presentation.values);
        setFormPlaceholders(presentation.placeholders);
      }
    } catch (err: unknown) {
      if (requestId === tagRequestId.current) {
        setBulkTagsState({
          status: 'error',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }
  }, [isBulkEdit, bulkTrackKey, server.url, tracks]);

  // Reset the form immediately from TrackMetadata when track changes
  React.useEffect(() => {
    const presentation = isBulkEdit
      ? aggregateDetailFieldValues(editTracks, null)
      : {
          values: detailFieldValues(track, null),
          placeholders: emptyDetailFieldValues(),
        };
    setFormState(presentation.values);
    setBaselineFormState(presentation.values);
    setFormPlaceholders(presentation.placeholders);
    setTagsState({ status: 'loading' });
    setBulkTagsState(isBulkEdit ? { status: 'loading' } : { status: 'idle' });
    setSaveStatus('idle');
    setCloseConfirmPending(false);
  }, [trackPath, bulkTrackKey, isBulkEdit]);

  // Load the ID3 tab frame values when opening or switching tracks.
  React.useEffect(() => {
    if (isBulkEdit) {
      void loadBulkTrackTags();
    } else {
      void loadTrackTags();
    }
    return () => {
      tagRequestId.current++;
    };
  }, [isBulkEdit, loadTrackTags, loadBulkTrackTags]);

  // Upgrade form state and baseline when tags load
  React.useEffect(() => {
    if (!isBulkEdit && tagsState.status === 'loaded') {
      const vals = detailFieldValues(track, tagsState.data);
      setBaselineFormState(vals);
      setFormState(vals);
      setFormPlaceholders(emptyDetailFieldValues());
    }
  }, [isBulkEdit, tagsState]);

  React.useEffect(() => {
    if (isBulkEdit && activeTab === 'id3') {
      dispatch(A.setMusicEditTab('details'));
    }
  }, [activeTab, dispatch, isBulkEdit]);

  const isDirty = React.useMemo(() => {
    for (const key of Object.keys(baselineFormState)) {
      if ((formState[key] ?? '') !== (baselineFormState[key] ?? '')) {
        return true;
      }
    }
    return false;
  }, [formState, baselineFormState]);

  function handleClose() {
    if (isDirty) {
      if (closeConfirmPending) {
        onClose();
      } else {
        setCloseConfirmPending(true);
      }
    } else {
      onClose();
    }
  }

  async function handleSave() {
    if (
      !trackPath ||
      isBulkEdit ||
      !isDirty ||
      saveStatus === 'saving' ||
      tagsState.status !== 'loaded'
    ) {
      return;
    }

    const changes: Array<{ frameId: string; value: string }> = [];
    for (const field of DETAIL_FIELDS) {
      if (isSplitField(field)) {
        const numVal = formState[field.key] ?? '';
        const totalVal = formState[field.totalKey] ?? '';
        const combined = totalVal ? `${numVal}/${totalVal}` : numVal;
        const baseNum = baselineFormState[field.key] ?? '';
        const baseTotal = baselineFormState[field.totalKey] ?? '';
        const baseCombined = baseTotal ? `${baseNum}/${baseTotal}` : baseNum;
        if (combined !== baseCombined) {
          changes.push({ frameId: field.frameId, value: combined });
        }
      } else {
        const current = formState[field.key] ?? '';
        const base = baselineFormState[field.key] ?? '';
        if (current !== base) {
          changes.push({ frameId: field.frameId, value: current });
        }
      }
    }
    if (changes.length === 0) {
      return;
    }

    setSaveStatus('saving');
    try {
      const res = await fetch(`${server.url}/music/write-track-tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: [trackPath], changes }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `${res.status}`);
      }
      await (res.json() as Promise<WriteTrackTagsResponse>);

      setBaselineFormState({ ...formState });
      setSaveStatus('idle');
      setCloseConfirmPending(false);

      // Patch Redux for fields that live in TrackMetadata. The server also
      // updates the durable music index as part of the tag write.
      const updatedTracks = tracks.map((t) => {
        if (t.path !== trackPath) {
          return t;
        }
        const updated = { ...t };
        for (const { frameId, value } of changes) {
          if (frameId === 'TIT2') {
            updated.title = value || null;
          } else if (frameId === 'TPE1') {
            updated.artist = value || null;
          } else if (frameId === 'TALB') {
            updated.album = value || null;
          } else if (frameId === 'TCON') {
            updated.genre = value || null;
          } else if (frameId === 'TRCK') {
            const num = parseInt(value.split('/')[0], 10);
            updated.track = isNaN(num) ? null : num;
          }
        }
        return updated;
      });
      dispatch(A.setMusicTracks(updatedTracks, needsRescan));
      await loadTrackTags();
    } catch {
      setSaveStatus('error');
    }
  }

  let sharedCoverArt: string | null = null;
  if (
    editTracks.length > 0 &&
    editTracks.every((t) => t.coverArt === editTracks[0].coverArt)
  ) {
    sharedCoverArt = editTracks[0].coverArt;
  }
  const hasMixedCoverArt =
    isBulkEdit &&
    editTracks.length > 0 &&
    !editTracks.every((t) => t.coverArt === editTracks[0].coverArt);
  const artUrl = sharedCoverArt
    ? `${server.url}/music/cover-art?path=${encodeURIComponent(sharedCoverArt)}`
    : null;
  const detailsEditingDisabled = isBulkEdit
    ? bulkTagsState.status === 'loading' || bulkTagsState.status === 'error'
    : tagsState.status !== 'loaded';

  // Build the Details panel by iterating detailFields
  let lastGroup: string | null = null;
  const detailRows: React.ReactNode[] = [];
  for (const field of DETAIL_FIELDS) {
    if (isBulkEdit && field.key === 'title') {
      continue;
    }
    if (field.group !== lastGroup) {
      detailRows.push(
        <div key={`group-${field.group}`} className="editTrackModalGroupHeader">
          {GROUP_LABELS[field.group]}
        </div>,
      );
      lastGroup = field.group;
    }

    if (isSplitField(field)) {
      detailRows.push(
        <label key={field.key} className="editTrackModalRow">
          <span className="editTrackModalLabel">{field.label}</span>
          <div className="editTrackModalSplitInput">
            <input
              className="editTrackModalInput editTrackModalSplitInput-num"
              type="text"
              inputMode="numeric"
              value={formState[field.key]}
              placeholder={formPlaceholders[field.key]}
              disabled={detailsEditingDisabled}
              onChange={(e) => setField(field.key, e.target.value)}
            />
            <span className="editTrackModalSplitSep">of</span>
            <input
              className="editTrackModalInput editTrackModalSplitInput-total"
              type="text"
              inputMode="numeric"
              value={formState[field.totalKey]}
              placeholder={formPlaceholders[field.totalKey]}
              disabled={detailsEditingDisabled}
              onChange={(e) => setField(field.totalKey, e.target.value)}
            />
          </div>
        </label>,
      );
    } else {
      detailRows.push(
        <label key={field.key} className="editTrackModalRow">
          <span className="editTrackModalLabel">{field.label}</span>
          <input
            className="editTrackModalInput"
            type="text"
            inputMode={field.type === 'number' ? 'numeric' : 'text'}
            value={formState[field.key]}
            placeholder={formPlaceholders[field.key]}
            disabled={detailsEditingDisabled}
            onChange={(e) => setField(field.key, e.target.value)}
          />
        </label>,
      );
    }
  }

  const tabs = [
    {
      id: 'details' as T.MusicEditTab,
      label: 'Details',
      panel: (
        <div className="editTrackModalDetails editTrackModalGrid">
          {detailRows}
        </div>
      ),
    },
    {
      id: 'artwork' as T.MusicEditTab,
      label: 'Artwork',
      panel:
        editTracks.length > 0 ? (
          <ArtworkTab
            artUrl={artUrl}
            coverArtPath={sharedCoverArt}
            emptyMessage={hasMixedCoverArt ? 'Mixed folder artwork' : undefined}
            hideEmbeddedArt={isBulkEdit}
            tagsState={
              isBulkEdit
                ? { status: 'loaded', data: { native: [] } }
                : tagsState
            }
            trackPath={editTracks[0].path}
            serverUrl={server.url}
          />
        ) : (
          <div className="editTrackModalArtwork">
            <div className="editTrackModalArtworkEmpty">No track selected</div>
          </div>
        ),
    },
    {
      id: 'id3' as T.MusicEditTab,
      label: 'ID3',
      disabled: isBulkEdit,
      disabledTitle: isBulkEdit
        ? 'ID3 is disabled for bulk editing'
        : undefined,
      panel: track ? (
        <TagsTab tagsState={tagsState} />
      ) : (
        <div className="editTrackModalTags">
          <div className="editTrackModalTagsLoading">No track selected</div>
        </div>
      ),
    },
  ];
  let saveButtonLabel = 'Save';
  if (saveStatus === 'saving') {
    saveButtonLabel = 'Saving…';
  } else if (saveStatus === 'error') {
    saveButtonLabel = 'Save failed — retry';
  }
  const effectiveActiveTab =
    isBulkEdit && activeTab === 'id3' ? 'details' : activeTab;

  return (
    <Modal isOpen={!!trackPath} onClose={handleClose}>
      <div className="music editTrackModal">
        <div className="editTrackModalHeader">
          <div className="editTrackModalHeaderTitle">
            {isBulkEdit
              ? `Edit ${editTracks.length} Tracks`
              : (track?.title ?? 'Unknown Title')}
          </div>
          {!isBulkEdit && track?.artist && (
            <div className="editTrackModalHeaderMeta">{track.artist}</div>
          )}
          {!isBulkEdit && track?.album && (
            <div className="editTrackModalHeaderMeta">{track.album}</div>
          )}
          {isBulkEdit && (
            <div className="editTrackModalHeaderMeta">
              {bulkTagsState.status === 'skipped'
                ? `Using indexed metadata for ${editTracks.length} selected tracks`
                : `${editTracks.length} selected tracks`}
            </div>
          )}
        </div>
        <Tabs
          tabs={tabs}
          activeTab={effectiveActiveTab}
          onChange={(id) => dispatch(A.setMusicEditTab(id as T.MusicEditTab))}
        />
        <div className="editTrackModalFooter">
          {closeConfirmPending && (
            <span className="editTrackModalCloseWarning">
              Close one more time to discard changes
            </span>
          )}
          <button
            type="button"
            className="editTrackModalSaveBtn"
            disabled={
              isBulkEdit ||
              !isDirty ||
              saveStatus === 'saving' ||
              tagsState.status !== 'loaded'
            }
            onClick={() => void handleSave()}
          >
            {saveButtonLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
