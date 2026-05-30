import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { $$, A, Hooks } from 'frontend';
import { ListFiles } from '../ListFiles';
import { MusicLibraryView } from './MusicLibraryView';
import './index.css';

type ScanPhase = 'idle' | 'scanning' | 'done' | 'error';
interface ScanProgress {
  scanCount: number;
  total: number | null;
}

export function Music() {
  const server = $$.getCurrentServerOrNull();
  const needsRescan = $$.getMusicNeedsRescan();
  const panelSelections = $$.getMusicPanelSelections();
  const selectedTrackPaths = $$.getMusicSelectedTrackPaths();
  const { dispatch } = Hooks.useStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [scanPhase, setScanPhase] = React.useState<ScanPhase>('idle');
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [scanProgress, setScanProgress] = React.useState<ScanProgress | null>(
    null,
  );
  const eventSourceRef = React.useRef<EventSource | null>(null);
  const isFirstRender = React.useRef(true);

  React.useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  // URL → Redux: initialize filter state from URL params on mount.
  React.useEffect(() => {
    const genres = searchParams.getAll('genre');
    const artists = searchParams.getAll('artist');
    const albums = searchParams.getAll('album');
    const tracks = searchParams.getAll('track');
    if (genres.length) dispatch(A.setMusicPanelSelection('genre', genres));
    if (artists.length) dispatch(A.setMusicPanelSelection('artist', artists));
    if (albums.length) dispatch(A.setMusicPanelSelection('album', albums));
    if (tracks.length) dispatch(A.setMusicSelectedTracks(tracks));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redux → URL: replace URL params when filter state changes. Skips the first
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
        for (const g of panelSelections.genre ?? []) params.append('genre', g);
        for (const a of panelSelections.artist ?? [])
          params.append('artist', a);
        for (const al of panelSelections.album ?? [])
          params.append('album', al);
        for (const t of selectedTrackPaths) params.append('track', t);
        return params;
      },
      { replace: true },
    );
  }, [panelSelections, selectedTrackPaths, setSearchParams]);

  if (!server) {
    return null;
  }

  const isFilesView = searchParams.get('view') === 'files';

  function handleScan() {
    if (!server || scanPhase === 'scanning') {
      return;
    }
    setScanPhase('scanning');
    setScanProgress({ scanCount: 0, total: null });
    setStatusMessage(null);

    const eventSource = new EventSource(`${server.url}/music/music-index/scan`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      switch (data.type) {
        case 'total':
          setScanProgress({ scanCount: 0, total: data.count });
          break;
        case 'progress':
          setScanProgress((p) => ({
            total: p?.total ?? null,
            scanCount: data.scanCount,
          }));
          break;
        case 'done':
          eventSource.close();
          setScanPhase('done');
          setScanProgress(null);
          setStatusMessage(`Found ${data.tracks.length} tracks.`);
          dispatch(A.setMusicTracks(data.tracks, false));
          break;
        case 'error':
          eventSource.close();
          setScanPhase('error');
          setScanProgress(null);
          setStatusMessage(data.message || 'Scan failed.');
          break;
        default:
          break;
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      setScanPhase('error');
      setScanProgress(null);
      setStatusMessage('Could not connect to the server.');
    };
  }

  let displayMessage: string | null = null;
  if (scanPhase === 'scanning') {
    if (scanProgress?.total !== null && scanProgress?.total !== undefined) {
      displayMessage = `Scanning… ${scanProgress.scanCount} / ${scanProgress.total} files`;
    } else {
      displayMessage = 'Scanning…';
    }
  } else {
    displayMessage = statusMessage;
  }

  let scanLabel = 'Scan Library';
  if (scanPhase === 'scanning') {
    scanLabel = 'Scanning…';
  } else if (needsRescan) {
    scanLabel = 'Scan Library (updates detected)';
  }

  return (
    <div className="music">
      <div className="musicToolbar">
        <button
          type="button"
          className={`button${needsRescan && scanPhase !== 'scanning' ? ' button-primary musicScanLibraryButton-rescan' : ''}`}
          onClick={handleScan}
          disabled={scanPhase === 'scanning'}
        >
          {scanLabel}
        </button>
        {displayMessage ? (
          <span className={`musicScanStatus musicScanStatus-${scanPhase}`}>
            {displayMessage}
          </span>
        ) : null}
        <div className="musicViewToggle">
          <button
            type="button"
            className={`button musicViewToggleButton${!isFilesView ? ' musicViewToggleButton-active' : ''}`}
            onClick={() =>
              setSearchParams(
                (prev) => {
                  const p = new URLSearchParams(prev);
                  p.delete('view');
                  return p;
                },
                { replace: true },
              )
            }
          >
            Library
          </button>
          <button
            type="button"
            className={`button musicViewToggleButton${isFilesView ? ' musicViewToggleButton-active' : ''}`}
            onClick={() =>
              setSearchParams(
                (prev) => {
                  const p = new URLSearchParams(prev);
                  p.set('view', 'files');
                  return p;
                },
                { replace: true },
              )
            }
          >
            Files
          </button>
        </div>
      </div>
      {isFilesView ? <ListFiles /> : <MusicLibraryView />}
    </div>
  );
}
