import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { $$, A, Hooks } from 'frontend';

export function useMusicUrlSerialization(): {
  isFilesView: boolean;
} {
  const panelSelections = $$.getMusicPanelSelections();
  const selectedTrackPaths = $$.getMusicSelectedTrackPaths();
  const editTrackPath = $$.getMusicEditTrackPath();
  const { dispatch } = Hooks.useStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const isFirstRender = React.useRef(true);
  const isFirstEditRender = React.useRef(true);

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

  // Sync edit param from URL to Redux — handles back/forward navigation
  // and the initial load.
  const editFromUrl = searchParams.get('edit');
  React.useEffect(() => {
    dispatch(A.setMusicEditTrackPath(editFromUrl));
  }, [editFromUrl]);

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

  // Push URL when the edit track changes in Redux. Skips the first render
  // and no-ops when the URL already matches (e.g. after back/forward navigation
  // synced URL → Redux and we don't want to push a duplicate entry).
  // setSearchParams is intentionally excluded from deps — including it causes
  // Effect D to re-fire on back/forward navigation (when setSearchParams gets a
  // new reference) with a stale editTrackPath, producing an incorrect push.
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
      }
      return params;
    });
  }, [editTrackPath]); // eslint-disable-line react-hooks/exhaustive-deps

  const isFilesView = searchParams.get('view') === 'files';

  return { isFilesView };
}
