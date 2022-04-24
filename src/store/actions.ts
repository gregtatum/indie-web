import { Action } from 'src/@types';

export function init(): Action {
  return { type: 'init' };
}

export function setDropboxAccessToken(token: string): Action {
  window.localStorage.setItem('dropboxAccessToken', token);
  return { type: 'set-dropbox-access-token', token };
}

export function removeDropboxAccessToken(): Action {
  window.localStorage.removeItem('dropboxAccessToken');
  return { type: 'remove-dropbox-access-token' };
}
