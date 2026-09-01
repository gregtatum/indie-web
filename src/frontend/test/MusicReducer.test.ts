import { A, $, T } from 'frontend';
import { createStore } from 'frontend/store/create-store';

const BASE_TRACK: T.TrackMetadata = {
  path: '/base.mp3',
  title: 'Base',
  artist: 'Base Artist',
  albumArtist: null,
  composer: null,
  album: 'Base Album',
  genre: 'Base Genre',
  preferComposerGrouping: null,
  track: 1,
  duration: 180,
  size: 1024,
  mtime: '2024-01-01T00:00:00Z',
  coverArt: null,
  hasEmbeddedArt: false,
};

function track(
  path: string,
  genre: string,
  artist: string,
  album: string,
): T.TrackMetadata {
  return {
    ...BASE_TRACK,
    path,
    title: path,
    genre,
    artist,
    album,
  };
}

function musicServer(id: string): T.FileStoreServer {
  return {
    id,
    url: `https://${id}.example`,
    name: id,
    storeType: 'music',
  };
}

describe('playback across music view navigation', () => {
  it('keeps playback when re-entering the same music store', () => {
    const store = createStore();
    const server = musicServer('alpha');

    store.dispatch(A.viewMusic(server, '/'));
    store.dispatch(
      A.setMusicTracks([track('/a.mp3', 'Rock', 'A', 'A')], false),
    );
    store.dispatch(A.musicPlaybackLoad('/a.mp3'));
    store.dispatch(A.musicPlaybackReady());

    // Browsing back to a folder root of a music store re-dispatches view-music.
    store.dispatch(A.viewMusic(server, '/'));

    expect($.getMusicPlaybackTrackPath(store.getState())).toBe('/a.mp3');
    expect($.getMusicPlaybackStatus(store.getState())).toBe('playing');
  });

  it('stops playback when switching to a different music store', () => {
    const store = createStore();

    store.dispatch(A.viewMusic(musicServer('alpha'), '/'));
    store.dispatch(A.musicPlaybackLoad('/a.mp3'));
    store.dispatch(A.musicPlaybackReady());

    store.dispatch(A.viewMusic(musicServer('beta'), '/'));

    expect($.getMusicPlaybackTrackPath(store.getState())).toBeNull();
    expect($.getMusicPlaybackStatus(store.getState())).toBe('idle');
  });

  it('still stops playback on an explicit stop', () => {
    const store = createStore();

    store.dispatch(A.viewMusic(musicServer('alpha'), '/'));
    store.dispatch(A.musicPlaybackLoad('/a.mp3'));
    store.dispatch(A.musicPlaybackReady());
    store.dispatch(A.musicPlaybackStop());

    expect($.getMusicPlaybackTrackPath(store.getState())).toBeNull();
    expect($.getMusicPlaybackStatus(store.getState())).toBe('idle');
  });

  it('stops playback when the playing store is removed', () => {
    const store = createStore();
    const server = musicServer('alpha');

    store.dispatch(A.viewMusic(server, '/'));
    store.dispatch(A.musicPlaybackLoad('/a.mp3'));
    store.dispatch(A.musicPlaybackReady());

    store.dispatch(A.removeFileStoreServer(server));

    expect($.getMusicPlaybackTrackPath(store.getState())).toBeNull();
    expect($.getMusicPlaybackStatus(store.getState())).toBe('idle');
  });

  it('leaves playback alone when a different store is removed', () => {
    const store = createStore();

    store.dispatch(A.viewMusic(musicServer('alpha'), '/'));
    store.dispatch(A.musicPlaybackLoad('/a.mp3'));
    store.dispatch(A.musicPlaybackReady());

    store.dispatch(A.removeFileStoreServer(musicServer('beta')));

    expect($.getMusicPlaybackTrackPath(store.getState())).toBe('/a.mp3');
    expect($.getMusicPlaybackStatus(store.getState())).toBe('playing');
  });

  it('stops playback when all storage is removed', () => {
    const store = createStore();

    store.dispatch(A.viewMusic(musicServer('alpha'), '/'));
    store.dispatch(A.musicPlaybackLoad('/a.mp3'));
    store.dispatch(A.musicPlaybackReady());

    store.dispatch(A.removeAllStorage());

    expect($.getMusicPlaybackTrackPath(store.getState())).toBeNull();
    expect($.getMusicPlaybackStatus(store.getState())).toBe('idle');
  });
});

describe('music filter derived selections', () => {
  it('preserves a selected genre and ignores it when it is no longer valid', () => {
    const store = createStore();
    store.dispatch(
      A.setMusicTracks(
        [track('/old.mp3', 'Alternative Rock', 'Artist A', 'Album A')],
        false,
      ),
    );
    store.dispatch(A.setMusicPanelSelection('genre', ['Alternative Rock']));

    store.dispatch(
      A.setMusicTracks(
        [track('/new.mp3', 'Alternative', 'Artist A', 'Album A')],
        false,
      ),
    );

    expect($.getMusicPanelSelections(store.getState())).toEqual({
      genre: ['Alternative Rock'],
    });
    expect(
      $.getFilteredMusicTracks(store.getState()).map((t) => t.path),
    ).toEqual(['/new.mp3']);
  });

  it('keeps a selected genre when it remains a valid option', () => {
    const store = createStore();
    store.dispatch(
      A.setMusicTracks(
        [
          track('/old-a.mp3', 'Alternative Rock', 'Artist A', 'Album A'),
          track('/old-b.mp3', 'Alternative Rock', 'Artist B', 'Album B'),
        ],
        false,
      ),
    );
    store.dispatch(A.setMusicPanelSelection('genre', ['Alternative Rock']));

    store.dispatch(
      A.setMusicTracks(
        [
          track('/new-a.mp3', 'Alternative', 'Artist A', 'Album A'),
          track('/old-b.mp3', 'Alternative Rock', 'Artist B', 'Album B'),
        ],
        false,
      ),
    );

    expect($.getMusicPanelSelections(store.getState())).toEqual({
      genre: ['Alternative Rock'],
    });
    expect(
      $.getFilteredMusicTracks(store.getState()).map((t) => t.path),
    ).toEqual(['/old-b.mp3']);
  });

  it('keeps stored genre selections and applies only valid selections', () => {
    const store = createStore();
    store.dispatch(
      A.setMusicTracks(
        [
          track('/indie.mp3', 'Indie', 'Artist A', 'Album A'),
          track('/jazz.mp3', 'Jazz', 'Artist B', 'Album B'),
        ],
        false,
      ),
    );
    store.dispatch(A.setMusicPanelSelection('genre', ['Indie', 'Jazz']));

    store.dispatch(
      A.setMusicTracks(
        [
          track('/indie.mp3', 'Alternative', 'Artist A', 'Album A'),
          track('/jazz.mp3', 'Jazz', 'Artist B', 'Album B'),
        ],
        false,
      ),
    );

    expect($.getMusicPanelSelections(store.getState())).toEqual({
      genre: ['Indie', 'Jazz'],
    });
    expect(
      $.getFilteredMusicTracks(store.getState()).map((t) => t.path),
    ).toEqual(['/jazz.mp3']);
  });

  it('ignores artist and album selections that are invalid under upstream filters', () => {
    const store = createStore();
    store.dispatch(
      A.setMusicTracks(
        [
          track('/rock-a.mp3', 'Rock', 'Artist A', 'Album A'),
          track('/rock-b.mp3', 'Rock', 'Artist B', 'Album B'),
          track('/jazz-a.mp3', 'Jazz', 'Artist A', 'Album A'),
        ],
        false,
      ),
    );
    store.dispatch(A.setMusicPanelSelection('genre', ['Rock']));
    store.dispatch(A.setMusicPanelSelection('artist', ['Artist A']));
    store.dispatch(A.setMusicPanelSelection('album', ['Album A']));

    store.dispatch(
      A.setMusicTracks(
        [
          track('/rock-b.mp3', 'Rock', 'Artist B', 'Album B'),
          track('/jazz-a.mp3', 'Jazz', 'Artist A', 'Album A'),
        ],
        false,
      ),
    );

    expect($.getMusicPanelSelections(store.getState())).toEqual({
      genre: ['Rock'],
      artist: ['Artist A'],
      album: ['Album A'],
    });
    expect(
      $.getFilteredMusicTracks(store.getState()).map((t) => t.path),
    ).toEqual(['/rock-b.mp3']);
  });
});
