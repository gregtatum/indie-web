import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import * as React from 'react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { Provider } from 'react-redux';
import { createStore } from 'frontend/store/create-store';
import { A, T, $ } from 'frontend';
import { AppRoutes } from 'frontend/components/App';
import { MUSIC_URL_SERIALIZATION_CUTOFF } from 'frontend/components/Music/UrlSerialization';
import type { FetchMockSandbox } from 'fetch-mock';
import { mockServerListFiles } from './utils/fixtures';

const FAKE_SERVER: T.FileStoreServer = {
  id: 'test-music',
  url: 'http://fake-music',
  name: 'Test Music',
  storeType: 'music',
};

const TRACKS: T.TrackMetadata[] = [
  {
    path: '/Indie/Andrew Bird/The Mysterious Production of Eggs/Sovay.mp3',
    title: 'Sovay',
    artist: 'Andrew Bird',
    albumArtist: null,
    album: 'The Mysterious Production of Eggs',
    genre: 'Indie',
    track: 1,
    duration: 180,
    size: 1024,
    mtime: '2024-01-01T00:00:00Z',
    coverArt: null,
    hasEmbeddedArt: false,
  },
  {
    path: '/Jazz/Miles Davis/Kind of Blue/All Blues.mp3',
    title: 'All Blues',
    artist: 'Miles Davis',
    albumArtist: null,
    album: 'Kind of Blue',
    genre: 'Jazz',
    track: 2,
    duration: 200,
    size: 2048,
    mtime: '2024-01-01T00:00:00Z',
    coverArt: null,
    hasEmbeddedArt: false,
  },
];

function makeTracks(count: number): T.TrackMetadata[] {
  return Array.from({ length: count }, (_, i) => ({
    ...TRACKS[0],
    path: `/Mass Edit/Song ${i}.mp3`,
    title: `Song ${i}`,
    artist: 'Mass Artist',
    albumArtist: null,
    album: 'Mass Album',
    genre: 'Mass Genre',
    track: i + 1,
  }));
}

function makeValues(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix} ${i}`);
}

beforeEach(() => {
  jest.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600);
  jest.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800);
});

function setup(search = '', tracks = TRACKS) {
  const store = createStore();
  store.dispatch(A.addFileStoreServer(FAKE_SERVER));

  (window.fetch as FetchMockSandbox).get(
    `${FAKE_SERVER.url}/music/music-index`,
    {
      body: JSON.stringify({
        version: 6,
        scannedAt: '2024-01-01T00:00:00Z',
        tracks,
      }),
      status: 200,
    },
  );
  const genreFolders: T.FolderListing = [
    ...new Set(tracks.map((t) => t.genre).filter(Boolean)),
  ].map((genre) => ({
    type: 'folder' as const,
    name: genre!,
    path: `/${genre}`,
    id: `id:/${genre}`,
  }));
  mockServerListFiles(FAKE_SERVER, genreFolders);

  let currentLocation: ReturnType<typeof useLocation>;
  let currentNavigate: ReturnType<typeof useNavigate>;
  // Captures the location and navigate during the React update cycle.
  function LocationCapture() {
    currentLocation = useLocation();
    currentNavigate = useNavigate();
    return null;
  }

  render(
    <MemoryRouter initialEntries={[`/${FAKE_SERVER.id}/music${search}`]}>
      <Provider store={store as any}>
        <AppRoutes />
        <LocationCapture />
      </Provider>
    </MemoryRouter>,
  );

  return {
    store,
    getLocation: () => currentLocation,
    getNavigate: () => currentNavigate,
  };
}

function getParams(search: string): URLSearchParams {
  return new URLSearchParams(search);
}

describe('music URL serialization', () => {
  it('filters artists by album artist first and falls back to artist', async () => {
    const tracks: T.TrackMetadata[] = [
      {
        ...TRACKS[0],
        path: '/Dance/Daft Punk/Random Access Memories/Instant Crush.mp3',
        title: 'Instant Crush',
        artist: 'Daft Punk feat. Julian Casablancas',
        albumArtist: 'Daft Punk',
        album: 'Random Access Memories',
        genre: 'Dance',
      },
      {
        ...TRACKS[0],
        path: '/Indie/Andrew Bird/The Mysterious Production of Eggs/Sovay.mp3',
        title: 'Sovay',
        artist: 'Andrew Bird',
        albumArtist: '',
      },
    ];
    setup('', tracks);

    const artistPanel = screen.getByRole('listbox', { name: 'artist' });
    fireEvent.click(
      await within(artistPanel).findByRole('option', { name: 'Daft Punk' }),
    );

    expect(await screen.findByText('Instant Crush')).toBeTruthy();
    expect(screen.queryByText('Sovay')).toBeNull();

    fireEvent.click(
      within(artistPanel).getByRole('option', { name: 'Daft Punk' }),
    );
    fireEvent.click(
      await within(artistPanel).findByRole('option', { name: 'Andrew Bird' }),
    );

    expect(await screen.findByText('Sovay')).toBeTruthy();
    expect(screen.queryByText('Instant Crush')).toBeNull();
  });

  it('updates the URL when clicking through filters and track selections', async () => {
    const { getLocation } = setup();

    const genrePanel = screen.getByRole('listbox', { name: 'genre' });
    fireEvent.click(
      await within(genrePanel).findByRole('option', { name: 'Indie' }),
    );

    await waitFor(() => {
      expect(getParams(getLocation().search).getAll('genre')).toEqual([
        'Indie',
      ]);
    });

    const artistPanel = screen.getByRole('listbox', { name: 'artist' });
    fireEvent.click(
      await within(artistPanel).findByRole('option', { name: 'Andrew Bird' }),
    );

    await waitFor(() => {
      const params = getParams(getLocation().search);
      expect(params.getAll('genre')).toEqual(['Indie']);
      expect(params.getAll('artist')).toEqual(['Andrew Bird']);
    });

    const albumPanel = screen.getByRole('listbox', { name: 'album' });
    fireEvent.click(
      await within(albumPanel).findByRole('option', {
        name: 'The Mysterious Production of Eggs',
      }),
    );

    await waitFor(() => {
      const params = getParams(getLocation().search);
      expect(params.getAll('genre')).toEqual(['Indie']);
      expect(params.getAll('artist')).toEqual(['Andrew Bird']);
      expect(params.getAll('album')).toEqual([
        'The Mysterious Production of Eggs',
      ]);
    });

    const trackPanel = screen.getByRole('listbox', { name: 'Tracks' });
    fireEvent.click(await within(trackPanel).findByText('Sovay'));

    await waitFor(() => {
      expect(getParams(getLocation().search).getAll('track')).toEqual([
        '/Indie/Andrew Bird/The Mysterious Production of Eggs/Sovay.mp3',
      ]);
    });
  });

  it('stops serializing selected tracks above the URL cutoff', async () => {
    const tracks = makeTracks(MUSIC_URL_SERIALIZATION_CUTOFF + 1);
    const { store, getLocation } = setup('', tracks);
    await screen.findByText('Song 0');

    act(() => {
      store.dispatch(
        A.setMusicSelectedTracks(tracks.map((track) => track.path)),
      );
    });
    expect($.getMusicSelectedTrackPaths(store.getState())).toHaveLength(
      MUSIC_URL_SERIALIZATION_CUTOFF + 1,
    );
    await waitFor(() => {
      expect(getParams(getLocation().search).getAll('track')).toEqual([]);
    });
  });

  it('does not serialize an open bulk edit above the track URL cutoff', async () => {
    const tracks = makeTracks(MUSIC_URL_SERIALIZATION_CUTOFF + 1);
    const { store, getLocation } = setup('', tracks);
    await screen.findByText('Song 0');

    act(() => {
      store.dispatch(
        A.setMusicSelectedTracks(tracks.map((track) => track.path)),
      );
      store.dispatch(A.setMusicEditTrackPath(tracks[0].path));
    });

    await screen.findByText(
      `Edit ${MUSIC_URL_SERIALIZATION_CUTOFF + 1} Tracks`,
    );
    await waitFor(() => {
      const params = getParams(getLocation().search);
      expect(params.getAll('track')).toEqual([]);
      expect(params.get('edit')).toBeNull();
      expect(params.get('tab')).toBeNull();
    });
  });

  it('ignores oversized track and edit params on load', async () => {
    const tracks = makeTracks(MUSIC_URL_SERIALIZATION_CUTOFF + 1);
    const params = new URLSearchParams();
    for (const track of tracks) {
      params.append('track', track.path);
    }
    params.set('edit', tracks[0].path);

    const { store } = setup(`?${params.toString()}`, tracks);
    await screen.findByText('Song 0');

    expect($.getMusicSelectedTrackPaths(store.getState())).toEqual([]);
    expect($.getMusicEditTrackPath(store.getState())).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('stops serializing filters above the URL cutoff', async () => {
    const values = makeValues('Genre', MUSIC_URL_SERIALIZATION_CUTOFF + 1);
    const { store, getLocation } = setup();

    act(() => {
      store.dispatch(A.setMusicPanelSelection('genre', values));
    });

    expect($.getMusicPanelSelections(store.getState()).genre).toHaveLength(
      MUSIC_URL_SERIALIZATION_CUTOFF + 1,
    );
    await waitFor(() => {
      expect(getParams(getLocation().search).getAll('genre')).toEqual([]);
    });
  });

  it('ignores oversized filter params on load', async () => {
    const params = new URLSearchParams();
    for (const artist of makeValues(
      'Artist',
      MUSIC_URL_SERIALIZATION_CUTOFF + 1,
    )) {
      params.append('artist', artist);
    }

    const { store } = setup(`?${params.toString()}`);
    await screen.findByText('Sovay');

    expect($.getMusicPanelSelections(store.getState()).artist).toBeUndefined();
  });

  it('cmd+clicking a second genre adds it to the URL', async () => {
    const { getLocation } = setup();

    fireEvent.click(await screen.findByText('Indie'));
    fireEvent.click(screen.getByText('Jazz'), { metaKey: true });

    await waitFor(() => {
      expect(getParams(getLocation().search).getAll('genre')).toEqual([
        'Indie',
        'Jazz',
      ]);
    });
  });

  it('drops a genre URL param when updated tracks make that filter invalid', async () => {
    const { store, getLocation } = setup('?genre=Indie');

    await waitFor(() => {
      expect($.getMusicPanelSelections(store.getState())).toEqual({
        genre: ['Indie'],
      });
    });

    act(() => {
      store.dispatch(
        A.setMusicTracks(
          TRACKS.map((track) =>
            track.genre === 'Indie'
              ? { ...track, genre: 'Alternative' }
              : track,
          ),
          false,
        ),
      );
    });

    await waitFor(() => {
      expect($.getMusicPanelSelections(store.getState())).toEqual({});
      expect(getParams(getLocation().search).get('genre')).toBeNull();
    });
  });

  it('keeps a genre URL param when updated tracks leave that filter valid', async () => {
    const tracks = [
      ...TRACKS,
      {
        ...TRACKS[0],
        path: '/Indie/Andrew Bird/Other/Other.mp3',
        title: 'Other Indie Song',
      },
    ];
    const { store, getLocation } = setup('?genre=Indie', tracks);

    await waitFor(() => {
      expect($.getMusicPanelSelections(store.getState())).toEqual({
        genre: ['Indie'],
      });
    });

    act(() => {
      store.dispatch(
        A.setMusicTracks(
          tracks.map((track) =>
            track.title === 'Sovay'
              ? { ...track, genre: 'Alternative' }
              : track,
          ),
          false,
        ),
      );
    });

    await waitFor(() => {
      expect($.getMusicPanelSelections(store.getState())).toEqual({
        genre: ['Indie'],
      });
      expect(getParams(getLocation().search).getAll('genre')).toEqual([
        'Indie',
      ]);
    });
  });

  it('drops an invalid genre filter after bulk editing every matching track', async () => {
    const tracks = [
      {
        ...TRACKS[0],
        path: '/Indie/Andrew Bird/Album A/Song A.mp3',
        title: 'Song A',
        album: 'Album A',
      },
      {
        ...TRACKS[0],
        path: '/Indie/Andrew Bird/Album A/Song B.mp3',
        title: 'Song B',
        album: 'Album A',
      },
      TRACKS[1],
    ];
    const { store, getLocation } = setup('?genre=Indie', tracks);
    (window.fetch as FetchMockSandbox).get(
      new RegExp(`${FAKE_SERVER.url}/music/track-tags`),
      { body: JSON.stringify({ native: [] }), status: 200 },
    );
    (window.fetch as FetchMockSandbox).post(
      `${FAKE_SERVER.url}/music/write-track-tags`,
      {
        body: JSON.stringify({
          updated: [
            '/Indie/Andrew Bird/Album A/Song A.mp3',
            '/Indie/Andrew Bird/Album A/Song B.mp3',
          ],
          errors: [],
          index: { status: 'updated', message: null },
        }),
        status: 200,
      },
    );

    await screen.findByText('Song A');
    await waitFor(() => {
      expect($.getMusicPanelSelections(store.getState())).toEqual({
        genre: ['Indie'],
      });
    });

    act(() => {
      store.dispatch(
        A.setMusicSelectedTracks([
          '/Indie/Andrew Bird/Album A/Song A.mp3',
          '/Indie/Andrew Bird/Album A/Song B.mp3',
        ]),
      );
    });
    await act(async () => {
      fireEvent.contextMenu(await screen.findByText('Song A'));
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
      fireEvent.change(genreInput, { target: { value: 'Alternative' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    await waitFor(() => {
      expect($.getMusicPanelSelections(store.getState())).toEqual({});
      expect(getParams(getLocation().search).get('genre')).toBeNull();
    });
    expect(screen.getByText('Song A')).toBeTruthy();
    expect(screen.getByText('Song B')).toBeTruthy();
    expect(screen.getByText('All Blues')).toBeTruthy();
  });
});

describe('music view toggle', () => {
  it('pushes onto history so back navigation returns to the previous view', async () => {
    const { getLocation, getNavigate } = setup();

    fireEvent.click(await screen.findByRole('link', { name: 'Files' }));

    await waitFor(() => {
      expect(getParams(getLocation().search).get('view')).toBe('files');
    });

    act(() => getNavigate()(-1));

    await waitFor(() => {
      expect(getParams(getLocation().search).get('view')).toBeNull();
    });
  });
});

describe('edit track modal tab URL serialization', () => {
  it('replaces tab param when switching tabs, back navigation skips tab history', async () => {
    const { getLocation, getNavigate } = setup();

    (window.fetch as FetchMockSandbox).get(
      new RegExp(`${FAKE_SERVER.url}/music/track-tags`),
      { body: JSON.stringify({ native: [] }), status: 200 },
    );

    const sovayTrack = await screen.findByText('Sovay');

    await act(async () => {
      fireEvent.contextMenu(sovayTrack);
    });

    const editButton = await screen.findByRole('button', { name: 'Edit' });
    await act(async () => {
      fireEvent.click(editButton);
    });

    await waitFor(() => {
      expect(getParams(getLocation().search).get('edit')).toBeTruthy();
    });

    const artworkTab = await screen.findByRole('tab', { name: 'Artwork' });
    await act(async () => {
      fireEvent.click(artworkTab);
    });

    await waitFor(() => {
      expect(getParams(getLocation().search).get('tab')).toBe('artwork');
    });

    // Tab uses replace, so back skips past both tabs to before the modal
    act(() => getNavigate()(-1));

    await waitFor(() => {
      expect(getParams(getLocation().search).get('edit')).toBeNull();
      expect(getParams(getLocation().search).get('tab')).toBeNull();
    });
  });
});

describe('edit track modal URL serialization', () => {
  it('pushes edit param on open and close, with back navigation restoring each state', async () => {
    const { getLocation, getNavigate } = setup();

    (window.fetch as FetchMockSandbox).get(
      new RegExp(`${FAKE_SERVER.url}/music/track-tags`),
      { body: JSON.stringify({ native: [] }), status: 200 },
    );

    const sovayTrack = await screen.findByText('Sovay');

    await act(async () => {
      fireEvent.contextMenu(sovayTrack);
    });

    const editButton = await screen.findByRole('button', { name: 'Edit' });
    await act(async () => {
      fireEvent.click(editButton);
    });

    await waitFor(() => {
      expect(getParams(getLocation().search).get('edit')).toBe(
        '/Indie/Andrew Bird/The Mysterious Production of Eggs/Sovay.mp3',
      );
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    });

    await waitFor(() => {
      expect(getParams(getLocation().search).get('edit')).toBeNull();
    });

    act(() => getNavigate()(-1));

    await waitFor(() => {
      expect(getParams(getLocation().search).get('edit')).toBe(
        '/Indie/Andrew Bird/The Mysterious Production of Eggs/Sovay.mp3',
      );
    });

    act(() => getNavigate()(-1));

    await waitFor(() => {
      expect(getParams(getLocation().search).get('edit')).toBeNull();
    });
  });
});

describe('music filter URL deserialization', () => {
  it('uses the genre', async () => {
    const { store } = setup('?genre=Indie');

    await waitFor(() => {
      expect($.getMusicPanelSelections(store.getState())).toEqual({
        genre: ['Indie'],
      });
    });
  });

  it('uses the artist', async () => {
    const { store } = setup(`?artist=${encodeURIComponent('Andrew Bird')}`);

    await waitFor(() => {
      expect($.getMusicPanelSelections(store.getState())).toEqual({
        artist: ['Andrew Bird'],
      });
    });
  });

  it('uses the album', async () => {
    const { store } = setup(
      `?album=${encodeURIComponent('The Mysterious Production of Eggs')}`,
    );

    await waitFor(() => {
      expect($.getMusicPanelSelections(store.getState())).toEqual({
        album: ['The Mysterious Production of Eggs'],
      });
    });
  });

  it('uses the track', async () => {
    const { store } = setup(`?track=${encodeURIComponent('/music/a.mp3')}`);

    await waitFor(() => {
      expect($.getMusicSelectedTrackPaths(store.getState())).toEqual([
        '/music/a.mp3',
      ]);
    });
  });

  it('supports multiple generes', async () => {
    const { store } = setup('?genre=Indie&genre=Jazz');

    await waitFor(() => {
      expect($.getMusicPanelSelections(store.getState())).toEqual({
        genre: ['Indie', 'Jazz'],
      });
    });
  });
});
