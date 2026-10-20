import * as React from 'react';
import * as Router from 'react-router-dom';
import { $$, A, Hooks, T } from 'frontend';
import { Tabs } from 'frontend/components/Tabs';
import { throttle } from 'shared/utils';
import { getDirName, getGeneration, getPathFileName } from 'frontend/utils';
import { ArtworkTab, type PendingArtwork } from './ArtworkTab';
import { FileTab } from './FileTab';
import {
  DETAIL_FIELDS,
  emptyDetailFieldValues,
  detailFieldValues,
  isSplitField,
  type DetailFormValueKey,
  type DetailFieldGroup,
  type TrackTagsLoadState,
  type DetailFieldValues,
  type MusicTrackSource,
} from 'frontend/logic/music/metadata';
import {
  defaultPreferComposerGroupingForGenre,
  getAlbumArtworkKey,
  getTrackCapabilities,
  serializePreferComposerGroupingTag,
} from 'shared/music';
import type {
  TrackTagsResponse,
  WriteFolderArtworkResponse,
} from 'shared/@types/shared';
import { useSaveTrackTags } from 'frontend/hooks/music';
import './EditTrackModal.css';

const DETAIL_GROUP_ORDER: DetailFieldGroup[] = [
  'core',
  'position',
  'classification',
  'notes',
];

const BULK_LIVE_TAGS_CUTOFF = 200;
const BULK_TAG_FETCH_CONCURRENCY = 6;
const BULK_PROGRESS_UPDATE_INTERVAL = 150;
export const BULK_SMALL_LOAD_NOTICE_DELAY = 1500;
const TEXT_MIXED_PLACEHOLDER = 'Mixed';
const UNSUPPORTED_FRAME_TITLE = 'Not supported for this file type.';
const NUMBER_MIXED_PLACEHOLDER = '–';
const NOT_LOADED_PLACEHOLDER = 'Not loaded';

const INDEXED_DETAIL_FIELD_KEYS: Partial<
  Record<DetailFormValueKey, keyof T.TrackMetadata>
> = {
  title: 'title',
  artist: 'artist',
  albumArtist: 'albumArtist',
  album: 'album',
  genre: 'genre',
  trackNum: 'track',
} satisfies Partial<Record<DetailFormValueKey, keyof T.TrackMetadata>>;

export interface TrackEditorPanelProps {
  trackPath: string | null;
  onClose: (() => void) | null;
  trackSource: MusicTrackSource;
}

export interface TrackEditorPanelHandle {
  requestClose(): void;
}

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
  key: DetailFormValueKey,
): string | null {
  if (key === 'preferComposerGrouping') {
    return track.preferComposerGrouping === null
      ? 'auto'
      : String(track.preferComposerGrouping);
  }
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
    for (const key of Object.keys(indexedValues) as DetailFormValueKey[]) {
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
): T.TrackTagUpdate[] {
  const changes: T.TrackTagUpdate[] = [];
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
  const currentPreferComposer = formState.preferComposerGrouping;
  const baselinePreferComposer = baselineFormState.preferComposerGrouping;
  if (currentPreferComposer !== baselinePreferComposer) {
    const tag = serializePreferComposerGroupingTag(
      currentPreferComposer === 'true' ? 'true' : 'false',
    );
    changes.push({
      frameId: 'TXXX',
      description: tag.description,
      value: tag.value,
    });
  }
  return changes;
}

export const TrackEditorPanel = React.forwardRef<
  TrackEditorPanelHandle,
  TrackEditorPanelProps
>(function TrackEditorPanel({ trackPath, onClose, trackSource }, ref) {
  const { tracks, updateTracks, removeTracks } = trackSource;
  const isStagingSource = Boolean(removeTracks);
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
  const trackCapabilities = editTracks.map((editTrack) =>
    getTrackCapabilities(editTrack.path),
  );
  function isFrameWritable(frameId: string): boolean {
    return trackCapabilities.every((capabilities) =>
      capabilities.writableFrameIds.includes(frameId),
    );
  }
  // On refresh the URL selection can be restored before the music index has
  // loaded. This key changes when selected paths resolve to TrackMetadata rows,
  // which lets the form reset from real scan values without resetting on every
  // metadata update after a save.
  const resolvedEditTrackKey = editTracks
    .map((editTrack) => editTrack.path)
    .sort()
    .join('\u0000');
  const server = $$.getCurrentServer();
  const activeTab = $$.getMusicEditTab();
  const folderArtworkVersion = $$.getMusicFolderArtworkVersion();
  const fsSlug = $$.getCurrentFileStoreSlug();
  const navigate = Router.useNavigate();
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
  const [isSaving, setIsSaving] = React.useState(false);
  const [fieldStatus, setFieldStatus] = React.useState<
    Partial<Record<DetailFormValueKey, 'saving' | 'error'>>
  >({});
  const isImmediate = !onClose;
  const formStateRef = React.useRef(formState);
  formStateRef.current = formState;
  const baselineFormStateRef = React.useRef(baselineFormState);
  baselineFormStateRef.current = baselineFormState;
  const commitQueueRef = React.useRef<Promise<void>>(Promise.resolve());
  const pendingCommitsRef = React.useRef(0);
  const failureMessageGeneration = React.useRef(getGeneration());
  const saveTrackTags = useSaveTrackTags(trackSource);
  const [closeConfirmPending, setCloseConfirmPending] = React.useState(false);
  const [pendingArtwork, setPendingArtwork] =
    React.useState<PendingArtwork | null>(null);
  const [undoneArtwork, setUndoneArtwork] =
    React.useState<PendingArtwork | null>(null);
  const artworkPreviewUrls = React.useRef<string[]>([]);
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
    bulkProgressCommit.cancel();
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

  function setNumericField(key: DetailFormValueKey, value: string) {
    setField(key, value.replace(/[^0-9]/g, ''));
  }

  function setField(key: DetailFormValueKey, value: string) {
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
    setIsSaving(false);
    setCloseConfirmPending(false);
    setPendingArtwork(null);
    setUndoneArtwork(null);
    revokeArtworkPreviews();
  }, [trackPath, bulkTrackKey, resolvedEditTrackKey, isBulkEdit]);

  React.useEffect(() => revokeArtworkPreviews, []);

  function revokeArtworkPreviews() {
    artworkPreviewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    artworkPreviewUrls.current = [];
  }

  // Load the Tags tab frame values when opening or switching tracks.
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

  const indexPresentation = React.useMemo(
    () =>
      isBulkEdit
        ? aggregateDetailFieldValues(editTracks, null, 'index')
        : {
            values: detailFieldValues(track, null),
            placeholders: emptyDetailFieldValues(),
          },
    [tracks, track, bulkTrackKey, isBulkEdit],
  );
  const indexSnapshotRef = React.useRef<{
    selectionKey: string;
    values: DetailFieldValues;
  } | null>(null);

  // Pick up index changes made elsewhere, like the batch edit grid. Dirty
  // fields keep what was typed and only rebase against the new value.
  React.useEffect(() => {
    const selectionKey = [
      trackPath,
      bulkTrackKey,
      resolvedEditTrackKey,
      isBulkEdit,
    ].join('\0');
    const previous = indexSnapshotRef.current;
    indexSnapshotRef.current = {
      selectionKey,
      values: indexPresentation.values,
    };
    const isLoaded = isBulkEdit
      ? bulkTagsState.status !== 'loading'
      : tagsState.status === 'loaded';
    if (!previous || previous.selectionKey !== selectionKey || !isLoaded) {
      return;
    }
    if (isSaving) {
      return;
    }
    const changedKeys = (
      Object.keys(indexPresentation.values) as DetailFormValueKey[]
    ).filter(
      (key) =>
        (previous.values[key] ?? '') !== (indexPresentation.values[key] ?? ''),
    );
    if (changedKeys.length === 0) {
      return;
    }
    setFormState((prev) => {
      const next = { ...prev };
      for (const key of changedKeys) {
        if ((prev[key] ?? '') === (baselineFormState[key] ?? '')) {
          next[key] = indexPresentation.values[key];
        }
      }
      return next;
    });
    setBaselineFormState((prev) => {
      const next = { ...prev };
      for (const key of changedKeys) {
        next[key] = indexPresentation.values[key];
      }
      return next;
    });
    setFormPlaceholders((prev) => {
      const next = { ...prev };
      for (const key of changedKeys) {
        next[key] = indexPresentation.placeholders[key];
      }
      return next;
    });
  }, [indexPresentation]);

  React.useEffect(() => {
    if (isBulkEdit && activeTab === 'id3') {
      dispatch(A.setMusicEditTab('details'));
    }
  }, [activeTab, dispatch, isBulkEdit]);

  const hasTagChanges = React.useMemo(() => {
    for (const key of Object.keys(baselineFormState) as DetailFormValueKey[]) {
      if ((formState[key] ?? '') !== (baselineFormState[key] ?? '')) {
        return true;
      }
    }
    return false;
  }, [formState, baselineFormState]);
  const isDirty = hasTagChanges || pendingArtwork !== null;

  function handleClose() {
    if (!onClose) {
      return;
    }
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

  React.useImperativeHandle(ref, () => ({ requestClose: handleClose }));

  async function writeArtwork(artwork: PendingArtwork) {
    const res = await fetch(
      `${server.url}/music/artwork?path=${encodeURIComponent(editTracks[0]?.path)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': artwork.contentType },
        body: artwork.data,
      },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `${res.status}`);
    }
    const written = await (res.json() as Promise<WriteFolderArtworkResponse>);
    if (written.folderArtworkPath) {
      handleFolderArtworkWritten(written.folderArtworkPath);
    }
    dispatch(A.musicFolderArtworkSaveSuccess());
  }

  async function writeArtworkImmediately(artwork: PendingArtwork) {
    dispatch(A.dismissMessage(failureMessageGeneration.current));
    try {
      await writeArtwork(artwork);
    } catch (error) {
      dispatch(
        A.addMessage({
          message: `Could not save artwork. ${error instanceof Error ? error.message : ''}`,
          generation: failureMessageGeneration.current,
        }),
      );
    } finally {
      URL.revokeObjectURL(artwork.previewUrl);
    }
  }

  function updateImmediateBaseline(
    keys: DetailFormValueKey[],
    values: DetailFieldValues,
  ) {
    const next = { ...baselineFormStateRef.current };
    for (const key of keys) {
      next[key] = values[key];
    }
    baselineFormStateRef.current = next;
    setBaselineFormState(next);
  }

  async function writeFormChanges(paths: string[]) {
    const form = formStateRef.current;
    const baseline = baselineFormStateRef.current;
    const changes = buildDetailChanges(form, baseline);
    if (changes.length === 0) {
      return;
    }
    const changedKeys = (Object.keys(form) as DetailFormValueKey[]).filter(
      (key) => (form[key] ?? '') !== (baseline[key] ?? ''),
    );
    const setStatus = (status: 'saving' | 'error' | null) =>
      setFieldStatus((prev) => {
        const next = { ...prev };
        for (const key of changedKeys) {
          if (status) {
            next[key] = status;
          } else {
            delete next[key];
          }
        }
        return next;
      });
    dispatch(A.dismissMessage(failureMessageGeneration.current));
    setStatus('saving');
    const { isSaved } = await saveTrackTags(
      paths,
      changes,
      failureMessageGeneration.current,
    );
    if (isSaved) {
      updateImmediateBaseline(changedKeys, form);
      setStatus(null);
    } else {
      setStatus('error');
    }
  }

  function commitFormChanges() {
    const paths = getSavePaths();
    if (!isImmediate || paths.length === 0 || detailsEditingDisabled) {
      return;
    }
    pendingCommitsRef.current++;
    setIsSaving(true);
    commitQueueRef.current = commitQueueRef.current.then(async () => {
      try {
        await writeFormChanges(paths);
      } finally {
        pendingCommitsRef.current--;
        if (pendingCommitsRef.current === 0) {
          setIsSaving(false);
        }
      }
    });
  }

  function getSavePaths(): string[] {
    if (isBulkEdit) {
      return selectedTrackPaths;
    }
    return trackPath ? [trackPath] : [];
  }

  function revertFormChanges() {
    formStateRef.current = baselineFormStateRef.current;
    setFormState(baselineFormStateRef.current);
    setFieldStatus({});
  }

  async function handleSave() {
    const savePaths = getSavePaths();
    if (
      savePaths.length === 0 ||
      !isDirty ||
      isSaving ||
      (!isBulkEdit && tagsState.status !== 'loaded') ||
      (isBulkEdit && bulkTagsState.status === 'loading')
    ) {
      return;
    }

    const changes = buildDetailChanges(formState, baselineFormState);
    if (changes.length === 0 && !pendingArtwork) {
      return;
    }

    setIsSaving(true);
    const savedFormState = { ...formState };
    const artwork = pendingArtwork;
    dispatch(A.dismissMessage(failureMessageGeneration.current));
    try {
      if (artwork) {
        await writeArtwork(artwork);
        setPendingArtwork(null);
        setUndoneArtwork(null);
        revokeArtworkPreviews();
      }
      if (changes.length > 0) {
        const { isSaved } = await saveTrackTags(
          savePaths,
          changes,
          failureMessageGeneration.current,
        );
        if (!isSaved) {
          return;
        }
        setBaselineFormState(savedFormState);
        if (!isBulkEdit && !onClose) {
          await loadTrackTags();
        }
      }
      setCloseConfirmPending(false);
      onClose?.();
    } catch (error) {
      dispatch(
        A.addMessage({
          message: `Could not save track details. ${error instanceof Error ? error.message : ''}`,
          generation: failureMessageGeneration.current,
        }),
      );
    } finally {
      setIsSaving(false);
    }
  }

  function handleDetailsSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isImmediate) {
      commitFormChanges();
    } else {
      void handleSave();
    }
  }

  const selectionDir =
    editTracks.length > 0 ? getDirName(editTracks[0].path) : null;
  const stagedAlbumKeys = new Set(editTracks.map(getAlbumArtworkKey));
  const isOneStagedAlbum =
    editTracks.length > 0 &&
    (editTracks.length === 1 ||
      (stagedAlbumKeys.size === 1 && !stagedAlbumKeys.has(null)));
  const isColocatedSelection = isStagingSource
    ? isOneStagedAlbum
    : editTracks.length > 0 &&
      editTracks.every((t) => getDirName(t.path) === selectionDir);
  const canEmbedFolderArtwork = !isBulkEdit || isColocatedSelection;
  const canEditFolderArtwork = canEmbedFolderArtwork;

  let sharedFolderArtworkPath: string | null = null;
  if (
    editTracks.length > 0 &&
    editTracks.every(
      (t) => t.folderArtworkPath === editTracks[0].folderArtworkPath,
    )
  ) {
    sharedFolderArtworkPath = editTracks[0].folderArtworkPath;
  }
  const hasMixedFolderArtwork =
    isBulkEdit &&
    editTracks.length > 0 &&
    !editTracks.every(
      (t) => t.folderArtworkPath === editTracks[0].folderArtworkPath,
    );
  const folderArtworkUrl = sharedFolderArtworkPath
    ? `${server.url}/music/artwork?path=${encodeURIComponent(sharedFolderArtworkPath)}`
    : null;
  // Album MP3s that do not yet carry the folder image as embedded art, so the
  // artwork tab can offer to embed it into them.
  const embeddableTrackPaths = React.useMemo(() => {
    if (!sharedFolderArtworkPath) {
      return [];
    }
    if (isBulkEdit && !isColocatedSelection) {
      return [];
    }
    const candidateTracks = isStagingSource ? editTracks : tracks;
    return candidateTracks
      .filter(
        (t) =>
          !t.hasEmbeddedArtwork &&
          t.folderArtworkPath === sharedFolderArtworkPath &&
          getTrackCapabilities(t.path).embedsArtwork,
      )
      .map((t) => t.path);
  }, [
    isBulkEdit,
    isColocatedSelection,
    isStagingSource,
    sharedFolderArtworkPath,
    tracks,
    editTracks,
  ]);
  const setStagedAlbumArtwork = React.useCallback(
    (folderArtworkPath: string | null) => {
      const [edited] = editTracksRef.current;
      if (!edited) {
        return;
      }
      const key = getAlbumArtworkKey(edited);
      function isInEditedAlbum(t: T.TrackMetadata): boolean {
        if (key === null) {
          return t.path === edited.path;
        }
        return getAlbumArtworkKey(t) === key;
      }
      updateTracks(
        tracks.map((t) => {
          if (isInEditedAlbum(t)) {
            return { ...t, folderArtworkPath };
          }
          return t;
        }),
      );
    },
    [updateTracks, tracks],
  );
  // Neither the folder artwork write nor the embed touches the music index, so
  // patch the store to keep the tab (and library) current until the next scan.
  const handleFolderArtworkWritten = React.useCallback(
    (folderArtworkPath: string) => {
      if (isStagingSource) {
        setStagedAlbumArtwork(folderArtworkPath);
        return;
      }
      const folderDir = getDirName(folderArtworkPath);
      updateTracks(
        tracks.map((t) =>
          getDirName(t.path) === folderDir ? { ...t, folderArtworkPath } : t,
        ),
      );
    },
    [updateTracks, tracks, isStagingSource, setStagedAlbumArtwork],
  );
  const handleFolderArtworkRemoved = React.useCallback(() => {
    if (isStagingSource) {
      setStagedAlbumArtwork(null);
    }
  }, [isStagingSource, setStagedAlbumArtwork]);
  const handleTracksEmbedded = React.useCallback(
    (embeddedPaths: string[]) => {
      const embedded = new Set(embeddedPaths);
      updateTracks(
        tracks.map((t) =>
          embedded.has(t.path) ? { ...t, hasEmbeddedArtwork: true } : t,
        ),
      );
      void loadTrackTags();
    },
    [updateTracks, tracks, loadTrackTags],
  );
  const handleEmbeddedArtworkRemoved = React.useCallback(
    (removedPath: string) => {
      updateTracks(
        tracks.map((t) =>
          t.path === removedPath ? { ...t, hasEmbeddedArtwork: false } : t,
        ),
      );
      // The remove endpoint strips the file's embedded APIC picture frames.
      // Drop them from the already-loaded tags in place so the panel flips to
      // the "Embed artwork" prompt the moment the write returns, instead of
      // flashing through a loading state on a second round trip.
      setTagsState((prev) => {
        if (prev.status !== 'loaded') {
          return prev;
        }

        const blocks = prev.data.blocks.map((block) => ({
          ...block,
          tags: block.tags.filter(
            (tag) =>
              !(
                tag.id === 'APIC' &&
                tag.binary !== undefined &&
                !tag.value.startsWith('-->')
              ),
          ),
        }));

        return { status: 'loaded', data: { ...prev.data, blocks } };
      });
    },
    [updateTracks, tracks],
  );
  let sharedAlbumHeader: { album: string; artist: string } | null = null;
  if (isBulkEdit && editTracks.length > 0) {
    const firstAlbum = editTracks[0].album;
    if (firstAlbum && editTracks.every((t) => t.album === firstAlbum)) {
      const firstAlbumArtist = editTracks[0].albumArtist;
      const firstArtist = editTracks[0].artist;
      let artist = 'Various Artists';
      if (
        firstAlbumArtist &&
        editTracks.every((t) => t.albumArtist === firstAlbumArtist)
      ) {
        artist = firstAlbumArtist;
      } else if (
        firstArtist &&
        editTracks.every((t) => t.artist === firstArtist)
      ) {
        artist = firstArtist;
      }
      sharedAlbumHeader = {
        album: firstAlbum,
        artist,
      };
    }
  }
  const artworkArtistHint = sharedAlbumHeader
    ? sharedAlbumHeader.artist
    : (track?.albumArtist ?? track?.artist ?? undefined);
  const artworkAlbumHint = sharedAlbumHeader
    ? sharedAlbumHeader.album
    : (track?.album ?? undefined);
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
            Loading tags: {bulkTagsState.loaded} / {bulkTagsState.total}
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
          Could not load tags for {bulkTagsState.failed} tracks.
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
  const detailRows: React.ReactNode[] = [];

  let pathLink: React.ReactNode = null;
  if (!isBulkEdit && editTracks.length > 0) {
    const filePath = editTracks[0].path;
    const folder = getDirName(filePath) || '/';
    const href = `/${fsSlug}/folder${folder}`;
    pathLink = (
      <a
        className="editTrackModalPathLink"
        href={href}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
            return;
          }
          e.preventDefault();
          dispatch(A.changeFileFocus(folder, getPathFileName(filePath)));
          navigate(href);
        }}
      >
        {filePath}
      </a>
    );
  }

  const radioName = 'preferComposerGrouping';
  const defaultPreferComposerGrouping = defaultPreferComposerGroupingForGenre(
    formState.genre ?? '',
  );
  const radioValue = formState.preferComposerGrouping;
  const groupArtistOptions = defaultPreferComposerGrouping
    ? ([
        { value: 'false', label: 'Album Artist' },
        { value: 'true', label: 'Default (Composer)' },
      ] as const)
    : ([
        { value: 'false', label: 'Default (Album Artist)' },
        { value: 'true', label: 'Composer' },
      ] as const);
  function setGroupArtistBy(value: 'true' | 'false') {
    setField('preferComposerGrouping', value);
    if (isImmediate) {
      formStateRef.current = {
        ...formStateRef.current,
        preferComposerGrouping: value,
      };
      commitFormChanges();
    }
  }
  const extraRowsByGroup: Partial<Record<DetailFieldGroup, React.ReactNode[]>> =
    {
      classification: [
        <div key="preferComposerGrouping" className="editTrackModalRow">
          <span
            className="editTrackModalLabel"
            title="Controls whether this track is grouped under Album Artist or Composer in the music library."
          >
            Group Artist By
          </span>
          <div
            className="editTrackModalRadioGroup"
            role="radiogroup"
            aria-label="Group Artist By"
            title={
              isFrameWritable('TXXX')
                ? 'Controls whether this track is grouped under Album Artist or Composer in the music library.'
                : UNSUPPORTED_FRAME_TITLE
            }
          >
            {groupArtistOptions.map((option) => (
              <label className="editTrackModalRadioOption" key={option.value}>
                <input
                  type="radio"
                  name={radioName}
                  value={option.value}
                  checked={radioValue === option.value}
                  disabled={detailsEditingDisabled || !isFrameWritable('TXXX')}
                  onChange={(e) =>
                    setGroupArtistBy(e.target.value as 'true' | 'false')
                  }
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>,
      ],
    };

  function statusClass(key: DetailFormValueKey): string {
    return fieldStatus[key] ? ` editTrackModalInput-${fieldStatus[key]}` : '';
  }

  function addDetailFieldRow(field: (typeof DETAIL_FIELDS)[number]) {
    const fieldDisabled =
      detailsEditingDisabled || !isFrameWritable(field.frameId);
    const fieldTitle = isFrameWritable(field.frameId)
      ? undefined
      : UNSUPPORTED_FRAME_TITLE;
    if (isSplitField(field)) {
      detailRows.push(
        <label key={field.key} className="editTrackModalRow" title={fieldTitle}>
          <span className="editTrackModalLabel">{field.label}</span>
          <div className="editTrackModalSplitInput">
            <input
              className={`editTrackModalInput editTrackModalSplitInput-num${statusClass(field.key)}`}
              type="text"
              inputMode="numeric"
              value={formState[field.key]}
              placeholder={formPlaceholders[field.key]}
              disabled={fieldDisabled}
              onChange={(e) => setNumericField(field.key, e.target.value)}
            />
            <span className="editTrackModalSplitSep">of</span>
            <input
              className={`editTrackModalInput editTrackModalSplitInput-total${statusClass(field.totalKey)}`}
              type="text"
              inputMode="numeric"
              value={formState[field.totalKey]}
              placeholder={formPlaceholders[field.totalKey]}
              disabled={fieldDisabled}
              onChange={(e) => setNumericField(field.totalKey, e.target.value)}
            />
          </div>
        </label>,
      );
    } else {
      detailRows.push(
        <label key={field.key} className="editTrackModalRow" title={fieldTitle}>
          <span className="editTrackModalLabel">{field.label}</span>
          <input
            className={`editTrackModalInput${statusClass(field.key)}`}
            type="text"
            inputMode={field.type === 'number' ? 'numeric' : 'text'}
            value={formState[field.key]}
            placeholder={formPlaceholders[field.key]}
            disabled={fieldDisabled}
            onChange={(e) =>
              field.type === 'number'
                ? setNumericField(field.key, e.target.value)
                : setField(field.key, e.target.value)
            }
          />
        </label>,
      );
    }
  }

  for (const [groupIndex, group] of DETAIL_GROUP_ORDER.entries()) {
    if (groupIndex > 0) {
      detailRows.push(
        <div key={`group-${group}`} className="editTrackModalGroupSpacer" />,
      );
    }
    for (const field of DETAIL_FIELDS) {
      if (field.group !== group || (isBulkEdit && field.key === 'title')) {
        continue;
      }
      addDetailFieldRow(field);
    }
    detailRows.push(...(extraRowsByGroup[group] ?? []));
  }

  const tabs = [
    {
      id: 'details' as T.MusicEditTab,
      label: 'Track',
      panel: (
        <form
          className="editTrackModalDetails"
          onSubmit={handleDetailsSubmit}
          onBlur={isImmediate ? commitFormChanges : undefined}
          onKeyDown={
            isImmediate
              ? (event) => {
                  if (event.key === 'Escape') {
                    event.stopPropagation();
                    revertFormChanges();
                  }
                }
              : undefined
          }
        >
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
            folderArtworkUrl={folderArtworkUrl}
            folderArtworkPath={sharedFolderArtworkPath}
            emptyMessage={
              hasMixedFolderArtwork ? 'Mixed folder artwork' : undefined
            }
            hideEmbeddedArtwork={isBulkEdit}
            canEditFolderArtwork={canEditFolderArtwork}
            canEmbedFolderArtwork={canEmbedFolderArtwork}
            tagsState={
              isBulkEdit
                ? { status: 'loaded', data: { blocks: [], resolved: {} } }
                : tagsState
            }
            trackPath={editTracks[0].path}
            embeddableTrackPaths={embeddableTrackPaths}
            onFolderArtworkWritten={handleFolderArtworkWritten}
            onFolderArtworkRemoved={handleFolderArtworkRemoved}
            pendingArtwork={pendingArtwork}
            canRedoArtwork={undoneArtwork !== null}
            onStageArtwork={(artwork) => {
              if (isImmediate) {
                void writeArtworkImmediately(artwork);
                return;
              }
              setCloseConfirmPending(false);
              artworkPreviewUrls.current.push(artwork.previewUrl);
              setUndoneArtwork(null);
              setPendingArtwork(artwork);
            }}
            onUndoArtwork={() => {
              setUndoneArtwork(pendingArtwork);
              setPendingArtwork(null);
            }}
            onRedoArtwork={() => {
              setPendingArtwork(undoneArtwork);
              setUndoneArtwork(null);
            }}
            onTracksEmbedded={handleTracksEmbedded}
            onEmbeddedArtworkRemoved={handleEmbeddedArtworkRemoved}
            serverUrl={server.url}
            artistHint={artworkArtistHint}
            albumHint={artworkAlbumHint}
          />
        ) : (
          <div className="editTrackModalArtwork">
            <div className="editTrackModalArtworkEmpty">No track selected</div>
          </div>
        ),
    },
    {
      id: 'id3' as T.MusicEditTab,
      label: 'File',
      disabled: isBulkEdit,
      disabledTitle: isBulkEdit
        ? 'File details are disabled for bulk editing'
        : undefined,
      panel: track ? (
        <FileTab tagsState={tagsState} location={pathLink} />
      ) : (
        <div className="editTrackModalTags">
          <div className="editTrackModalTagsLoading">No track selected</div>
        </div>
      ),
    },
  ];
  const saveButtonLabel = isSaving ? 'Saving…' : 'Save';
  const effectiveActiveTab =
    isBulkEdit && activeTab === 'id3' ? 'details' : activeTab;
  let headerTitle = track?.title ?? 'Unknown Title';
  if (sharedAlbumHeader) {
    headerTitle = sharedAlbumHeader.album;
  } else if (isBulkEdit) {
    headerTitle = `Edit ${editTracks.length} Tracks`;
  }

  return (
    <div className="music editTrackModal">
      <div
        className={
          sharedAlbumHeader
            ? 'editTrackModalHeader editTrackModalHeader-sharedAlbum'
            : 'editTrackModalHeader'
        }
      >
        {sharedAlbumHeader ? (
          <>
            <div
              className={
                folderArtworkUrl
                  ? 'editTrackModalHeaderArtwork'
                  : 'editTrackModalHeaderArtwork editTrackModalHeaderArtworkEmpty'
              }
            >
              {folderArtworkUrl ? (
                <img
                  src={
                    folderArtworkVersion
                      ? `${folderArtworkUrl}&v=${folderArtworkVersion}`
                      : folderArtworkUrl
                  }
                  alt={`${sharedAlbumHeader.album} artwork`}
                />
              ) : null}
            </div>
            <div className="editTrackModalHeaderAlbumDetails">
              <div className="editTrackModalHeaderMeta">
                {sharedAlbumHeader.artist}
              </div>
              <h2
                id="edit-track-modal-title"
                className="editTrackModalHeaderTitle"
              >
                {headerTitle}
              </h2>
            </div>
          </>
        ) : (
          <>
            <h2
              id="edit-track-modal-title"
              className="editTrackModalHeaderTitle"
            >
              {headerTitle}
            </h2>
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
          </>
        )}
      </div>
      <Tabs
        tabs={tabs}
        activeTab={effectiveActiveTab}
        onChange={(id) => dispatch(A.setMusicEditTab(id as T.MusicEditTab))}
      />
      {!isImmediate && (
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
              isSaving ||
              (!isBulkEdit && tagsState.status !== 'loaded') ||
              (isBulkEdit && bulkTagsState.status === 'loading')
            }
            onClick={() => void handleSave()}
          >
            {saveButtonLabel}
          </button>
        </div>
      )}
    </div>
  );
});
