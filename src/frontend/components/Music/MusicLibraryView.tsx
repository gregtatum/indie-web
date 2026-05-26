import * as React from 'react';
import { $$, T, A, Hooks, $ } from 'frontend';
import { UnhandledCaseError } from 'frontend/utils';
import { Splitter } from 'frontend/components/Splitter';
import { upgradeMusicIndex } from 'frontend/logic/music/music-index-upgraders';
import { useVirtualizer } from '@tanstack/react-virtual';
import { PlaybackBar } from './PlaybackBar';
import { TrackContextMenu, TrackContextMenuHandle } from './TrackContextMenu';

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
        end={<TracksView />}
        persistLocalStorage="musicLibrarySplitterOffset"
      />
    </div>
  );
}

type ConfigurableColumns = 'artist' | 'album';
type ColumnWidths = Record<ConfigurableColumns, number>;
const COL_MIN_WIDTH = 60;
const TRACK_MIN_WIDTH = 100; // matches .musicTracksHeaderTitle { min-width: 100px }
const TRACK_COLUMN_WIDTH = 24; // matches --column-track CSS variable
const MUSIC_GAP = 12; // matches --music-gap CSS variable
const MUSIC_PADDING_H = 12; // matches --music-padding-h CSS variable
const CONFIGURABLE_COLUMNS: ConfigurableColumns[] = ['artist', 'album'];

function clampColumnWidths(prev: ColumnWidths, maxWidth: number): ColumnWidths {
  const maxForConfigurable = maxWidth - TRACK_MIN_WIDTH;
  const total = CONFIGURABLE_COLUMNS.reduce((sum, k) => sum + prev[k], 0);
  if (total <= maxForConfigurable) {
    return prev;
  }
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
      localStorage.getItem('musicTrackColumnWidths') ?? 'null',
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
    localStorage.setItem(
      'musicTrackColumnWidths',
      JSON.stringify(columnWidths),
    );
  }, [columnWidths]);

  return { columnWidths, setColumnWidths };
}

function TracksView() {
  const { columnWidths, setColumnWidths } = useColumnWidths();

  return (
    <div
      className="musicTracksView"
      style={
        {
          '--column-artist': `${columnWidths.artist}px`,
          '--column-album': `${columnWidths.album}px`,
        } as React.CSSProperties
      }
    >
      <TracksHeader setColumnWidths={setColumnWidths} />
      <Tracks />
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
          const shrinkBy = Math.min(
            remaining,
            Math.max(0, result[key] - COL_MIN_WIDTH),
          );
          result[key] -= shrinkBy;
          remaining -= shrinkBy;
        }
        // Grow left neighbor. Title column (K=0) grows automatically via flex:1.
        if (myIndex > 0) {
          result[columnOrder[myIndex - 1]] += dx - remaining;
        }
      } else {
        // Drag left: grow this column, cascade left through explicit columns then the title column.
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
          const trackCurrent =
            maxAvailableWidth -
            columnOrder.reduce((sum, k) => sum + result[k], 0);
          const canTake = Math.max(0, trackCurrent - TRACK_MIN_WIDTH);
          result[columnKey] += Math.min(remaining, canTake);
        }
      }

      return result;
    });
  }

  return (
    <div
      className="musicTracksHeaderCell"
      style={{ flex: `0 0 var(--column-${columnKey})` }}
    >
      <ColumnResizeHandle onDrag={dragHandler} />
      <div className="musicTracksHeaderCellText">{label}</div>
    </div>
  );
}

interface TracksHeaderProps {
  setColumnWidths: React.Dispatch<React.SetStateAction<ColumnWidths>>;
}

function TracksHeader({ setColumnWidths }: TracksHeaderProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [maxAvailableWidth, setMaxAvailableWidth] = React.useState(400);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return undefined;
    }
    const numCols = CONFIGURABLE_COLUMNS.length + 2; // +1 for Title, +1 for TrackNumber
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      const newMax =
        width -
        2 * MUSIC_PADDING_H -
        (numCols - 1) * MUSIC_GAP -
        TRACK_COLUMN_WIDTH;
      setMaxAvailableWidth(newMax);
      setColumnWidths((prev) => clampColumnWidths(prev, newMax));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="musicTracksHeader" ref={containerRef}>
      <div className="musicTracksHeaderCell musicTracksHeaderTrackNumber" />
      <div className="musicTracksHeaderCell musicTracksHeaderTitle">
        <div className="musicTracksHeaderCellText">Track</div>
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
    <div className="musicTrackColumnResize" onMouseDown={onMouseDown}>
      <div className="musicTrackColumnResizeVisible" />
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
  const { dispatch } = Hooks.useStore();
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
        case 'ArrowUp': {
          event.preventDefault();
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
          break;
        }
        case 'ArrowDown': {
          event.preventDefault();
          const nextIndex =
            currentIndex < 0
              ? 0
              : Math.min(currentItems.length - 1, currentIndex + 1);
          if (currentItems[nextIndex] !== undefined) {
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
}: {
  panel: T.MusicPanelType;
  value: string;
  index: number;
  isSelected: boolean;
  isCursor: boolean;
  onClick: (event: React.MouseEvent) => void;
}) {
  const divRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (isCursor && divRef.current) {
      divRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [isCursor]);

  return (
    <div
      className={`musicFilterPanelItem${isSelected ? ' selected' : ''}`}
      role="option"
      aria-selected={isSelected}
      id={`music-panel-${panel}-${index}`}
      ref={divRef}
      onClick={onClick}
    >
      {value}
    </div>
  );
}

const sizeEstimate = 32;

function Tracks() {
  const tracks = $$.getFilteredMusicTracks();
  const selectedPaths = $$.getMusicSelectedTrackPaths();
  const playingPath = $$.getMusicPlaybackTrackPath();
  const { getState, dispatch } = Hooks.useStore();

  const listRef = React.useRef<HTMLDivElement | null>(null);
  const contextMenuRef = React.useRef<TrackContextMenuHandle | null>(null);
  const tracksRef = React.useRef(tracks);
  tracksRef.current = tracks;

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
        const isSoleSelected =
          currentPaths.length === 1 && currentPaths[0] === track.path;
        const next = isSoleSelected ? [] : [track.path];
        anchorPathRef.current = isSoleSelected ? null : track.path;
        setFocusedPath(isSoleSelected ? null : track.path);
        dispatch(A.setMusicSelectedTracks(next));
      }
    },
    [],
  );

  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: tracks.length,
    getScrollElement: () => listRef.current,
    // Must match the height set on .musicTrack in index.css (box-sizing: border-box).
    // Derived from: padding-v (8px×2) + border-bottom (1px) + line-height.
    // Estimate the largest plausible size when not using dynamic measurement.
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
      if (document.activeElement !== listRef.current) {
        return;
      }

      const currentTracks = tracksRef.current;
      const currentPath = focusedPathRef.current;
      const currentIndex = currentPath
        ? currentTracks.findIndex((t) => t.path === currentPath)
        : -1;

      switch (event.key) {
        case 'ArrowUp': {
          event.preventDefault();
          if (currentIndex > 0) {
            const newPath = currentTracks[currentIndex - 1].path;
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

  return (
    <div className="musicTracksContainer">
      <TrackContextMenu ref={contextMenuRef} />
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
  offsetTop,
}: {
  track: T.TrackMetadata;
  index: number;
  isSelected: boolean;
  isPlaying: boolean;
  onClick: (event: React.MouseEvent) => void;
  onContextMenu: (event: React.MouseEvent) => void;
  onPlay: (path: string) => void;
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
      <span className="musicTrackTitle">{track.title ?? track.path}</span>
      <span className="musicTrackArtist">{track.artist}</span>
      <span className="musicTrackAlbum">{track.album}</span>
    </div>
  );
}
