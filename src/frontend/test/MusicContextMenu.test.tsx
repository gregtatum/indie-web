import { fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import * as React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { createStore } from 'frontend/store/create-store';
import { A, T, $ } from 'frontend';
import { AppRoutes } from 'frontend/components/App';
import type { FetchMockSandbox } from 'fetch-mock';
import { mockMusicMediaElement } from './utils/music';
import { MUSIC_INDEX_VERSION } from 'shared/music';

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
    albumArtist: null,
    composer: null,
    album: 'Album A',
    genre: 'Rock',
    preferComposerGrouping: null,
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
    albumArtist: null,
    composer: null,
    album: 'Album A',
    genre: 'Rock',
    preferComposerGrouping: null,
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
    albumArtist: null,
    composer: null,
    album: 'Album B',
    genre: 'Jazz',
    preferComposerGrouping: null,
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
  mockMusicMediaElement();
});

function mockPlatform(platform: string) {
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue(platform);
}

function setup(tracks = TRACKS) {
  const store = createStore();
  store.dispatch(A.addFileStoreServer(FAKE_SERVER));

  (window.fetch as FetchMockSandbox).get(
    `${FAKE_SERVER.url}/music/music-index`,
    {
      body: JSON.stringify({
        version: MUSIC_INDEX_VERSION,
        scannedAt: '2024-01-01T00:00:00Z',
        tracks,
      }),
      status: 200,
    },
  );
  (window.fetch as FetchMockSandbox).get(
    new RegExp(`${FAKE_SERVER.url}/music/track-tags`),
    { body: JSON.stringify({ native: [] }), status: 200 },
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

  it('shows shortcut hints without changing menu item names', async () => {
    mockPlatform('Win32');
    setup();
    const trackA = await screen.findByText('Song A');
    await act(async () => {
      fireEvent.contextMenu(trackA);
    });

    await screen.findByRole('button', { name: 'Edit' });
    await screen.findByRole('button', { name: 'Show in Files' });
    screen.getByText('Ctrl E');
    screen.getByText('Ctrl Enter');
    expect(screen.queryByText('⌘ E')).toBeNull();
  });

  it('shows the edit shortcut hint for multi-track selection', async () => {
    mockPlatform('MacIntel');
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
    screen.getByText('⌘ E');
    expect(screen.queryByText('Ctrl E')).toBeNull();
  });
});

describe('track list keyboard shortcuts', () => {
  function focusTrackList() {
    screen.getByRole('listbox', { name: 'Tracks' }).focus();
  }

  it('cmd+a selects all filtered tracks when the track list has focus', async () => {
    const { store } = setup();
    await screen.findByText('Song A');

    await act(async () => {
      focusTrackList();
      fireEvent.keyDown(document.body, { key: 'a', metaKey: true });
    });

    expect($.getMusicSelectedTrackPaths(store.getState())).toEqual([
      '/music/a.mp3',
      '/music/b.mp3',
      '/music/c.mp3',
    ]);
  });

  it('ctrl+a selects all filtered tracks when the track list has focus', async () => {
    const { store } = setup();
    await screen.findByText('Song A');

    await act(async () => {
      focusTrackList();
      fireEvent.keyDown(document.body, { key: 'a', ctrlKey: true });
    });

    expect($.getMusicSelectedTrackPaths(store.getState())).toEqual([
      '/music/a.mp3',
      '/music/b.mp3',
      '/music/c.mp3',
    ]);
  });

  it('cmd+a preserves the focused track to avoid scrolling the list', async () => {
    const { store } = setup();
    const trackC = await screen.findByText('Song C');
    const trackList = screen.getByRole('listbox', { name: 'Tracks' });

    await act(async () => {
      fireEvent.click(trackC);
      trackList.focus();
      fireEvent.keyDown(document.body, { key: 'a', metaKey: true });
    });

    expect($.getMusicSelectedTrackPaths(store.getState())).toEqual([
      '/music/a.mp3',
      '/music/b.mp3',
      '/music/c.mp3',
    ]);
    expect(trackList.getAttribute('aria-activedescendant')).toBe(
      'music-track-2',
    );
  });

  it('cmd+e opens the details edit modal for one selected track', async () => {
    const { store } = setup();
    const trackA = await screen.findByText('Song A');
    await act(async () => {
      fireEvent.click(trackA);
      focusTrackList();
      fireEvent.keyDown(document.body, { key: 'e', metaKey: true });
    });

    await screen.findByRole('dialog');
    expect($.getMusicEditTrackPath(store.getState())).toBe('/music/a.mp3');
    expect($.getMusicEditTab(store.getState())).toBe('details');
  });

  it('ctrl+e opens the details edit modal for one selected track', async () => {
    const { store } = setup();
    const trackA = await screen.findByText('Song A');
    await act(async () => {
      fireEvent.click(trackA);
      focusTrackList();
      fireEvent.keyDown(document.body, { key: 'e', ctrlKey: true });
    });

    await screen.findByRole('dialog');
    expect($.getMusicEditTrackPath(store.getState())).toBe('/music/a.mp3');
    expect($.getMusicEditTab(store.getState())).toBe('details');
  });

  it('cmd+i opens the edit modal on the ID3 tab for one selected track', async () => {
    const { store } = setup();
    const trackA = await screen.findByText('Song A');
    await act(async () => {
      fireEvent.click(trackA);
      focusTrackList();
      fireEvent.keyDown(document.body, { key: 'i', metaKey: true });
    });

    await screen.findByRole('dialog');
    expect($.getMusicEditTrackPath(store.getState())).toBe('/music/a.mp3');
    expect($.getMusicEditTab(store.getState())).toBe('id3');
  });

  it('cmd+e opens bulk edit when multiple tracks are selected', async () => {
    const { store } = setup();
    await act(async () => {
      store.dispatch(
        A.setMusicSelectedTracks(['/music/a.mp3', '/music/b.mp3']),
      );
      focusTrackList();
      fireEvent.keyDown(document.body, { key: 'e', metaKey: true });
    });

    await screen.findByRole('dialog', { name: 'Album A' });
    expect($.getMusicEditTrackPath(store.getState())).toBe('/music/a.mp3');
  });

  it('cmd+enter shows one selected track in files', async () => {
    const { store } = setup();
    const trackB = await screen.findByText('Song B');
    await act(async () => {
      fireEvent.click(trackB);
      focusTrackList();
      fireEvent.keyDown(document.body, { key: 'Enter', metaKey: true });
    });

    expect($.getFileFocusByPath(store.getState())).toMatchObject({
      '/music': 'b.mp3',
    });
  });

  it('cmd+enter does nothing for multi-track selection', async () => {
    const { store } = setup();
    await screen.findByText('Song A');
    await act(async () => {
      store.dispatch(
        A.setMusicSelectedTracks(['/music/a.mp3', '/music/b.mp3']),
      );
      focusTrackList();
      fireEvent.keyDown(document.body, { key: 'Enter', metaKey: true });
    });

    expect($.getFileFocusByPath(store.getState())).toEqual({});
  });

  it('does not run track shortcuts when another panel has focus', async () => {
    const { store } = setup();
    await screen.findByText('Song A');
    await act(async () => {
      screen.getByRole('listbox', { name: 'genre' }).focus();
      fireEvent.keyDown(document.body, { key: 'a', metaKey: true });
    });

    expect($.getMusicSelectedTrackPaths(store.getState())).toEqual([]);
  });

  it('ignores shifted and alt-modified shortcut keys', async () => {
    const { store } = setup();
    await screen.findByText('Song A');

    await act(async () => {
      focusTrackList();
      fireEvent.keyDown(document.body, {
        key: 'a',
        metaKey: true,
        shiftKey: true,
      });
      fireEvent.keyDown(document.body, {
        key: 'e',
        metaKey: true,
        altKey: true,
      });
    });

    expect($.getMusicSelectedTrackPaths(store.getState())).toEqual([]);
    expect($.getMusicEditTrackPath(store.getState())).toBeNull();
  });
});
