import { act, fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { Provider } from 'react-redux';
import { createStore } from 'frontend/store/create-store';
import { A, T } from 'frontend';
import { EditTrackModal } from 'frontend/components/Music/EditTrackModal';

const TRACK_A: T.TrackMetadata = {
  path: '/music/a.mp3',
  title: 'Song A',
  artist: 'Artist A',
  genre: 'Rock',
  album: 'Album A',
  track: 1,
  duration: 180,
  size: 1024,
  mtime: '2024-01-01T00:00:00Z',
  coverArt: null,
};

const TRACK_B: T.TrackMetadata = {
  path: '/music/b.mp3',
  title: 'Song B',
  artist: 'Artist B',
  genre: 'Jazz',
  album: 'Album B',
  track: 1,
  duration: 200,
  size: 2048,
  mtime: '2024-01-01T00:00:00Z',
  coverArt: null,
};

function makeStore() {
  const store = createStore();
  store.dispatch(A.setMusicTracks([TRACK_A, TRACK_B], false));
  return store;
}

describe('EditTrackModal', () => {
  it('does not render when trackPath is null', () => {
    const store = makeStore();
    render(
      <Provider store={store as any}>
        <EditTrackModal trackPath={null} onClose={jest.fn()} />
      </Provider>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders the dialog when trackPath is set', () => {
    const store = makeStore();
    render(
      <Provider store={store as any}>
        <EditTrackModal trackPath="/music/a.mp3" onClose={jest.fn()} />
      </Provider>,
    );
    screen.getByRole('dialog');
  });

  it('pre-populates fields from track metadata', () => {
    const store = makeStore();
    render(
      <Provider store={store as any}>
        <EditTrackModal trackPath="/music/a.mp3" onClose={jest.fn()} />
      </Provider>,
    );
    expect((screen.getByLabelText('Artist') as HTMLInputElement).value).toBe(
      'Artist A',
    );
    expect((screen.getByLabelText('Song') as HTMLInputElement).value).toBe(
      'Song A',
    );
    expect((screen.getByLabelText('Genre') as HTMLInputElement).value).toBe(
      'Rock',
    );
  });

  it('allows editing the artist field', async () => {
    const store = makeStore();
    render(
      <Provider store={store as any}>
        <EditTrackModal trackPath="/music/a.mp3" onClose={jest.fn()} />
      </Provider>,
    );
    const artistInput = screen.getByLabelText('Artist') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(artistInput, { target: { value: 'New Artist' } });
    });
    expect(artistInput.value).toBe('New Artist');
  });

  it('calls onClose when the close button is clicked', async () => {
    const store = makeStore();
    const onClose = jest.fn();
    render(
      <Provider store={store as any}>
        <EditTrackModal trackPath="/music/a.mp3" onClose={onClose} />
      </Provider>,
    );
    const closeButton = screen.getByRole('button', { name: 'Close' });
    await act(async () => {
      fireEvent.click(closeButton);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape is pressed', async () => {
    const store = makeStore();
    const onClose = jest.fn();
    render(
      <Provider store={store as any}>
        <EditTrackModal trackPath="/music/a.mp3" onClose={onClose} />
      </Provider>,
    );
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('repopulates fields when switching to a different track', async () => {
    const store = makeStore();
    const { rerender } = render(
      <Provider store={store as any}>
        <EditTrackModal trackPath="/music/a.mp3" onClose={jest.fn()} />
      </Provider>,
    );
    expect((screen.getByLabelText('Artist') as HTMLInputElement).value).toBe(
      'Artist A',
    );

    await act(async () => {
      rerender(
        <Provider store={store as any}>
          <EditTrackModal trackPath="/music/b.mp3" onClose={jest.fn()} />
        </Provider>,
      );
    });
    expect((screen.getByLabelText('Artist') as HTMLInputElement).value).toBe(
      'Artist B',
    );
    expect((screen.getByLabelText('Song') as HTMLInputElement).value).toBe(
      'Song B',
    );
    expect((screen.getByLabelText('Genre') as HTMLInputElement).value).toBe(
      'Jazz',
    );
  });
});
