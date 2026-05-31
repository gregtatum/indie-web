import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { $$, A, Hooks, T } from 'frontend';

/**
 * Synchronize the URL state with the Redux state. Certain items get persisted
 * to the URL. This hook manages that synchronization for all of the music view.
 */
export function useMusicUrlSerialization(): {
  isFilesView: boolean;
} {
  const panelSelections = $$.getMusicPanelSelections();
  const selectedTrackPaths = $$.getMusicSelectedTrackPaths();
  const editTrackPath = $$.getMusicEditTrackPath();
  const editTab = $$.getMusicEditTab();
  const { dispatch } = Hooks.useStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const isFirstRender = React.useRef(true);
  const isFirstEditRender = React.useRef(true);
  const isFirstTabRender = React.useRef(true);

  // Initialize filter state from URL params on mount.
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

  // TODO - Split the modal hooks into their own hook for better code organization.
  // Track filters can also use their own hook.

  // The "edit' param is used when editing tracks. edit=/path/to/track.mp3
  // It opens the edit model.
  const editFromUrl = searchParams.get('edit');
  // TODO - This should do some light validation, but converting a (string) => T.MusicEditTab | null.
  // Then if it's null AND the editFromUrl exists set it the first tab. This should happen
  // outside of the hook here.
  const tabFromUrl = searchParams.get('tab') as T.MusicEditTab | null;

  React.useEffect(() => {
    dispatch(A.setMusicEditTrackPath(editFromUrl));
  }, [editFromUrl]);
  React.useEffect(() => {
    dispatch(A.setMusicEditTab(tabFromUrl ?? 'details'));
  }, [tabFromUrl]);

  // Replace URL params when filter state changes. Skips the first
  // render so the mount effect above can dispatch before this runs.
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

  // Keep a ref so Effect D always uses the latest setSearchParams without
  // triggering re-runs when it changes due to URL navigation.
  const setSearchParamsRef = React.useRef(setSearchParams);
  setSearchParamsRef.current = setSearchParams;

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
    if (editTab === tabFromUrl) {
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

  const isFilesView = searchParams.get('view') === 'files';

  return { isFilesView };
}
