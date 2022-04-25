import { State } from 'src/@types';
import { Dropbox } from 'dropbox';
import { createSelector } from 'reselect';
import { ensureExists } from 'src/utils';
import * as T from 'src/@types';
import { parseChordPro } from 'src/logic/parse';

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

export function getActiveFile(state: State): string {
  return state.app.activeFile;
}

export const getActiveFileText = createSelector(
  getDownloadFileCache,
  getActiveFile,
  (downloadFileCache, activeFile): string => {
    const downloadFileRequest = ensureExists(
      downloadFileCache.get(activeFile),
      'download file',
    );
    if (
      downloadFileRequest.type === 'download-file-received' &&
      typeof downloadFileRequest.value.text === 'string'
    ) {
      return downloadFileRequest.value.text;
    }
    if (
      downloadFileRequest.type === 'download-file-failed' &&
      typeof downloadFileRequest.value?.text === 'string'
    ) {
      return downloadFileRequest.value.text;
    }
    throw new Error('Downloaded file is not ready.');
  },
);

export const getParsedFile = createSelector(getActiveFileText, parseChordPro);

export const getSongKey = createSelector(
  getParsedFile,
  ({ directives }): string | null => {
    if (typeof directives.key === 'string') {
      if (directives.key.match(/^[A-G]#?b?m?$/)) {
        //                      ^           $
        //                       [A-G]
        //                            #?
        //                              b?
        //                                m?
        return directives.key;
      }
    }
    return null;
  },
);

export const getSongTitle = createSelector(
  getParsedFile,
  ({ directives }): string | null => {
    if (typeof directives.title === 'string') {
      return directives.title;
    }
    return 'Untitled';
  },
);
