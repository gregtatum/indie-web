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
  WriteTrackTagsRequest,
  WriteTrackTagsResponse,
} from 'shared/@types/shared';
import './EditTrackModal.css';

const GROUP_LABELS: Record<string, string> = {
  core: 'Identity',
  position: 'Position',
  classification: 'Classification',
  notes: 'Notes',
};

const BULK_LIVE_TAGS_CUTOFF = 200;
const BULK_TAG_FETCH_CONCURRENCY = 6;
const BULK_PROGRESS_UPDATE_INTERVAL = 150;
export const BULK_SMALL_LOAD_NOTICE_DELAY = 1500;
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
type SaveNotice =
  | {
      type: 'partial-error';
      errors: WriteTrackTagsResponse['errors'];
      index: WriteTrackTagsResponse['index'];
      attemptedCount: number;
      updatedCount: number;
    }
  | { type: 'index-error'; index: WriteTrackTagsResponse['index'] }
  | { type: 'technical-error'; message: string };
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

function buildDetailChanges(
  formState: DetailFieldValues,
  baselineFormState: DetailFieldValues,
): Array<{ frameId: string; value: string }> {
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
  return changes;
}

function applyIndexedTrackChanges(
  track: T.TrackMetadata,
  changes: Array<{ frameId: string; value: string }>,
): T.TrackMetadata {
  const updated = { ...track };
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
  const editTracksRef = React.useRef<T.TrackMetadata[]>([]);
  editTracksRef.current = editTracks;
  // On refresh the URL selection can be restored before the music index has
  // loaded. This key changes when selected paths resolve to TrackMetadata rows,
  // which lets the form reset from real scan values without resetting on every
  // metadata update after a save.
  const resolvedEditTrackKey = editTracks
    .map((editTrack) => editTrack.path)
    .join('\u0000');
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
  const [showBulkLoadingNotice, setShowBulkLoadingNotice] =
    React.useState(false);
  const [bulkForceLoadAll, setBulkForceLoadAll] = React.useState(false);
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>('idle');
  const [saveNotice, setSaveNotice] = React.useState<SaveNotice | null>(null);
  const [showAllSaveErrors, setShowAllSaveErrors] = React.useState(false);
  const [closeConfirmPending, setCloseConfirmPending] = React.useState(false);
  const tagRequestId = React.useRef(0);
  const bulkAbortControllerRef = React.useRef<AbortController | null>(null);
  const bulkTagsByPathRef = React.useRef(new Map<string, TrackTagsResponse>());
  const bulkProgressRef = React.useRef({ loaded: 0, failed: 0, total: 0 });
  const bulkProgressRequestIdRef = React.useRef<number | null>(null);
  const bulkLoadingNoticeTimeoutRef = React.useRef<number | null>(null);
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
    clearBulkLoadingNoticeDelay();
    setShowBulkLoadingNotice(false);
  }

  function clearBulkLoadingNoticeDelay() {
    if (bulkLoadingNoticeTimeoutRef.current !== null) {
      window.clearTimeout(bulkLoadingNoticeTimeoutRef.current);
      bulkLoadingNoticeTimeoutRef.current = null;
    }
  }

  function scheduleBulkLoadingNotice(total: number) {
    clearBulkLoadingNoticeDelay();
    if (total < BULK_LIVE_TAGS_CUTOFF) {
      setShowBulkLoadingNotice(false);
      bulkLoadingNoticeTimeoutRef.current = window.setTimeout(() => {
        bulkLoadingNoticeTimeoutRef.current = null;
        setShowBulkLoadingNotice(true);
      }, BULK_SMALL_LOAD_NOTICE_DELAY);
    } else {
      setShowBulkLoadingNotice(true);
    }
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
    scheduleBulkLoadingNotice(editTracks.length);
    setBulkForceLoadAll(true);
  }

  function setField(key: DetailFieldValueKey, value: string) {
    setCloseConfirmPending(false);
    setSaveNotice(null);
    setShowAllSaveErrors(false);
    if (saveStatus === 'error') {
      setSaveStatus('idle');
    }
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
    const currentTracks = editTracksRef.current;
    abortBulkTagLoad();

    if (currentTracks.length > BULK_LIVE_TAGS_CUTOFF && !bulkForceLoadAll) {
      const presentation = aggregateDetailFieldValues(
        currentTracks,
        null,
        'index',
      );
      setBulkTagsState({ status: 'skipped' });
      setShowBulkLoadingNotice(false);
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
    scheduleBulkLoadingNotice(currentTracks.length);
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
          clearBulkLoadingNoticeDelay();
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
        clearBulkLoadingNoticeDelay();
        setShowBulkLoadingNotice(false);
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
        clearBulkLoadingNoticeDelay();
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
  }, [
    isBulkEdit,
    bulkTrackKey,
    resolvedEditTrackKey,
    bulkForceLoadAll,
    server.url,
  ]);

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
    setShowBulkLoadingNotice(false);
    setBulkForceLoadAll(false);
    abortBulkTagLoad();
    setSaveStatus('idle');
    setSaveNotice(null);
    setShowAllSaveErrors(false);
    setCloseConfirmPending(false);
  }, [trackPath, bulkTrackKey, resolvedEditTrackKey, isBulkEdit]);

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
  }, [isBulkEdit, tagsState, resolvedEditTrackKey]);

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

  async function handleSave(): Promise<boolean> {
    let savePaths: string[] = [];
    if (isBulkEdit) {
      savePaths = selectedTrackPaths;
    } else if (trackPath) {
      savePaths = [trackPath];
    }
    if (
      savePaths.length === 0 ||
      !isDirty ||
      saveStatus === 'saving' ||
      (!isBulkEdit && tagsState.status !== 'loaded') ||
      (isBulkEdit && bulkTagsState.status === 'loading')
    ) {
      return false;
    }

    const changes = buildDetailChanges(formState, baselineFormState);
    if (changes.length === 0) {
      return false;
    }

    setSaveStatus('saving');
    setSaveNotice(null);
    setShowAllSaveErrors(false);
    try {
      const body: WriteTrackTagsRequest = { paths: savePaths, changes };
      const res = await fetch(`${server.url}/music/write-track-tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `${res.status}`);
      }
      const data = await (res.json() as Promise<WriteTrackTagsResponse>);
      if (data.updated.length === 0) {
        setSaveStatus('error');
        setSaveNotice(
          data.errors.length > 0
            ? {
                type: 'partial-error',
                errors: data.errors,
                index: data.index,
                attemptedCount: savePaths.length,
                updatedCount: data.updated.length,
              }
            : {
                type: 'technical-error',
                message: 'The server did not update any tracks.',
              },
        );
        return false;
      }

      const updatedPathSet = new Set(data.updated);
      dispatch(
        A.setMusicTracks(
          tracks.map((t) =>
            updatedPathSet.has(t.path)
              ? applyIndexedTrackChanges(t, changes)
              : t,
          ),
          needsRescan,
        ),
      );

      if (data.errors.length > 0) {
        setSaveStatus('error');
        setSaveNotice({
          type: 'partial-error',
          errors: data.errors,
          index: data.index,
          attemptedCount: savePaths.length,
          updatedCount: data.updated.length,
        });
        return false;
      }

      setBaselineFormState({ ...formState });
      setSaveStatus('idle');
      setCloseConfirmPending(false);

      if (data.index.status === 'error') {
        setSaveNotice({ type: 'index-error', index: data.index });
      }
      if (!isBulkEdit) {
        await loadTrackTags();
      }
      return true;
    } catch (error) {
      setSaveStatus('error');
      setSaveNotice({
        type: 'technical-error',
        message:
          error instanceof Error ? error.message : 'Unable to save tags.',
      });
      return false;
    }
  }

  async function handleDetailsSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (await handleSave()) {
      onClose();
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
  const detailsNotices: React.ReactNode[] = [];
  if (isBulkEdit && bulkTagsState.status === 'skipped') {
    detailsNotices.push(
      <div
        key="index-skipped"
        className="editTrackModalIndexNotice"
        role="status"
      >
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
      </div>,
    );
  } else if (
    isBulkEdit &&
    bulkTagsState.status === 'loading' &&
    showBulkLoadingNotice
  ) {
    const progress =
      bulkTagsState.total === 0
        ? 0
        : (bulkTagsState.loaded / bulkTagsState.total) * 100;
    detailsNotices.push(
      <div
        key="bulk-loading"
        className="editTrackModalIndexNotice"
        role="status"
      >
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
      </div>,
    );
  } else if (isBulkEdit && bulkTagsState.status === 'error') {
    detailsNotices.push(
      <div key="bulk-error" className="editTrackModalIndexNotice" role="status">
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
      </div>,
    );
  }
  if (saveNotice) {
    let message: React.ReactNode;
    let details: React.ReactNode = null;
    if (saveNotice.type === 'partial-error') {
      const hiddenCount = saveNotice.errors.length - 3;
      const visibleErrors = showAllSaveErrors
        ? saveNotice.errors
        : saveNotice.errors.slice(0, 3);
      message = (
        <>
          Saved {saveNotice.updatedCount} of {saveNotice.attemptedCount} tracks.
          Could not save {saveNotice.errors.length} tracks.
        </>
      );
      details = (
        <>
          <ul className="editTrackModalNoticeList">
            {visibleErrors.map((error) => (
              <li key={`${error.path}:${error.message}`}>
                <span className="editTrackModalNoticePath">{error.path}</span>
                <span>{error.message}</span>
              </li>
            ))}
          </ul>
          {!showAllSaveErrors && hiddenCount > 0 && (
            <button
              type="button"
              className="editTrackModalIndexNoticeButton"
              onClick={() => setShowAllSaveErrors(true)}
            >
              Show all failed tracks
            </button>
          )}
          {saveNotice.index.status === 'error' && saveNotice.index.message && (
            <div className="editTrackModalNoticeHelp">
              Music index update failed: {saveNotice.index.message}
            </div>
          )}
        </>
      );
    } else if (saveNotice.type === 'index-error') {
      message = 'Tags were saved, but the library index was not updated.';
      details = (
        <div className="editTrackModalNoticeHelp">
          {saveNotice.index.message} Check the server logs, then scan the
          library if the list looks stale.
        </div>
      );
    } else {
      message = 'Could not save track details.';
      details = (
        <div className="editTrackModalNoticeHelp">
          {saveNotice.message} Check the browser console and server logs for the
          full error.
        </div>
      );
    }
    detailsNotices.push(
      <div
        key="save-notice"
        className="editTrackModalIndexNotice editTrackModalIndexNotice-error"
        role="status"
      >
        <div className="editTrackModalIndexNoticeLoading">
          <span className="editTrackModalIndexNoticeText">{message}</span>
          {details}
        </div>
      </div>,
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
        <form className="editTrackModalDetails" onSubmit={handleDetailsSubmit}>
          {detailsNotices}
          <div className="editTrackModalGrid">{detailRows}</div>
          <button type="submit" hidden />
        </form>
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
              !isDirty ||
              saveStatus === 'saving' ||
              (!isBulkEdit && tagsState.status !== 'loaded') ||
              (isBulkEdit && bulkTagsState.status === 'loading')
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
