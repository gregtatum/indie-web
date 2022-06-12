import * as T from 'src/@types';
import { Dropbox } from 'dropbox';
import { createSelector } from 'reselect';
import { ensureExists, getDirName, UnhandledCaseError } from 'src/utils';
import { parseChordPro } from 'src/logic/parse';
import type * as PDFJS from 'pdfjs-dist';

type State = T.State;
const pdfjs: typeof PDFJS = (window as any).pdfjsLib;

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.js';

export function getView(state: State) {
  return state.app.view;
}

export function getDropboxOauth(state: State) {
  return state.app.dropboxOauth;
}

export function getListFilesCache(state: State) {
  return state.app.listFilesCache;
}

export function getDownloadFileCache(state: State) {
  return state.app.downloadFileCache;
}

export function getDownloadBlobCache(state: State) {
  return state.app.downloadBlobCache;
}

export function getPath(state: State) {
  return state.app.path;
}

export function getModifiedText(state: State) {
  return state.app.modifiedText;
}

export function getMessages(state: State) {
  return state.app.messages;
}

export function getHideEditor(state: State) {
  return state.app.hideEditor;
}

export function getIsDraggingSplitter(state: State) {
  return state.app.isDraggingSplitter;
}

export function shouldHideHeader(state: State) {
  return state.app.shouldHideHeader;
}

function dangerousSelector<T>(
  selector: (state: State) => T | null,
  message: string,
): (state: State) => T {
  return (state) => ensureExists(selector(state), message);
}

export const getDropboxOrNull = createSelector(
  getDropboxOauth,
  (oauth): Dropbox | null => {
    if (!oauth) {
      return null;
    }
    const { accessToken } = oauth;
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

export const getIsDropboxInitiallyExpired = createSelector(
  getDropboxOauth,
  (oauth) => {
    if (!oauth) {
      return false;
    }
    return oauth.expires < Date.now();
  },
);

export const getDropbox = dangerousSelector(
  getDropboxOrNull,
  "Dropbox wasn't available",
);

export const getActiveFileTextOrNull = createSelector(
  getDownloadFileCache,
  getPath,
  getModifiedText,
  (downloadFileCache, path, modifiedText): string | null => {
    if (modifiedText) {
      return modifiedText;
    }
    const downloadFileRequest = downloadFileCache.get(path);
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

export const getActiveBlobOrNull = createSelector(
  getDownloadBlobCache,
  getPath,
  (downloadBlobCache, path): Blob | null => {
    const downloadFileRequest = downloadBlobCache.get(path);
    if (!downloadFileRequest) {
      return null;
    }
    if (
      downloadFileRequest.type === 'download-blob-received' &&
      downloadFileRequest.value.fileBlob
    ) {
      return downloadFileRequest.value.fileBlob;
    }
    if (
      downloadFileRequest.type === 'download-blob-failed' &&
      downloadFileRequest.value?.fileBlob
    ) {
      return downloadFileRequest.value.fileBlob;
    }
    return null;
  },
);

export const getActiveBlob = dangerousSelector(
  getActiveBlobOrNull,
  'Active file was not downloaded while getting text.',
);

export const getActivePDFOrNull = createSelector(
  getActiveBlobOrNull,
  async (blob) => {
    if (!blob) {
      return null;
    }
    return pdfjs.getDocument((await blob.arrayBuffer()) as Uint8Array).promise;
  },
);

export const getActivePDF = dangerousSelector(
  getActivePDFOrNull,
  'Active file was not downloaded while parsing file.',
);

export const getActiveImageOrNull = createSelector(
  getActiveBlobOrNull,
  async (blob) => {
    if (!blob) {
      return null;
    }
    return URL.createObjectURL(blob);
  },
);

export const getActiveImage = dangerousSelector(
  getActiveImageOrNull,
  'Active file was not downloaded while processing file.',
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
    return null;
  },
);

export const getActiveFileSongTitle = dangerousSelector(
  getActiveFileSongTitleOrNull,
  'Active file was not downloaded when getting song title.',
);

export const getActiveFileDisplayPath = createSelector(
  getPath,
  getDownloadFileCache,
  getListFilesCache,
  (path, downloadFilesCache, listFilesCache) => {
    const downloadFile = downloadFilesCache.get(path);
    if (
      downloadFile &&
      downloadFile.type !== 'download-file-requested' &&
      downloadFile.value
    ) {
      const { metadata } = downloadFile.value;
      if (metadata?.path_display) {
        return metadata.path_display;
      }
    }

    const listFiles = listFilesCache.get(path);
    if (
      listFiles &&
      listFiles.type !== 'list-files-requested' &&
      listFiles.value
    ) {
      const files = listFiles.value;
      const file = files.find((file) => file.path_display === path);
      if (file?.path_display) {
        return file.path_display;
      }
      const activeFileWithSlash = path + '/';
      for (const file of files) {
        if (
          file?.path_display?.startsWith(activeFileWithSlash) &&
          file.path_display
        ) {
          const parts = path.split('/');
          const displayParts = file.path_display.split('/');
          return displayParts.slice(0, parts.length).join('/');
        }
      }
    }

    return path;
  },
);

export function canGoFullScreen(state: State) {
  const view = getView(state);
  switch (view) {
    case null:
      return false;
    case 'view-file':
    case 'view-pdf':
    case 'view-image':
      return (
        true &&
        (document.fullscreenEnabled ||
          (document as any).webkitFullscreenEnabled)
      );
    case 'list-files':
    case 'settings':
    case 'privacy':
      return false;
    default:
      throw new UnhandledCaseError(view, 'view');
  }
}

type NextPrevSong = Partial<{
  nextSong: T.DropboxFile;
  prevSong: T.DropboxFile;
}>;

export const getNextPrevSong = createSelector(
  getPath,
  getListFilesCache,
  (path, listFilesCache): NextPrevSong => {
    const results: NextPrevSong = {};
    const folder = getDirName(path);

    // Only return values if the folders are requested.
    const listFiles = listFilesCache.get(folder);
    if (!listFiles || listFiles.type === 'list-files-requested') {
      return results;
    }
    const filesAndFolders = listFiles.value;
    if (!filesAndFolders) {
      return results;
    }

    // Remove any folders since we wouldn't want to go next to one.
    const files = filesAndFolders.filter((file) => file['.tag'] === 'file');

    // Look up the index.
    const pathLower = path.toLowerCase();
    const index = files.findIndex((file) => file.path_lower === pathLower);

    if (index === -1) {
      console.error('File not found in folder listing.');
      return results;
    }

    if (index > 0) {
      results.prevSong = files[index - 1];
    }

    if (index < files.length - 1) {
      results.nextSong = files[index + 1];
    }

    return results;
  },
);
