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

type ColWidths = { artist: number; album: number };

const COL_WIDTHS_KEY = 'musicSongColumnWidths';
const COL_MIN_WIDTH = 60;
const COL_DEFAULT_WIDTHS: ColWidths = { artist: 160, album: 160 };

function loadColumnWidths(): ColWidths {
  try {
    const parsed = JSON.parse(localStorage.getItem(COL_WIDTHS_KEY) ?? 'null');
    if (
      parsed !== null &&
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
  return COL_DEFAULT_WIDTHS;
}

function SongsView() {
  const [colWidths, setColWidths] = React.useState<ColWidths>(loadColumnWidths);

  React.useEffect(() => {
    localStorage.setItem(COL_WIDTHS_KEY, JSON.stringify(colWidths));
  }, [colWidths]);

  return (
    <div
      className="musicSongsView"
      style={
        {
          '--col-artist': `${colWidths.artist}px`,
          '--col-album': `${colWidths.album}px`,
        } as React.CSSProperties
      }
    >
      <SongsHeader setColWidths={setColWidths} />
      <Songs />
      <PlaybackBar />
    </div>
  );
}

function SongsHeader({
  setColWidths,
}: {
  setColWidths: React.Dispatch<React.SetStateAction<ColWidths>>;
}) {
  return (
    <div className="musicSongsHeader">
      <div className="musicSongsHeaderCell musicSongsHeaderTitle">Song</div>
      <div className="musicSongsHeaderCell musicSongsHeaderArtist">
        <ColumnResizeHandle
          onDrag={(dx) =>
            setColWidths((prev) => ({
              ...prev,
              artist: Math.max(COL_MIN_WIDTH, prev.artist - dx),
            }))
          }
        />
        Artist
      </div>
      <div className="musicSongsHeaderCell musicSongsHeaderAlbum">
        <ColumnResizeHandle
          onDrag={(dx) =>
            setColWidths((prev) => ({
              ...prev,
              album: Math.max(COL_MIN_WIDTH, prev.album - dx),
            }))
          }
        />
        Album
      </div>
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
    <div className="musicSongColResize" onMouseDown={onMouseDown}>
      <div className="musicSongColResizeVisible" />
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
