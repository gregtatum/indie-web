import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { createStore } from 'frontend/store/create-store';
import { A, T, $ } from 'frontend';
import { MusicLibraryView } from 'frontend/components/Music/MusicLibraryView';

// AudioContext is unavailable in jsdom, but the real useAudioPlayer hook is safe
// to use in tests: without a server URL in the store, Effect 1 exits early (no
// fetch), Effect 2 exits early (no AudioBuffer), and AudioContext is never
// created. Button clicks dispatch real Redux actions — we assert on store state.

// The virtualizer reads offsetHeight/offsetWidth to determine how many rows to
// render. Jsdom returns 0 for both, so without this the virtualizer renders
// nothing and tests cannot find track elements.
beforeEach(() => {
  jest.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600);
  jest.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800);
});

// When a new music index upgrader is written (bumping CURRENT_MUSIC_INDEX_VERSION),
// add a representative track here with the new field populated.
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
    <MemoryRouter>
      <Provider store={store as any}>
        <MusicLibraryView />
      </Provider>
    </MemoryRouter>,
  );
  return { store };
}

describe('track interactions', () => {
  it('double-clicking a track loads it for playback', async () => {
    const { store } = setup();
    const trackA = await screen.findByText('Song A');
    await act(async () => {
      await userEvent.dblClick(trackA);
    });
    const state = store.getState();
    expect($.getMusicPlaybackTrackPath(state)).toBe('/music/a.mp3');
    expect($.getMusicPlaybackStatus(state)).toBe('loading');
  });

  it('pressing Enter on a selected track loads it', async () => {
    const { store } = setup();
    // Click to select Song A first
    await act(async () => {
      await userEvent.click(await screen.findByText('Song A'));
    });
    // Focus the track list and press Enter
    const list = screen.getByRole('listbox', { name: 'Tracks' });
    await act(async () => {
      list.focus();
      await userEvent.keyboard('{Enter}');
    });
    const state = store.getState();
    expect($.getMusicPlaybackTrackPath(state)).toBe('/music/a.mp3');
    expect($.getMusicPlaybackStatus(state)).toBe('loading');
  });

  it('pressing Enter with multiple tracks selected queues only those tracks', async () => {
    const { store } = setup();
    await act(async () => {
      await userEvent.click(await screen.findByText('Song A'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Song B'), { shiftKey: true });
    });
    const list = screen.getByRole('listbox', { name: 'Tracks' });
    await act(async () => {
      list.focus();
      await userEvent.keyboard('{Enter}');
    });
    const state = store.getState();
    expect($.getMusicPlaybackQueue(state).map((t) => t.path)).toEqual([
      '/music/a.mp3',
      '/music/b.mp3',
    ]);
  });

  it('pressing Space with an idle status loads the selected track', async () => {
    const { store } = setup();
    await act(async () => {
      await userEvent.click(await screen.findByText('Song B'));
    });
    const list = screen.getByRole('listbox', { name: 'Tracks' });
    await act(async () => {
      list.focus();
      await userEvent.keyboard(' ');
    });
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
    const list = screen.getByRole('listbox', { name: 'Tracks' });
    await act(async () => {
      list.focus();
      await userEvent.keyboard(' ');
    });
    expect($.getMusicPlaybackStatus(store.getState())).toBe('paused');
  });

  it('pressing Space while paused resumes', async () => {
    const { store } = setup();
    await act(async () => {
      store.dispatch(A.musicPlaybackLoad('/music/a.mp3'));
      store.dispatch(A.musicPlaybackReady());
      store.dispatch(A.musicPlaybackPause());
    });
    const list = screen.getByRole('listbox', { name: 'Tracks' });
    await act(async () => {
      list.focus();
      await userEvent.keyboard(' ');
    });
    expect($.getMusicPlaybackStatus(store.getState())).toBe('playing');
  });

  it('clicking a track selects it', async () => {
    const { store } = setup();
    await act(async () => {
      await userEvent.click(await screen.findByText('Song A'));
    });
    expect($.getMusicSelectedTrackPaths(store.getState())).toEqual([
      '/music/a.mp3',
    ]);
  });

  it('clicking the sole selected track deselects it', async () => {
    const { store } = setup();
    await act(async () => {
      await userEvent.click(await screen.findByText('Song A'));
    });
    await act(async () => {
      await userEvent.click(await screen.findByText('Song A'));
    });
    expect($.getMusicSelectedTrackPaths(store.getState())).toEqual([]);
  });

  it('cmd+click adds a track to the selection', async () => {
    const { store } = setup();
    await act(async () => {
      await userEvent.click(await screen.findByText('Song A'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Song B'), { metaKey: true });
    });
    expect($.getMusicSelectedTrackPaths(store.getState())).toEqual([
      '/music/a.mp3',
      '/music/b.mp3',
    ]);
  });

  it('cmd+click removes an already-selected track', async () => {
    const { store } = setup();
    await act(async () => {
      await userEvent.click(await screen.findByText('Song A'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Song B'), { metaKey: true });
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Song A'), { metaKey: true });
    });
    expect($.getMusicSelectedTrackPaths(store.getState())).toEqual([
      '/music/b.mp3',
    ]);
  });

  it('shift+click selects a range of tracks', async () => {
    const { store } = setup();
    await act(async () => {
      await userEvent.click(await screen.findByText('Song A'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Song C'), { shiftKey: true });
    });
    expect($.getMusicSelectedTrackPaths(store.getState())).toEqual([
      '/music/a.mp3',
      '/music/b.mp3',
      '/music/c.mp3',
    ]);
  });

  it('Shift+ArrowDown extends the selection downward', async () => {
    const { store } = setup();
    await act(async () => {
      await userEvent.click(await screen.findByText('Song A'));
    });
    const list = screen.getByRole('listbox', { name: 'Tracks' });
    await act(async () => {
      list.focus();
      await userEvent.keyboard('{Shift>}{ArrowDown}{/Shift}');
    });
    expect($.getMusicSelectedTrackPaths(store.getState())).toEqual([
      '/music/a.mp3',
      '/music/b.mp3',
    ]);
  });

  it('Shift+ArrowUp extends the selection upward', async () => {
    const { store } = setup();
    await act(async () => {
      await userEvent.click(await screen.findByText('Song C'));
    });
    const list = screen.getByRole('listbox', { name: 'Tracks' });
    await act(async () => {
      list.focus();
      await userEvent.keyboard('{Shift>}{ArrowUp}{/Shift}');
    });
    expect($.getMusicSelectedTrackPaths(store.getState())).toEqual([
      '/music/b.mp3',
      '/music/c.mp3',
    ]);
  });

  it('Shift+ArrowDown then Shift+ArrowUp shrinks the selection back', async () => {
    const { store } = setup();
    await act(async () => {
      await userEvent.click(await screen.findByText('Song A'));
    });
    const list = screen.getByRole('listbox', { name: 'Tracks' });
    await act(async () => {
      list.focus();
      await userEvent.keyboard(
        '{Shift>}{ArrowDown}{ArrowDown}{ArrowUp}{/Shift}',
      );
    });
    expect($.getMusicSelectedTrackPaths(store.getState())).toEqual([
      '/music/a.mp3',
      '/music/b.mp3',
    ]);
  });

  it('plain click after multi-select narrows to a single track', async () => {
    const { store } = setup();
    await act(async () => {
      await userEvent.click(await screen.findByText('Song A'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Song C'), { shiftKey: true });
    });
    await act(async () => {
      await userEvent.click(screen.getByText('Song B'));
    });
    expect($.getMusicSelectedTrackPaths(store.getState())).toEqual([
      '/music/b.mp3',
    ]);
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
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Pause' }));
    });
    expect($.getMusicPlaybackStatus(store.getState())).toBe('paused');
  });

  it('clicking the Play button dispatches play', async () => {
    const { store } = setup();
    await act(async () => {
      store.dispatch(A.musicPlaybackLoad('/music/a.mp3'));
      store.dispatch(A.musicPlaybackReady());
      store.dispatch(A.musicPlaybackPause());
    });
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Play' }));
    });
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

describe('filter panels', () => {
  it('lists items derived from track metadata', () => {
    setup();
    const genreList = screen.getByRole('listbox', { name: 'genre' });
    expect(
      within(genreList).getByRole('option', { name: 'Jazz' }),
    ).toBeTruthy();
    expect(
      within(genreList).getByRole('option', { name: 'Rock' }),
    ).toBeTruthy();
  });

  it('clicking an item selects it', async () => {
    const { store } = setup();
    const genreList = screen.getByRole('listbox', { name: 'genre' });
    await act(async () => {
      await userEvent.click(
        within(genreList).getByRole('option', { name: 'Rock' }),
      );
    });
    expect($.getMusicPanelSelections(store.getState()).genre).toEqual(['Rock']);
  });

  it('clicking the All option clears a selection', async () => {
    const { store } = setup();
    await act(async () => {
      store.dispatch(A.setMusicPanelSelection('genre', ['Rock']));
    });
    const genreList = screen.getByRole('listbox', { name: 'genre' });
    await act(async () => {
      await userEvent.click(
        within(genreList).getByRole('option', { name: '« All Genres »' }),
      );
    });
    expect($.getMusicPanelSelections(store.getState()).genre).toBeUndefined();
  });

  it('cmd+click adds an item to the filter panel selection', async () => {
    const { store } = setup();
    const genreList = screen.getByRole('listbox', { name: 'genre' });
    await act(async () => {
      await userEvent.click(
        within(genreList).getByRole('option', { name: 'Jazz' }),
      );
    });
    await act(async () => {
      fireEvent.click(within(genreList).getByRole('option', { name: 'Rock' }), {
        metaKey: true,
      });
    });
    expect($.getMusicPanelSelections(store.getState()).genre).toEqual([
      'Jazz',
      'Rock',
    ]);
  });

  it('cmd+click removes an already-selected filter panel item', async () => {
    const { store } = setup();
    const genreList = screen.getByRole('listbox', { name: 'genre' });
    await act(async () => {
      await userEvent.click(
        within(genreList).getByRole('option', { name: 'Jazz' }),
      );
    });
    await act(async () => {
      fireEvent.click(within(genreList).getByRole('option', { name: 'Rock' }), {
        metaKey: true,
      });
    });
    await act(async () => {
      fireEvent.click(within(genreList).getByRole('option', { name: 'Jazz' }), {
        metaKey: true,
      });
    });
    expect($.getMusicPanelSelections(store.getState()).genre).toEqual(['Rock']);
  });

  it('shift+click selects a range in the filter panel', async () => {
    const { store } = setup();
    const genreList = screen.getByRole('listbox', { name: 'genre' });
    await act(async () => {
      await userEvent.click(
        within(genreList).getByRole('option', { name: 'Jazz' }),
      );
    });
    await act(async () => {
      fireEvent.click(within(genreList).getByRole('option', { name: 'Rock' }), {
        shiftKey: true,
      });
    });
    expect($.getMusicPanelSelections(store.getState()).genre).toEqual([
      'Jazz',
      'Rock',
    ]);
  });

  it('a multi-selection in a filter panel shows tracks matching any selection', async () => {
    setup();
    const genreList = screen.getByRole('listbox', { name: 'genre' });
    await act(async () => {
      await userEvent.click(
        within(genreList).getByRole('option', { name: 'Jazz' }),
      );
    });
    await act(async () => {
      fireEvent.click(within(genreList).getByRole('option', { name: 'Rock' }), {
        metaKey: true,
      });
    });
    // All three tracks should be visible (Rock: A, B — Jazz: C)
    expect(await screen.findByText('Song A')).toBeTruthy();
    expect(screen.getByText('Song B')).toBeTruthy();
    expect(screen.getByText('Song C')).toBeTruthy();
  });

  it('Shift+ArrowDown extends the filter panel selection downward', async () => {
    const { store } = setup();
    await act(async () => {
      store.dispatch(A.setMusicPanelSelection('genre', ['Jazz']));
    });
    await act(async () => {
      screen.getByRole('listbox', { name: 'genre' }).focus();
      await userEvent.keyboard('{Shift>}{ArrowDown}{/Shift}');
    });
    expect($.getMusicPanelSelections(store.getState()).genre).toEqual([
      'Jazz',
      'Rock',
    ]);
  });

  it('Shift+ArrowUp extends the filter panel selection upward', async () => {
    const { store } = setup();
    await act(async () => {
      store.dispatch(A.setMusicPanelSelection('genre', ['Rock']));
    });
    await act(async () => {
      screen.getByRole('listbox', { name: 'genre' }).focus();
      await userEvent.keyboard('{Shift>}{ArrowUp}{/Shift}');
    });
    expect($.getMusicPanelSelections(store.getState()).genre).toEqual([
      'Jazz',
      'Rock',
    ]);
  });

  it('Shift+ArrowDown then Shift+ArrowUp shrinks the filter panel selection', async () => {
    const { store } = setup();
    await act(async () => {
      store.dispatch(A.setMusicPanelSelection('genre', ['Jazz']));
    });
    await act(async () => {
      screen.getByRole('listbox', { name: 'genre' }).focus();
      await userEvent.keyboard('{Shift>}{ArrowDown}{ArrowUp}{/Shift}');
    });
    expect($.getMusicPanelSelections(store.getState()).genre).toEqual(['Jazz']);
  });

  it('Shift+ArrowUp on the first item does nothing', async () => {
    const { store } = setup();
    await act(async () => {
      store.dispatch(A.setMusicPanelSelection('genre', ['Jazz']));
    });
    await act(async () => {
      screen.getByRole('listbox', { name: 'genre' }).focus();
      await userEvent.keyboard('{Shift>}{ArrowUp}{/Shift}');
    });
    expect($.getMusicPanelSelections(store.getState()).genre).toEqual(['Jazz']);
  });

  it('ArrowDown selects the first item when none is selected', async () => {
    const { store } = setup();
    await act(async () => {
      screen.getByRole('listbox', { name: 'genre' }).focus();
      await userEvent.keyboard('{ArrowDown}');
    });
    expect($.getMusicPanelSelections(store.getState()).genre).toEqual(['Jazz']);
  });

  it('ArrowDown advances the selection', async () => {
    const { store } = setup();
    await act(async () => {
      store.dispatch(A.setMusicPanelSelection('genre', ['Jazz']));
    });
    await act(async () => {
      screen.getByRole('listbox', { name: 'genre' }).focus();
      await userEvent.keyboard('{ArrowDown}');
    });
    expect($.getMusicPanelSelections(store.getState()).genre).toEqual(['Rock']);
  });

  it('ArrowDown stays on the last item', async () => {
    const { store } = setup();
    await act(async () => {
      store.dispatch(A.setMusicPanelSelection('genre', ['Rock']));
    });
    await act(async () => {
      screen.getByRole('listbox', { name: 'genre' }).focus();
      await userEvent.keyboard('{ArrowDown}');
    });
    expect($.getMusicPanelSelections(store.getState()).genre).toEqual(['Rock']);
  });

  it('ArrowUp from the first item clears to All', async () => {
    const { store } = setup();
    await act(async () => {
      store.dispatch(A.setMusicPanelSelection('genre', ['Jazz']));
    });
    await act(async () => {
      screen.getByRole('listbox', { name: 'genre' }).focus();
      await userEvent.keyboard('{ArrowUp}');
    });
    expect($.getMusicPanelSelections(store.getState()).genre).toBeUndefined();
  });

  it('ArrowUp does nothing when All is active', async () => {
    const { store } = setup();
    await act(async () => {
      screen.getByRole('listbox', { name: 'genre' }).focus();
      await userEvent.keyboard('{ArrowUp}');
    });
    expect($.getMusicPanelSelections(store.getState()).genre).toBeUndefined();
  });

  it('Escape clears the selection', async () => {
    const { store } = setup();
    await act(async () => {
      store.dispatch(A.setMusicPanelSelection('genre', ['Rock']));
    });
    await act(async () => {
      screen.getByRole('listbox', { name: 'genre' }).focus();
      await userEvent.keyboard('{Escape}');
    });
    expect($.getMusicPanelSelections(store.getState()).genre).toBeUndefined();
  });

  it('ArrowRight moves focus to the next panel', async () => {
    setup();
    await act(async () => {
      screen.getByRole('listbox', { name: 'genre' }).focus();
      await userEvent.keyboard('{ArrowRight}');
    });
    expect(document.activeElement).toBe(
      screen.getByRole('listbox', { name: 'artist' }),
    );
  });

  it('ArrowLeft moves focus to the previous panel', async () => {
    setup();
    await act(async () => {
      screen.getByRole('listbox', { name: 'artist' }).focus();
      await userEvent.keyboard('{ArrowLeft}');
    });
    expect(document.activeElement).toBe(
      screen.getByRole('listbox', { name: 'genre' }),
    );
  });

  it('ArrowLeft does nothing on the first panel', async () => {
    setup();
    const genreList = screen.getByRole('listbox', { name: 'genre' });
    await act(async () => {
      genreList.focus();
      await userEvent.keyboard('{ArrowLeft}');
    });
    expect(document.activeElement).toBe(genreList);
  });

  it('ArrowRight does nothing on the last panel', async () => {
    setup();
    const albumList = screen.getByRole('listbox', { name: 'album' });
    await act(async () => {
      albumList.focus();
      await userEvent.keyboard('{ArrowRight}');
    });
    expect(document.activeElement).toBe(albumList);
  });

  it('a genre selection cascades to narrow the artist panel', async () => {
    setup();
    const genreList = screen.getByRole('listbox', { name: 'genre' });
    await act(async () => {
      await userEvent.click(
        within(genreList).getByRole('option', { name: 'Jazz' }),
      );
    });
    const artistList = screen.getByRole('listbox', { name: 'artist' });
    expect(
      within(artistList).getByRole('option', { name: 'Artist A' }),
    ).toBeTruthy();
    expect(
      within(artistList).queryByRole('option', { name: 'Artist B' }),
    ).toBeNull();
  });
});
