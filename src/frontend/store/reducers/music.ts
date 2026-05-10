import * as T from 'frontend/@types';
import { combineReducers } from 'redux';

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

export const musicReducer = combineReducers({
  panelSelections,
  tracks,
  selectedTrackPath,
});
