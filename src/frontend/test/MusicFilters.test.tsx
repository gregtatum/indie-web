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

beforeEach(() => {
  jest.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600);
  jest.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800);
});

function setup(search = '') {
  const store = createStore();
  store.dispatch(A.addFileStoreServer(FAKE_SERVER));

  (window.fetch as FetchMockSandbox).get(
    `${FAKE_SERVER.url}/music/music-index`,
    {
      body: JSON.stringify({
        version: 4,
        scannedAt: '2024-01-01T00:00:00Z',
        tracks: TRACKS,
      }),
      status: 200,
    },
  );
  const genreFolders: T.FolderListing = [
    ...new Set(TRACKS.map((t) => t.genre).filter(Boolean)),
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
