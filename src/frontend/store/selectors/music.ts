import { createSelector } from 'reselect';
import * as T from 'frontend/@types';
import { State } from 'frontend/@types';
import { UnhandledCaseError } from 'frontend/utils';
import type { MusicPlaybackStatus } from 'frontend/store/reducers/music';

export function getMusic(state: State) {
  return state.music;
}

export function getMusicTracks(state: State): T.TrackMetadata[] {
  return getMusic(state).tracks;
}

export function getMusicSelectedTrackPath(state: State): string | null {
  return getMusic(state).selectedTrackPath;
}

export function getMusicPanelSelections(state: State) {
  return getMusic(state).panelSelections;
}

export function getMusicPanelSelection(panel: T.MusicPanelType) {
  return (state: State) => getMusicPanelSelections(state)[panel];
}

export function getMusicNeedsRescan(state: State): boolean {
  return getMusic(state).needsRescan;
}

const PANEL_ORDER: T.MusicPanelType[] = ['genre', 'artist', 'album'];

function filterByPanel(
  filteredTracks: T.TrackMetadata[],
  panel: T.MusicPanelType,
  value: string,
): T.TrackMetadata[] {
  switch (panel) {
    case 'genre':
      return filteredTracks.filter((t) => t.genre === value);
    case 'artist':
      return filteredTracks.filter((t) => t.artist === value);
    case 'album':
      return filteredTracks.filter((t) => t.album === value);
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
  (allTracks, panelSelections): Record<T.MusicPanelType, T.TrackMetadata[]> => {
    const result = {} as Record<T.MusicPanelType, T.TrackMetadata[]>;
    let filtered = allTracks;
    for (const panel of PANEL_ORDER) {
      result[panel] = filtered;
      const sel = panelSelections[panel];
      if (sel) {
        filtered = filterByPanel(filtered, panel, sel);
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

/**
 * All panel filters applied in order — the final track list for the song view.
 */
export const getFilteredMusicTracks = createSelector(
  getMusicTracks,
  getMusicPanelSelections,
  (allTracks, panelSelections) =>
    PANEL_ORDER.reduce((filtered, panel) => {
      const sel = panelSelections[panel];
      return sel ? filterByPanel(filtered, panel, sel) : filtered;
    }, allTracks),
);
