import { State } from 'src/@types';
import { Dropbox } from 'dropbox';
import { createSelector } from 'reselect';
import { ensureExists } from 'src/utils';
import * as T from 'src/@types';

export function getDropboxAccessToken(state: State) {
  return state.app.dropboxAccessToken;
}

export const getDropboxOrNull = createSelector(
  getDropboxAccessToken,
  (accessToken): Dropbox | null => {
    if (!accessToken) {
      return null;
    }
    // Initiate dropbox.
    const dropbox = new Dropbox({ accessToken });
    // Intercept all calls to dropbox and log them.
    const fakeDropbox: any = {};

    for (const key in dropbox) {
      fakeDropbox[key] = (...args: any[]) => {
        // First log the request.
        const style = 'color: #006DFF; font-weight: bold';
        console.log(`[dropbox] calling %c"${key}"`, style, ...args);

        // Monitor the response, and pass on the promise result.
        return new Promise((resolve, reject) => {
          const result = (dropbox as any)[key](...args);
          result.then(
            (response: any) => {
              console.log(`[dropbox] response %c"${key}"`, style, response);
              resolve(response);
            },
            (error: any) => {
              console.log(`[dropbox] error %c"${key}"`, style, error);
              reject(error);
            },
          );
        });
      };
    }
    return fakeDropbox;
  },
);

export function getDropbox(state: State) {
  return ensureExists(getDropboxOrNull(state), 'Dropbox');
}

export function getListFilesCache(state: State): T.ListFilesCache {
  return state.app.listFilesCache;
}

export function getDownloadFileCache(state: State): T.DownloadFileCache {
  return state.app.downloadFileCache;
}
