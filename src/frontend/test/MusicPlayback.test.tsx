import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { Provider } from 'react-redux';
import { createStore } from 'frontend/store/create-store';
import { A, T, $ } from 'frontend';
import { MusicLibraryView } from 'frontend/components/Music/MusicLibraryView';

// AudioContext is unavailable in jsdom, but the real useAudioPlayer hook is safe
// to use in tests: without a server URL in the store, Effect 1 exits early (no
// fetch), Effect 2 exits early (no AudioBuffer), and AudioContext is never
// created. Button clicks dispatch real Redux actions — we assert on store state.

const TRACKS: T.TrackMetadata[] = [
  {
    path: '/music/a.mp3',
    title: 'Song A',
    artist: 'Artist A',
    album: 'Album',
    genre: null,
    duration: 180,
    size: 1024,
    mtime: '2024-01-01T00:00:00Z',
  },
  {
    path: '/music/b.mp3',
    title: 'Song B',
    artist: 'Artist B',
    album: 'Album',
    genre: null,
    duration: 200,
    size: 2048,
    mtime: '2024-01-01T00:00:00Z',
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

describe('song interactions', () => {
  it('double-clicking a song loads that track for playback', async () => {
    const { store } = setup();
    const songA = await screen.findByText('Song A');
    await userEvent.dblClick(songA);
    const state = store.getState();
    expect($.getMusicPlaybackTrackPath(state)).toBe('/music/a.mp3');
    expect($.getMusicPlaybackStatus(state)).toBe('loading');
  });

  it('pressing Enter on a selected song loads that track', async () => {
    const { store } = setup();
    // Click to select Song A first
    await userEvent.click(await screen.findByText('Song A'));
    // Focus the song list and press Enter
    const list = screen.getByRole('listbox', { name: 'Songs' });
    list.focus();
    await userEvent.keyboard('{Enter}');
    const state = store.getState();
    expect($.getMusicPlaybackTrackPath(state)).toBe('/music/a.mp3');
    expect($.getMusicPlaybackStatus(state)).toBe('loading');
  });

  it('pressing Space with an idle status loads the selected track', async () => {
    const { store } = setup();
    await userEvent.click(await screen.findByText('Song B'));
    const list = screen.getByRole('listbox', { name: 'Songs' });
    list.focus();
    await userEvent.keyboard(' ');
    const state = store.getState();
    expect($.getMusicPlaybackTrackPath(state)).toBe('/music/b.mp3');
    expect($.getMusicPlaybackStatus(state)).toBe('loading');
  });

  it('pressing Space while playing pauses', async () => {
    const { store } = setup();
    await act(async () => {
      store.dispatch(A.musicPlaybackLoad('/music/a.mp3'));
      store.dispatch(A.musicPlaybackReady());
    });
    const list = screen.getByRole('listbox', { name: 'Songs' });
    await act(async () => {
      list.focus();
    });
    await userEvent.keyboard(' ');
    expect($.getMusicPlaybackStatus(store.getState())).toBe('paused');
  });

  it('pressing Space while paused resumes', async () => {
    const { store } = setup();
    await act(async () => {
      store.dispatch(A.musicPlaybackLoad('/music/a.mp3'));
      store.dispatch(A.musicPlaybackReady());
      store.dispatch(A.musicPlaybackPause());
    });
    const list = screen.getByRole('listbox', { name: 'Songs' });
    await act(async () => {
      list.focus();
    });
    await userEvent.keyboard(' ');
    expect($.getMusicPlaybackStatus(store.getState())).toBe('playing');
  });
});

describe('PlaybackBar', () => {
  it('is not rendered when status is idle', () => {
    setup();
    expect(
      screen.queryByRole('region', { name: 'Playback controls' }),
    ).toBeNull();
  });

  async function setupPlaying() {
    const result = setup();
    await act(async () => {
      result.store.dispatch(A.musicPlaybackLoad('/music/a.mp3'));
      result.store.dispatch(A.musicPlaybackReady());
    });
    return result;
  }

  it('renders track title and artist when a track is loaded', async () => {
    await setupPlaying();
    const bar = screen.getByRole('region', { name: 'Playback controls' });
    expect(within(bar).getByText('Song A')).toBeTruthy();
    expect(within(bar).getByText('Artist A')).toBeTruthy();
  });

  it('shows Pause button when playing', async () => {
    await setupPlaying();
    screen.getByRole('button', { name: 'Pause' });
  });

  it('shows Play button when paused', async () => {
    const { store } = setup();
    await act(async () => {
      store.dispatch(A.musicPlaybackLoad('/music/a.mp3'));
      store.dispatch(A.musicPlaybackReady());
      store.dispatch(A.musicPlaybackPause());
    });
    screen.getByRole('button', { name: 'Play' });
  });

  it('clicking the Pause button dispatches pause', async () => {
    const { store } = await setupPlaying();
    await userEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect($.getMusicPlaybackStatus(store.getState())).toBe('paused');
  });

  it('clicking the Play button dispatches play', async () => {
    const { store } = setup();
    await act(async () => {
      store.dispatch(A.musicPlaybackLoad('/music/a.mp3'));
      store.dispatch(A.musicPlaybackReady());
      store.dispatch(A.musicPlaybackPause());
    });
    await userEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect($.getMusicPlaybackStatus(store.getState())).toBe('playing');
  });

  it('seek slider is present and accepts input', async () => {
    await setupPlaying();
    const seekInput = screen.getByRole('slider', { name: 'Seek' });
    // Just verify the slider is interactive (no assertion on hook internals)
    fireEvent.change(seekInput, { target: { value: '60' } });
  });

  it('volume slider is present and accepts input', async () => {
    await setupPlaying();
    const volInput = screen.getByRole('slider', { name: 'Volume' });
    fireEvent.change(volInput, { target: { value: '0.5' } });
  });

  it('displays time and duration formatted as M:SS', async () => {
    // The real hook starts at currentTime=0 and duration=0 before any audio loads.
    // Verify the time display elements exist with their initial "0:00" values.
    await setupPlaying();
    const bar = screen.getByRole('region', { name: 'Playback controls' });
    const times = within(bar).getAllByText('0:00');
    expect(times.length).toBe(2); // current time + duration both start at 0:00
  });
});
