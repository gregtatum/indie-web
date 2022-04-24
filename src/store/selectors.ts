import { State } from 'src/@types';

export function getInit(state: State) {
  return state.app.init;
}

export function getDropboxAccessToken(state: State) {
  return state.app.dropboxAccessToken;
}
