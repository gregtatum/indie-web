import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { act } from 'react';
import * as React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { createStore } from 'frontend/store/create-store';
import { A, T } from 'frontend';
import { AppRoutes } from 'frontend/components/App';
import { BULK_SMALL_LOAD_NOTICE_DELAY } from 'frontend/components/Music/EditTrackModal';
import fetchMock from '@fetch-mock/jest';
import { MUSIC_INDEX_VERSION } from 'shared/music';

/**
 * Prefer EditTrackModal.test.tsx for behavioral tests, as this mocks the server for
 * timing purposes. Mocking the server is generally not preferred.
 */

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
    albumArtist: 'Album Artist A',
    composer: null,
    album: 'Album A',
    genre: 'Rock',
    year: null,
    preferComposerGrouping: null,
    track: 1,
    duration: 180,
    size: 1024,
    mtime: '2024-01-01T00:00:00Z',
    folderArtworkPath: null,
    hasEmbeddedArtwork: false,
  },
  {
    path: '/music/b.mp3',
    title: 'Song B',
    artist: 'Artist B',
    albumArtist: 'Album Artist A',
    composer: null,
    album: 'Album A',
    genre: 'Rock',
    year: null,
    preferComposerGrouping: null,
    track: 2,
    duration: 200,
    size: 2048,
    mtime: '2024-01-01T00:00:00Z',
    folderArtworkPath: null,
    hasEmbeddedArtwork: false,
  },
];

type CannedResponse =
  | { body: string; status: number }
  | (() => Promise<{ body: string; status: number }>);

interface SetupOptions {
  search?: string;
  musicIndexResponse?: CannedResponse;
  trackTagsResponse?: CannedResponse;
}

function mockWriteTrackTags(
  response: T.WriteTrackTagsResponse = {
    updated: ['/music/a.mp3'],
    errors: [],
    index: { status: 'updated', message: null },
  },
): T.WriteTrackTagsRequest[] {
  const requests: T.WriteTrackTagsRequest[] = [];
  fetchMock.post(
    `${FAKE_SERVER.url}/music/write-track-tags`,
    ({ options }: any) => {
      requests.push(JSON.parse(options.body));
      return { body: JSON.stringify(response), status: 200 };
    },
  );
  return requests;
}

beforeEach(() => {
  jest.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600);
  jest.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800);
});

function setup(tracks = TRACKS, options: SetupOptions = {}) {
  const store = createStore();
  store.dispatch(A.addFileStoreServer(FAKE_SERVER));

  fetchMock.get(
    `${FAKE_SERVER.url}/music/music-index`,
    options.musicIndexResponse ?? {
      body: JSON.stringify({
        version: MUSIC_INDEX_VERSION,
        scannedAt: '2024-01-01T00:00:00Z',
        tracks,
      }),
      status: 200,
    },
  );

  fetchMock.get(
    new RegExp(`${FAKE_SERVER.url}/music/track-tags`),
    options.trackTagsResponse ?? {
      body: JSON.stringify({ blocks: [], resolved: {} }),
      status: 200,
    },
  );

  fetchMock.head(new RegExp(`${FAKE_SERVER.url}/music/artwork`), {
    status: 200,
    headers: { 'content-length': '245760' },
  });

  render(
    <MemoryRouter
      initialEntries={[`/${FAKE_SERVER.id}/music${options.search ?? ''}`]}
    >
      <Provider store={store as any}>
        <AppRoutes />
      </Provider>
    </MemoryRouter>,
  );

  return { store };
}

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
    store.dispatch(A.setMusicSelectedTracks(['/music/a.mp3', '/music/b.mp3']));
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

function getDialog(name: string) {
  return screen.getByRole('dialog', { name });
}

describe('edit track modal — loading and error states', () => {
  it('fills a refreshed bulk edit after the music index loads', async () => {
    let resolveMusicIndex!: (response: {
      body: string;
      status: number;
    }) => void;
    setup(TRACKS, {
      search:
        '?track=%2Fmusic%2Fa.mp3&track=%2Fmusic%2Fb.mp3&edit=%2Fmusic%2Fa.mp3',
      musicIndexResponse: () =>
        new Promise((resolve) => {
          resolveMusicIndex = resolve;
        }),
    });

    await screen.findByText('Edit 0 Tracks');

    await act(async () => {
      resolveMusicIndex({
        body: JSON.stringify({
          version: MUSIC_INDEX_VERSION,
          scannedAt: '2024-01-01T00:00:00Z',
          tracks: TRACKS,
        }),
        status: 200,
      });
    });

    await screen.findByRole('dialog', { name: 'Album A' });
    await waitFor(() => {
      expect((screen.getByLabelText('Album') as HTMLInputElement).value).toBe(
        'Album A',
      );
      expect((screen.getByLabelText('Genre') as HTMLInputElement).value).toBe(
        'Rock',
      );
    });
    expect(
      (screen.getByLabelText('Artist') as HTMLInputElement).placeholder,
    ).toBe('Mixed');
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
    setup(staleTracks, {
      trackTagsResponse: () => tagsPromise,
    });
    const writeRequests = mockWriteTrackTags();

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
          blocks: [
            {
              format: 'ID3v2.3',
              tags: [
                { id: 'TIT2', value: 'Live Title' },
                { id: 'TPE1', value: 'Live Artist' },
              ],
            },
          ],
          resolved: { TIT2: 'Live Title', TPE1: 'Live Artist' },
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
    setup(TRACKS, {
      trackTagsResponse: {
        body: 'Tag load failed',
        status: 500,
      },
    });
    const writeRequests = mockWriteTrackTags();

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

    fetchMock.get(`${FAKE_SERVER.url}/music/music-index`, {
      body: JSON.stringify({
        version: 4,
        scannedAt: '2024-01-01T00:00:00Z',
        tracks: manyTracks,
      }),
      status: 200,
    });
    fetchMock.get(new RegExp(`${FAKE_SERVER.url}/music/track-tags`), () => {
      trackTagsFetchCount++;
      return {
        body: JSON.stringify({ blocks: [], resolved: {} }),
        status: 200,
      };
    });

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

    screen.getByRole('dialog', { name: 'Album A' });
    expect(
      screen.getByText('Using track details from the library scan.'),
    ).toBeTruthy();
    expect(trackTagsFetchCount).toBe(0);
    expect(
      (screen.getByLabelText('Artist') as HTMLInputElement).placeholder,
    ).toBe('Mixed');
    expect(
      (screen.getByRole('textbox', { name: 'Composer' }) as HTMLInputElement)
        .placeholder,
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
      (screen.getByRole('textbox', { name: 'Composer' }) as HTMLInputElement)
        .placeholder,
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

    fetchMock.get(`${FAKE_SERVER.url}/music/music-index`, {
      body: JSON.stringify({
        version: 4,
        scannedAt: '2024-01-01T00:00:00Z',
        tracks: manyTracks,
      }),
      status: 200,
    });
    fetchMock.get(new RegExp(`${FAKE_SERVER.url}/music/track-tags`), () => {
      trackTagsFetchCount++;
      return {
        body: JSON.stringify({ blocks: [], resolved: {} }),
        status: 200,
      };
    });
    const writeRequests = mockWriteTrackTags({
      updated: manyTracks.map((track) => track.path),
      errors: [],
      index: { status: 'updated', message: null },
    });

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

    fetchMock.get(`${FAKE_SERVER.url}/music/music-index`, {
      body: JSON.stringify({
        version: 4,
        scannedAt: '2024-01-01T00:00:00Z',
        tracks: manyTracks,
      }),
      status: 200,
    });
    fetchMock.get(
      new RegExp(`${FAKE_SERVER.url}/music/track-tags`),
      ({ options }: any) => {
        signals.push(options.signal);
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => {
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

    fetchMock.get(`${FAKE_SERVER.url}/music/music-index`, {
      body: JSON.stringify({
        version: 4,
        scannedAt: '2024-01-01T00:00:00Z',
        tracks: manyTracks,
      }),
      status: 200,
    });
    fetchMock.get(new RegExp(`${FAKE_SERVER.url}/music/track-tags`), () => {
      trackTagsFetchCount++;
      if (trackTagsFetchCount === 1) {
        return { body: 'Nope', status: 500 };
      }
      return {
        body: JSON.stringify({ blocks: [], resolved: {} }),
        status: 200,
      };
    });

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
      (screen.getByRole('textbox', { name: 'Composer' }) as HTMLInputElement)
        .placeholder,
    ).toBe('Not loaded');
  });

  // The frontend POSTs the picked File straight through as the fetch body. jsdom
  // + node-fetch can't serialize a File, so the real-server harness always sees
  // an empty upload — only a mock can prove this wiring. The server's own
  // handling of an uploaded body is covered by
  // server/test/route-music-write-artwork.test.ts.
  it('uploads a picked file as the album artwork', async () => {
    const tracksWithArt: T.TrackMetadata[] = [
      {
        ...TRACKS[0],
        folderArtworkPath: '/music/Album A/Folder.jpg',
        hasEmbeddedArtwork: false,
      },
      ...TRACKS.slice(1),
    ];
    setup(tracksWithArt);

    let uploadCount = 0;
    let lastHadBody = false;
    fetchMock.post(
      new RegExp(`${FAKE_SERVER.url}/music/artwork`),
      ({ options }: any) => {
        uploadCount++;
        lastHadBody = Boolean(options.body);
        return {
          status: 200,
          body: JSON.stringify({
            folderArtworkPath: '/music/Album A/Folder.jpg',
          }),
        };
      },
    );

    await openEditModal('Song A');
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Artwork' }));
    });

    const dialog = getDialog('Song A');
    expect(
      within(dialog).getByRole('button', { name: /Change album artwork/ }),
    ).toBeTruthy();

    const input = dialog.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File(['fake-bytes'], 'cover.png', { type: 'image/png' });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    await waitFor(() => {
      expect(uploadCount).toBe(1);
    });
    expect(lastHadBody).toBe(true);
    expect(
      await within(dialog).findByRole('button', { name: 'Saved' }),
    ).toBeTruthy();
  });

  it('adds artwork from the empty state and shows it', async () => {
    const noArtTracks: T.TrackMetadata[] = [
      {
        ...TRACKS[0],
        path: '/music/Guero/01.mp3',
        title: 'Que Onda Guero',
        folderArtworkPath: null,
        hasEmbeddedArtwork: false,
      },
    ];
    setup(noArtTracks);

    fetchMock.post(new RegExp(`${FAKE_SERVER.url}/music/artwork`), {
      status: 200,
      body: JSON.stringify({
        folderArtworkPath: '/music/Guero/Folder.jpg',
      }),
    });

    await openEditModal('Que Onda Guero');
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Artwork' }));
    });

    const dialog = getDialog('Que Onda Guero');
    expect(within(dialog).getByText('No artwork found')).toBeTruthy();

    const input = dialog.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(
      within(dialog).getByRole('button', { name: /Add album artwork/ }),
    ).toBeTruthy();

    const file = new File(['bytes'], 'cover.jpg', { type: 'image/jpeg' });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    expect(await within(dialog).findByText('/music/Guero/')).toBeTruthy();
    expect(within(dialog).queryByText('No artwork found')).toBeNull();
  });
});
