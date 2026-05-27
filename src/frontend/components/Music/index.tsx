import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { $$, A, Hooks } from 'frontend';
import { ListFiles } from '../ListFiles';
import { MusicLibraryView } from './MusicLibraryView';
import './index.css';

type ScanPhase = 'idle' | 'scanning' | 'done' | 'error';
interface ScanProgress {
  scanned: number;
  total: number | null;
}

export function Music() {
  const server = $$.getCurrentServerOrNull();
  const needsRescan = $$.getMusicNeedsRescan();
  const { dispatch } = Hooks.useStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [scanPhase, setScanPhase] = React.useState<ScanPhase>('idle');
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [scanProgress, setScanProgress] = React.useState<ScanProgress | null>(
    null,
  );
  const eventSourceRef = React.useRef<EventSource | null>(null);

  React.useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  if (!server) {
    return null;
  }

  const isFilesView = searchParams.get('view') === 'files';

  function handleScan() {
    if (!server || scanPhase === 'scanning') {
      return;
    }
    setScanPhase('scanning');
    setScanProgress({ scanned: 0, total: null });
    setStatusMessage(null);

    const eventSource = new EventSource(`${server.url}/music/music-index/scan`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      switch (data.type) {
        case 'total':
          setScanProgress({ scanned: 0, total: data.count });
          break;
        case 'progress':
          setScanProgress((p) => ({
            total: p?.total ?? null,
            scanned: data.scanned,
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
      displayMessage = `Scanning… ${scanProgress.scanned} / ${scanProgress.total} files`;
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
            onClick={() => setSearchParams({})}
          >
            Library
          </button>
          <button
            type="button"
            className={`button musicViewToggleButton${isFilesView ? ' musicViewToggleButton-active' : ''}`}
            onClick={() => setSearchParams({ view: 'files' })}
          >
            Files
          </button>
        </div>
      </div>
      {isFilesView ? <ListFiles /> : <MusicLibraryView />}
    </div>
  );
}
