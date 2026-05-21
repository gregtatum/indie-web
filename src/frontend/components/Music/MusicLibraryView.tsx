import * as React from 'react';
import { $$, T, A, Hooks, $ } from 'frontend';
import { UnhandledCaseError } from 'frontend/utils';
import { Splitter } from 'frontend/components/Splitter';
import { upgradeMusicIndex } from 'frontend/logic/music/music-index-upgraders';
import { useVirtualizer } from '@tanstack/react-virtual';
import { PlaybackBar } from './PlaybackBar';

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

export function MusicLibraryView() {
  const server = $$.getCurrentServerOrNull();
  const { dispatch } = Hooks.useStore();
  const [error, setError] = React.useState<React.ReactNode>(null);

  React.useEffect(() => {
    if (!server) {
      return undefined;
    }
    const currentServer = server;
    const fetchController = new AbortController();

    async function loadIndex() {
      try {
        const res = await fetch(`${currentServer.url}/music/music-index`, {
          signal: fetchController.signal,
        });
        if (!res.ok) {
          setError('Music library not found. Run a scan first.');
          return;
        }
        const { index, wasUpgraded } = upgradeMusicIndex(await res.json());
        dispatch(A.setMusicTracks(index.tracks, wasUpgraded));
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        setError(getConnectionErrorMessage(currentServer));
      }
    }

    // loadIndex is infallible as it handles the error.
    void loadIndex();

    return () => {
      // When unmounting the component, cancel the music index fetch.
      fetchController.abort();
    };
  }, [server?.url]);

  if (error) {
    return (
      <div className="musicLibraryView">
        <div className="musicLibraryViewError">
          <div>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="musicLibraryView">
      <Splitter
        direction="vertical"
        className="musicLibrarySplitter"
        start={<FilterPanels />}
        end={<SongsView />}
        persistLocalStorage="musicLibrarySplitterOffset"
      />
    </div>
  );
}

type ConfigurableColumns = 'artist' | 'album';
type ColumnWidths = Record<ConfigurableColumns, number>;
const COL_MIN_WIDTH = 60;
const SONG_MIN_WIDTH = 100; // matches .musicSongsHeaderTitle { min-width: 100px }
const MUSIC_GAP = 12; // matches --music-gap CSS variable
const MUSIC_PADDING_H = 12; // matches --music-padding-h CSS variable
const CONFIGURABLE_COLUMNS: ConfigurableColumns[] = ['artist', 'album'];

function clampColumnWidths(prev: ColumnWidths, maxWidth: number): ColumnWidths {
  const maxForConfigurable = maxWidth - SONG_MIN_WIDTH;
  const total = CONFIGURABLE_COLUMNS.reduce((sum, k) => sum + prev[k], 0);
  if (total <= maxForConfigurable) return prev;
  const result = { ...prev };
  let excess = total - maxForConfigurable;
  for (let i = CONFIGURABLE_COLUMNS.length - 1; i >= 0 && excess > 0; i--) {
    const key = CONFIGURABLE_COLUMNS[i];
    const shrinkBy = Math.min(excess, Math.max(0, result[key] - COL_MIN_WIDTH));
    result[key] -= shrinkBy;
    excess -= shrinkBy;
  }
  return result;
}

function loadColumnWidths(): ColumnWidths {
  try {
    const parsed = JSON.parse(
      localStorage.getItem('musicSongColumnWidths') ?? 'null',
    );
    if (
      parsed &&
      typeof parsed === 'object' &&
      Number.isFinite(parsed.artist) &&
      Number.isFinite(parsed.album)
    ) {
      return {
        artist: Math.max(COL_MIN_WIDTH, parsed.artist),
        album: Math.max(COL_MIN_WIDTH, parsed.album),
      };
    }
  } catch {
    // Ignore malformed localStorage data.
  }
  return { artist: 160, album: 160 };
}

function useColumnWidths() {
  const [columnWidths, setColumnWidths] =
    React.useState<ColumnWidths>(loadColumnWidths);

  React.useEffect(() => {
    // TODO - Let's debounce this to something like 500ms.
    localStorage.setItem('musicSongColumnWidths', JSON.stringify(columnWidths));
  }, [columnWidths]);

  return { columnWidths, setColumnWidths };
}

function SongsView() {
  const { columnWidths, setColumnWidths } = useColumnWidths();

  return (
    <div
      className="musicSongsView"
      style={
        {
          '--column-artist': `${columnWidths.artist}px`,
          '--column-album': `${columnWidths.album}px`,
        } as React.CSSProperties
      }
    >
      <SongsHeader setColumnWidths={setColumnWidths} />
      <Songs />
      <PlaybackBar />
    </div>
  );
}

interface ColumnHeaderProps {
  columnKey: ConfigurableColumns;
  columnOrder: ConfigurableColumns[];
  label: string;
  setColumnWidths: React.Dispatch<React.SetStateAction<ColumnWidths>>;
  maxAvailableWidth: number;
}

function ColumnHeader({
  columnKey,
  columnOrder,
  label,
  setColumnWidths,
  maxAvailableWidth,
}: ColumnHeaderProps) {
  function dragHandler(dx: number) {
    setColumnWidths((prev) => {
      const result = { ...prev };
      const myIndex = columnOrder.indexOf(columnKey);

      if (dx > 0) {
        // Drag right: shrink this column, cascade right if it hits min, grow left neighbor.
        let remaining = dx;
        for (let i = myIndex; i < columnOrder.length && remaining > 0; i++) {
          const key = columnOrder[i];
          const shrinkBy = Math.min(remaining, Math.max(0, result[key] - COL_MIN_WIDTH));
          result[key] -= shrinkBy;
          remaining -= shrinkBy;
        }
        // Grow left neighbor. Song (K=0) grows automatically via flex:1.
        if (myIndex > 0) {
          result[columnOrder[myIndex - 1]] += dx - remaining;
        }
      } else {
        // Drag left: grow this column, cascade left through explicit columns then song.
        let remaining = -dx;
        for (let i = myIndex - 1; i >= 0 && remaining > 0; i--) {
          const key = columnOrder[i];
          const canTake = Math.max(0, result[key] - COL_MIN_WIDTH);
          const taken = Math.min(remaining, canTake);
          result[key] -= taken;
          result[columnKey] += taken;
          remaining -= taken;
        }
        if (remaining > 0) {
          const songCurrent =
            maxAvailableWidth - columnOrder.reduce((sum, k) => sum + result[k], 0);
          const canTake = Math.max(0, songCurrent - SONG_MIN_WIDTH);
          result[columnKey] += Math.min(remaining, canTake);
        }
      }

      return result;
    });
  }

  return (
    <div
      className="musicSongsHeaderCell"
      style={{ flex: `0 0 var(--column-${columnKey})` }}
    >
      <ColumnResizeHandle onDrag={dragHandler} />
      <div className="musicSongsHeaderCellText">{label}</div>
    </div>
  );
}

interface SongsHeaderProps {
  setColumnWidths: React.Dispatch<React.SetStateAction<ColumnWidths>>;
}

function SongsHeader({ setColumnWidths }: SongsHeaderProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [maxAvailableWidth, setMaxAvailableWidth] = React.useState(400);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const numCols = CONFIGURABLE_COLUMNS.length + 1; // +1 for Song
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      const newMax = width - 2 * MUSIC_PADDING_H - (numCols - 1) * MUSIC_GAP;
      setMaxAvailableWidth(newMax);
      setColumnWidths((prev) => clampColumnWidths(prev, newMax));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="musicSongsHeader" ref={containerRef}>
      <div className="musicSongsHeaderCell musicSongsHeaderTitle">
        <div className="musicSongsHeaderCellText">Song</div>
      </div>
      <ColumnHeader
        columnKey="artist"
        columnOrder={CONFIGURABLE_COLUMNS}
        label="Artist"
        setColumnWidths={setColumnWidths}
        maxAvailableWidth={maxAvailableWidth}
      />
      <ColumnHeader
        columnKey="album"
        columnOrder={CONFIGURABLE_COLUMNS}
        label="Album"
        setColumnWidths={setColumnWidths}
        maxAvailableWidth={maxAvailableWidth}
      />
    </div>
  );
}

function ColumnResizeHandle({ onDrag }: { onDrag: (dx: number) => void }) {
  const onMouseDown: React.MouseEventHandler = (event) => {
    event.preventDefault();
    document.body.style.cursor = 'col-resize';
    let lastX = event.pageX;

    function handleMove(ev: MouseEvent) {
      onDrag(ev.pageX - lastX);
      lastX = ev.pageX;
    }
    function handleUp() {
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    }
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  };

  return (
    <div className="musicSongColumnResize" onMouseDown={onMouseDown}>
      <div className="musicSongColumnResizeVisible" />
    </div>
  );
}

function FilterPanels() {
  const panelTracks = $$.getMusicPanelTracks();
  return (
    <div className="musicFilterPanels">
      <FilterPanel panel="genre" tracks={panelTracks.genre} />
      <FilterPanel panel="artist" tracks={panelTracks.artist} />
      <FilterPanel panel="album" tracks={panelTracks.album} />
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

function getPanelItems(
  tracks: T.TrackMetadata[],
  panel: T.MusicPanelType,
): string[] {
  let field: (track: T.TrackMetadata) => string | null;
  switch (panel) {
    case 'genre':
      field = (t) => t.genre;
      break;
    case 'artist':
      field = (t) => t.artist;
      break;
    case 'album':
      field = (t) => t.album;
      break;
    default:
      throw new UnhandledCaseError(panel, 'MusicPanelType');
  }
  return [...new Set(tracks.map(field).filter(Boolean))].sort() as string[];
}

function FilterPanel({
  panel,
  tracks,
}: {
  panel: T.MusicPanelType;
  tracks: T.TrackMetadata[];
}) {
  const { getState, dispatch } = Hooks.useStore();
  const panelSelections = $$.getMusicPanelSelections();
  const selection = panelSelections[panel];

  const items = React.useMemo(
    () => getPanelItems(tracks, panel),
    [tracks, panel],
  );

  // Keep a ref so the keydown handler always sees the latest items without
  // re-registering on every render.
  const itemsRef = React.useRef(items);
  itemsRef.current = items;

  // If the stored selection isn't in the current filtered list (e.g. genre
  // changed and the previous artist no longer exists in it), treat it as
  // unset for display purposes without clearing the store value.
  const effectiveSelection =
    selection && items.includes(selection) ? selection : undefined;
  const selectedIndex = effectiveSelection
    ? items.indexOf(effectiveSelection)
    : -1;
  const listRef = React.useRef<HTMLDivElement | null>(null);

  Hooks.useTypeAheadSearch(listRef, items, (value) =>
    dispatch(A.setMusicPanelSelection(panel, value)),
  );

  let activeDescendant: string | undefined;
  if (!effectiveSelection) {
    activeDescendant = `music-panel-${panel}-all`;
  } else if (selectedIndex >= 0) {
    activeDescendant = `music-panel-${panel}-${selectedIndex}`;
  }
  const allItemRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!effectiveSelection && allItemRef.current) {
      allItemRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [effectiveSelection]);

  // Keep the active item visible when the panel is resized (e.g. splitter drag).
  React.useEffect(() => {
    const list = listRef.current;
    if (!list) return undefined;
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
      const currentSelection = $.getMusicPanelSelections(getState())[panel];
      const currentIndex = currentSelection
        ? currentItems.indexOf(currentSelection)
        : -1;

      switch (event.key) {
        case 'ArrowUp': {
          event.preventDefault();
          if (currentIndex > 0) {
            dispatch(
              A.setMusicPanelSelection(panel, currentItems[currentIndex - 1]),
            );
          } else if (currentIndex === 0) {
            dispatch(A.setMusicPanelSelection(panel));
          }
          break;
        }
        case 'ArrowDown': {
          event.preventDefault();
          const nextIndex =
            currentIndex < 0
              ? 0
              : Math.min(currentItems.length - 1, currentIndex + 1);
          if (currentItems[nextIndex] !== undefined) {
            dispatch(A.setMusicPanelSelection(panel, currentItems[nextIndex]));
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

  return (
    <div className="musicFilterPanel">
      <div className="musicFilterPanelHeader">{panel}</div>
      <div
        className="musicFilterPanelList"
        role="listbox"
        tabIndex={0}
        aria-activedescendant={activeDescendant}
        ref={listRef}
      >
        <div
          className={`musicFilterPanelItem${!effectiveSelection ? ' selected' : ''}`}
          role="option"
          aria-selected={!effectiveSelection}
          id={`music-panel-${panel}-all`}
          ref={allItemRef}
          onClick={() => dispatch(A.setMusicPanelSelection(panel))}
        >
          {getPanelAllLabel(panel)}
        </div>
        {items.map((value, index) => (
          <FilterPanelItem
            key={value}
            panel={panel}
            value={value}
            index={index}
            isSelected={value === effectiveSelection}
            dispatch={dispatch}
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
  dispatch,
}: {
  panel: T.MusicPanelType;
  value: string;
  index: number;
  isSelected: boolean;
  dispatch: T.Dispatch;
}) {
  const divRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (isSelected && divRef.current) {
      divRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [isSelected]);

  return (
    <div
      className={`musicFilterPanelItem${isSelected ? ' selected' : ''}`}
      role="option"
      aria-selected={isSelected}
      id={`music-panel-${panel}-${index}`}
      ref={divRef}
      onClick={() => {
        dispatch(A.setMusicPanelSelection(panel, value));
      }}
    >
      {value}
    </div>
  );
}

function Songs() {
  const tracks = $$.getFilteredMusicTracks();
  const selectedPath = $$.getMusicSelectedTrackPath();
  const { getState, dispatch } = Hooks.useStore();

  const selectedIndex = selectedPath
    ? tracks.findIndex((t) => t.path === selectedPath)
    : -1;
  const listRef = React.useRef<HTMLDivElement | null>(null);

  const activeDescendant =
    selectedIndex >= 0 ? `music-song-${selectedIndex}` : undefined;

  const tracksRef = React.useRef(tracks);
  tracksRef.current = tracks;

  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: tracks.length,
    getScrollElement: () => listRef.current,
    // Must match the height set on .musicSong in index.css (box-sizing: border-box).
    // Derived from: padding-v (8px×2) + border-bottom (1px) + line-height (~16.5px) ≈ 33.5px.
    // Rounded up to 34 per the TanStack Virtual recommendation to estimate the
    // largest plausible size when not using dynamic measurement.
    estimateSize: () => 34,
    overscan: 5,
  });

  const virtualizerRef = React.useRef(virtualizer);
  virtualizerRef.current = virtualizer;

  React.useEffect(() => {
    if (selectedIndex >= 0) {
      virtualizerRef.current.scrollToIndex(selectedIndex, { align: 'auto' });
    }
  }, [selectedIndex]);

  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (document.activeElement !== listRef.current) {
        return;
      }

      const currentTracks = tracksRef.current;
      const currentPath = $.getMusicSelectedTrackPath(getState());
      const currentIndex = currentPath
        ? currentTracks.findIndex((t) => t.path === currentPath)
        : -1;

      switch (event.key) {
        case 'ArrowUp': {
          event.preventDefault();
          if (currentIndex > 0) {
            dispatch(
              A.setMusicSelectedTrack(currentTracks[currentIndex - 1].path),
            );
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
            dispatch(A.setMusicSelectedTrack(currentTracks[nextIndex].path));
          }
          break;
        }
        case 'Enter': {
          event.preventDefault();
          if (currentPath) {
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
            dispatch(A.musicPlaybackLoad(currentPath));
          }
          break;
        }
        case 'Escape': {
          event.preventDefault();
          dispatch(A.setMusicSelectedTrack());
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
      dispatch(A.setMusicSelectedTrack(track.path));
    }
  });

  return (
    <div className="musicSongsContainer">
      <div
        className="musicSongs"
        role="listbox"
        aria-label="Songs"
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
              <Song
                key={track.path}
                track={track}
                index={virtualItem.index}
                isSelected={track.path === selectedPath}
                dispatch={dispatch}
                offsetTop={virtualItem.start}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Song({
  track,
  index,
  isSelected,
  dispatch,
  offsetTop,
}: {
  track: T.TrackMetadata;
  index: number;
  isSelected: boolean;
  dispatch: T.Dispatch;
  offsetTop: number;
}) {
  return (
    <div
      className={`musicSong${isSelected ? ' selected' : ''}`}
      role="option"
      aria-selected={isSelected}
      id={`music-song-${index}`}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '34px',
        transform: `translateY(${offsetTop}px)`,
      }}
      onClick={() =>
        dispatch(A.setMusicSelectedTrack(isSelected ? undefined : track.path))
      }
      onDoubleClick={() => {
        dispatch(A.setMusicSelectedTrack(track.path));
        dispatch(A.musicPlaybackLoad(track.path));
      }}
    >
      <span className="musicSongTitle">{track.title ?? track.path}</span>
      <span className="musicSongArtist">{track.artist}</span>
      <span className="musicSongAlbum">{track.album}</span>
    </div>
  );
}
