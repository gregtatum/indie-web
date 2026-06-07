import * as React from 'react';
import { Link } from 'react-router-dom';
import { $$, A, Hooks, T } from 'frontend';
import { ListFiles } from '../ListFiles';
import { MusicLibraryView } from './MusicLibraryView';
import { useMusicUrlSerialization } from './UrlSerialization';
import './index.css';

type ScanPhase = 'idle' | 'scanning' | 'done' | 'error';
interface ScanProgress {
  scanCount: number;
  total: number | null;
}

export function Music() {
  const server = $$.getCurrentServerOrNull();

  if (!server) {
    return null;
  }

  return <MusicForServer key={server.url} server={server} />;
}

function MusicForServer({ server }: { server: T.FileStoreServer }) {
  const needsRescan = $$.getMusicNeedsRescan();
  const { dispatch } = Hooks.useStore();
  const { isFilesView } = useMusicUrlSerialization();
  const [scanPhase, setScanPhase] = React.useState<ScanPhase>('idle');
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [completedScanCount, setCompletedScanCount] = React.useState(0);
  const [scanProgress, setScanProgress] = React.useState<ScanProgress | null>(
    null,
  );
  const eventSourceRef = React.useRef<EventSource | null>(null);

  React.useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  function handleScan() {
    if (scanPhase === 'scanning') {
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
          setCompletedScanCount((count) => count + 1);
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
    <div className="music musicContainer">
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
          <Link
            to={{ search: '' }}
            className={`button musicViewToggleButton${!isFilesView ? ' musicViewToggleButton-active' : ''}`}
          >
            Library
          </Link>
          <Link
            to={{ search: 'view=files' }}
            className={`button musicViewToggleButton${isFilesView ? ' musicViewToggleButton-active' : ''}`}
          >
            Files
          </Link>
        </div>
      </div>
      {isFilesView ? (
        <ListFiles />
      ) : (
        <MusicLibraryView completedScanCount={completedScanCount} />
      )}
    </div>
  );
}
