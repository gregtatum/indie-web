import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { $$, A, Hooks, T } from 'frontend';
import { ensureNever } from 'frontend/utils';

type SetSearchParams = ReturnType<typeof useSearchParams>[1];

function sameStrings(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

/**
 * Synchronize the URL state with the Redux state. Certain items get persisted
 * to the URL. This hook manages that synchronization for all of the music view.
 */
export function useMusicUrlSerialization(): {
  isFilesView: boolean;
} {
  const [searchParams, setSearchParams] = useSearchParams();
  useFilterUrlSync(searchParams, setSearchParams);
  useEditModalUrlSync(searchParams, setSearchParams);
  return { isFilesView: searchParams.get('view') === 'files' };
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
  const { dispatch } = Hooks.useStore();
  const isFirstRender = React.useRef(true);

  // Initialize the Redux store from the URLs on the initial load.
  React.useEffect(
    () => {
      const genres = searchParams.getAll('genre');
      const artists = searchParams.getAll('artist');
      const albums = searchParams.getAll('album');
      const tracks = searchParams.getAll('track');
      if (genres.length) {
        dispatch(A.setMusicPanelSelection('genre', genres));
      }
      if (artists.length) {
        dispatch(A.setMusicPanelSelection('artist', artists));
      }
      if (albums.length) {
        dispatch(A.setMusicPanelSelection('album', albums));
      }
      if (tracks.length) {
        dispatch(A.setMusicSelectedTracks(tracks));
      }
    },
    [
      // Run once on mount.
    ],
  );

  // Synchronize the URLs from the Redux store.
  React.useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.delete('genre');
        params.delete('artist');
        params.delete('album');
        params.delete('track');
        if (panelSelections.genre) {
          for (const genre of panelSelections.genre) {
            params.append('genre', genre);
          }
        }
        if (panelSelections.artist) {
          for (const artist of panelSelections.artist) {
            params.append('artist', artist);
          }
        }
        if (panelSelections.album) {
          for (const album of panelSelections.album) {
            params.append('album', album);
          }
        }
        for (const track of selectedTrackPaths) {
          params.append('track', track);
        }
        return params;
      },
      { replace: true },
    );
  }, [panelSelections, selectedTrackPaths, setSearchParams]);
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
  const tracksFromUrl = searchParams.getAll('track');
  const tracksFromUrlKey = tracksFromUrl.join('\0');
  const tabFromUrl = parseTabFromUrl(searchParams.get('tab'), editFromUrl);

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
  // repeated `track` params. Restore that selection when loading or navigating
  // to the URL so the modal can derive its bulk-edit state.
  React.useEffect(() => {
    if (
      editFromUrl &&
      tracksFromUrl.length > 1 &&
      !sameStrings(tracksFromUrl, selectedTrackPathsRef.current)
    ) {
      dispatch(A.setMusicSelectedTracks(tracksFromUrl));
    }
  }, [editFromUrl, tracksFromUrlKey]);

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
    if (editTrackPath === editFromUrl) {
      return;
    }
    setSearchParamsRef.current((prev) => {
      const params = new URLSearchParams(prev);
      if (editTrackPath) {
        params.set('edit', editTrackPath);
      } else {
        params.delete('edit');
        params.delete('tab');
      }
      return params;
    });
  }, [editTrackPath]);

  React.useEffect(() => {
    if (isFirstTabRender.current) {
      isFirstTabRender.current = false;
      return;
    }
    if (editTab === tabFromUrl || (!tabFromUrl && editTab === 'details')) {
      return;
    }
    setSearchParamsRef.current(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (editTrackPath) {
          params.set('tab', editTab);
        } else {
          params.delete('tab');
        }
        return params;
      },
      { replace: true },
    );
  }, [editTab]);
}
