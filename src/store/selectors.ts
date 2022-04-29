import { State } from 'src/@types';
import { Dropbox } from 'dropbox';
import { createSelector } from 'reselect';
import { ensureExists } from 'src/utils';
import * as T from 'src/@types';
import { parseChordPro } from 'src/logic/parse';

export function getView(state: State): T.View {
  return state.app.view;
}

export function getDropboxAccessToken(state: State) {
  return state.app.dropboxAccessToken;
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

export function getModifiedText(state: State): string {
  return state.app.modifiedText;
}

export function getMessages(state: State): T.Message[] {
  return state.app.messages;
}

export function getHideEditor(state: State): boolean {
  return state.app.hideEditor;
}

export function getKeepAwake(state: State): boolean {
  return state.app.keepAwake;
}

function dangerousSelector<T>(
  selector: (state: State) => T | null,
  message: string,
): (state: State) => T {
  return (state) => ensureExists(selector(state), message);
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

export const getDropbox = dangerousSelector(
  getDropboxOrNull,
  "Dropbox wasn't available",
);

export const getActiveFileTextOrNull = createSelector(
  getDownloadFileCache,
  getActiveFile,
  getModifiedText,
  (downloadFileCache, activeFile, modifiedText): string | null => {
    if (modifiedText) {
      return modifiedText;
    }
    const downloadFileRequest = downloadFileCache.get(activeFile);
    if (!downloadFileRequest) {
      return null;
    }
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
    return null;
  },
);

export const getActiveFileText = dangerousSelector(
  getActiveFileTextOrNull,
  'Active file was not downloaded while getting text.',
);

export const getActiveFileParsedOrNull = createSelector(
  getActiveFileTextOrNull,
  (text) => {
    if (!text) {
      return null;
    }
    return parseChordPro(text);
  },
);

export const getActiveFileParsed = dangerousSelector(
  getActiveFileParsedOrNull,
  'Active file was not downloaded while parsing file.',
);

export const getActiveFileSongKey = createSelector(
  getActiveFileParsed,
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

export const getActiveFileSongTitleOrNull = createSelector(
  getActiveFileParsedOrNull,
  (parsedFile): string | null => {
    if (!parsedFile) {
      return null;
    }
    const { directives } = parsedFile;
    if (typeof directives.title === 'string') {
      return directives.title;
    }
    return 'Untitled';
  },
);

export const getActiveFileSongTitle = dangerousSelector(
  getActiveFileSongTitleOrNull,
  'Active file was not downloaded when getting song title.',
);
