import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

interface SetupOptions {
  trackTagsResponse?:
    | {
        body: string;
        status: number;
      }
    | (() => Promise<{ body: string; status: number }>);
}

function setup(tracks = TRACKS, options: SetupOptions = {}) {
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

  (window.fetch as FetchMockSandbox).get(
    new RegExp(`${FAKE_SERVER.url}/music/track-tags`),
    options.trackTagsResponse ?? {
      body: JSON.stringify({ native: [] }),
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
    await waitFor(() => {
      expect(artistInput.disabled).toBe(false);
    });
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

  // The indexed metadata is only a preview while live ID3 tags load. Keeping the
  // fields disabled until the live tags establish the save baseline prevents
  // stale index data from being edited or written back over newer ID3 tags.
  it('does not allow editing stale indexed fields before live tags load', async () => {
    const staleTracks: T.TrackMetadata[] = [
      {
        ...TRACKS[0],
        title: 'Indexed Title',
        artist: 'Indexed Artist',
      },
    ];
    let resolveTags: (response: { body: string; status: number }) => void;
    const tagsPromise = new Promise<{ body: string; status: number }>(
      (resolve) => {
        resolveTags = resolve;
      },
    );
    const writeRequests: Array<{
      path: string;
      changes: Array<{ frameId: string; value: string }>;
    }> = [];

    setup(staleTracks, {
      trackTagsResponse: () => tagsPromise,
    });
    (window.fetch as FetchMockSandbox).post(
      `${FAKE_SERVER.url}/music/write-track-tags`,
      (_url, opts: any) => {
        writeRequests.push(JSON.parse(opts.body));
        return { body: JSON.stringify({}), status: 200 };
      },
    );

    await openEditModal('Indexed Title');
    const titleInput = screen.getByLabelText('Title') as HTMLInputElement;
    const artistInput = screen.getByLabelText('Artist') as HTMLInputElement;
    const saveButton = screen.getByRole('button', {
      name: 'Save',
    }) as HTMLButtonElement;

    expect(titleInput.value).toBe('Indexed Title');
    expect(artistInput.value).toBe('Indexed Artist');
    expect(titleInput.disabled).toBe(true);
    expect(artistInput.disabled).toBe(true);
    expect(saveButton.disabled).toBe(true);

    await act(async () => {
      resolveTags!({
        body: JSON.stringify({
          native: [
            {
              format: 'ID3v2.3',
              tags: [
                { id: 'TIT2', value: 'Live Title' },
                { id: 'TPE1', value: 'Live Artist' },
              ],
            },
          ],
        }),
        status: 200,
      });
      await tagsPromise;
    });

    await waitFor(() => {
      expect(screen.queryByText('Loading…')).toBeNull();
    });
    expect(titleInput.disabled).toBe(false);
    expect(artistInput.disabled).toBe(false);
    expect(titleInput.value).toBe('Live Title');
    expect(artistInput.value).toBe('Live Artist');

    await act(async () => {
      fireEvent.change(titleInput, {
        target: { value: 'User Edited Title' },
      });
    });

    await act(async () => {
      fireEvent.click(saveButton);
    });

    await waitFor(() => {
      expect(writeRequests).toHaveLength(1);
    });
    expect(writeRequests[0]).toEqual({
      path: '/music/a.mp3',
      changes: [{ frameId: 'TIT2', value: 'User Edited Title' }],
    });
  });

  it('keeps details editing disabled when live tags fail to load', async () => {
    const writeRequests: Array<unknown> = [];

    setup(TRACKS, {
      trackTagsResponse: {
        body: 'Tag load failed',
        status: 500,
      },
    });
    (window.fetch as FetchMockSandbox).post(
      `${FAKE_SERVER.url}/music/write-track-tags`,
      (_url, opts: any) => {
        writeRequests.push(JSON.parse(opts.body));
        return { body: JSON.stringify({}), status: 200 };
      },
    );

    await openEditModal('Song A');
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: 'ID3' }));
    });
    await waitFor(() => {
      expect(screen.getByText(/Error: 500/)).toBeTruthy();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Details' }));
    });

    expect((screen.getByLabelText('Title') as HTMLInputElement).disabled).toBe(
      true,
    );
    const saveButton = screen.getByRole('button', {
      name: 'Save',
    }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);

    await act(async () => {
      fireEvent.click(saveButton);
    });
    expect(writeRequests).toHaveLength(0);
  });
});
