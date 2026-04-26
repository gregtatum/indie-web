import * as React from 'react';
import { $$ } from 'frontend';

interface Track {
  path: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  duration: number | null;
}

type FilterType = 'artist' | 'album';

export function MusicLibraryView() {
  const server = $$.getCurrentServerOrNull();
  const [tracks, setTracks] = React.useState<Track[]>([]);

  React.useEffect(() => {
    if (!server) return;
    fetch(`${server.url}/music/music-index`)
      .then((res) => (res.ok ? res.json() : null))
      .then((index) => {
        if (index?.tracks) {
          setTracks(index.tracks);
        }
      })
      .catch(() => {});
  }, [server?.url]);

  return (
    <div className="musicLibraryView">
      <FilterPanels tracks={tracks} />
      <Songs tracks={tracks} />
    </div>
  );
}

function FilterPanels({ tracks }: { tracks: Track[] }) {
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
  filter: FilterType;
  tracks: Track[];
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

function Songs({ tracks }: { tracks: Track[] }) {
  return (
    <div className="musicSongs">
      {tracks.map((track) => (
        <Song key={track.path} track={track} />
      ))}
    </div>
  );
}

function Song({ track }: { track: Track }) {
  return (
    <div className="musicSong">
      <span className="musicSongTitle">{track.title ?? track.path}</span>
      <span className="musicSongArtist">{track.artist}</span>
      <span className="musicSongAlbum">{track.album}</span>
    </div>
  );
}
