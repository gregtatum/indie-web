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

interface Props {
  trackPath: string | null;
  onClose: () => void;
}

type SaveStatus = 'idle' | 'saving' | 'error';

export function EditTrackModal({ trackPath, onClose }: Props) {
  const tracks = $$.getMusicTracks();
  const track = tracks.find((t) => t.path === trackPath) ?? null;
  const server = $$.getCurrentServerOrNull();
  const activeTab = $$.getMusicEditTab();
  const dispatch = Hooks.useDispatch();

  const [formState, setFormState] = React.useState<DetailFieldValues>(
    emptyDetailFieldValues,
  );
  const [tagsState, setTagsState] = React.useState<TrackTagsLoadState>({
    status: 'loading',
  });
  const [baselineFormState, setBaselineFormState] =
    React.useState<DetailFieldValues>(emptyDetailFieldValues);
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>('idle');
  const [closeConfirmPending, setCloseConfirmPending] = React.useState(false);
  // Tracks whether the user has made any edits since the modal last opened/reset.
  // A ref (not state) so the tags-load effect always reads the latest value without
  // needing to be in its dependency array.
  const hasUserEdited = React.useRef(false);

  function setField(key: string, value: string) {
    hasUserEdited.current = true;
    setCloseConfirmPending(false);
    setFormState((prev) => ({ ...prev, [key]: value }));
  }

  // Reset the form immediately from TrackMetadata when track changes
  React.useEffect(() => {
    const vals = detailFieldValues(track, null);
    setFormState(vals);
    setBaselineFormState(vals);
    setTagsState({ status: 'loading' });
    setSaveStatus('idle');
    setCloseConfirmPending(false);
    hasUserEdited.current = false;
  }, [trackPath]);

  // Fetch tags once per track
  React.useEffect(() => {
    if (!trackPath || !server) {
      return () => {};
    }
    let cancelled = false;
    fetch(
      `${server.url}/music/track-tags?path=${encodeURIComponent(trackPath)}`,
    )
      .then((res) => {
        if (!res.ok) {
          throw new Error(`${res.status} ${res.statusText}`);
        }
        return res.json() as Promise<TrackTagsResponse>;
      })
      .then((data) => {
        if (!cancelled) {
          setTagsState({ status: 'loaded', data });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setTagsState({
            status: 'error',
            message: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [trackPath, server?.url]);

  // Upgrade form state and baseline when tags load
  React.useEffect(() => {
    if (tagsState.status === 'loaded') {
      const vals = detailFieldValues(track, tagsState.data);
      setBaselineFormState(vals);
      // Only sync formState to the full tag values if the user hasn't started editing.
      // The ref is always current so this check is race-free.
      if (!hasUserEdited.current) {
        setFormState(vals);
      }
    }
  }, [tagsState]);

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
    if (!server || !trackPath || !isDirty || saveStatus === 'saving') {
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
        body: JSON.stringify({ path: trackPath, changes }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `${res.status}`);
      }
      await (res.json() as Promise<WriteTrackTagsResponse>);

      setBaselineFormState({ ...formState });
      setSaveStatus('idle');
      setCloseConfirmPending(false);

      // Optimistically patch Redux for fields that live in TrackMetadata.
      // needsRescan:true surfaces the "Rescan recommended" button.
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
      dispatch(A.setMusicTracks(updatedTracks, true));
    } catch {
      setSaveStatus('error');
    }
  }

  const artUrl =
    server && track?.coverArt
      ? `${server.url}/music/cover-art?path=${encodeURIComponent(track.coverArt)}`
      : null;

  // Build the Details panel by iterating detailFields
  let lastGroup: string | null = null;
  const detailRows: React.ReactNode[] = [];
  for (const field of DETAIL_FIELDS) {
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
              onChange={(e) => setField(field.key, e.target.value)}
            />
            <span className="editTrackModalSplitSep">of</span>
            <input
              className="editTrackModalInput editTrackModalSplitInput-total"
              type="text"
              inputMode="numeric"
              value={formState[field.totalKey]}
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
        track && server ? (
          <ArtworkTab
            artUrl={artUrl}
            coverArtPath={track.coverArt ?? null}
            tagsState={tagsState}
            trackPath={track.path}
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

  return (
    <Modal isOpen={!!trackPath} onClose={handleClose}>
      <div className="music editTrackModal">
        <div className="editTrackModalHeader">
          <div className="editTrackModalHeaderTitle">
            {track?.title ?? 'Unknown Title'}
          </div>
          {track?.artist && (
            <div className="editTrackModalHeaderMeta">{track.artist}</div>
          )}
          {track?.album && (
            <div className="editTrackModalHeaderMeta">{track.album}</div>
          )}
        </div>
        <Tabs
          tabs={tabs}
          activeTab={activeTab}
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
              !isDirty ||
              saveStatus === 'saving' ||
              tagsState.status === 'loading'
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
