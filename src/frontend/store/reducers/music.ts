import * as T from 'frontend/@types';
import { combineReducers } from 'redux';

export type MusicPlaybackStatus =
  'idle' | 'loading' | 'playing' | 'paused' | 'error';

export type FolderArtworkSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

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

function folderArtworkSaveStatus(
  state: FolderArtworkSaveStatus = 'idle',
  action: T.Action,
): FolderArtworkSaveStatus {
  switch (action.type) {
    case 'music-folder-artwork-save-start':
      return 'saving';
    case 'music-folder-artwork-save-success':
      return 'saved';
    case 'music-folder-artwork-save-error':
      return 'error';
    case 'set-music-selected-tracks':
    case 'view-music':
      return 'idle';
    default:
      return state;
  }
}

function folderArtworkEmbedStatus(
  state: FolderArtworkSaveStatus = 'idle',
  action: T.Action,
): FolderArtworkSaveStatus {
  switch (action.type) {
    case 'music-folder-artwork-embed-start':
      return 'saving';
    case 'music-folder-artwork-embed-success':
      return 'saved';
    case 'music-folder-artwork-embed-error':
      return 'error';
    case 'set-music-selected-tracks':
    case 'view-music':
      return 'idle';
    default:
      return state;
  }
}

function embeddedArtworkRemoveStatus(
  state: FolderArtworkSaveStatus = 'idle',
  action: T.Action,
): FolderArtworkSaveStatus {
  switch (action.type) {
    case 'music-embedded-artwork-remove-start':
      return 'saving';
    case 'music-embedded-artwork-remove-success':
      return 'saved';
    case 'music-embedded-artwork-remove-error':
      return 'error';
    case 'set-music-selected-tracks':
    case 'view-music':
      return 'idle';
    default:
      return state;
  }
}

function folderArtworkRemoveStatus(
  state: FolderArtworkSaveStatus = 'idle',
  action: T.Action,
): FolderArtworkSaveStatus {
  switch (action.type) {
    case 'music-folder-artwork-remove-start':
      return 'saving';
    case 'music-folder-artwork-remove-success':
      return 'saved';
    case 'music-folder-artwork-remove-error':
      return 'error';
    case 'set-music-selected-tracks':
    case 'view-music':
      return 'idle';
    default:
      return state;
  }
}

/**
 * A monotonic counter to invalidate the HTTP cache.
 */
function folderArtworkVersion(state = 0, action: T.Action): number {
  switch (action.type) {
    case 'music-folder-artwork-save-success':
    case 'music-folder-artwork-remove-success':
      return state + 1;
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

function batchEditTrackPaths(
  state: string[] | null = null,
  action: T.Action,
): string[] | null {
  switch (action.type) {
    case 'set-music-batch-edit-track-paths':
      return action.paths;
    case 'view-music':
      return null;
    default:
      return state;
  }
}

function importBatch(
  state: T.MusicImportBatch | null = null,
  action: T.Action,
): T.MusicImportBatch | null {
  switch (action.type) {
    case 'set-music-import-batch':
      return action.batch;
    case 'set-music-import-batch-step':
      return state && state.batchId === action.batchId
        ? { ...state, step: action.step, template: action.template }
        : state;
    case 'view-music':
      return null;
    default:
      return state;
  }
}

function stagedBatchSummaries(
  state: T.StagedBatchSummary[] = [],
  action: T.Action,
): T.StagedBatchSummary[] {
  switch (action.type) {
    case 'set-music-staged-batch-summaries':
      return action.summaries;
    case 'view-music':
      return [];
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

function servedIndexVersion(
  state: number | null = null,
  action: T.Action,
): number | null {
  switch (action.type) {
    case 'set-music-tracks':
      return action.servedVersion;
    case 'view-music':
      return null;
    default:
      return state;
  }
}

function serverMaxIndexVersion(
  state: number | null = null,
  action: T.Action,
): number | null {
  switch (action.type) {
    case 'set-music-server-max-index-version':
      return action.version;
    case 'view-music':
      return null;
    default:
      return state;
  }
}

function fileManagerRevealLabel(
  state: string | null = null,
  action: T.Action,
): string | null {
  switch (action.type) {
    case 'set-file-manager-reveal-label':
      return action.label;
    case 'view-music':
      return null;
    default:
      return state;
  }
}

/**
 * The Docker container's hostname, reported by the server. A string value
 * implies the server is running in Docker.
 */
function fileStoreContainerName(
  state: string | null = null,
  action: T.Action,
): string | null {
  switch (action.type) {
    case 'set-file-store-container-name':
      return action.containerName;
    case 'view-music':
      return null;
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
    default:
      return state;
  }
}

function playbackServerId(
  state: string | null = null,
  action: T.Action,
): string | null {
  switch (action.type) {
    case 'view-music':
      return action.fileStoreServer.id;
    case 'remove-all-storage':
      return null;
    case 'remove-server':
      return action.server.id === state ? null : state;
    default:
      return state;
  }
}

const combinedMusicReducer = combineReducers({
  editTrackPath,
  batchEditTrackPaths,
  importBatch,
  stagedBatchSummaries,
  editTab,
  panelOrder,
  panelSelections,
  tracks,
  selectedTrackPaths,
  needsRescan,
  servedIndexVersion,
  serverMaxIndexVersion,
  fileManagerRevealLabel,
  fileStoreContainerName,
  playingTrackPath,
  playbackLoadId,
  playbackStatus,
  playbackQueue,
  playbackServerId,
  folderArtworkSaveStatus,
  folderArtworkEmbedStatus,
  embeddedArtworkRemoveStatus,
  folderArtworkRemoveStatus,
  folderArtworkVersion,
});

type MusicState = ReturnType<typeof combinedMusicReducer>;

export function musicReducer(
  state: MusicState | undefined,
  action: T.Action,
): MusicState {
  const next = combinedMusicReducer(state, action);
  if (
    state &&
    state.playbackServerId !== null &&
    next.playbackServerId !== state.playbackServerId
  ) {
    // Invalidate the currenet music playback when the server changes.
    return {
      ...next,
      playingTrackPath: null,
      playbackLoadId: 0,
      playbackStatus: 'idle',
      playbackQueue: emptyPlaybackQueue,
    };
  }
  return next;
}
