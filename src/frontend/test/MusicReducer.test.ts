import { A, $, T } from 'frontend';
import { createStore } from 'frontend/store/create-store';

const BASE_TRACK: T.TrackMetadata = {
  path: '/base.mp3',
  title: 'Base',
  artist: 'Base Artist',
  albumArtist: null,
  album: 'Base Album',
  genre: 'Base Genre',
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

describe('music reducer filter pruning', () => {
  it('drops a selected genre when it is no longer a valid option', () => {
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

    expect($.getMusicPanelSelections(store.getState())).toEqual({});
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
  });

  it('keeps valid genre selections and drops invalid genre selections', () => {
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
      genre: ['Jazz'],
    });
  });

  it('drops artist and album selections that are invalid under upstream filters', () => {
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
    });
  });
});
