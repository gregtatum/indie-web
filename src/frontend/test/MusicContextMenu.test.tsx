import { fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import * as React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { createStore } from 'frontend/store/create-store';
import { A, T, $ } from 'frontend';
import { AppRoutes } from 'frontend/components/App';
import type { FetchMockSandbox } from 'fetch-mock';

const FAKE_SERVER: T.FileStoreServer = {
  id: 'test-music',
  url: 'http://fake-music',
  name: 'Test Music',
  storeType: 'music',
};

const TRACKS: T.TrackMetadata[] = [
  {
    path: '/music/a.mp3',
    title: 'Song A',
    artist: 'Artist A',
    album: 'Album A',
    genre: 'Rock',
    track: 1,
    duration: 180,
    size: 1024,
    mtime: '2024-01-01T00:00:00Z',
    coverArt: null,
    hasEmbeddedArt: false,
  },
  {
    path: '/music/b.mp3',
    title: 'Song B',
    artist: 'Artist B',
    album: 'Album A',
    genre: 'Rock',
    track: 2,
    duration: 200,
    size: 2048,
    mtime: '2024-01-01T00:00:00Z',
    coverArt: null,
    hasEmbeddedArt: false,
  },
  {
    path: '/music/c.mp3',
    title: 'Song C',
    artist: 'Artist A',
    album: 'Album B',
    genre: 'Jazz',
    track: 1,
    duration: 240,
    size: 3072,
    mtime: '2024-01-01T00:00:00Z',
    coverArt: null,
    hasEmbeddedArt: false,
  },
];

beforeEach(() => {
  jest.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600);
  jest.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800);
});

function setup(tracks = TRACKS) {
  const store = createStore();
  store.dispatch(A.addFileStoreServer(FAKE_SERVER));

  (window.fetch as FetchMockSandbox).get(
    `${FAKE_SERVER.url}/music/music-index`,
    {
      body: JSON.stringify({
        version: 4,
        scannedAt: '2024-01-01T00:00:00Z',
        tracks,
      }),
      status: 200,
    },
  );

  render(
    <MemoryRouter initialEntries={[`/${FAKE_SERVER.id}/music`]}>
      <Provider store={store as any}>
        <AppRoutes />
      </Provider>
    </MemoryRouter>,
  );

  return { store };
}

describe('track right-click context menu', () => {
  it('shows "Play Track" when no tracks are selected', async () => {
    setup();
    const trackA = await screen.findByText('Song A');
    await act(async () => {
      fireEvent.contextMenu(trackA);
    });
    await screen.findByRole('button', { name: 'Play Track' });
  });

  it('shows "Play Track" when only one track is selected', async () => {
    const { store } = setup();
    await act(async () => {
      store.dispatch(A.setMusicSelectedTracks(['/music/a.mp3']));
    });
    const trackA = await screen.findByText('Song A');
    await act(async () => {
      fireEvent.contextMenu(trackA);
    });
    await screen.findByRole('button', { name: 'Play Track' });
  });

  it('shows "Play Selection" when multiple tracks are selected', async () => {
    const { store } = setup();
    await act(async () => {
      store.dispatch(
        A.setMusicSelectedTracks(['/music/a.mp3', '/music/b.mp3']),
      );
    });
    const trackA = await screen.findByText('Song A');
    await act(async () => {
      fireEvent.contextMenu(trackA);
    });
    await screen.findByRole('button', { name: 'Play Selection' });
  });

  it('clicking "Play Track" loads the right-clicked track and queues all tracks', async () => {
    const { store } = setup();
    const trackB = await screen.findByText('Song B');
    await act(async () => {
      fireEvent.contextMenu(trackB);
    });
    const playButton = await screen.findByRole('button', {
      name: 'Play Track',
    });
    await act(async () => {
      fireEvent.click(playButton);
    });
    const state = store.getState();
    expect($.getMusicPlaybackTrackPath(state)).toBe('/music/b.mp3');
    expect($.getMusicPlaybackQueue(state).map((t) => t.path)).toEqual([
      '/music/a.mp3',
      '/music/b.mp3',
      '/music/c.mp3',
    ]);
  });

  it('clicking "Play Selection" loads the first selected track and queues only selected tracks', async () => {
    const { store } = setup();
    await act(async () => {
      store.dispatch(
        A.setMusicSelectedTracks(['/music/b.mp3', '/music/c.mp3']),
      );
    });
    const trackA = await screen.findByText('Song A');
    await act(async () => {
      fireEvent.contextMenu(trackA);
    });
    const playButton = await screen.findByRole('button', {
      name: 'Play Selection',
    });
    await act(async () => {
      fireEvent.click(playButton);
    });
    const state = store.getState();
    expect($.getMusicPlaybackTrackPath(state)).toBe('/music/b.mp3');
    expect($.getMusicPlaybackQueue(state).map((t) => t.path)).toEqual([
      '/music/b.mp3',
      '/music/c.mp3',
    ]);
  });

  it('"Show in Files" is shown for single-track selection and focuses the file', async () => {
    const { store } = setup();
    const trackB = await screen.findByText('Song B');
    await act(async () => {
      fireEvent.contextMenu(trackB);
    });
    const showButton = await screen.findByRole('button', {
      name: 'Show in Files',
    });
    await act(async () => {
      fireEvent.click(showButton);
    });
    const state = store.getState();
    expect($.getFileFocusByPath(state)).toMatchObject({
      '/music': 'b.mp3',
    });
  });

  it('"Show in Files" is not shown for multi-track selection', async () => {
    const { store } = setup();
    await act(async () => {
      store.dispatch(
        A.setMusicSelectedTracks(['/music/a.mp3', '/music/b.mp3']),
      );
    });
    const trackA = await screen.findByText('Song A');
    await act(async () => {
      fireEvent.contextMenu(trackA);
    });
    await screen.findByRole('button', { name: 'Play Selection' });
    expect(screen.queryByRole('button', { name: 'Show in Files' })).toBeNull();
  });

  it('shows "Edit Selection" for multi-track selection', async () => {
    const { store } = setup();
    await act(async () => {
      store.dispatch(
        A.setMusicSelectedTracks(['/music/a.mp3', '/music/b.mp3']),
      );
    });
    const trackA = await screen.findByText('Song A');
    await act(async () => {
      fireEvent.contextMenu(trackA);
    });
    await screen.findByRole('button', { name: 'Edit Selection' });
  });
});
