import * as T from 'frontend/@types';
import { combineReducers } from 'redux';

const PANEL_ORDER: T.MusicPanelType[] = ['genre', 'artist', 'album'];

export type MusicPlaybackStatus =
  | 'idle'
  | 'loading'
  | 'playing'
  | 'paused'
  | 'error';

export type FolderArtSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

function filterTracksByPanel(
  tracks: T.TrackMetadata[],
  panel: T.MusicPanelType,
  selections: string[],
): T.TrackMetadata[] {
  switch (panel) {
    case 'genre':
      return tracks.filter((track) => {
        return track.genre !== null && selections.includes(track.genre);
      });
    case 'artist':
      return tracks.filter((track) => {
        return track.artist !== null && selections.includes(track.artist);
      });
    case 'album':
      return tracks.filter((track) => {
        return track.album !== null && selections.includes(track.album);
      });
    default:
      throw new Error(`Unhandled music panel: ${panel}`);
  }
}

function getAvailablePanelValues(
  tracks: T.TrackMetadata[],
  panel: T.MusicPanelType,
): Set<string> {
  switch (panel) {
    case 'genre':
      return new Set(
        tracks.flatMap((track) => (track.genre === null ? [] : [track.genre])),
      );
    case 'artist':
      return new Set(
        tracks.flatMap((track) =>
          track.artist === null ? [] : [track.artist],
        ),
      );
    case 'album':
      return new Set(
        tracks.flatMap((track) => (track.album === null ? [] : [track.album])),
      );
    default:
      return new Set();
  }
}

function prunePanelSelections(
  tracks: T.TrackMetadata[],
  panelSelections: Partial<Record<T.MusicPanelType, string[]>>,
): Partial<Record<T.MusicPanelType, string[]>> {
  const next: Partial<Record<T.MusicPanelType, string[]>> = {};
  let filteredTracks = tracks;

  for (const panel of PANEL_ORDER) {
    const selections = panelSelections[panel];
    if (!selections || selections.length === 0) {
      continue;
    }

    const available = getAvailablePanelValues(filteredTracks, panel);
    const validSelections = selections.filter((selection) => {
      return available.has(selection);
    });
    if (validSelections.length > 0) {
      next[panel] = validSelections;
      filteredTracks = filterTracksByPanel(
        filteredTracks,
        panel,
        validSelections,
      );
    }
  }

  return next;
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

function playbackQueue(
  state: T.TrackMetadata[] = [],
  action: T.Action,
): T.TrackMetadata[] {
  switch (action.type) {
    case 'set-music-playback-queue':
      return action.tracks;
    case 'view-music':
      return [];
    default:
      return state;
  }
}

const combinedMusicReducer = combineReducers({
  editTrackPath,
  editTab,
  panelSelections,
  tracks,
  selectedTrackPaths,
  needsRescan,
  playingTrackPath,
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
  // When loading a new track, if the single selected track matches the currently
  // playing track, advance the selection to follow the new track.
  if (
    action.type === 'music-playback-load' &&
    state !== undefined &&
    state.selectedTrackPaths.length === 1 &&
    state.selectedTrackPaths[0] === state.playingTrackPath
  ) {
    const next = combinedMusicReducer(state, action);
    return { ...next, selectedTrackPaths: [action.path] };
  }
  const next = combinedMusicReducer(state, action);
  if (action.type === 'set-music-tracks') {
    return {
      ...next,
      panelSelections: prunePanelSelections(next.tracks, next.panelSelections),
    };
  }
  return next;
}
