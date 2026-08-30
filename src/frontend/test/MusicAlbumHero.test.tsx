import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { createStore } from 'frontend/store/create-store';
import { A, T } from 'frontend';
import { persistedState } from 'frontend/logic/persisted-state';
import { AppRoutes } from 'frontend/components/App';
import fetchMock from '@fetch-mock/jest';
import { mockServerListFiles } from './utils/fixtures';
import { mockMusicMediaElement } from './utils/music';
import { MUSIC_INDEX_VERSION } from 'shared/music';

const FAKE_SERVER: T.FileStoreServer = {
  id: 'test-music',
  url: 'http://fake-music',
  name: 'Test Music',
  storeType: 'music',
};

function makeTrack(overrides: Partial<T.TrackMetadata>): T.TrackMetadata {
  return {
    path: '/track.mp3',
    title: 'Track',
    artist: 'Artist',
    albumArtist: null,
    composer: null,
    album: 'Album',
    genre: 'Rock',
    preferComposerGrouping: null,
    track: 1,
    duration: 100,
    size: 1000,
    mtime: '2024-01-01T00:00:00Z',
    coverArt: null,
    hasEmbeddedArt: false,
    ...overrides,
  };
}

// Two Rock tracks on one album, one Jazz track on another.
const TRACKS: T.TrackMetadata[] = [
  makeTrack({ path: '/rock/1.mp3', title: 'Rock One', album: 'Rock Album' }),
  makeTrack({
    path: '/rock/2.mp3',
    title: 'Rock Two',
    album: 'Rock Album',
    track: 2,
  }),
  makeTrack({
    path: '/jazz/1.mp3',
    title: 'Jazz One',
    album: 'Jazz Album',
    genre: 'Jazz',
  }),
];

beforeEach(() => {
  persistedState.musicLastPlayedTrackPath.remove();
  jest.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600);
  jest.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800);
  mockMusicMediaElement();
});

function setup(tracks = TRACKS) {
  const store = createStore();
  store.dispatch(A.addFileStoreServer(FAKE_SERVER));

  fetchMock.get(`${FAKE_SERVER.url}/music/music-index`, {
    body: JSON.stringify({
      version: MUSIC_INDEX_VERSION,
      scannedAt: '2024-01-01T00:00:00Z',
      tracks,
    }),
    status: 200,
  });
  const genreFolders: T.FolderListing = [
    ...new Set(tracks.map((t) => t.genre).filter(Boolean)),
  ].map((genre) => ({
    type: 'folder' as const,
    name: genre as string,
    path: `/${genre}`,
    id: `id:/${genre}`,
  }));
  mockServerListFiles(FAKE_SERVER, genreFolders);

  render(
    <MemoryRouter initialEntries={[`/${FAKE_SERVER.id}/music`]}>
      <Provider store={store as any}>
        <AppRoutes />
      </Provider>
    </MemoryRouter>,
  );

  return { store };
}

/**
 * The album name shown in the hero panel, or null if the hero is not rendered.
 * The hero renders its title as the page's only level-2 heading.
 */
function heroAlbum(): string | null {
  return screen.queryByRole('heading', { level: 2 })?.textContent ?? null;
}

async function clickTrack(title: string) {
  const trackList = screen.getByRole('listbox', { name: 'Tracks' });
  await act(async () => {
    await userEvent.click(
      within(trackList).getByRole('option', { name: RegExp(title) }),
    );
  });
}

async function clickArtistFilter(name: string) {
  const artistPanel = screen.getByRole('listbox', { name: 'artist' });
  await act(async () => {
    await userEvent.click(within(artistPanel).getByRole('option', { name }));
  });
}

describe('album hero selection', () => {
  it('falls back to the first track before anything is clicked or played', async () => {
    setup();
    await screen.findByText('Rock One', { selector: '.musicTrackTitle' });

    expect(heroAlbum()).toBe('Rock Album');
  });

  it('selecting a track sets the hero album, overriding what is playing', async () => {
    const { store } = setup();
    await screen.findByText('Jazz One', { selector: '.musicTrackTitle' });

    await act(async () => {
      store.dispatch(A.musicPlaybackLoad('/jazz/1.mp3'));
    });
    expect(heroAlbum()).toBe('Jazz Album');

    // Clicking a track on another album wins over the playing track.
    await clickTrack('Rock Two');
    expect(heroAlbum()).toBe('Rock Album');
  });

  it('playback that starts after a selection moves the hero to the playing album', async () => {
    const { store } = setup();
    await screen.findByText('Rock One', { selector: '.musicTrackTitle' });

    await clickTrack('Rock One');
    expect(heroAlbum()).toBe('Rock Album');

    // Playing is now the most recent action, so the hero follows it.
    await act(async () => {
      store.dispatch(A.musicPlaybackLoad('/jazz/1.mp3'));
    });
    expect(heroAlbum()).toBe('Jazz Album');
  });

  it("clicking an artist filter moves the hero to that artist's album", async () => {
    const tracks = [
      makeTrack({
        path: '/naked/sun.mp3',
        title: 'The Sun',
        artist: 'The Naked and Famous',
        album: 'Passive Me Aggressive You',
        genre: 'Indie',
      }),
      makeTrack({
        path: '/killers/brightside.mp3',
        title: 'Mr Brightside',
        artist: 'The Killers',
        album: 'Hot Fuss',
        genre: 'Rock',
      }),
      makeTrack({
        path: '/killers/somebody.mp3',
        title: 'Somebody Told Me',
        artist: 'The Killers',
        album: 'Hot Fuss',
        genre: 'Rock',
        track: 2,
      }),
    ];
    setup(tracks);
    await screen.findByRole('option', { name: 'The Killers' });

    // A track by another artist is the current hero context.
    await clickTrack('The Sun');
    expect(heroAlbum()).toBe('Passive Me Aggressive You');

    // Filtering by artist is now the most recent action: the hero follows the
    // filtered list rather than staying on the selected track's album.
    await clickArtistFilter('The Killers');
    expect(heroAlbum()).toBe('Hot Fuss');
  });
});
