import * as React from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { $$, A, Hooks, T } from 'frontend';
import { useMediaQuery } from 'frontend/hooks';
import { ListFiles } from '../ListFiles';
import { MusicLibraryView } from './MusicLibraryView';
import { useMusicUrlSerialization } from './UrlSerialization';
import { Tooltip } from '../Tooltip';
import { HeaderToolbarSlotContext } from '../Header';
import { CURRENT_MUSIC_INDEX_VERSION } from 'frontend/logic/music/music-index-upgraders';
import './index.css';

type ScanPhase = 'idle' | 'scanning' | 'done' | 'error';

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
  const [completedScanCount, setCompletedScanCount] = React.useState(0);
  const eventSourceRef = React.useRef<EventSource | null>(null);
  const scanMessageGeneration = React.useRef<number | undefined>(undefined);
  const scanTotalRef = React.useRef<number | null>(null);

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
    scanTotalRef.current = null;
    scanMessageGeneration.current = dispatch(
      A.addMessage({ message: 'Scanning…' }),
    );

    const eventSource = new EventSource(
      `${server.url}/music/music-index/scan${force ? '?force=true' : ''}`,
    );
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      switch (data.type) {
        case 'total':
          scanTotalRef.current = data.count;
          dispatch(
            A.addMessage({
              message: `Scanning… 0 / ${data.count.toLocaleString()} files`,
              generation: scanMessageGeneration.current,
            }),
          );
          break;
        case 'progress': {
          const total = scanTotalRef.current;
          dispatch(
            A.addMessage({
              message:
                total === null
                  ? 'Scanning…'
                  : `Scanning… ${data.scanCount.toLocaleString()} / ${total.toLocaleString()} files`,
              generation: scanMessageGeneration.current,
            }),
          );
          break;
        }
        case 'done':
          eventSource.close();
          setScanPhase('done');
          dispatch(
            A.addMessage({
              message: `Found ${data.tracks.length.toLocaleString()} tracks.`,
              generation: scanMessageGeneration.current,
              timeout: true,
            }),
          );
          dispatch(A.setMusicTracks(data.tracks, false));
          setCompletedScanCount((count) => count + 1);
          break;
        case 'error':
          eventSource.close();
          setScanPhase('error');
          dispatch(
            A.addMessage({
              message: data.message || 'Scan failed.',
              generation: scanMessageGeneration.current,
            }),
          );
          break;
        default:
          break;
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      setScanPhase('error');
      dispatch(
        A.addMessage({
          message: 'Could not connect to the server.',
          generation: scanMessageGeneration.current,
        }),
      );
    };
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
      className={`button musicScanLibraryButton${showRescanPrompt && scanPhase !== 'scanning' ? ' button-primary musicScanLibraryButton-rescan' : ''}`}
      onClick={(event) => handleScan(event.shiftKey)}
      disabled={scanPhase === 'scanning'}
    >
      {scanLabel}
    </button>
  );

  const isWideHeader = useMediaQuery('(min-width: 900px)');
  const headerToolbarSlot = React.useContext(HeaderToolbarSlotContext);
  const useHeaderToolbar = isWideHeader && headerToolbarSlot !== null;

  const toolbar = (
    <div
      className={`musicToolbar${useHeaderToolbar ? ' musicToolbar-inHeader' : ''}`}
    >
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
      <div className="musicViewToggle">
        <Link
          to={{ search: '' }}
          className={`musicViewToggleButton${!isFilesView ? ' musicViewToggleButton-active' : ''}`}
        >
          Library
        </Link>
        <Link
          to={{ search: 'view=files' }}
          className={`musicViewToggleButton${isFilesView ? ' musicViewToggleButton-active' : ''}`}
        >
          Files
        </Link>
      </div>
    </div>
  );

  return (
    <div className="music musicContainer">
      {useHeaderToolbar ? createPortal(toolbar, headerToolbarSlot) : toolbar}
      {isFilesView ? (
        <ListFiles />
      ) : (
        <MusicLibraryView completedScanCount={completedScanCount} />
      )}
    </div>
  );
}
