import * as React from 'react';
import { $$, T, A, Hooks, $ } from 'frontend';

export function MusicLibraryView() {
  const server = $$.getCurrentServerOrNull();
  const [tracks, setTracks] = React.useState<T.TrackMetadata[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!server) {
      return;
    }

    async function loadIndex() {
      try {
        const res = await fetch(`${server!.url}/music/music-index`);
        if (!res.ok) {
          setError('Music library not found. Run a scan first.');
          return;
        }
        const index: T.MusicIndex = await res.json();
        setTracks(index.tracks);
      } catch {
        setError('Could not connect to the server.');
      }
    }

    void loadIndex();
  }, [server?.url]);

  if (error) {
    return (
      <div className="musicLibraryView musicLibraryViewError">{error}</div>
    );
  }

  return (
    <div className="musicLibraryView">
      <FilterPanels tracks={tracks} />
      <Songs tracks={tracks} />
    </div>
  );
}

function FilterPanels({ tracks }: { tracks: T.TrackMetadata[] }) {
  return (
    <div className="musicFilterPanels">
      <FilterPanel panel="artist" tracks={tracks} />
      <FilterPanel panel="album" tracks={tracks} />
    </div>
  );
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

  const values = [
    ...new Set(tracks.map((t) => t[panel]).filter(Boolean)),
  ].sort() as string[];

  // Keep a ref so the keydown handler always sees the latest values without
  // re-registering on every render.
  const valuesRef = React.useRef(values);
  valuesRef.current = values;

  const selectedIndex = selection !== undefined ? values.indexOf(selection) : -1;
  const listRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (document.activeElement !== listRef.current) {
        return;
      }

      const currentValues = valuesRef.current;
      const currentSelection = $.getMusicPanelSelections(getState())[panel];
      const currentIndex =
        currentSelection !== undefined
          ? currentValues.indexOf(currentSelection)
          : -1;

      switch (event.key) {
        case 'ArrowUp': {
          event.preventDefault();
          const nextIndex = Math.max(0, currentIndex - 1);
          if (currentValues[nextIndex] !== undefined) {
            dispatch(A.setMusicPanelSelection(panel, currentValues[nextIndex]));
          }
          break;
        }
        case 'ArrowDown': {
          event.preventDefault();
          const nextIndex =
            currentIndex < 0 ? 0 : Math.min(currentValues.length - 1, currentIndex + 1);
          if (currentValues[nextIndex] !== undefined) {
            dispatch(A.setMusicPanelSelection(panel, currentValues[nextIndex]));
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
        aria-activedescendant={
          selectedIndex >= 0
            ? `music-panel-${panel}-${selectedIndex}`
            : undefined
        }
        ref={listRef}
      >
        {values.map((value, index) => (
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

function Songs({ tracks }: { tracks: T.TrackMetadata[] }) {
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
