import * as T from 'frontend/@types';
import { combineReducers } from 'redux';

export type MusicPlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

interface PlaybackState {
  trackPath: string | null;
  status: MusicPlaybackStatus;
}

const playbackInitial: PlaybackState = { trackPath: null, status: 'idle' };

function playback(
  state: PlaybackState = playbackInitial,
  action: T.Action,
): PlaybackState {
  switch (action.type) {
    case 'music-playback-load':
      return { trackPath: action.path, status: 'loading' };
    case 'music-playback-ready':
      return { ...state, status: 'playing' };
    case 'music-playback-play':
      return { ...state, status: 'playing' };
    case 'music-playback-pause':
      return { ...state, status: 'paused' };
    case 'music-playback-error':
      return { ...state, status: 'error' };
    case 'music-playback-stop':
      return playbackInitial;
    case 'view-music':
      return playbackInitial;
    default:
      return state;
  }
}

/**
 * The panels are the top filter section for the music view. This structure controls
 * what is currently selected inside of that panel.
 */
function panelSelections(
  state: Partial<Record<T.MusicPanelType, string>> = {},
  action: T.Action,
): Partial<Record<T.MusicPanelType, string>> {
  switch (action.type) {
    case 'set-music-panel-selection': {
      const next = { ...state, [action.panel]: action.value };
      if (!action.value) {
        delete next[action.panel];
      }
      return next;
    }
    case 'view-music':
      return {};
    default:
      return state;
  }
}

function tracks(
  state: T.TrackMetadata[] = [],
  action: T.Action,
): T.TrackMetadata[] {
  switch (action.type) {
    case 'set-music-tracks':
      return action.tracks;
    case 'view-music':
      return [];
    default:
      return state;
  }
}

function selectedTrackPath(
  state: string | null = null,
  action: T.Action,
): string | null {
  switch (action.type) {
    case 'set-music-selected-track':
      return action.path ?? null;
    case 'view-music':
      return null;
    default:
      return state;
  }
}

function needsRescan(state = false, action: T.Action): boolean {
  switch (action.type) {
    case 'set-music-tracks':
      return action.needsRescan;
    case 'view-music':
      return false;
    default:
      return state;
  }
}

export const musicReducer = combineReducers({
  panelSelections,
  tracks,
  selectedTrackPath,
  needsRescan,
  playback,
});
