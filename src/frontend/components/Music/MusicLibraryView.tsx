import * as React from 'react';
import { $$, T, A, Hooks, $ } from 'frontend';
import {
  UnhandledCaseError,
  ensureExists,
  getKeyboardString,
} from 'frontend/utils';
import { Splitter } from 'frontend/components/Splitter';
import { upgradeMusicIndex } from 'frontend/logic/music/music-index-upgraders';
import { getTrackFilterArtist } from 'frontend/logic/music/metadata';
import {
  getTrackCapabilities,
  shouldPreferComposerGrouping,
} from 'shared/music';
import { persistedState } from 'frontend/logic/persisted-state';
import {
  useFolderArtworkDrop,
  useFolderArtworkPaste,
  useMusicLibraryTrackSource,
  useWriteTrackTags,
  useMusicStagingPoolTrackSource,
  useDiscardStagingPool,
  collectFilesFromDataTransfer,
} from 'frontend/hooks/music';
import { useVirtualizer } from '@tanstack/react-virtual';
import { TrackContextMenu, TrackContextMenuHandle } from './TrackContextMenu';
import { BatchEditGrid } from './BatchEditGrid';
import { TrackEditorSidebar } from './TrackEditorSidebar';
import { OrganizeImportView } from './OrganizeImportView';
import {
  ColumnResizeHandle,
  layoutColumns,
  resizeColumnsOnDrag,
} from './column-resize';

const TrackContextMenuContext =
  React.createContext<React.RefObject<TrackContextMenuHandle | null> | null>(
    null,
  );

function useTrackContextMenu() {
  return ensureExists(
    React.useContext(TrackContextMenuContext),
    'Expected a TrackContextMenu provider.',
  );
}

interface LoadProgress {
  loaded: number;
  total: number | null;
}

async function readJsonWithProgress(
  res: Response,
  onProgress: (progress: LoadProgress) => void,
): Promise<unknown> {
  const contentLength = Number(res.headers.get('Content-Length'));
  const total = contentLength > 0 ? contentLength : null;
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  function addChunk(chunk: Uint8Array) {
    chunks.push(chunk);
    loaded += chunk.length;
    onProgress({ loaded, total });
  }

  if (typeof res.body?.getReader === 'function') {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      addChunk(value);
    }
  } else {
    addChunk(new Uint8Array(await res.arrayBuffer()));
  }

  return new Response(new Blob(chunks as BlobPart[])).json();
}

function getConnectionErrorMessage(server: T.FileStoreServer): React.ReactNode {
  const { name, url } = server;
  const hostname = URL.parse(url)?.hostname;

  let advice: React.ReactNode;
  if (process.env.NODE_ENV === 'development') {
    advice = (
      <>
        Run <code>task start-server</code> to start it.
      </>
    );
  } else if (hostname === 'localhost' || hostname === '127.0.0.1') {
    advice = 'Make sure the server is running on your local machine.';
  } else {
    advice =
      'Check that the server is online and your network connection is working.';
  }

  return (
    <>
      Could not connect to the <code>{name}</code> server at <code>{url}</code>.
      <br />
      <br />
      {advice}
    </>
  );
}

interface MusicLibraryViewProps {
  completedScanCount: number;
  onCloseBatchEdit: () => void;
}

export function MusicLibraryView({
  completedScanCount,
  onCloseBatchEdit,
}: MusicLibraryViewProps) {
  const server = $$.getCurrentServer();
  const { dispatch, getState } = Hooks.useStore();
  const contextMenuRef = React.useRef<TrackContextMenuHandle | null>(null);
  const [error, setError] = React.useState<React.ReactNode>(null);
  const [loadProgress, setLoadProgress] = React.useState<LoadProgress | null>(
    null,
  );
  const [isLoading, setIsLoading] = React.useState(
    () => $.getMusicTracks(getState()).length === 0,
  );
  const batchEditTrackPaths = $$.getMusicBatchEditTrackPaths();
  const stagingPool = $$.getMusicStagingPool();
  const stagingView = $$.getMusicStagingView();
  const selectedTrackPaths = $$.getMusicSelectedTrackPaths();
  const organizeTracks = React.useMemo(() => {
    if (stagingView !== 'organize') {
      return null;
    }
    return selectedTrackPaths.length > 1
      ? stagingPool.filter((track) => selectedTrackPaths.includes(track.path))
      : stagingPool;
  }, [stagingView, selectedTrackPaths, stagingPool]);

  const importDropRef = React.useRef<HTMLDivElement>(null);
  const importDropping = Hooks.useFileDrop(
    importDropRef,
    (event) => {
      void collectFilesFromDataTransfer(event.dataTransfer).then((files) => {
        if (!files.length) {
          return;
        }
        void dispatch(A.addFilesToStagingPool(files));
      });
    },
    (event) =>
      !$.getDraggedFiles(getState())?.length &&
      Array.from(event.dataTransfer?.types ?? []).includes('Files'),
  );

  // Portaled into #overlayContainer to escape .musicTracksHeader's stacking
  // context, so position is computed from the target's rect, not CSS inset.
  const [dropOverlayRect, setDropOverlayRect] = React.useState<null | {
    top: number;
    left: number;
    width: number;
    height: number;
  }>(null);

  React.useEffect(() => {
    if (!importDropping) {
      return;
    }
    const el = importDropRef.current;
    if (!el) {
      return;
    }
    const rect = el.getBoundingClientRect();
    const docRect = document.body.getBoundingClientRect();
    setDropOverlayRect({
      top: rect.top - docRect.top,
      left: rect.left - docRect.left,
      width: rect.width,
      height: rect.height,
    });
  }, [importDropping]);

  const wasBatchEditingRef = React.useRef(batchEditTrackPaths !== null);
  React.useEffect(() => {
    const wasBatchEditing = wasBatchEditingRef.current;
    const isBatchEditing = batchEditTrackPaths !== null;
    wasBatchEditingRef.current = isBatchEditing;
    if (wasBatchEditing && !isBatchEditing) {
      document.querySelector<HTMLElement>('.musicTracks')?.focus();
    } else if (!wasBatchEditing && isBatchEditing) {
      dispatch(A.setMusicEditTab('artwork'));
    }
  }, [batchEditTrackPaths, dispatch]);

  React.useEffect(() => {
    if (completedScanCount > 0) {
      // Clear out any stale errors.
      setError(null);
    }
  }, [completedScanCount]);

  React.useEffect(() => {
    void dispatch(A.refreshMusicStagingPool());
  }, [dispatch]);

  React.useEffect(() => {
    const currentServer = server;
    const fetchController = new AbortController();

    async function loadIndex() {
      const serverInfoResponse = await fetch(`${currentServer.url}/music`, {
        signal: fetchController.signal,
      }).catch(() => null);

      // The first index check happened at version 8, so assume version 7 if none exists.
      let maxMusicIndexVersion = 7;
      if (serverInfoResponse?.ok) {
        const serverInfo = await serverInfoResponse.json().catch(() => null);
        if (typeof serverInfo?.maxMusicIndexVersion === 'number') {
          maxMusicIndexVersion = serverInfo.maxMusicIndexVersion;
        }
      }
      dispatch(A.setMusicServerMaxIndexVersion(maxMusicIndexVersion));

      const fileStoreInfoResponse = await fetch(
        `${currentServer.url}/file-store/`,
        { signal: fetchController.signal },
      ).catch(() => null);

      let revealLabel: string | null = null;
      let containerName: string | null = null;
      if (fileStoreInfoResponse?.ok) {
        const fileStoreInfo = await fileStoreInfoResponse
          .json()
          .catch(() => null);
        if (typeof fileStoreInfo?.revealLabel === 'string') {
          revealLabel = fileStoreInfo.revealLabel;
        }
        if (typeof fileStoreInfo?.containerName === 'string') {
          containerName = fileStoreInfo.containerName;
        }
      }
      dispatch(A.setFileManagerRevealLabel(revealLabel));
      dispatch(A.setFileStoreContainerName(containerName));

      if ($.getMusicTracks(getState()).length > 0) {
        setError(null);
        return;
      }

      try {
        const res = await fetch(`${currentServer.url}/music/music-index`, {
          signal: fetchController.signal,
        });
        if (!res.ok) {
          setError('Music library not found. Run a scan first.');
          return;
        }
        const { index, wasUpgraded, servedVersion } = upgradeMusicIndex(
          await readJsonWithProgress(res, (progress) => {
            if (!fetchController.signal.aborted) {
              setLoadProgress(progress);
            }
          }),
        );
        dispatch(A.setMusicTracks(index.tracks, wasUpgraded, servedVersion));
        setError(null);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        setError(getConnectionErrorMessage(currentServer));
      }
    }

    // loadIndex is infallible as it handles the error.
    void loadIndex().then(() => {
      if (!fetchController.signal.aborted) {
        setIsLoading(false);
      }
    });

    return () => {
      // When unmounting the component, cancel the music index fetch.
      fetchController.abort();
    };
  }, [server.url]);

  function renderImportDropOverlay() {
    if (!importDropping || !dropOverlayRect) {
      return null;
    }
    return Hooks.overlayPortal(
      <div
        className="musicImportDropOverlay"
        aria-hidden="true"
        style={{
          top: dropOverlayRect.top,
          left: dropOverlayRect.left,
          width: dropOverlayRect.width,
          height: dropOverlayRect.height,
        }}
      >
        <div className="musicImportDropOverlayInner">
          {stagingPool.length > 0
            ? 'Add audio files to staging'
            : 'Add audio files to your library'}
        </div>
      </div>,
    );
  }

  function withDropTarget(children: React.ReactNode) {
    return (
      <div className="musicLibraryView" ref={importDropRef}>
        {renderImportDropOverlay()}
        {children}
      </div>
    );
  }
  function withoutDropTarget(children: React.ReactNode) {
    return <div className="musicLibraryView">{children}</div>;
  }

  if (stagingView !== null && stagingPool.length > 0) {
    // The staging pool doesn't depend on the real music index, so it renders
    // even if that index has never been scanned.
    return organizeTracks
      ? withoutDropTarget(
          <OrganizeImportView
            tracks={organizeTracks}
            onBack={() => dispatch(A.setMusicStagingView('staging'))}
            onClose={() => dispatch(A.setMusicStagingView(null))}
          />,
        )
      : withDropTarget(
          <StagingPoolEditView
            onCloseView={() => dispatch(A.setMusicStagingView(null))}
          />,
        );
  }

  if (error) {
    return withoutDropTarget(
      <>
        <StagingPoolBanner />
        <div className="musicLibraryViewError">
          <div>{error}</div>
        </div>
      </>,
    );
  }

  if (batchEditTrackPaths) {
    return withoutDropTarget(
      <BatchEditView
        trackPaths={batchEditTrackPaths}
        onClose={onCloseBatchEdit}
      />,
    );
  }

  return (
    <TrackContextMenuContext.Provider value={contextMenuRef}>
      <TrackContextMenu ref={contextMenuRef} />
      <div className="musicLibraryView">
        <StagingPoolBanner />
        <div className="musicLibraryBody">
          <Splitter
            direction="horizontal"
            className="musicLibrarySidebarSplitter"
            defaultOffset={400}
            constrain={{ pane: 'start', minSize: 245, maxSize: 500 }}
            start={isLoading ? <AlbumHeroSkeleton /> : <AlbumHero />}
            end={
              <div
                className="musicLibrarySplitterDropTarget"
                ref={importDropRef}
              >
                {renderImportDropOverlay()}
                <Splitter
                  direction="vertical"
                  className="musicLibrarySplitter"
                  start={<FilterPanels isLoading={isLoading} />}
                  end={
                    <TracksView
                      isLoading={isLoading}
                      loadProgress={loadProgress}
                    />
                  }
                  persistLocalStorage="musicLibrarySplitterOffset"
                />
              </div>
            }
            persistLocalStorage="musicLibrarySidebarSplitterOffset"
          />
        </div>
      </div>
    </TrackContextMenuContext.Provider>
  );
}

function StagingPoolBanner() {
  const dispatch = Hooks.useDispatch();
  const stagingPool = $$.getMusicStagingPool();
  const { discardConfirmPending, handleDiscardClick } = useDiscardStagingPool();

  if (stagingPool.length === 0) {
    return null;
  }

  return (
    <div className="musicStagingPoolBanner">
      <span className="musicStagingPoolBannerLabel">
        {stagingPool.length} {stagingPool.length === 1 ? 'track' : 'tracks'}{' '}
        staged
      </span>
      {discardConfirmPending ? (
        <span className="musicImportDiscardWarning">
          Click again to discard
        </span>
      ) : null}
      <button type="button" className="button" onClick={handleDiscardClick}>
        Discard
      </button>
      <button
        type="button"
        className="button button-primary"
        onClick={() => dispatch(A.setMusicStagingView('staging'))}
      >
        Resume
      </button>
    </div>
  );
}

function BatchEditView({
  trackPaths,
  onClose,
}: {
  trackPaths: string[];
  onClose: () => void;
}) {
  Hooks.useEscape(onClose, true);
  const trackSource = useMusicLibraryTrackSource();

  return (
    <div className="musicBatchEditView">
      <div className="musicBatchEditHeader">
        <h2 className="musicBatchEditHeaderTitle">
          Batch Edit · {trackPaths.length}{' '}
          {trackPaths.length === 1 ? 'track' : 'tracks'}
        </h2>
        <button
          type="button"
          className="musicBatchEditCloseButton"
          aria-label="Close batch edit"
          onClick={onClose}
        >
          <img src="/svg/xmark.svg" alt="" />
        </button>
      </div>
      <div className="musicBatchEditBody">
        <Splitter
          direction="horizontal"
          className="musicBatchEditSplitter"
          defaultOffset={150}
          constrain={{ pane: 'end', minSize: 320, maxSize: 560 }}
          start={
            <BatchEditGrid trackPaths={trackPaths} trackSource={trackSource} />
          }
          end={<TrackEditorSidebar trackSource={trackSource} />}
          persistLocalStorage="musicBatchEditSplitterOffset"
        />
      </div>
    </div>
  );
}

function StagingPoolEditView({ onCloseView }: { onCloseView: () => void }) {
  const dispatch = Hooks.useDispatch();
  const trackSource = useMusicStagingPoolTrackSource();
  const selectedTrackPaths = $$.getMusicSelectedTrackPaths();
  const trackPaths = React.useMemo(
    () => trackSource.tracks.map((t) => t.path),
    [trackSource.tracks],
  );

  const { discardConfirmPending, handleDiscardClick } = useDiscardStagingPool();

  Hooks.useEscape(() => {
    if (selectedTrackPaths.length > 0) {
      dispatch(A.setMusicSelectedTracks([]));
    } else {
      onCloseView();
    }
  }, true);

  // A single selection just means "I'm editing this row".
  const isMultiSelect = selectedTrackPaths.length > 1;

  function handleNextClick() {
    dispatch(A.setMusicStagingView('organize'));
  }

  return (
    <div className="musicBatchEditView">
      <div className="musicBatchEditHeader">
        <h2 className="musicBatchEditHeaderTitle">
          Staging · {trackSource.tracks.length}{' '}
          {trackSource.tracks.length === 1 ? 'track' : 'tracks'}
        </h2>
        <div className="musicImportBatchHeaderActions">
          {discardConfirmPending ? (
            <span className="musicImportDiscardWarning">
              Click again to discard
            </span>
          ) : null}
          <button type="button" className="button" onClick={handleDiscardClick}>
            Discard
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={handleNextClick}
          >
            {isMultiSelect
              ? `Next ${selectedTrackPaths.length} selected`
              : 'Next'}
          </button>
          <button
            type="button"
            className="musicBatchEditCloseButton"
            aria-label="Back to library"
            onClick={onCloseView}
          >
            <img src="/svg/xmark.svg" alt="" />
          </button>
        </div>
      </div>
      <div className="musicBatchEditBody">
        <Splitter
          direction="horizontal"
          className="musicBatchEditSplitter"
          defaultOffset={150}
          constrain={{ pane: 'end', minSize: 320, maxSize: 560 }}
          start={
            <BatchEditGrid trackPaths={trackPaths} trackSource={trackSource} />
          }
          end={<TrackEditorSidebar trackSource={trackSource} />}
          persistLocalStorage="musicImportBatchEditSplitterOffset"
        />
      </div>
    </div>
  );
}

type ConfigurableColumns = 'artist' | 'album';
type ColumnWidths = Record<ConfigurableColumns, number>;
type StoredColumnWidths = ColumnWidths & { referenceWidth: number | null };
const COL_MIN_WIDTH = 60;
const TRACK_MIN_WIDTH = 100; // matches .musicTracksHeaderTitle { min-width: 100px }
const TRACK_COLUMN_WIDTH = 24; // matches --column-track CSS variable
const MUSIC_GAP = 12; // matches --music-gap CSS variable
const CONFIGURABLE_COLUMNS: ConfigurableColumns[] = ['artist', 'album'];

function loadColumnWidths(): StoredColumnWidths {
  const stored = persistedState.musicTrackColumnWidths.read();
  if (stored) {
    return {
      artist: Math.max(COL_MIN_WIDTH, stored.artist),
      album: Math.max(COL_MIN_WIDTH, stored.album),
      referenceWidth: stored.referenceWidth,
    };
  }
  return { artist: 160, album: 160, referenceWidth: null };
}

function TracksView({
  isLoading,
  loadProgress,
}: {
  isLoading: boolean;
  loadProgress: LoadProgress | null;
}) {
  const [stored, setStored] =
    React.useState<StoredColumnWidths>(loadColumnWidths);
  const [availableWidth, setAvailableWidth] = React.useState<number | null>(
    null,
  );
  const [scrollbarWidth, setScrollbarWidth] = React.useState(0);
  const storedRef = React.useRef(stored);
  storedRef.current = stored;
  const availableWidthRef = React.useRef(availableWidth);
  availableWidthRef.current = availableWidth;

  function computeColumnWidths(
    widths: StoredColumnWidths,
    available: number | null,
  ): ColumnWidths {
    if (available === null) {
      return widths;
    }
    return layoutColumns(
      CONFIGURABLE_COLUMNS,
      widths,
      widths.referenceWidth ?? available,
      available,
      COL_MIN_WIDTH,
      TRACK_MIN_WIDTH,
    );
  }

  const columnWidths = computeColumnWidths(stored, availableWidth);

  function onColumnDrag(columnKey: ConfigurableColumns, dx: number) {
    setStored((prev) => {
      const available = availableWidthRef.current;
      if (available === null) {
        return prev;
      }
      const resized = resizeColumnsOnDrag(
        CONFIGURABLE_COLUMNS,
        computeColumnWidths(prev, available),
        columnKey,
        dx,
        COL_MIN_WIDTH,
        available,
        TRACK_MIN_WIDTH,
      );
      return { ...resized, referenceWidth: available };
    });
  }

  function onColumnDragEnd() {
    persistedState.musicTrackColumnWidths.write(storedRef.current);
  }

  return (
    <div
      className="musicTracksView"
      style={
        {
          '--column-artist': `${columnWidths.artist}px`,
          '--column-album': `${columnWidths.album}px`,
          '--scrollbar-width': `${scrollbarWidth}px`,
        } as React.CSSProperties
      }
    >
      <TracksHeader
        onAvailableWidthChange={setAvailableWidth}
        onColumnDrag={onColumnDrag}
        onColumnDragEnd={onColumnDragEnd}
      />
      {isLoading ? (
        <TracksSkeleton loadProgress={loadProgress} />
      ) : (
        <Tracks onScrollbarWidthChange={setScrollbarWidth} />
      )}
    </div>
  );
}

interface ColumnHeaderProps {
  columnKey: ConfigurableColumns;
  label: string;
  onColumnDrag: (columnKey: ConfigurableColumns, dx: number) => void;
  onColumnDragEnd: () => void;
}

function ColumnHeader({
  columnKey,
  label,
  onColumnDrag,
  onColumnDragEnd,
}: ColumnHeaderProps) {
  return (
    <div
      className="musicTracksHeaderCell"
      style={{ flex: `0 0 var(--column-${columnKey})` }}
    >
      <ColumnResizeHandle
        onDrag={(dx) => onColumnDrag(columnKey, dx)}
        onDragEnd={onColumnDragEnd}
      />
      <div className="musicTracksHeaderCellText">{label}</div>
    </div>
  );
}

interface TracksHeaderProps {
  onAvailableWidthChange: (width: number) => void;
  onColumnDrag: (columnKey: ConfigurableColumns, dx: number) => void;
  onColumnDragEnd: () => void;
}

function TracksHeader({
  onAvailableWidthChange,
  onColumnDrag,
  onColumnDragEnd,
}: TracksHeaderProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return undefined;
    }
    const numCols = CONFIGURABLE_COLUMNS.length + 2; // +1 for Title, +1 for TrackNumber
    const observer = new ResizeObserver(([entry]) => {
      // contentRect already excludes the header padding, including the scrollbar.
      onAvailableWidthChange(
        entry.contentRect.width -
          (numCols - 1) * MUSIC_GAP -
          TRACK_COLUMN_WIDTH,
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [onAvailableWidthChange]);

  return (
    <div className="musicTracksHeader" ref={containerRef}>
      <div className="musicTracksHeaderCell musicTracksHeaderTrackNumber" />
      <div className="musicTracksHeaderCell musicTracksHeaderTitle">
        <div className="musicTracksHeaderCellText">Track</div>
      </div>
      <ColumnHeader
        columnKey="artist"
        label="Artist"
        onColumnDrag={onColumnDrag}
        onColumnDragEnd={onColumnDragEnd}
      />
      <ColumnHeader
        columnKey="album"
        label="Album"
        onColumnDrag={onColumnDrag}
        onColumnDragEnd={onColumnDragEnd}
      />
    </div>
  );
}

const SKELETON_WIDTHS = [62, 80, 48, 71, 55, 88, 44, 67, 76, 52, 84, 58];

function skeletonWidth(index: number, offset = 0): string {
  return `${SKELETON_WIDTHS[(index + offset) % SKELETON_WIDTHS.length]}%`;
}

function FilterPanelsSkeleton() {
  return (
    <div className="musicFilterPanels" aria-busy="true">
      {(['genre', 'artist', 'album'] as const).map((panel, panelIndex) => (
        <div className="musicFilterPanel" key={panel}>
          <div className="musicFilterPanelHeader">{panel}</div>
          <div className="musicFilterPanelList">
            <div className="musicFilterPanelItem musicSkeletonItem">
              {getPanelAllLabel(panel)}
            </div>
            {SKELETON_WIDTHS.slice(0, 5).map((_, index) => (
              <div className="musicFilterPanelItem" key={index}>
                <div
                  className="musicSkeletonBar"
                  style={{ width: skeletonWidth(index, panelIndex * 3) }}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatMegabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function LoadingLabel({ progress }: { progress: LoadProgress | null }) {
  const total = progress?.total ?? null;
  const fraction =
    progress && total ? Math.min(progress.loaded / total, 1) : null;
  return (
    <div className="musicLoadingLabel" role="status">
      <div>Loading library…</div>
      <div
        className={`musicLoadingBar${fraction === null ? ' indeterminate' : ''}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={
          fraction === null ? undefined : Math.round(fraction * 100)
        }
      >
        <div
          className="musicLoadingBarFill"
          style={
            fraction === null ? undefined : { width: `${fraction * 100}%` }
          }
        />
      </div>
      {progress && progress.loaded > 0 ? (
        <div className="musicLoadingBytes">
          {formatMegabytes(progress.loaded)}
          {total ? ` / ${formatMegabytes(total)}` : null}
        </div>
      ) : null}
    </div>
  );
}

function TracksSkeleton({
  loadProgress,
}: {
  loadProgress: LoadProgress | null;
}) {
  return (
    <div className="musicTracksContainer" aria-busy="true">
      <LoadingLabel progress={loadProgress} />
      <div className="musicTracks">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            className="musicTrack musicSkeletonTrack"
            key={index}
            style={{ height: `${sizeEstimate}px` }}
          >
            <span className="musicTrackNumber" />
            <span className="musicTrackTitle">
              <div
                className="musicSkeletonBar"
                style={{ width: skeletonWidth(index) }}
              />
            </span>
            <span className="musicTrackArtist">
              <div
                className="musicSkeletonBar"
                style={{ width: skeletonWidth(index, 4) }}
              />
            </span>
            <span className="musicTrackAlbum">
              <div
                className="musicSkeletonBar"
                style={{ width: skeletonWidth(index, 7) }}
              />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AlbumHeroSkeleton() {
  return (
    <div className="musicAlbumHero" aria-busy="true">
      <div className="musicAlbumHeroArtwork musicSkeletonBar" />
      <div className="musicAlbumHeroBody">
        <div className="musicSkeletonBar musicSkeletonHeroTitle" />
        <div className="musicSkeletonBar musicSkeletonHeroMeta" />
      </div>
    </div>
  );
}

function FilterPanels({ isLoading }: { isLoading: boolean }) {
  const panelTracks = $$.getMusicPanelTracks();
  if (isLoading) {
    return <FilterPanelsSkeleton />;
  }
  return (
    <div className="musicFilterPanels">
      <FilterPanel panel="genre" tracks={panelTracks.genre} />
      <FilterPanel panel="artist" tracks={panelTracks.artist} />
      <FilterPanel panel="album" tracks={panelTracks.album} />
    </div>
  );
}

function formatAlbumDuration(totalSeconds: number): string {
  const secs = Math.round(totalSeconds);
  const hours = Math.floor(secs / 3600);
  const minutes = Math.floor((secs % 3600) / 60);
  const seconds = secs % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}

function pickMostCommon(values: (string | null)[]): string | null {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (value) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function shuffleTracks(tracks: T.TrackMetadata[]): T.TrackMetadata[] {
  const result = tracks.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function AlbumHero() {
  const dispatch = Hooks.useDispatch();
  const server = $$.getCurrentServer();
  const allTracks = $$.getMusicTracks();
  const filteredTracks = $$.getFilteredMusicTracks();
  const selectedTrackPaths = $$.getMusicSelectedTrackPaths();
  const playingTrackPath = $$.getMusicPlaybackTrackPath();
  const selectedTrackPath = selectedTrackPaths[0] ?? null;
  const panelSelections = $$.getMusicPanelSelections();
  const folderArtworkVersion = $$.getMusicFolderArtworkVersion();

  // The hero follows the most recent thing you clicked: a track or a filter
  // panel. After a track click it shows that track's album; after a filter
  // click it shows the first album in the filtered list. Playback advancing to
  // the next track does not change it. Seeded from any existing selection,
  // then the last played track, so a fresh reload still shows an album.
  const heroTrackPathRef = React.useRef<string | null>(
    selectedTrackPath ?? persistedState.musicLastPlayedTrackPath.read(),
  );
  const heroSourceRef = React.useRef<'track' | 'filter'>('track');
  const prevSelectedRef = React.useRef(selectedTrackPath);
  const prevPanelSelectionsRef = React.useRef(panelSelections);

  if (panelSelections !== prevPanelSelectionsRef.current) {
    heroSourceRef.current = 'filter';
  }
  if (selectedTrackPath && selectedTrackPath !== prevSelectedRef.current) {
    heroTrackPathRef.current = selectedTrackPath;
    heroSourceRef.current = 'track';
  }
  prevSelectedRef.current = selectedTrackPath;
  prevPanelSelectionsRef.current = panelSelections;

  const tracksByPath = React.useMemo(() => {
    const map = new Map<string, T.TrackMetadata>();
    for (const track of allTracks) {
      map.set(track.path, track);
    }
    return map;
  }, [allTracks]);

  const contextTrack =
    heroSourceRef.current === 'filter'
      ? (selectedTrackPath &&
          filteredTracks.find((track) => track.path === selectedTrackPath)) ||
        filteredTracks[0] ||
        allTracks[0] ||
        null
      : (heroTrackPathRef.current &&
          tracksByPath.get(heroTrackPathRef.current)) ||
        (selectedTrackPath && tracksByPath.get(selectedTrackPath)) ||
        (playingTrackPath && tracksByPath.get(playingTrackPath)) ||
        filteredTracks[0] ||
        allTracks[0] ||
        null;

  const albumName = contextTrack?.album ?? null;

  const orderedTracks = React.useMemo(() => {
    if (!contextTrack) {
      return [];
    }
    const albumTracks = albumName
      ? allTracks.filter((track) => track.album === albumName)
      : [contextTrack];
    return albumTracks.sort((a, b) => {
      const aTrack = a.track ?? Number.MAX_SAFE_INTEGER;
      const bTrack = b.track ?? Number.MAX_SAFE_INTEGER;
      if (aTrack !== bTrack) {
        return aTrack - bTrack;
      }
      return (a.title ?? a.path).localeCompare(b.title ?? b.path);
    });
  }, [allTracks, albumName, contextTrack]);

  // Any track in the album's folder works as the write target. Prefer the one
  // that already carries folder artwork so a replacement lands in the same
  // folder even when the album spans more than one.
  const artworkDropTrackPath =
    orderedTracks.find((track) => track.folderArtworkPath)?.path ??
    orderedTracks[0]?.path ??
    null;
  const { ref: artworkDropRef, dragging: artworkDragging } =
    useFolderArtworkDrop({
      trackPath: artworkDropTrackPath,
      serverUrl: server.url,
    });

  if (!contextTrack || orderedTracks.length === 0) {
    return null;
  }

  const title = albumName ?? contextTrack.title ?? contextTrack.path;
  const artist = pickMostCommon(
    orderedTracks.map((track) => track.albumArtist ?? track.artist),
  );
  const genres = [
    ...new Set(
      orderedTracks.flatMap((track) => (track.genre ? [track.genre] : [])),
    ),
  ];
  const totalDuration = orderedTracks.reduce(
    (sum, track) => sum + (track.duration ?? 0),
    0,
  );
  const folderArtworkTrack = orderedTracks.find(
    (track) => track.folderArtworkPath,
  );
  const folderArtworkUrl = folderArtworkTrack?.folderArtworkPath
    ? `${server.url}/music/artwork?path=${encodeURIComponent(folderArtworkTrack.folderArtworkPath)}`
    : null;

  const meta = [
    `${orderedTracks.length} ${orderedTracks.length === 1 ? 'song' : 'songs'}`,
    totalDuration > 0 ? formatAlbumDuration(totalDuration) : null,
  ].filter(Boolean) as string[];

  function editAlbumArtwork() {
    const trackPaths = orderedTracks.map((track) => track.path);
    dispatch(A.setMusicSelectedTracks(trackPaths));
    dispatch(A.setMusicEditTrackPath(trackPaths[0]));
    dispatch(A.setMusicEditTab('artwork'));
  }

  function playTracks(tracks: T.TrackMetadata[]) {
    if (tracks.length === 0) {
      return;
    }
    dispatch(A.setMusicPlaybackQueue(tracks));
    dispatch(A.musicPlaybackLoad(tracks[0].path));
  }

  return (
    <div className="musicAlbumHero">
      <div className="musicAlbumHeroArtwork" ref={artworkDropRef}>
        {folderArtworkUrl ? (
          <img
            src={
              folderArtworkVersion
                ? `${folderArtworkUrl}&v=${folderArtworkVersion}`
                : folderArtworkUrl
            }
            alt=""
          />
        ) : (
          <span
            className="musicAlbumHeroArtworkPlaceholder"
            aria-hidden="true"
          />
        )}
        <button
          type="button"
          className="musicAlbumHeroArtworkEdit"
          aria-label={`Edit artwork for ${title}`}
          onClick={editAlbumArtwork}
        >
          <span className="musicAlbumHeroArtworkEditIcon" aria-hidden="true" />
        </button>
        {artworkDragging && (
          <div className="musicAlbumHeroArtworkDropHint" aria-hidden="true">
            Set the album artwork
          </div>
        )}
      </div>
      <div className="musicAlbumHeroBody">
        <h2 className="musicAlbumHeroTitle">{title}</h2>
        {artist ? <div className="musicAlbumHeroArtist">{artist}</div> : null}
        {meta.length > 0 ? (
          <div className="musicAlbumHeroMeta">{meta.join(' • ')}</div>
        ) : null}
        <div className="musicAlbumHeroActions">
          <button
            type="button"
            className="musicAlbumHeroButton musicAlbumHeroButton-primary"
            aria-label={`Play ${title}`}
            onClick={() => playTracks(orderedTracks)}
          >
            <img src="/svg/play.svg" alt="" />
            Play
          </button>
          <button
            type="button"
            className="musicAlbumHeroButton"
            aria-label={`Shuffle ${title}`}
            onClick={() => playTracks(shuffleTracks(orderedTracks))}
          >
            <img src="/svg/shuffle.svg" alt="" />
            Shuffle
          </button>
        </div>
        {genres.length > 0 ? (
          <div className="musicAlbumHeroGenres">{genres.join(' • ')}</div>
        ) : null}
      </div>
    </div>
  );
}

function getPanelAllLabel(panel: T.MusicPanelType): string {
  switch (panel) {
    case 'genre':
      return '« All Genres »';
    case 'artist':
      return '« All Artists »';
    case 'album':
      return '« All Albums »';
    default:
      throw new UnhandledCaseError(panel, 'MusicPanelType');
  }
}

function getPanelField(panel: T.MusicPanelType) {
  switch (panel) {
    case 'genre':
      return (t: T.TrackMetadata) => t.genre;
    case 'artist':
      return getTrackFilterArtist;
    case 'album':
      return (t: T.TrackMetadata) => t.album;
    default:
      throw new UnhandledCaseError(panel, 'MusicPanelType');
  }
}

function getPanelItems(
  tracks: T.TrackMetadata[],
  panel: T.MusicPanelType,
): string[] {
  return [
    ...new Set(tracks.map(getPanelField(panel)).filter(Boolean)),
  ].sort() as string[];
}

function getPanelFrameId(
  track: T.TrackMetadata,
  panel: T.MusicPanelType,
): T.TrackTagUpdate['frameId'] {
  switch (panel) {
    case 'genre':
      return 'TCON';
    case 'album':
      return 'TALB';
    case 'artist':
      if (shouldPreferComposerGrouping(track) && track.composer) {
        return 'TCOM';
      }
      return track.albumArtist ? 'TPE2' : 'TPE1';
    default:
      throw new UnhandledCaseError(panel, 'MusicPanelType');
  }
}

function FilterPanel({
  panel,
  tracks,
}: {
  panel: T.MusicPanelType;
  tracks: T.TrackMetadata[];
}) {
  const { dispatch, getState } = Hooks.useStore();
  const contextMenuRef = useTrackContextMenu();
  const writeTags = useWriteTrackTags();
  const panelSelections = $$.getMusicPanelSelections();
  const selections = panelSelections[panel] ?? [];

  const items = React.useMemo(
    () => getPanelItems(tracks, panel),
    [tracks, panel],
  );

  // Keep a ref so the keydown handler always sees the latest items without
  // re-registering on every render.
  const itemsRef = React.useRef(items);
  itemsRef.current = items;

  // Filter stored selections to only those present in the current item list
  // (e.g. upstream panel changed and some values no longer exist).
  const effectiveSelections = React.useMemo(
    () => selections.filter((s) => items.includes(s)),
    [selections, items],
  );

  const listRef = React.useRef<HTMLDivElement | null>(null);
  const allItemRef = React.useRef<HTMLDivElement | null>(null);

  // cursor tracks the focused item for aria-activedescendant and keyboard nav.
  // cursorRef gives the keyboard handler synchronous access without stale closure.
  const [cursor, setCursorState] = React.useState<string | null>(null);
  const cursorRef = React.useRef<string | null>(null);
  // anchor is the pivot for shift-click range selection.
  const anchorRef = React.useRef<string | null>(null);

  function setCursor(value: string | null) {
    cursorRef.current = value;
    setCursorState(value);
  }

  // Sync cursor from Redux when selection has 0 or 1 item so that externally
  // dispatched actions (e.g. from tests or keyboard nav) stay in sync.
  React.useEffect(() => {
    if (effectiveSelections.length === 1) {
      const only = effectiveSelections[0];
      if (cursorRef.current !== only) {
        cursorRef.current = only;
        setCursorState(only);
        anchorRef.current = only;
      }
    } else if (effectiveSelections.length === 0) {
      if (cursorRef.current !== null) {
        cursorRef.current = null;
        setCursorState(null);
        anchorRef.current = null;
      }
    }
  }, [effectiveSelections]);

  const rename = useInlineRename<PanelRenamingState>(
    listRef,
    ({ targets, value }) => void commitRename(targets, value),
  );

  async function commitRename(targets: string[], value: string) {
    const field = getPanelField(panel);
    const pathsByFrameId = new Map<T.TrackTagUpdate['frameId'], string[]>();
    for (const track of tracks) {
      const frameId = getPanelFrameId(track, panel);
      if (
        targets.includes(field(track) ?? '') &&
        getTrackCapabilities(track.path).writableFrameIds.includes(frameId)
      ) {
        pathsByFrameId.set(frameId, [
          ...(pathsByFrameId.get(frameId) ?? []),
          track.path,
        ]);
      }
    }
    let allWritten = pathsByFrameId.size > 0;
    for (const [frameId, paths] of pathsByFrameId) {
      allWritten = (await writeTags(paths, [{ frameId, value }])) && allWritten;
    }
    if (!allWritten) {
      return;
    }
    const next = [
      ...new Set(
        ($.getMusicPanelSelections(getState())[panel] ?? [])
          .map((selected) => (targets.includes(selected) ? value : selected))
          .filter(Boolean),
      ),
    ];
    dispatch(
      A.setMusicPanelSelection(panel, next.length > 0 ? next : undefined),
    );
  }

  function handleItemClick(value: string, event: React.MouseEvent) {
    if (event.metaKey || event.ctrlKey) {
      const next = effectiveSelections.includes(value)
        ? effectiveSelections.filter((s) => s !== value)
        : [...effectiveSelections, value];
      setCursor(value);
      if (!effectiveSelections.includes(value)) {
        anchorRef.current = value;
      }
      dispatch(
        A.setMusicPanelSelection(panel, next.length > 0 ? next : undefined),
      );
    } else if (event.shiftKey && anchorRef.current !== null) {
      const anchorIndex = itemsRef.current.indexOf(anchorRef.current);
      const targetIndex = itemsRef.current.indexOf(value);
      const [start, end] =
        anchorIndex <= targetIndex
          ? [anchorIndex, targetIndex]
          : [targetIndex, anchorIndex];
      const range = itemsRef.current.slice(start, end + 1);
      setCursor(value);
      dispatch(A.setMusicPanelSelection(panel, range));
    } else {
      anchorRef.current = value;
      setCursor(value);
      dispatch(A.setMusicPanelSelection(panel, [value]));
    }
  }

  Hooks.useTypeAheadSearch(listRef, items, (value) => {
    anchorRef.current = value;
    setCursor(value);
    dispatch(A.setMusicPanelSelection(panel, [value]));
  });

  const cursorInItems = cursor !== null && items.includes(cursor);
  let activeDescendant: string | undefined;
  if (cursorInItems) {
    activeDescendant = `music-panel-${panel}-${items.indexOf(cursor!)}`;
  } else if (effectiveSelections.length === 0) {
    activeDescendant = `music-panel-${panel}-all`;
  }

  React.useEffect(() => {
    if (cursor === null && allItemRef.current) {
      allItemRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [cursor]);

  // Keep the active item visible when the panel is resized (e.g. splitter drag).
  React.useEffect(() => {
    const list = listRef.current;
    if (!list) {
      return undefined;
    }
    const observer = new ResizeObserver(() => {
      const activeId = list.getAttribute('aria-activedescendant');
      if (activeId) {
        document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' });
      }
    });
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (document.activeElement !== listRef.current) {
        return;
      }

      const currentItems = itemsRef.current;
      const currentCursor = cursorRef.current;
      const currentIndex =
        currentCursor !== null ? currentItems.indexOf(currentCursor) : -1;

      switch (event.key) {
        case 'F2': {
          event.preventDefault();
          if (currentCursor !== null && currentItems.includes(currentCursor)) {
            const selected = (
              $.getMusicPanelSelections(getState())[panel] ?? []
            ).filter((item) => currentItems.includes(item));
            const targets = selected.includes(currentCursor)
              ? selected
              : [currentCursor];
            rename.start({
              focused: currentCursor,
              targets,
              value: currentCursor,
              initialValue: currentCursor,
            });
          }
          break;
        }
        case 'ArrowUp': {
          event.preventDefault();
          // Shift extends the range selection instead of moving the cursor —
          // it's a modifier of this same action, not a distinct shortcut, so
          // this isn't the getKeyboardString switch-dispatch pattern.
          /* eslint-disable indie-web/prefer-keyboard-string */
          if (
            event.shiftKey &&
            anchorRef.current !== null &&
            currentIndex > 0
          ) {
            const newIndex = currentIndex - 1;
            const newCursor = currentItems[newIndex];
            setCursor(newCursor);
            const anchorIndex = currentItems.indexOf(anchorRef.current);
            const [start, end] =
              anchorIndex <= newIndex
                ? [anchorIndex, newIndex]
                : [newIndex, anchorIndex];
            dispatch(
              A.setMusicPanelSelection(
                panel,
                currentItems.slice(start, end + 1),
              ),
            );
          } else if (!event.shiftKey) {
            if (currentIndex > 0) {
              const next = currentItems[currentIndex - 1];
              anchorRef.current = next;
              setCursor(next);
              dispatch(A.setMusicPanelSelection(panel, [next]));
            } else if (currentIndex === 0) {
              anchorRef.current = null;
              setCursor(null);
              dispatch(A.setMusicPanelSelection(panel));
            }
          }
          /* eslint-enable indie-web/prefer-keyboard-string */
          break;
        }
        case 'ArrowDown': {
          event.preventDefault();
          const nextIndex =
            currentIndex < 0
              ? 0
              : Math.min(currentItems.length - 1, currentIndex + 1);
          if (currentItems[nextIndex] !== undefined) {
            // Shift extends the range selection instead of moving the cursor —
            // same rationale as the ArrowUp case above.
            /* eslint-disable indie-web/prefer-keyboard-string */
            if (
              event.shiftKey &&
              anchorRef.current !== null &&
              currentIndex >= 0
            ) {
              const newCursor = currentItems[nextIndex];
              setCursor(newCursor);
              const anchorIndex = currentItems.indexOf(anchorRef.current);
              const [start, end] =
                anchorIndex <= nextIndex
                  ? [anchorIndex, nextIndex]
                  : [nextIndex, anchorIndex];
              dispatch(
                A.setMusicPanelSelection(
                  panel,
                  currentItems.slice(start, end + 1),
                ),
              );
            } else {
              const next = currentItems[nextIndex];
              anchorRef.current = next;
              setCursor(next);
              dispatch(A.setMusicPanelSelection(panel, [next]));
            }
            /* eslint-enable indie-web/prefer-keyboard-string */
          }
          break;
        }
        case 'ArrowLeft':
        case 'ArrowRight': {
          event.preventDefault();
          // stopImmediatePropagation prevents the newly-focused panel's handler
          // from also firing on this same event (focus changes activeElement
          // synchronously, which would cause a double-advance).
          event.stopImmediatePropagation();
          const lists = Array.from(
            document.querySelectorAll<HTMLElement>('.musicFilterPanelList'),
          );
          const idx = lists.indexOf(listRef.current!);
          const target = lists[idx + (event.key === 'ArrowRight' ? 1 : -1)];
          if (target) {
            target.focus();
            // Scroll the destination panel's active item into view; selection
            // didn't change so the per-item effect won't fire on its own.
            const activeId = target.getAttribute('aria-activedescendant');
            if (activeId) {
              document
                .getElementById(activeId)
                ?.scrollIntoView({ block: 'nearest' });
            }
          }
          break;
        }
        case 'Escape': {
          event.preventDefault();
          anchorRef.current = null;
          setCursor(null);
          dispatch(A.setMusicPanelSelection(panel));
          break;
        }
        default:
          break;
      }
    }

    document.body.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.removeEventListener('keydown', handleKeyDown);
    };
  }, [panel]);

  const allSelected = effectiveSelections.length === 0;

  return (
    <div className="musicFilterPanel">
      <div className="musicFilterPanelHeader">{panel}</div>
      <div
        className="musicFilterPanelList"
        role="listbox"
        aria-label={panel}
        aria-multiselectable="true"
        tabIndex={0}
        aria-activedescendant={activeDescendant}
        ref={listRef}
        onContextMenu={(event) =>
          contextMenuRef.current?.openForFilteredTracks(event)
        }
      >
        <div
          className={`musicFilterPanelItem${allSelected ? ' selected' : ''}`}
          role="option"
          aria-selected={allSelected}
          id={`music-panel-${panel}-all`}
          ref={allItemRef}
          onClick={() => {
            anchorRef.current = null;
            setCursor(null);
            dispatch(A.setMusicPanelSelection(panel));
          }}
        >
          {getPanelAllLabel(panel)}
        </div>
        {items.map((value, index) => (
          <FilterPanelItem
            key={value}
            panel={panel}
            value={value}
            index={index}
            isSelected={effectiveSelections.includes(value)}
            isCursor={value === cursor}
            onClick={(event) => handleItemClick(value, event)}
            isRenameTarget={rename.state?.targets.includes(value) ?? false}
            rename={
              rename.state?.focused === value
                ? {
                    value: rename.state.value,
                    placeholder: '',
                    onChange: rename.onChange,
                    onKeyDown: rename.onKeyDown,
                    onBlur: rename.onBlur,
                  }
                : null
            }
          />
        ))}
      </div>
    </div>
  );
}

function FilterPanelItem({
  panel,
  value,
  index,
  isSelected,
  isCursor,
  onClick,
  isRenameTarget,
  rename,
}: {
  panel: T.MusicPanelType;
  value: string;
  index: number;
  isSelected: boolean;
  isCursor: boolean;
  onClick: (event: React.MouseEvent) => void;
  isRenameTarget: boolean;
  rename: InlineRename | null;
}) {
  const divRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (isCursor && divRef.current) {
      divRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [isCursor]);

  return (
    <div
      className={`musicFilterPanelItem${isSelected ? ' selected' : ''}${isRenameTarget ? ' renameTarget' : ''}`}
      role="option"
      aria-selected={isSelected}
      id={`music-panel-${panel}-${index}`}
      ref={divRef}
      onClick={onClick}
    >
      {rename ? (
        <input
          className="musicRenameInput"
          autoFocus
          value={rename.value}
          placeholder={rename.placeholder}
          onChange={(event) => rename.onChange(event.target.value)}
          onKeyDown={rename.onKeyDown}
          onBlur={rename.onBlur}
          onClick={(event) => event.stopPropagation()}
        />
      ) : (
        value
      )}
    </div>
  );
}

const sizeEstimate = 32;

function useInlineRename<S extends { value: string; initialValue: string }>(
  returnFocusRef: React.RefObject<HTMLElement | null>,
  onCommit: (state: S) => void,
) {
  const [state, setState] = React.useState<S | null>(null);
  const stateRef = React.useRef(state);
  stateRef.current = state;
  const onCommitRef = React.useRef(onCommit);
  onCommitRef.current = onCommit;
  const cancelRef = React.useRef(false);

  function onBlur() {
    const current = stateRef.current;
    setState(null);
    if (cancelRef.current) {
      cancelRef.current = false;
    } else if (current && current.value !== current.initialValue) {
      onCommitRef.current(current);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === 'Escape') {
      event.preventDefault();
      // Otherwise the event reaches the list's own handler once focus moves
      // back to it, which would play the track or clear the selection.
      event.stopPropagation();
      cancelRef.current = event.key === 'Escape';
      returnFocusRef.current?.focus();
    }
  }

  function onChange(value: string) {
    setState((current) => current && { ...current, value });
  }

  return { state, start: setState, onChange, onKeyDown, onBlur };
}

interface PanelRenamingState {
  focused: string;
  targets: string[];
  value: string;
  initialValue: string;
}

interface RenamingState {
  paths: string[];
  focusedPath: string;
  value: string;
  initialValue: string;
  placeholder: string;
}

interface InlineRename {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onBlur: () => void;
}

interface TracksProps {
  onScrollbarWidthChange: (width: number) => void;
}

function Tracks({ onScrollbarWidthChange }: TracksProps) {
  const tracks = $$.getFilteredMusicTracks();
  const selectedPaths = $$.getMusicSelectedTrackPaths();
  const playingPath = $$.getMusicPlaybackTrackPath();
  const { getState, dispatch } = Hooks.useStore();

  const listRef = React.useRef<HTMLDivElement | null>(null);
  const contextMenuRef = useTrackContextMenu();
  const tracksRef = React.useRef(tracks);
  tracksRef.current = tracks;
  const writeTags = useWriteTrackTags();
  const rename = useInlineRename<RenamingState>(listRef, ({ paths, value }) => {
    void writeTags(paths, [{ frameId: 'TIT2', value }]);
  });

  React.useEffect(() => {
    const el = listRef.current;
    if (!el) {
      return undefined;
    }
    const observer = new ResizeObserver(() => {
      onScrollbarWidthChange(el.offsetWidth - el.clientWidth);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [onScrollbarWidthChange]);

  // focusedPath is the keyboard cursor and the anchor for Enter/Space playback.
  // focusedPathRef gives the keyboard handler synchronous access.
  const [focusedPath, setFocusedPathState] = React.useState<string | null>(
    null,
  );
  const focusedPathRef = React.useRef<string | null>(null);
  // anchorPath is the pivot for shift-click range selection.
  const anchorPathRef = React.useRef<string | null>(null);

  function setFocusedPath(path: string | null) {
    focusedPathRef.current = path;
    setFocusedPathState(path);
  }

  // Sync focusedPath from Redux when selection has 0 or 1 item.
  React.useEffect(() => {
    if (selectedPaths.length === 1) {
      const only = selectedPaths[0];
      if (focusedPathRef.current !== only) {
        focusedPathRef.current = only;
        setFocusedPathState(only);
        anchorPathRef.current = only;
      }
    } else if (selectedPaths.length === 0) {
      if (focusedPathRef.current !== null) {
        focusedPathRef.current = null;
        setFocusedPathState(null);
        anchorPathRef.current = null;
      }
    }
  }, [selectedPaths]);

  const focusedIndex = focusedPath
    ? tracks.findIndex((t) => t.path === focusedPath)
    : -1;

  const activeDescendant =
    focusedIndex >= 0 ? `music-track-${focusedIndex}` : undefined;

  const handlePlay = React.useCallback((path: string) => {
    dispatch(A.setMusicPlaybackQueue(tracksRef.current));
    dispatch(A.musicPlaybackLoad(path));
  }, []);

  const handleTrackClick = React.useCallback(
    (track: T.TrackMetadata, event: React.MouseEvent) => {
      const currentPaths = $.getMusicSelectedTrackPaths(getState());
      if (event.metaKey || event.ctrlKey) {
        const isSelected = currentPaths.includes(track.path);
        const next = isSelected
          ? currentPaths.filter((p) => p !== track.path)
          : [...currentPaths, track.path];
        setFocusedPath(track.path);
        if (!isSelected) {
          anchorPathRef.current = track.path;
        }
        dispatch(A.setMusicSelectedTracks(next));
      } else if (event.shiftKey && anchorPathRef.current !== null) {
        const currentTracks = tracksRef.current;
        const anchorIndex = currentTracks.findIndex(
          (t) => t.path === anchorPathRef.current,
        );
        const targetIndex = currentTracks.findIndex(
          (t) => t.path === track.path,
        );
        const [start, end] =
          anchorIndex <= targetIndex
            ? [anchorIndex, targetIndex]
            : [targetIndex, anchorIndex];
        const range = currentTracks.slice(start, end + 1).map((t) => t.path);
        setFocusedPath(track.path);
        dispatch(A.setMusicSelectedTracks(range));
      } else {
        anchorPathRef.current = track.path;
        setFocusedPath(track.path);
        dispatch(A.setMusicSelectedTracks([track.path]));
      }
    },
    [],
  );

  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: tracks.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => sizeEstimate,
    overscan: 5,
  });

  const virtualizerRef = React.useRef(virtualizer);
  virtualizerRef.current = virtualizer;

  React.useEffect(() => {
    if (focusedIndex >= 0) {
      virtualizerRef.current.scrollToIndex(focusedIndex, { align: 'auto' });
    }
  }, [focusedIndex]);

  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isFilterPanelFocused = Boolean(
        document.activeElement?.closest('.musicFilterPanelList'),
      );
      if (document.activeElement !== listRef.current && !isFilterPanelFocused) {
        return;
      }

      const currentTracks = tracksRef.current;
      const currentPath = focusedPathRef.current;
      const currentIndex = currentPath
        ? currentTracks.findIndex((t) => t.path === currentPath)
        : -1;

      function getShortcutTargetPaths(): string[] {
        if (isFilterPanelFocused) {
          const filteredPaths = currentTracks.map((track) => track.path);
          dispatch(A.setMusicSelectedTracks(filteredPaths));
          return filteredPaths;
        }
        const selectedPaths = $.getMusicSelectedTrackPaths(getState());
        if (selectedPaths.length > 0) {
          return selectedPaths;
        }
        return currentPath ? [currentPath] : [];
      }

      const keyboardString = getKeyboardString(event);

      switch (keyboardString) {
        case 'Enter': {
          if (!isFilterPanelFocused) {
            break;
          }
          event.preventDefault();
          contextMenuRef.current?.play(getShortcutTargetPaths());
          return;
        }
        case 'Meta+E':
        case 'Control+E': {
          event.preventDefault();
          contextMenuRef.current?.edit(getShortcutTargetPaths(), 'details');
          return;
        }
        case 'Meta+I':
        case 'Control+I': {
          event.preventDefault();
          contextMenuRef.current?.edit(getShortcutTargetPaths(), 'id3');
          return;
        }
        case 'Meta+Shift+E':
        case 'Control+Shift+E': {
          event.preventDefault();
          contextMenuRef.current?.batchEdit(getShortcutTargetPaths());
          return;
        }
        case 'Meta+Enter':
        case 'Control+Enter': {
          event.preventDefault();
          const shortcutTargetPaths = getShortcutTargetPaths();
          if (shortcutTargetPaths.length === 1) {
            contextMenuRef.current?.showInFiles(shortcutTargetPaths[0]);
          }
          return;
        }
        case 'Meta+Shift+Enter':
        case 'Control+Shift+Enter': {
          event.preventDefault();
          const shortcutTargetPaths = getShortcutTargetPaths();
          if (
            shortcutTargetPaths.length === 1 &&
            $.getFileManagerRevealLabel(getState())
          ) {
            contextMenuRef.current?.revealInFileManager(shortcutTargetPaths[0]);
          }
          return;
        }
        case 'Meta+Delete':
        case 'Meta+Backspace':
        case 'Control+Delete':
        case 'Control+Backspace': {
          event.preventDefault();
          contextMenuRef.current?.deleteTracks(getShortcutTargetPaths());
          return;
        }
        case 'Meta+A':
        case 'Control+A': {
          if (isFilterPanelFocused) {
            return;
          }
          event.preventDefault();
          const allPaths = currentTracks.map((track) => track.path);
          anchorPathRef.current = currentPath ?? allPaths[0] ?? null;
          dispatch(A.setMusicSelectedTracks(allPaths));
          return;
        }
        default:
          break;
      }

      if (isFilterPanelFocused) {
        return;
      }

      if (keyboardString === 'F2') {
        event.preventDefault();
        const paths = getShortcutTargetPaths().filter((path) =>
          getTrackCapabilities(path).writableFrameIds.includes('TIT2'),
        );
        if (paths.length === 0) {
          return;
        }
        const titles = new Map(
          $.getMusicTracks(getState()).map((t) => [t.path, t.title ?? '']),
        );
        const values = new Set(paths.map((path) => titles.get(path) ?? ''));
        const value = values.size === 1 ? [...values][0] : '';
        rename.start({
          paths,
          focusedPath: paths.includes(currentPath ?? '')
            ? (currentPath as string)
            : paths[0],
          value,
          initialValue: value,
          placeholder: values.size === 1 ? '' : 'Mixed',
        });
        return;
      }

      switch (event.key) {
        case 'ArrowUp': {
          event.preventDefault();
          if (currentIndex > 0) {
            const newPath = currentTracks[currentIndex - 1].path;
            // Shift extends the range selection instead of moving the cursor
            // — it's a modifier of this same action, not a distinct shortcut,
            // so this isn't the getKeyboardString switch-dispatch pattern.
            // eslint-disable-next-line indie-web/prefer-keyboard-string
            if (event.shiftKey && anchorPathRef.current !== null) {
              setFocusedPath(newPath);
              const anchorIndex = currentTracks.findIndex(
                (t) => t.path === anchorPathRef.current,
              );
              const newCursorIndex = currentIndex - 1;
              const [start, end] =
                anchorIndex <= newCursorIndex
                  ? [anchorIndex, newCursorIndex]
                  : [newCursorIndex, anchorIndex];
              dispatch(
                A.setMusicSelectedTracks(
                  currentTracks.slice(start, end + 1).map((t) => t.path),
                ),
              );
            } else {
              anchorPathRef.current = newPath;
              setFocusedPath(newPath);
              dispatch(A.setMusicSelectedTracks([newPath]));
            }
          }
          break;
        }
        case 'ArrowDown': {
          event.preventDefault();
          const nextIndex =
            currentIndex < 0
              ? 0
              : Math.min(currentTracks.length - 1, currentIndex + 1);
          if (currentTracks[nextIndex]) {
            const newPath = currentTracks[nextIndex].path;
            // Shift extends the range selection instead of moving the cursor
            // — same rationale as the ArrowUp case above.
            /* eslint-disable indie-web/prefer-keyboard-string */
            if (
              event.shiftKey &&
              anchorPathRef.current !== null &&
              currentIndex >= 0
            ) {
              setFocusedPath(newPath);
              const anchorIndex = currentTracks.findIndex(
                (t) => t.path === anchorPathRef.current,
              );
              const [start, end] =
                anchorIndex <= nextIndex
                  ? [anchorIndex, nextIndex]
                  : [nextIndex, anchorIndex];
              dispatch(
                A.setMusicSelectedTracks(
                  currentTracks.slice(start, end + 1).map((t) => t.path),
                ),
              );
            } else {
              anchorPathRef.current = newPath;
              setFocusedPath(newPath);
              dispatch(A.setMusicSelectedTracks([newPath]));
            }
            /* eslint-enable indie-web/prefer-keyboard-string */
          }
          break;
        }
        case 'Enter': {
          event.preventDefault();
          if (currentPath) {
            const selectedPaths = $.getMusicSelectedTrackPaths(getState());
            // Queue up either all of the filtered tracks, or just the selected
            // tracks if there is more than one selection.
            const queue =
              selectedPaths.length > 1
                ? currentTracks.filter((t) => selectedPaths.includes(t.path))
                : currentTracks;
            dispatch(A.setMusicPlaybackQueue(queue));
            dispatch(A.musicPlaybackLoad(currentPath));
          }
          break;
        }
        case ' ': {
          event.preventDefault();
          const playbackStatus = $.getMusicPlaybackStatus(getState());
          if (playbackStatus === 'playing') {
            dispatch(A.musicPlaybackPause());
          } else if (playbackStatus === 'paused') {
            dispatch(A.musicPlaybackPlay());
          } else if (currentPath) {
            dispatch(A.setMusicPlaybackQueue(currentTracks));
            dispatch(A.musicPlaybackLoad(currentPath));
          }
          break;
        }
        case 'Escape': {
          event.preventDefault();
          anchorPathRef.current = null;
          setFocusedPath(null);
          dispatch(A.setMusicSelectedTracks([]));
          break;
        }
        default:
          break;
      }
    }

    document.body.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const titles = React.useMemo(
    () => tracks.map((t) => t.title ?? t.path),
    [tracks],
  );

  Hooks.useTypeAheadSearch(listRef, titles, (title) => {
    const track = tracks.find((t) => (t.title ?? t.path) === title);
    if (track) {
      anchorPathRef.current = track.path;
      setFocusedPath(track.path);
      dispatch(A.setMusicSelectedTracks([track.path]));
    }
  });

  useFolderArtworkPaste({
    trackPath: selectedPaths[0] ?? focusedPath ?? null,
    isActive: () => document.activeElement === listRef.current,
  });

  return (
    <div className="musicTracksContainer">
      <div
        className="musicTracks"
        role="listbox"
        aria-label="Tracks"
        aria-multiselectable="true"
        tabIndex={0}
        aria-activedescendant={activeDescendant}
        ref={listRef}
      >
        <div
          style={{
            height: virtualizer.getTotalSize(),
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const track = tracks[virtualItem.index];
            return (
              <Track
                key={track.path}
                track={track}
                index={virtualItem.index}
                isSelected={selectedPaths.includes(track.path)}
                isPlaying={track.path === playingPath}
                onClick={(event) => handleTrackClick(track, event)}
                onPlay={handlePlay}
                onContextMenu={(event) =>
                  contextMenuRef.current?.open(event, track.path)
                }
                rename={
                  rename.state?.focusedPath === track.path
                    ? {
                        value: rename.state.value,
                        placeholder: rename.state.placeholder,
                        onChange: rename.onChange,
                        onKeyDown: rename.onKeyDown,
                        onBlur: rename.onBlur,
                      }
                    : null
                }
                offsetTop={virtualItem.start}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Track({
  track,
  index,
  isSelected,
  isPlaying,
  onClick,
  onContextMenu,
  onPlay,
  rename,
  offsetTop,
}: {
  track: T.TrackMetadata;
  index: number;
  isSelected: boolean;
  isPlaying: boolean;
  onClick: (event: React.MouseEvent) => void;
  onContextMenu: (event: React.MouseEvent) => void;
  onPlay: (path: string) => void;
  rename: InlineRename | null;
  offsetTop: number;
}) {
  return (
    <div
      className={`musicTrack${isSelected ? ' selected' : ''}`}
      role="option"
      aria-selected={isSelected}
      id={`music-track-${index}`}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: `${sizeEstimate}px`,
        transform: `translateY(${offsetTop}px)`,
      }}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onDoubleClick={() => {
        onPlay(track.path);
      }}
    >
      <span className="musicTrackNumber" aria-hidden="true">
        {isPlaying ? <img src="/svg/play.svg" alt="" /> : (track.track ?? '')}
      </span>
      {rename ? (
        <span className="musicTrackTitle editing">
          <input
            className="musicRenameInput"
            autoFocus
            value={rename.value}
            placeholder={rename.placeholder}
            onChange={(event) => rename.onChange(event.target.value)}
            onKeyDown={rename.onKeyDown}
            onBlur={rename.onBlur}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
          />
        </span>
      ) : (
        <span className="musicTrackTitle">{track.title ?? track.path}</span>
      )}
      <span className="musicTrackArtist">{track.artist}</span>
      <span className="musicTrackAlbum">{track.album}</span>
    </div>
  );
}
