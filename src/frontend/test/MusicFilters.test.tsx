import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import * as React from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
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
    album: 'Album B',
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

  let currentLocation: ReturnType<typeof useLocation>;
  // Captures the location during the React update cycle.
  function LocationCapture() {
    currentLocation = useLocation();
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

  return { store, getLocation: () => currentLocation };
}

describe('music filter URL serialization', () => {
  it('clicking a genre filter updates the URL', async () => {
    const { getLocation } = setup();

    const rock = await screen.findByText('Rock');
    await act(async () => {
      fireEvent.click(rock);
    });

    await waitFor(() => {
      expect(getLocation().search).toContain('genre=Rock');
    });
  });

  it('loading a URL with filter params initializes the Redux state', async () => {
    const { store } = setup('?genre=Rock');

    await waitFor(() => {
      expect($.getMusicPanelSelections(store.getState())).toEqual({
        genre: ['Rock'],
      });
    });
  });
});
