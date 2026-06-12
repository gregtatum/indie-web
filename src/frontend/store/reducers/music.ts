import * as T from 'frontend/@types';
import { combineReducers } from 'redux';

export type MusicPlaybackStatus =
  | 'idle'
  | 'loading'
  | 'playing'
  | 'paused'
  | 'error';

export type FolderArtSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface MusicPlaybackQueue {
  tracks: T.TrackMetadata[];
  panelSelections: Partial<Record<T.MusicPanelType, string[]>>;
}

/**
 * The panel ordering is not yet wired into the UI to be configurable.
 */
function panelOrder(
  state: T.MusicPanelType[] = ['genre', 'artist', 'album'],
): T.MusicPanelType[] {
  return state;
}

function folderArtSaveStatus(
  state: FolderArtSaveStatus = 'idle',
  action: T.Action,
): FolderArtSaveStatus {
  switch (action.type) {
    case 'music-folder-art-save-start':
      return 'saving';
    case 'music-folder-art-save-success':
      return 'saved';
    case 'music-folder-art-save-error':
      return 'error';
    case 'set-music-selected-tracks':
    case 'view-music':
      return 'idle';
    default:
      return state;
  }
}

function folderArtVersion(state = 0, action: T.Action): number {
  switch (action.type) {
    case 'music-folder-art-save-success':
      return state + 1;
    case 'set-music-selected-tracks':
    case 'view-music':
      return 0;
    default:
      return state;
  }
}

function playingTrackPath(
  state: string | null = null,
  action: T.Action,
): string | null {
  switch (action.type) {
    case 'music-playback-load':
      return action.path;
    case 'music-playback-stop':
    case 'view-music':
      return null;
    default:
      return state;
  }
}

/**
 * Monotonically increases on every load action so the audio hook can re-run
 * its src-loading effect even when the same track path is requested again
 * (double-clicking the currently playing track to restart it).
 */
function playbackLoadId(state = 0, action: T.Action): number {
  switch (action.type) {
    case 'music-playback-load':
      return state + 1;
    case 'view-music':
      return 0;
    default:
      return state;
  }
}

function playbackStatus(
  state: MusicPlaybackStatus = 'idle',
  action: T.Action,
): MusicPlaybackStatus {
  switch (action.type) {
    case 'music-playback-load':
      return 'loading';
    case 'music-playback-ready':
    case 'music-playback-play':
      return 'playing';
    case 'music-playback-pause':
      return 'paused';
    case 'music-playback-error':
      return 'error';
    case 'music-playback-stop':
    case 'view-music':
      return 'idle';
    default:
      return state;
  }
}

/**
 * The panels are the top filter section for the music view. This structure controls
 * what is currently selected inside of that panel.
 */
function panelSelections(
  state: Partial<Record<T.MusicPanelType, string[]>> = {},
  action: T.Action,
): Partial<Record<T.MusicPanelType, string[]>> {
  switch (action.type) {
    case 'set-music-panel-selection': {
      const next = { ...state, [action.panel]: action.values };
      if (!action.values || action.values.length === 0) {
        delete next[action.panel];
      }
      return next;
    }
    case 'set-music-tracks':
      return action.panelSelections;
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

function selectedTrackPaths(state: string[] = [], action: T.Action): string[] {
  switch (action.type) {
    case 'music-playback-load':
      return action.selectedTrackPath ? [action.selectedTrackPath] : state;
    case 'set-music-selected-tracks':
      return action.paths;
    case 'view-music':
      return [];
    default:
      return state;
  }
}

function editTrackPath(
  state: string | null = null,
  action: T.Action,
): string | null {
  switch (action.type) {
    case 'set-music-edit-track-path':
      return action.path;
    case 'view-music':
      return null;
    default:
      return state;
  }
}

function editTab(
  state: T.MusicEditTab = 'details',
  action: T.Action,
): T.MusicEditTab {
  switch (action.type) {
    case 'set-music-edit-tab':
      return action.tab;
    case 'set-music-edit-track-path':
      return 'details';
    case 'view-music':
      return 'details';
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

const emptyPlaybackQueue: MusicPlaybackQueue = {
  tracks: [],
  panelSelections: {},
};

function playbackQueue(
  state: MusicPlaybackQueue = emptyPlaybackQueue,
  action: T.Action,
): MusicPlaybackQueue {
  switch (action.type) {
    case 'set-music-playback-queue':
      return {
        tracks: action.tracks,
        panelSelections: action.panelSelections,
      };
    case 'view-music':
      return emptyPlaybackQueue;
    default:
      return state;
  }
}

const combinedMusicReducer = combineReducers({
  editTrackPath,
  editTab,
  panelOrder,
  panelSelections,
  tracks,
  selectedTrackPaths,
  needsRescan,
  playingTrackPath,
  playbackLoadId,
  playbackStatus,
  playbackQueue,
  folderArtSaveStatus,
  folderArtVersion,
});

type MusicState = ReturnType<typeof combinedMusicReducer>;

export function musicReducer(
  state: MusicState | undefined,
  action: T.Action,
): MusicState {
  return combinedMusicReducer(state, action);
}
