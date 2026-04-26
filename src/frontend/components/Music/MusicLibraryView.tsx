import * as React from 'react';
import { $$, T } from 'frontend';

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
      <FilterPanel filter="artist" tracks={tracks} />
      <FilterPanel filter="album" tracks={tracks} />
    </div>
  );
}

function FilterPanel({
  filter,
  tracks,
}: {
  filter: T.MusicFilterType;
  tracks: T.TrackMetadata[];
}) {
  const values = [
    ...new Set(tracks.map((t) => t[filter]).filter(Boolean)),
  ].sort() as string[];

  return (
    <div className="musicFilterPanel">
      <div className="musicFilterPanelHeader">{filter}</div>
      <div className="musicFilterPanelList">
        {values.map((value) => (
          <div key={value} className="musicFilterPanelItem">
            {value}
          </div>
        ))}
      </div>
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
