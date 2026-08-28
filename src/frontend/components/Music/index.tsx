import * as React from 'react';
import { Link } from 'react-router-dom';
import { $$, A, Hooks, T } from 'frontend';
import { ListFiles } from '../ListFiles';
import { MusicLibraryView } from './MusicLibraryView';
import { useMusicUrlSerialization } from './UrlSerialization';
import { Tooltip } from '../Tooltip';
import { CURRENT_MUSIC_INDEX_VERSION } from 'frontend/logic/music/music-index-upgraders';
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
  const servedIndexVersion = $$.getMusicServedIndexVersion();
  const serverMaxIndexVersion = $$.getMusicServerMaxIndexVersion();
  const containerName = $$.getFileStoreContainerName();
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

  function handleScan(force: boolean) {
    if (scanPhase === 'scanning') {
      return;
    }
    setScanPhase('scanning');
    setScanProgress({ scanCount: 0, total: null });
    setStatusMessage(null);

    const eventSource = new EventSource(
      `${server.url}/music/music-index/scan${force ? '?force=true' : ''}`,
    );
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
          setStatusMessage(
            `Found ${data.tracks.length.toLocaleString()} tracks.`,
          );
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
      displayMessage = `Scanning… ${scanProgress.scanCount.toLocaleString()} / ${scanProgress.total.toLocaleString()} files`;
    } else {
      displayMessage = 'Scanning…';
    }
  } else {
    displayMessage = statusMessage;
  }

  // A rescan can't produce current-format data from a server that doesn't
  // know about it yet, so don't prompt for a rescan in that case — updating
  // the server is the actual fix.
  const serverOutdated =
    serverMaxIndexVersion !== null &&
    serverMaxIndexVersion < CURRENT_MUSIC_INDEX_VERSION;
  const showRescanPrompt = needsRescan && !serverOutdated;

  const updateDocsHref = containerName
    ? `/docs/update-docker.html?containerName=${encodeURIComponent(containerName)}`
    : '/docs/update-npm.html';

  let scanLabel = 'Scan Library';
  if (scanPhase === 'scanning') {
    scanLabel = 'Scanning…';
  } else if (showRescanPrompt) {
    scanLabel = 'Scan Library (updates detected)';
  }

  const scanButton = (
    <button
      type="button"
      className={`button${showRescanPrompt && scanPhase !== 'scanning' ? ' button-primary musicScanLibraryButton-rescan' : ''}`}
      onClick={(event) => handleScan(event.shiftKey)}
      disabled={scanPhase === 'scanning'}
    >
      {scanLabel}
    </button>
  );

  return (
    <div className="music musicContainer">
      <div className="musicToolbar">
        {showRescanPrompt && scanPhase !== 'scanning' ? (
          <Tooltip
            text={`Your library scan can be updated from version ${servedIndexVersion ?? '?'} to ${CURRENT_MUSIC_INDEX_VERSION}.`}
          >
            {scanButton}
          </Tooltip>
        ) : (
          scanButton
        )}
        {serverOutdated ? (
          <a
            className="button button-primary"
            href={updateDocsHref}
            target="_blank"
            rel="noopener noreferrer"
          >
            Server update needed
          </a>
        ) : null}
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
