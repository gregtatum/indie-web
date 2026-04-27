import * as T from 'frontend/@types';
import { State } from 'frontend/@types';

export function getMusic(state: State) {
  return state.music;
}

export function getMusicPanelSelections(state: State) {
  return getMusic(state).panelSelections;
}

export function getMusicPanelSelection(panel: T.MusicPanelType) {
  return (state: State) => getMusicPanelSelections(state)[panel];
}
