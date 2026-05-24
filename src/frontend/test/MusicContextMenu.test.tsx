import { act, fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { Provider } from 'react-redux';
import { createStore } from 'frontend/store/create-store';
import { A, T, $ } from 'frontend';
import { MusicLibraryView } from 'frontend/components/Music/MusicLibraryView';

beforeEach(() => {
  jest.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600);
  jest.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800);
});

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

function setup() {
  const store = createStore();
  store.dispatch(A.setMusicTracks(TRACKS, false));
  render(
    <Provider store={store as any}>
      <MusicLibraryView />
    </Provider>,
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
});
