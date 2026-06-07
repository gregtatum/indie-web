import * as React from 'react';
import { $$, A, Hooks, T } from 'frontend';
import { Modal } from 'frontend/components/Modal';
import { Tabs } from 'frontend/components/Tabs';
import { throttle } from 'frontend/utils';
import { ArtworkTab } from './ArtworkTab';
import { TagsTab } from './TagsTab';
import {
  DETAIL_FIELDS,
  emptyDetailFieldValues,
  detailFieldValues,
  isSplitField,
  type DetailFieldValueKey,
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
const BULK_TAG_FETCH_CONCURRENCY = 6;
const BULK_PROGRESS_UPDATE_INTERVAL = 150;
const TEXT_MIXED_PLACEHOLDER = 'Mixed';
const NUMBER_MIXED_PLACEHOLDER = '–';
const NOT_LOADED_PLACEHOLDER = 'Not loaded';

const INDEXED_DETAIL_FIELD_KEYS: Partial<
  Record<DetailFieldValueKey, keyof T.TrackMetadata>
> = {
  title: 'title',
  artist: 'artist',
  album: 'album',
  genre: 'genre',
  trackNum: 'track',
} satisfies Partial<Record<DetailFieldValueKey, keyof T.TrackMetadata>>;

interface Props {
  trackPath: string | null;
  onClose: () => void;
}

type SaveStatus = 'idle' | 'saving' | 'error';
type BulkTagsState =
  | { status: 'idle' }
  | { status: 'loading'; loaded: number; total: number }
  | { status: 'loaded'; tagsByPath: Map<string, TrackTagsResponse> }
  | { status: 'skipped' }
  | { status: 'error'; failed: number; total: number };

interface DetailFormPresentation {
  values: DetailFieldValues;
  placeholders: DetailFieldValues;
}

function getIndexedDetailValue(
  track: T.TrackMetadata,
  key: DetailFieldValueKey,
): string | null {
  const metadataKey = INDEXED_DETAIL_FIELD_KEYS[key];
  if (!metadataKey) {
    return null;
  }
  const value = track[metadataKey];
  return value === null ? '' : String(value);
}

function aggregateDetailFieldValues(
  tracks: T.TrackMetadata[],
  tagsByPath: Map<string, TrackTagsResponse> | null,
  source: 'index' | 'tags',
): DetailFormPresentation {
  const values = emptyDetailFieldValues();
  const placeholders = emptyDetailFieldValues();

  if (tracks.length === 0) {
    return { values, placeholders };
  }

  const perTrackValues = tracks.map((track) => {
    if (source === 'tags') {
      return detailFieldValues(track, tagsByPath?.get(track.path) ?? null);
    }

    const indexedValues = emptyDetailFieldValues();
    for (const key of Object.keys(indexedValues) as DetailFieldValueKey[]) {
      const value = getIndexedDetailValue(track, key);
      if (value !== null) {
        indexedValues[key] = value;
      }
    }
    return indexedValues;
  });

  for (const field of DETAIL_FIELDS) {
    const keys = isSplitField(field)
      ? [field.key, field.totalKey]
      : [field.key];
    for (const key of keys) {
      if (
        source === 'index' &&
        getIndexedDetailValue(tracks[0], key) === null
      ) {
        values[key] = '';
        placeholders[key] = NOT_LOADED_PLACEHOLDER;
        continue;
      }
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
  signal: AbortSignal,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIndex < items.length) {
        if (signal.aborted) {
          return;
        }
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
  const [bulkForceLoadAll, setBulkForceLoadAll] = React.useState(false);
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>('idle');
  const [closeConfirmPending, setCloseConfirmPending] = React.useState(false);
  const tagRequestId = React.useRef(0);
  const bulkAbortControllerRef = React.useRef<AbortController | null>(null);
  const bulkTagsByPathRef = React.useRef(new Map<string, TrackTagsResponse>());
  const bulkProgressRef = React.useRef({ loaded: 0, failed: 0, total: 0 });
  const bulkProgressRequestIdRef = React.useRef<number | null>(null);
  const bulkProgressCommit = React.useMemo(
    () =>
      throttle((requestId: number) => {
        if (
          requestId !== tagRequestId.current ||
          requestId !== bulkProgressRequestIdRef.current
        ) {
          return;
        }
        const { loaded, total } = bulkProgressRef.current;
        setBulkTagsState({ status: 'loading', loaded, total });
      }, BULK_PROGRESS_UPDATE_INTERVAL),
    [],
  );

  function abortBulkTagLoad() {
    bulkAbortControllerRef.current?.abort();
    bulkAbortControllerRef.current = null;
    bulkProgressRequestIdRef.current = null;
  }

  function getIndexDetailPresentation() {
    return aggregateDetailFieldValues(editTracks, null, 'index');
  }

  function resetBulkFormFromIndex() {
    const presentation = getIndexDetailPresentation();
    setBaselineFormState(presentation.values);
    setFormState(presentation.values);
    setFormPlaceholders(presentation.placeholders);
    setCloseConfirmPending(false);
  }

  function startBulkTagLoad() {
    abortBulkTagLoad();
    resetBulkFormFromIndex();
    bulkTagsByPathRef.current = new Map();
    bulkProgressRef.current = {
      loaded: 0,
      failed: 0,
      total: editTracks.length,
    };
    setBulkTagsState({
      status: 'loading',
      loaded: 0,
      total: editTracks.length,
    });
    setBulkForceLoadAll(true);
  }

  function setField(key: DetailFieldValueKey, value: string) {
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
    abortBulkTagLoad();

    if (currentTracks.length > BULK_LIVE_TAGS_CUTOFF && !bulkForceLoadAll) {
      const presentation = aggregateDetailFieldValues(
        currentTracks,
        null,
        'index',
      );
      setBulkTagsState({ status: 'skipped' });
      setBaselineFormState(presentation.values);
      setFormState(presentation.values);
      setFormPlaceholders(presentation.placeholders);
      return;
    }

    const abortController = new AbortController();
    bulkAbortControllerRef.current = abortController;
    bulkProgressRequestIdRef.current = requestId;
    bulkTagsByPathRef.current = new Map();
    bulkProgressRef.current = {
      loaded: 0,
      failed: 0,
      total: currentTracks.length,
    };
    setBulkTagsState({
      status: 'loading',
      loaded: 0,
      total: currentTracks.length,
    });
    try {
      await mapWithConcurrency(
        currentTracks,
        BULK_TAG_FETCH_CONCURRENCY,
        abortController.signal,
        async (selectedTrack) => {
          try {
            const res = await fetch(
              `${server.url}/music/track-tags?path=${encodeURIComponent(
                selectedTrack.path,
              )}`,
              { signal: abortController.signal },
            );
            if (!res.ok) {
              throw new Error(`${res.status} ${res.statusText}`);
            }
            bulkTagsByPathRef.current.set(
              selectedTrack.path,
              (await res.json()) as TrackTagsResponse,
            );
          } catch (err: unknown) {
            if (
              err instanceof Error &&
              (err.name === 'AbortError' || abortController.signal.aborted)
            ) {
              throw err;
            }
            bulkProgressRef.current.failed++;
          } finally {
            if (!abortController.signal.aborted) {
              bulkProgressRef.current.loaded++;
              bulkProgressCommit(requestId);
            }
          }
        },
      );
      if (requestId === tagRequestId.current) {
        if (abortController.signal.aborted) {
          return;
        }
        if (bulkProgressRef.current.failed > 0) {
          bulkProgressRequestIdRef.current = null;
          setBulkTagsState({
            status: 'error',
            failed: bulkProgressRef.current.failed,
            total: currentTracks.length,
          });
          resetBulkFormFromIndex();
          return;
        }
        const tagsByPath = bulkTagsByPathRef.current;
        const presentation = aggregateDetailFieldValues(
          currentTracks,
          tagsByPath,
          'tags',
        );
        bulkProgressRequestIdRef.current = null;
        setBulkTagsState({ status: 'loaded', tagsByPath });
        setBaselineFormState(presentation.values);
        setFormState(presentation.values);
        setFormPlaceholders(presentation.placeholders);
      }
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        (err.name === 'AbortError' || abortController.signal.aborted)
      ) {
        return;
      }
      if (requestId === tagRequestId.current) {
        bulkProgressRequestIdRef.current = null;
        setBulkTagsState({
          status: 'error',
          failed: Math.max(1, bulkProgressRef.current.failed),
          total: currentTracks.length,
        });
        resetBulkFormFromIndex();
      }
    } finally {
      if (bulkAbortControllerRef.current === abortController) {
        bulkAbortControllerRef.current = null;
      }
    }
  }, [isBulkEdit, bulkTrackKey, bulkForceLoadAll, server.url, tracks]);

  // Reset the form immediately from TrackMetadata when track changes
  React.useEffect(() => {
    const presentation = isBulkEdit
      ? aggregateDetailFieldValues(editTracks, null, 'index')
      : {
          values: detailFieldValues(track, null),
          placeholders: emptyDetailFieldValues(),
        };
    setFormState(presentation.values);
    setBaselineFormState(presentation.values);
    setFormPlaceholders(presentation.placeholders);
    setTagsState({ status: 'loading' });
    setBulkTagsState(
      isBulkEdit
        ? { status: 'loading', loaded: 0, total: editTracks.length }
        : { status: 'idle' },
    );
    setBulkForceLoadAll(false);
    abortBulkTagLoad();
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
      abortBulkTagLoad();
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
    for (const key of Object.keys(baselineFormState) as DetailFieldValueKey[]) {
      if ((formState[key] ?? '') !== (baselineFormState[key] ?? '')) {
        return true;
      }
    }
    return false;
  }, [formState, baselineFormState]);

  function handleClose() {
    if (bulkTagsState.status === 'loading') {
      abortBulkTagLoad();
      onClose();
      return;
    }
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
    ? bulkTagsState.status === 'loading'
    : tagsState.status !== 'loaded';
  let detailsIndexNotice: React.ReactNode = null;
  if (isBulkEdit && bulkTagsState.status === 'skipped') {
    detailsIndexNotice = (
      <div className="editTrackModalIndexNotice" role="status">
        <span className="editTrackModalIndexNoticeText">
          Using track details from the library scan.
        </span>
        <button
          type="button"
          className="editTrackModalIndexNoticeButton"
          onClick={startBulkTagLoad}
        >
          Load all {editTracks.length} tracks
        </button>
      </div>
    );
  } else if (isBulkEdit && bulkTagsState.status === 'loading') {
    const progress =
      bulkTagsState.total === 0
        ? 0
        : (bulkTagsState.loaded / bulkTagsState.total) * 100;
    detailsIndexNotice = (
      <div className="editTrackModalIndexNotice" role="status">
        <div className="editTrackModalIndexNoticeLoading">
          <span className="editTrackModalIndexNoticeText">
            Loading ID3 tags: {bulkTagsState.loaded} / {bulkTagsState.total}
          </span>
          <div className="editTrackModalLoadProgress" aria-hidden="true">
            <div
              className="editTrackModalLoadProgressFill"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    );
  } else if (isBulkEdit && bulkTagsState.status === 'error') {
    detailsIndexNotice = (
      <div className="editTrackModalIndexNotice" role="status">
        <span className="editTrackModalIndexNoticeText">
          Could not load ID3 tags for {bulkTagsState.failed} tracks.
        </span>
        <button
          type="button"
          className="editTrackModalIndexNoticeButton"
          onClick={startBulkTagLoad}
        >
          Retry
        </button>
      </div>
    );
  }

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
        <div className="editTrackModalDetails">
          {detailsIndexNotice}
          <div className="editTrackModalGrid">{detailRows}</div>
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
              {editTracks.length} selected tracks
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
