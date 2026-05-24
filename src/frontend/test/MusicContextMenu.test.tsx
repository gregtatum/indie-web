import { act, fireEvent, render, screen } from '@testing-library/react';
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
});

describe('edit track modal', () => {
  async function openEditModal(trackText: string) {
    const track = await screen.findByText(trackText);
    await act(async () => {
      fireEvent.contextMenu(track);
    });
    const editButton = await screen.findByRole('button', { name: 'Edit' });
    await act(async () => {
      fireEvent.click(editButton);
    });
  }

  it('opens with the right-clicked track fields pre-populated', async () => {
    setup();
    await openEditModal('Song A');
    screen.getByRole('dialog');
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe(
      'Song A',
    );
    expect((screen.getByLabelText('Artist') as HTMLInputElement).value).toBe(
      'Artist A',
    );
    expect((screen.getByLabelText('Genre') as HTMLInputElement).value).toBe(
      'Rock',
    );
  });

  it('allows editing the artist field', async () => {
    setup();
    await openEditModal('Song A');
    const artistInput = screen.getByLabelText('Artist') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(artistInput, { target: { value: 'New Artist' } });
    });
    expect(artistInput.value).toBe('New Artist');
  });

  it('closes when the close button is clicked', async () => {
    setup();
    await openEditModal('Song A');
    screen.getByRole('dialog');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes when Escape is pressed', async () => {
    setup();
    await openEditModal('Song A');
    screen.getByRole('dialog');
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('repopulates fields when opening for a different track', async () => {
    setup();
    await openEditModal('Song A');
    expect((screen.getByLabelText('Artist') as HTMLInputElement).value).toBe(
      'Artist A',
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    });
    await openEditModal('Song B');
    expect((screen.getByLabelText('Artist') as HTMLInputElement).value).toBe(
      'Artist B',
    );
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe(
      'Song B',
    );
    expect((screen.getByLabelText('Genre') as HTMLInputElement).value).toBe(
      'Rock',
    );
  });
});
