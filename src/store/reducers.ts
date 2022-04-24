import * as T from 'src/@types';
import { combineReducers } from 'redux';

function getDropboxAccessTokenLocalStorage(): string | null {
  const token = window.localStorage.getItem('dropboxAccessToken');
  if (token) {
    return token;
  }
  return null;
}

function dropboxAccessToken(
  state: string | null = getDropboxAccessTokenLocalStorage(),
  action: T.Action,
): string | null {
  switch (action.type) {
    case 'set-dropbox-access-token':
      return action.token;
    case 'remove-dropbox-access-token':
      return null;
    default:
      return state;
  }
}

function init(state = false, action: T.Action): boolean {
  switch (action.type) {
    case 'init':
      return true;
    default:
      return state;
  }
}

export const app = combineReducers({ init, dropboxAccessToken });
export type AppState = ReturnType<typeof app>;

export const reducers = { app };
export type State = {
  app: AppState;
};
