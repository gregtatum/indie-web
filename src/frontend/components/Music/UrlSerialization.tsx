import * as React from 'react';
import {
  NavigationType,
  useLocation,
  useNavigate,
  useNavigationType,
  useSearchParams,
} from 'react-router-dom';
import { $, $$, A, Hooks, T } from 'frontend';
import { ensureNever } from 'frontend/utils';

type SetSearchParams = ReturnType<typeof useSearchParams>[1];
export const MUSIC_URL_SERIALIZATION_CUTOFF = 50;

const MUSIC_URL_TRACK_RUN_LIMIT = 20;

/**
 * Parses 1-based positions like "1,5,6" or "1-3,7". Returns an empty list for
 * malformed input or when there are more runs than fit in a URL. Positions
 * beyond `max` are dropped.
 */
export function parseTrackPositions(raw: string | null, max: number): number[] {
  if (!raw) {
    return [];
  }
  const runs = raw.split('.');
  if (runs.length > MUSIC_URL_TRACK_RUN_LIMIT) {
    return [];
  }
  const positions = new Set<number>();
  for (const run of runs) {
    const match = /^(\d+)(?:-(\d+))?$/.exec(run);
    if (!match) {
      return [];
    }
    const start = Number(match[1]);
    const end = match[2] === undefined ? start : Number(match[2]);
    if (start < 1 || end < start) {
      return [];
    }
    for (let position = start; position <= Math.min(end, max); position++) {
      positions.add(position);
    }
  }
  return [...positions].sort((a, b) => a - b);
}

/**
 * Formats ascending 1-based positions as "1-3,7". Returns null when there are
 * too many runs to fit in a URL.
 */
export function formatTrackPositions(positions: number[]): string | null {
  const runs: string[] = [];
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i];
    let end = start;
    while (positions[i + 1] === end + 1) {
      end = positions[++i];
    }
    runs.push(start === end ? `${start}` : `${start}-${end}`);
  }
  return runs.length > MUSIC_URL_TRACK_RUN_LIMIT ? null : runs.join('.');
}

/**
 * Describes selected paths by their position in the visible track list.
 * Returns null when the selection is too fragmented for a URL.
 */
function trackPathsToUrl(
  paths: string[],
  visibleTracks: T.TrackMetadata[],
): string | null {
  const selected = new Set(paths);
  const positions: number[] = [];
  visibleTracks.forEach((track, i) => {
    if (selected.has(track.path)) {
      positions.push(i + 1);
    }
  });
  return formatTrackPositions(positions);
}

function trackPathsFromUrl(
  raw: string | null,
  visibleTracks: T.TrackMetadata[],
): string[] {
  return parseTrackPositions(raw, visibleTracks.length).map(
    (position) => visibleTracks[position - 1].path,
  );
}

function canSerializeUrlValues(values: string[]): boolean {
  return values.length <= MUSIC_URL_SERIALIZATION_CUTOFF;
}

function appendUrlValues(
  params: URLSearchParams,
  key: string,
  values: string[] | undefined,
): boolean {
  if (!values) {
    return true;
  }
  if (!canSerializeUrlValues(values)) {
    return false;
  }
  for (const value of values) {
    params.append(key, value);
  }
  return true;
}

/**
 * Synchronize the URL state with the Redux state. Certain items get persisted
 * to the URL. This hook manages that synchronization for all of the music view.
 */
export function useMusicUrlSerialization(): {
  isFilesView: boolean;
  closeBatchEdit: () => void;
} {
  const [searchParams, setSearchParams] = useSearchParams();
  useFilterUrlSync(searchParams, setSearchParams);
  useEditModalUrlSync(searchParams, setSearchParams);
  useStagingViewUrlSync(searchParams, setSearchParams);
  const closeBatchEdit = useBatchEditHistorySync();
  return { isFilesView: searchParams.get('view') === 'files', closeBatchEdit };
}

/**
 * Returns the active tab for the edit modal given the raw URL value and whether
 * the modal is open. Tab is only meaningful when the modal is open; an invalid
 * or missing value defaults to 'details'.
 */
function parseTabFromUrl(
  raw: string | null,
  editFromUrl: string | null,
): T.MusicEditTab | null {
  if (!editFromUrl || !raw) {
    return null;
  }
  const editTab: T.MusicEditTab = raw as T.MusicEditTab;
  switch (editTab) {
    case 'details':
    case 'artwork':
    case 'id3':
      return editTab;
    default:
      // Use ensureNever to exhaustively check this type.
      ensureNever(editTab);
      return null;
  }
}

/**
 * Sync the filters and selected track with the URL.
 */
function useFilterUrlSync(
  searchParams: URLSearchParams,
  setSearchParams: SetSearchParams,
) {
  const panelSelections = $$.getMusicPanelSelections();
  const selectedTrackPaths = $$.getMusicSelectedTrackPaths();
  const selectedTrackPathsKey = selectedTrackPaths.join('\0');
  const filteredTracks = $$.getFilteredMusicTracks();
  const hasTracks = $$.getMusicTracks().length > 0;
  const { dispatch, getState } = Hooks.useStore();
  const pendingTrackParamRef = React.useRef<string | null>(null);
  const isFirstRender = React.useRef(true);
  const panelSelectionsRef = React.useRef(panelSelections);
  panelSelectionsRef.current = panelSelections;
  const selectedTrackPathsRef = React.useRef(selectedTrackPaths);
  selectedTrackPathsRef.current = selectedTrackPaths;
  const filteredTracksRef = React.useRef(filteredTracks);
  filteredTracksRef.current = filteredTracks;

  function restorePendingTracks() {
    const raw = pendingTrackParamRef.current;
    const visibleTracks = $.getFilteredMusicTracks(getState());
    if (raw === null || visibleTracks.length === 0) {
      return;
    }
    pendingTrackParamRef.current = null;
    const paths = trackPathsFromUrl(raw, visibleTracks);
    if (paths.length) {
      dispatch(A.setMusicSelectedTracks(paths));
    }
  }

  // Initialize the Redux store from the URLs on the initial load.
  React.useEffect(
    () => {
      const genres = searchParams.getAll('genre');
      const artists = searchParams.getAll('artist');
      const albums = searchParams.getAll('album');
      if (genres.length && canSerializeUrlValues(genres)) {
        dispatch(A.setMusicPanelSelection('genre', genres));
      }
      if (artists.length && canSerializeUrlValues(artists)) {
        dispatch(A.setMusicPanelSelection('artist', artists));
      }
      if (albums.length && canSerializeUrlValues(albums)) {
        dispatch(A.setMusicPanelSelection('album', albums));
      }
      pendingTrackParamRef.current = searchParams.get('track');
      restorePendingTracks();
    },
    [
      // Run once on mount.
    ],
  );

  // Track positions can only be resolved once the library has loaded.
  React.useEffect(restorePendingTracks, [hasTracks]);

  // Synchronize the URLs from the Redux store.
  React.useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        const currentPanelSelections = panelSelectionsRef.current;
        const currentSelectedTrackPaths = selectedTrackPathsRef.current;
        params.delete('genre');
        params.delete('artist');
        params.delete('album');
        params.delete('track');
        appendUrlValues(params, 'genre', currentPanelSelections.genre);
        appendUrlValues(params, 'artist', currentPanelSelections.artist);
        appendUrlValues(params, 'album', currentPanelSelections.album);
        const trackParam = trackPathsToUrl(
          currentSelectedTrackPaths,
          filteredTracksRef.current,
        );
        if (trackParam) {
          params.set('track', trackParam);
        }
        if (trackParam === null) {
          params.delete('edit');
          params.delete('tab');
        }
        return params;
      },
      { replace: true },
    );
  }, [panelSelections, selectedTrackPathsKey, filteredTracks, setSearchParams]);
}

function parseStagingViewFromUrl(
  raw: string | null,
): T.MusicStagingView | null {
  return raw === 'staging' || raw === 'organize' ? raw : null;
}

function useStagingViewUrlSync(
  searchParams: URLSearchParams,
  setSearchParams: SetSearchParams,
) {
  const stagingView = $$.getMusicStagingView();
  const { dispatch } = Hooks.useStore();
  const isFirstRender = React.useRef(true);
  const stagingViewRef = React.useRef(stagingView);
  stagingViewRef.current = stagingView;

  // Initialize the Redux store from the URL on the initial load.
  React.useEffect(() => {
    const fromUrl = parseStagingViewFromUrl(searchParams.get('stagingView'));
    if (fromUrl) {
      dispatch(A.setMusicStagingView(fromUrl));
    }
  }, []);

  // Synchronize the URL from the Redux store.
  React.useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (stagingViewRef.current) {
          params.set('stagingView', stagingViewRef.current);
        } else {
          params.delete('stagingView');
        }
        return params;
      },
      { replace: true },
    );
  }, [stagingView, setSearchParams]);
}

function useEditModalUrlSync(
  searchParams: URLSearchParams,
  setSearchParams: SetSearchParams,
) {
  const editTrackPath = $$.getMusicEditTrackPath();
  const editTab = $$.getMusicEditTab();
  const selectedTrackPaths = $$.getMusicSelectedTrackPaths();
  const { dispatch } = Hooks.useStore();

  const editFromUrl = searchParams.get('edit');
  const trackParam = searchParams.get('track');
  const filteredTracks = $$.getFilteredMusicTracks();
  const tabFromUrl = parseTabFromUrl(searchParams.get('tab'), editFromUrl);
  const canSerializeCurrentEdit = React.useMemo(
    () =>
      selectedTrackPaths.length <= 1 ||
      trackPathsToUrl(selectedTrackPaths, filteredTracks) !== null,
    [selectedTrackPaths, filteredTracks],
  );

  const isFirstEditRender = React.useRef(true);
  const isFirstTabRender = React.useRef(true);

  const setSearchParamsRef = React.useRef(setSearchParams);
  setSearchParamsRef.current = setSearchParams;

  // Refs let us read the current Redux values inside the URL→Redux effects
  // without adding them as deps. Adding them as deps would cause those effects
  // to fire on Redux-driven changes and revert the Redux state back to the URL.
  const editTrackPathRef = React.useRef(editTrackPath);
  editTrackPathRef.current = editTrackPath;
  const editTabRef = React.useRef(editTab);
  editTabRef.current = editTab;
  const selectedTrackPathsRef = React.useRef(selectedTrackPaths);
  selectedTrackPathsRef.current = selectedTrackPaths;

  // Initialize Redux from the URL on mount and react to URL-driven changes
  // (e.g., browser back). Unlike the filter sync, the edit URL is not replaced
  // in-place, so navigating back can close the modal and must update Redux.
  // The guards skip redundant dispatches when the URL changed because Redux
  // just updated it.
  React.useEffect(() => {
    if (editFromUrl !== editTrackPathRef.current) {
      dispatch(A.setMusicEditTrackPath(editFromUrl));
    }
  }, [editFromUrl]);

  // Bulk edit URLs store the open modal in `edit` and the selected files in
  // `track` positions. Restore that selection when loading or navigating to
  // the URL so the modal can derive its bulk-edit state.
  React.useEffect(() => {
    const tracksFromUrl = trackPathsFromUrl(trackParam, filteredTracks);
    if (
      editFromUrl &&
      tracksFromUrl.length > 1 &&
      trackPathsToUrl(selectedTrackPathsRef.current, filteredTracks) !==
        trackParam
    ) {
      dispatch(A.setMusicSelectedTracks(tracksFromUrl));
    }
  }, [editFromUrl, trackParam, filteredTracks]);

  React.useEffect(() => {
    if (tabFromUrl !== null && tabFromUrl !== editTabRef.current) {
      dispatch(A.setMusicEditTab(tabFromUrl));
    }
  }, [tabFromUrl]);

  // isFirstEditRender/isFirstTabRender guard the Redux→URL direction from
  // firing on the initial render, which would overwrite the URL params before
  // the URL→Redux effects above have had a chance to initialize Redux.
  React.useEffect(() => {
    if (isFirstEditRender.current) {
      isFirstEditRender.current = false;
      return;
    }
    if (
      (canSerializeCurrentEdit && editTrackPath === editFromUrl) ||
      (!canSerializeCurrentEdit && editFromUrl === null)
    ) {
      return;
    }
    setSearchParamsRef.current((prev) => {
      const params = new URLSearchParams(prev);
      if (editTrackPath && canSerializeCurrentEdit) {
        params.set('edit', editTrackPath);
      } else {
        params.delete('edit');
        params.delete('tab');
      }
      return params;
    });
  }, [editTrackPath, canSerializeCurrentEdit]);

  React.useEffect(() => {
    if (isFirstTabRender.current) {
      isFirstTabRender.current = false;
      return;
    }
    if (
      canSerializeCurrentEdit &&
      (editTab === tabFromUrl || (!tabFromUrl && editTab === 'details'))
    ) {
      return;
    }
    setSearchParamsRef.current(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (editTrackPath && canSerializeCurrentEdit) {
          params.set('tab', editTab);
        } else {
          params.delete('tab');
        }
        return params;
      },
      { replace: true },
    );
  }, [editTab, canSerializeCurrentEdit]);
}

interface BatchEditHistoryState {
  musicBatchEdit: true;
}

function hasBatchEditMarker(state: unknown): boolean {
  return (state as BatchEditHistoryState | null)?.musicBatchEdit === true;
}

function useBatchEditHistorySync(): () => void {
  const dispatch = Hooks.useDispatch();
  const batchEditTrackPaths = $$.getMusicBatchEditTrackPaths();
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();

  const prevTrackPathsRef = React.useRef(batchEditTrackPaths);
  const lastTrackPathsRef = React.useRef(batchEditTrackPaths);
  const ignoreNextTransitionRef = React.useRef(false);
  if (batchEditTrackPaths) {
    lastTrackPathsRef.current = batchEditTrackPaths;
  }

  React.useEffect(() => {
    if (hasBatchEditMarker(location.state) && !batchEditTrackPaths) {
      navigate(`${location.pathname}${location.search}`, {
        replace: true,
        state: null,
      });
    }
  }, []);

  React.useEffect(() => {
    const prevTrackPaths = prevTrackPathsRef.current;
    prevTrackPathsRef.current = batchEditTrackPaths;
    if (ignoreNextTransitionRef.current) {
      ignoreNextTransitionRef.current = false;
      return;
    }
    if (batchEditTrackPaths && !prevTrackPaths) {
      navigate(`${location.pathname}${location.search}`, {
        state: { musicBatchEdit: true } satisfies BatchEditHistoryState,
      });
    }
  }, [batchEditTrackPaths]);

  React.useEffect(() => {
    if (navigationType !== NavigationType.Pop) {
      return;
    }
    const hasMarker = hasBatchEditMarker(location.state);
    if (hasMarker && !batchEditTrackPaths && lastTrackPathsRef.current) {
      ignoreNextTransitionRef.current = true;
      dispatch(A.setMusicBatchEditTrackPaths(lastTrackPathsRef.current));
    } else if (!hasMarker && batchEditTrackPaths) {
      ignoreNextTransitionRef.current = true;
      dispatch(A.setMusicBatchEditTrackPaths(null));
    }
  }, [location, navigationType]);

  return React.useCallback(() => {
    if (hasBatchEditMarker(location.state)) {
      navigate(-1);
    } else {
      dispatch(A.setMusicBatchEditTrackPaths(null));
    }
  }, [location, navigate, dispatch]);
}
