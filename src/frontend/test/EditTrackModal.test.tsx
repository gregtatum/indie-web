import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import * as React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { createStore } from 'frontend/store/create-store';
import { A, T } from 'frontend';
import { AppRoutes } from 'frontend/components/App';
import { BULK_SMALL_LOAD_NOTICE_DELAY } from 'frontend/components/Music/EditTrackModal';
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

  async function openBulkEditModal(store: ReturnType<typeof createStore>) {
    await act(async () => {
      store.dispatch(
        A.setMusicSelectedTracks(['/music/a.mp3', '/music/b.mp3']),
      );
    });
    const track = await screen.findByText('Song A');
    await act(async () => {
      fireEvent.contextMenu(track);
    });
    const editButton = await screen.findByRole('button', {
      name: 'Edit Selection',
    });
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
      paths: ['/music/a.mp3'],
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

  it('opens a bulk Details editor with shared values and mixed placeholders', async () => {
    const { store } = setup();
    await openBulkEditModal(store);

    screen.getByRole('dialog');
    await waitFor(() => {
      expect(
        (screen.getByLabelText('Artist') as HTMLInputElement).disabled,
      ).toBe(false);
    });

    expect(screen.queryByLabelText('Title')).toBeNull();
    expect(screen.getByText('Edit 2 Tracks')).toBeTruthy();

    const artistInput = screen.getByLabelText('Artist') as HTMLInputElement;
    const albumInput = screen.getByLabelText('Album') as HTMLInputElement;
    const genreInput = screen.getByLabelText('Genre') as HTMLInputElement;
    expect(artistInput.value).toBe('');
    expect(artistInput.placeholder).toBe('Mixed');
    expect(albumInput.value).toBe('Album A');
    expect(albumInput.placeholder).toBe('');
    expect(genreInput.value).toBe('Rock');

    const trackLabel = screen
      .getAllByText('Track')
      .find((node) => node.closest('label'));
    const trackInputs = trackLabel!.closest('label')!.querySelectorAll('input');
    expect(trackInputs[0].value).toBe('');
    expect(trackInputs[0].placeholder).toBe('–');
  });

  it('keeps ID3 disabled and saves shared bulk genre edits', async () => {
    const { store } = setup();
    const writeRequests: Array<{
      paths: string[];
      changes: Array<{ frameId: string; value: string }>;
    }> = [];
    (window.fetch as FetchMockSandbox).post(
      `${FAKE_SERVER.url}/music/write-track-tags`,
      (_url, opts: any) => {
        writeRequests.push(JSON.parse(opts.body));
        return {
          body: JSON.stringify({
            updated: ['/music/a.mp3', '/music/b.mp3'],
            errors: [],
            index: { status: 'updated', message: null },
          }),
          status: 200,
        };
      },
    );

    await openBulkEditModal(store);
    const id3Tab = screen.getByRole('tab', {
      name: 'ID3',
    }) as HTMLButtonElement;
    expect(id3Tab.disabled).toBe(true);

    await act(async () => {
      fireEvent.click(id3Tab);
    });
    expect(id3Tab.getAttribute('aria-selected')).toBe('false');

    const genreInput = screen.getByLabelText('Genre') as HTMLInputElement;
    await waitFor(() => {
      expect(genreInput.disabled).toBe(false);
    });
    await act(async () => {
      fireEvent.change(genreInput, { target: { value: 'New Genre' } });
    });

    const saveButton = screen.getByRole('button', {
      name: 'Save',
    }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(saveButton);
    });

    await waitFor(() => {
      expect(writeRequests).toHaveLength(1);
    });
    expect(writeRequests[0]).toEqual({
      paths: ['/music/a.mp3', '/music/b.mp3'],
      changes: [{ frameId: 'TCON', value: 'New Genre' }],
    });
    await waitFor(() => {
      expect(
        (screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement)
          .disabled,
      ).toBe(true);
    });
    const state = store.getState() as any;
    const tracks = state.music.tracks as T.TrackMetadata[];
    expect(tracks.find((track) => track.path === '/music/a.mp3')?.genre).toBe(
      'New Genre',
    );
    expect(tracks.find((track) => track.path === '/music/b.mp3')?.genre).toBe(
      'New Genre',
    );
  });

  it('shows all server save errors from a partial bulk failure', async () => {
    const tracks: T.TrackMetadata[] = [
      ...TRACKS,
      {
        ...TRACKS[0],
        path: '/music/d.mp3',
        title: 'Song D',
      },
      {
        ...TRACKS[0],
        path: '/music/e.mp3',
        title: 'Song E',
      },
      {
        ...TRACKS[0],
        path: '/music/f.mp3',
        title: 'Song F',
      },
      {
        ...TRACKS[0],
        path: '/music/g.mp3',
        title: 'Song G',
      },
    ];
    const { store } = setup(tracks);
    await act(async () => {
      store.dispatch(
        A.setMusicSelectedTracks([
          '/music/a.mp3',
          '/music/b.mp3',
          '/music/d.mp3',
          '/music/e.mp3',
          '/music/f.mp3',
        ]),
      );
    });
    (window.fetch as FetchMockSandbox).post(
      `${FAKE_SERVER.url}/music/write-track-tags`,
      {
        body: JSON.stringify({
          updated: ['/music/a.mp3'],
          errors: [
            { path: '/music/b.mp3', message: 'File not found.' },
            {
              path: '/music/d.mp3',
              message: 'Only MP3 files are supported for tag writing.',
            },
            { path: '/music/e.mp3', message: 'Permission denied.' },
            { path: '/music/f.mp3', message: 'Unable to write tags.' },
          ],
          index: {
            status: 'error',
            message: 'Failed to write music index after writing track tags.',
          },
        }),
        status: 200,
      },
    );

    const track = await screen.findByText('Song A');
    await act(async () => {
      fireEvent.contextMenu(track);
    });
    await act(async () => {
      fireEvent.click(
        await screen.findByRole('button', { name: 'Edit Selection' }),
      );
    });
    const genreInput = screen.getByLabelText('Genre') as HTMLInputElement;
    await waitFor(() => {
      expect(genreInput.disabled).toBe(false);
    });
    await act(async () => {
      fireEvent.change(genreInput, { target: { value: 'New Genre' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    await screen.findByText('Saved 1 of 5 tracks. Could not save 4 tracks.');
    expect(screen.getByText('/music/b.mp3')).toBeTruthy();
    expect(screen.queryByText('/music/f.mp3')).toBeNull();
    expect(
      screen.getByText(
        'Music index update failed: Failed to write music index after writing track tags.',
      ),
    ).toBeTruthy();

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Show all failed tracks' }),
      );
    });
    expect(screen.getByText('/music/f.mp3')).toBeTruthy();
    expect(
      (
        screen.getByRole('button', {
          name: 'Save failed — retry',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);

    const state = store.getState() as any;
    const savedTrack = (state.music.tracks as T.TrackMetadata[]).find(
      (track) => track.path === '/music/a.mp3',
    );
    const failedTrack = (state.music.tracks as T.TrackMetadata[]).find(
      (track) => track.path === '/music/b.mp3',
    );
    expect(savedTrack?.genre).toBe('New Genre');
    expect(failedTrack?.genre).toBe('Rock');
  });

  it('defers the bulk loading progress notice for small selections', async () => {
    jest.useFakeTimers();
    const { store } = setup(TRACKS, {
      trackTagsResponse: () => new Promise(() => {}),
    });

    await openBulkEditModal(store);

    expect(screen.queryByText(/Loading ID3 tags/)).toBeNull();
    expect((screen.getByLabelText('Artist') as HTMLInputElement).disabled).toBe(
      true,
    );

    await act(async () => {
      jest.advanceTimersByTime(BULK_SMALL_LOAD_NOTICE_DELAY - 1);
    });
    expect(screen.queryByText(/Loading ID3 tags/)).toBeNull();

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(screen.getByText('Loading ID3 tags: 0 / 2')).toBeTruthy();
  });

  it('shows shared folder artwork only in the bulk editor', async () => {
    const tracksWithArt: T.TrackMetadata[] = TRACKS.map((track, index) => ({
      ...track,
      coverArt:
        index < 2 ? '/music/Album A/Folder.jpg' : '/music/Album B/Folder.jpg',
      hasEmbeddedArt: true,
    }));
    const { store } = setup(tracksWithArt, {
      trackTagsResponse: {
        body: JSON.stringify({
          native: [
            {
              format: 'ID3v2.3',
              tags: [
                {
                  id: 'APIC',
                  value: 'image/jpeg — Cover (front)',
                  binary: 'abc123',
                },
              ],
            },
          ],
        }),
        status: 200,
      },
    });

    await openBulkEditModal(store);
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Artwork' }));
    });

    expect(await screen.findByText('Folder')).toBeTruthy();
    expect(screen.getByText('/music/Album A/Folder.jpg')).toBeTruthy();
    expect(screen.queryByText('Embedded')).toBeNull();
    expect(
      screen.queryByRole('button', {
        name: 'Overwrite with embedded artwork',
      }),
    ).toBeNull();
  });

  it('skips live tag loading above the bulk cutoff', async () => {
    const manyTracks: T.TrackMetadata[] = Array.from(
      { length: 201 },
      (_, i) => ({
        ...TRACKS[0],
        path: `/music/${i}.mp3`,
        title: `Song ${i}`,
        artist: i === 0 ? 'Artist A' : 'Artist B',
        track: i + 1,
      }),
    );
    const store = createStore();
    store.dispatch(A.addFileStoreServer(FAKE_SERVER));
    let trackTagsFetchCount = 0;

    (window.fetch as FetchMockSandbox).get(
      `${FAKE_SERVER.url}/music/music-index`,
      {
        body: JSON.stringify({
          version: 4,
          scannedAt: '2024-01-01T00:00:00Z',
          tracks: manyTracks,
        }),
        status: 200,
      },
    );
    (window.fetch as FetchMockSandbox).get(
      new RegExp(`${FAKE_SERVER.url}/music/track-tags`),
      () => {
        trackTagsFetchCount++;
        return { body: JSON.stringify({ native: [] }), status: 200 };
      },
    );

    render(
      <MemoryRouter initialEntries={[`/${FAKE_SERVER.id}/music`]}>
        <Provider store={store as any}>
          <AppRoutes />
        </Provider>
      </MemoryRouter>,
    );

    const track = await screen.findByText('Song 0');
    await act(async () => {
      store.dispatch(A.setMusicSelectedTracks(manyTracks.map((t) => t.path)));
    });
    await act(async () => {
      fireEvent.contextMenu(track);
    });
    const editButton = await screen.findByRole('button', {
      name: 'Edit Selection',
    });
    await act(async () => {
      fireEvent.click(editButton);
    });

    expect(screen.getByText('Edit 201 Tracks')).toBeTruthy();
    expect(
      screen.getByText('Using track details from the library scan.'),
    ).toBeTruthy();
    expect(trackTagsFetchCount).toBe(0);
    expect(
      (screen.getByLabelText('Artist') as HTMLInputElement).placeholder,
    ).toBe('Mixed');
    expect(
      (screen.getByLabelText('Composer') as HTMLInputElement).placeholder,
    ).toBe('Not loaded');

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Load all 201 tracks' }),
      );
    });

    await waitFor(() => {
      expect(trackTagsFetchCount).toBe(201);
    });
    expect(screen.queryByText(/Using track details/)).toBeNull();
    expect(
      (screen.getByLabelText('Composer') as HTMLInputElement).placeholder,
    ).toBe('');
  });

  it('saves bulk edits from scanned index values when live tags are skipped', async () => {
    const manyTracks: T.TrackMetadata[] = Array.from(
      { length: 201 },
      (_, i) => ({
        ...TRACKS[0],
        path: `/music/${i}.mp3`,
        title: `Song ${i}`,
        artist: 'Artist A',
        genre: 'Old Genre',
        track: i + 1,
      }),
    );
    const store = createStore();
    store.dispatch(A.addFileStoreServer(FAKE_SERVER));
    let trackTagsFetchCount = 0;
    const writeRequests: Array<{
      paths: string[];
      changes: Array<{ frameId: string; value: string }>;
    }> = [];

    (window.fetch as FetchMockSandbox).get(
      `${FAKE_SERVER.url}/music/music-index`,
      {
        body: JSON.stringify({
          version: 4,
          scannedAt: '2024-01-01T00:00:00Z',
          tracks: manyTracks,
        }),
        status: 200,
      },
    );
    (window.fetch as FetchMockSandbox).get(
      new RegExp(`${FAKE_SERVER.url}/music/track-tags`),
      () => {
        trackTagsFetchCount++;
        return { body: JSON.stringify({ native: [] }), status: 200 };
      },
    );
    (window.fetch as FetchMockSandbox).post(
      `${FAKE_SERVER.url}/music/write-track-tags`,
      (_url, opts: any) => {
        writeRequests.push(JSON.parse(opts.body));
        return {
          body: JSON.stringify({
            updated: manyTracks.map((track) => track.path),
            errors: [],
            index: { status: 'updated', message: null },
          }),
          status: 200,
        };
      },
    );

    render(
      <MemoryRouter initialEntries={[`/${FAKE_SERVER.id}/music`]}>
        <Provider store={store as any}>
          <AppRoutes />
        </Provider>
      </MemoryRouter>,
    );

    const track = await screen.findByText('Song 0');
    await act(async () => {
      store.dispatch(A.setMusicSelectedTracks(manyTracks.map((t) => t.path)));
    });
    await act(async () => {
      fireEvent.contextMenu(track);
    });
    await act(async () => {
      fireEvent.click(
        await screen.findByRole('button', { name: 'Edit Selection' }),
      );
    });

    expect(
      screen.getByText('Using track details from the library scan.'),
    ).toBeTruthy();
    const genreInput = screen.getByLabelText('Genre') as HTMLInputElement;
    expect(genreInput.disabled).toBe(false);
    await act(async () => {
      fireEvent.change(genreInput, { target: { value: 'New Genre' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    await waitFor(() => {
      expect(writeRequests).toHaveLength(1);
    });
    expect(trackTagsFetchCount).toBe(0);
    expect(writeRequests[0]).toEqual({
      paths: manyTracks.map((track) => track.path),
      changes: [{ frameId: 'TCON', value: 'New Genre' }],
    });
  });

  it('discards bulk edits and disables fields while loading all ID3 tags', async () => {
    const manyTracks: T.TrackMetadata[] = Array.from(
      { length: 201 },
      (_, i) => ({
        ...TRACKS[0],
        path: `/music/${i}.mp3`,
        title: `Song ${i}`,
        artist: i === 0 ? 'Artist A' : 'Artist B',
        track: i + 1,
      }),
    );
    const store = createStore();
    store.dispatch(A.addFileStoreServer(FAKE_SERVER));
    const signals: AbortSignal[] = [];

    (window.fetch as FetchMockSandbox).get(
      `${FAKE_SERVER.url}/music/music-index`,
      {
        body: JSON.stringify({
          version: 4,
          scannedAt: '2024-01-01T00:00:00Z',
          tracks: manyTracks,
        }),
        status: 200,
      },
    );
    (window.fetch as FetchMockSandbox).get(
      new RegExp(`${FAKE_SERVER.url}/music/track-tags`),
      (_url, opts: any) => {
        signals.push(opts.signal);
        return new Promise((_resolve, reject) => {
          opts.signal.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      },
    );

    render(
      <MemoryRouter initialEntries={[`/${FAKE_SERVER.id}/music`]}>
        <Provider store={store as any}>
          <AppRoutes />
        </Provider>
      </MemoryRouter>,
    );

    const track = await screen.findByText('Song 0');
    await act(async () => {
      store.dispatch(A.setMusicSelectedTracks(manyTracks.map((t) => t.path)));
    });
    await act(async () => {
      fireEvent.contextMenu(track);
    });
    await act(async () => {
      fireEvent.click(
        await screen.findByRole('button', { name: 'Edit Selection' }),
      );
    });

    const albumInput = screen.getByLabelText('Album') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(albumInput, { target: { value: 'Unsaved Album' } });
    });
    expect(albumInput.value).toBe('Unsaved Album');

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Load all 201 tracks' }),
      );
    });

    const resetAlbumInput = screen.getByLabelText('Album') as HTMLInputElement;
    expect(resetAlbumInput.value).toBe('Album A');
    expect(resetAlbumInput.disabled).toBe(true);
    expect(screen.getByText('Loading ID3 tags: 0 / 201')).toBeTruthy();

    await waitFor(() => {
      expect(signals.length).toBeGreaterThan(0);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it('keeps scan values and offers retry when bulk ID3 loading fails', async () => {
    const manyTracks: T.TrackMetadata[] = Array.from(
      { length: 201 },
      (_, i) => ({
        ...TRACKS[0],
        path: `/music/${i}.mp3`,
        title: `Song ${i}`,
        artist: i === 0 ? 'Artist A' : 'Artist B',
        track: i + 1,
      }),
    );
    const store = createStore();
    store.dispatch(A.addFileStoreServer(FAKE_SERVER));
    let trackTagsFetchCount = 0;

    (window.fetch as FetchMockSandbox).get(
      `${FAKE_SERVER.url}/music/music-index`,
      {
        body: JSON.stringify({
          version: 4,
          scannedAt: '2024-01-01T00:00:00Z',
          tracks: manyTracks,
        }),
        status: 200,
      },
    );
    (window.fetch as FetchMockSandbox).get(
      new RegExp(`${FAKE_SERVER.url}/music/track-tags`),
      () => {
        trackTagsFetchCount++;
        if (trackTagsFetchCount === 1) {
          return { body: 'Nope', status: 500 };
        }
        return { body: JSON.stringify({ native: [] }), status: 200 };
      },
    );

    render(
      <MemoryRouter initialEntries={[`/${FAKE_SERVER.id}/music`]}>
        <Provider store={store as any}>
          <AppRoutes />
        </Provider>
      </MemoryRouter>,
    );

    const track = await screen.findByText('Song 0');
    await act(async () => {
      store.dispatch(A.setMusicSelectedTracks(manyTracks.map((t) => t.path)));
    });
    await act(async () => {
      fireEvent.contextMenu(track);
    });
    await act(async () => {
      fireEvent.click(
        await screen.findByRole('button', { name: 'Edit Selection' }),
      );
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Load all 201 tracks' }),
      );
    });

    await waitFor(() => {
      expect(
        screen.getByText('Could not load ID3 tags for 1 tracks.'),
      ).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(
      (screen.getByLabelText('Composer') as HTMLInputElement).placeholder,
    ).toBe('Not loaded');
  });
});
