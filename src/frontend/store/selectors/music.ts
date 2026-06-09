import { createSelector } from 'reselect';
import * as T from 'frontend/@types';
import { State } from 'frontend/@types';
import { UnhandledCaseError } from 'frontend/utils';
import type {
  MusicPlaybackStatus,
  FolderArtSaveStatus,
} from 'frontend/store/reducers/music';
export type { FolderArtSaveStatus } from 'frontend/store/reducers/music';

export function getMusic(state: State) {
  return state.music;
}

export function getMusicTracks(state: State): T.TrackMetadata[] {
  return getMusic(state).tracks;
}

export function getMusicSelectedTrackPaths(state: State): string[] {
  return getMusic(state).selectedTrackPaths;
}

export function getMusicPanelSelections(
  state: State,
): Partial<Record<T.MusicPanelType, string[]>> {
  return getMusic(state).panelSelections;
}

export function getMusicPanelOrder(state: State): T.MusicPanelType[] {
  return getMusic(state).panelOrder;
}

export function getMusicEditTrackPath(state: State): string | null {
  return getMusic(state).editTrackPath;
}

export function getMusicEditTab(state: State): T.MusicEditTab {
  return getMusic(state).editTab;
}

export function getMusicNeedsRescan(state: State): boolean {
  return getMusic(state).needsRescan;
}

function filterByPanel(
  filteredTracks: T.TrackMetadata[],
  panel: T.MusicPanelType,
  selections: string[],
): T.TrackMetadata[] {
  switch (panel) {
    case 'genre':
      return filteredTracks.filter(
        (t) => t.genre && selections.includes(t.genre),
      );
    case 'artist':
      return filteredTracks.filter(
        (t) => t.artist && selections.includes(t.artist),
      );
    case 'album':
      return filteredTracks.filter(
        (t) => t.album && selections.includes(t.album),
      );
    default:
      throw new UnhandledCaseError(panel, 'MusicPanelType');
  }
}

/**
 * For each panel, the tracks available as input to that panel's item list —
 * filtered by all panels to its left. e.g. the album panel receives tracks
 * already narrowed by the artist selection.
 */
export const getMusicPanelTracks = createSelector(
  getMusicTracks,
  getMusicPanelSelections,
  getMusicPanelOrder,
  (
    allTracks,
    panelSelections,
    panelOrder,
  ): Record<T.MusicPanelType, T.TrackMetadata[]> => {
    const result = {} as Record<T.MusicPanelType, T.TrackMetadata[]>;
    let filtered = allTracks;
    for (const panel of panelOrder) {
      result[panel] = filtered;
      const selections = panelSelections[panel];
      if (selections && selections.length > 0) {
        filtered = filterByPanel(filtered, panel, selections);
      }
    }
    return result;
  },
);

export function getMusicPlaybackStatus(state: State): MusicPlaybackStatus {
  return getMusic(state).playbackStatus;
}

export function getMusicPlaybackTrackPath(state: State): string | null {
  return getMusic(state).playingTrackPath;
}

export function getMusicPlaybackQueue(state: State): T.TrackMetadata[] {
  return getMusic(state).playbackQueue;
}

export function getMusicFolderArtSaveStatus(state: State): FolderArtSaveStatus {
  return getMusic(state).folderArtSaveStatus;
}

export function getMusicFolderArtVersion(state: State): number {
  return getMusic(state).folderArtVersion;
}

/**
 * All panel filters applied in order — the final track list for the tracks view.
 */
export const getFilteredMusicTracks = createSelector(
  getMusicTracks,
  getMusicPanelSelections,
  getMusicPanelOrder,
  (allTracks, panelSelections, panelOrder) =>
    panelOrder.reduce((filtered, panel) => {
      const sel = panelSelections[panel];
      return sel && sel.length > 0
        ? filterByPanel(filtered, panel, sel)
        : filtered;
    }, allTracks),
);
