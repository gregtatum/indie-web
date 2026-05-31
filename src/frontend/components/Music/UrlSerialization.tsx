import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { $$, A, Hooks } from 'frontend';

export function useMusicUrlSerialization(): {
  isFilesView: boolean;
} {
  const panelSelections = $$.getMusicPanelSelections();
  const selectedTrackPaths = $$.getMusicSelectedTrackPaths();
  const { dispatch } = Hooks.useStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const isFirstRender = React.useRef(true);

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

  const isFilesView = searchParams.get('view') === 'files';

  return { isFilesView };
}
