import * as React from 'react';
import { $$, T, A, Hooks, $ } from 'frontend';
import { UnhandledCaseError } from 'frontend/utils';

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
      return;
    }
    const currentServer = server;

    async function loadIndex() {
      try {
        const res = await fetch(`${currentServer.url}/music/music-index`);
        if (!res.ok) {
          setError('Music library not found. Run a scan first.');
          return;
        }
        const index: T.MusicIndex = await res.json();
        dispatch(A.setMusicTracks(index.tracks));
      } catch {
        setError(getConnectionErrorMessage(currentServer));
      }
    }

    void loadIndex();
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
      <FilterPanels />
      <Songs />
    </div>
  );
}

function FilterPanels() {
  const panelTracks = $$.getMusicPanelTracks();
  return (
    <div className="musicFilterPanels">
      <FilterPanel panel="artist" tracks={panelTracks.artist} />
      <FilterPanel panel="album" tracks={panelTracks.album} />
    </div>
  );
}

function getPanelAllLabel(panel: T.MusicPanelType): string {
  switch (panel) {
    case 'artist':
      return 'All Artists';
    case 'album':
      return 'All Albums';
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

  const selectedIndex = selection ? items.indexOf(selection) : -1;
  const listRef = React.useRef<HTMLDivElement | null>(null);

  let activeDescendant: string | undefined;
  if (!selection) {
    activeDescendant = `music-panel-${panel}-all`;
  } else if (selectedIndex >= 0) {
    activeDescendant = `music-panel-${panel}-${selectedIndex}`;
  }
  const allItemRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!selection && allItemRef.current) {
      allItemRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [selection]);

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
            dispatch(A.setMusicPanelSelection(panel, currentItems[currentIndex - 1]));
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
          const lists = Array.from(
            document.querySelectorAll<HTMLElement>('.musicFilterPanelList'),
          );
          const idx = lists.indexOf(listRef.current!);
          const target = lists[idx + (event.key === 'ArrowRight' ? 1 : -1)];
          target?.focus();
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
          className={`musicFilterPanelItem${!selection ? ' selected' : ''}`}
          role="option"
          aria-selected={!selection}
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
            isSelected={value === selection}
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
        dispatch(
          A.setMusicPanelSelection(panel, isSelected ? undefined : value),
        );
      }}
    >
      {value}
    </div>
  );
}

function Songs() {
  const tracks = $$.getFilteredMusicTracks();
  return (
    <div className="musicSongs">
      {tracks.map((track) => (
        <Song key={track.path} track={track} />
      ))}
    </div>
  );
}

function Song({ track }: { track: T.TrackMetadata }) {
  return (
    <div className="musicSong">
      <span className="musicSongTitle">{track.title ?? track.path}</span>
      <span className="musicSongArtist">{track.artist}</span>
      <span className="musicSongAlbum">{track.album}</span>
    </div>
  );
}
