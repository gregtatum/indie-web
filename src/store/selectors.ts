import * as T from 'src/@types';
import { Dropbox } from 'dropbox';
import { createSelector } from 'reselect';
import {
  ensureExists,
  getDirName,
  getUrlForFile,
  UnhandledCaseError,
} from 'src/utils';
import { parseChordPro } from 'src/logic/parse';
import type * as PDFJS from 'pdfjs-dist';
import { parseSearchString } from 'src/logic/search';

type State = T.State;
const pdfjs: typeof PDFJS = (window as any).pdfjsLib;

if (process.env.NODE_ENV !== 'test') {
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.js';
}

export function getView(state: State) {
  return state.view;
}

export function getDropboxOauth(state: State) {
  return state.dropboxOauth;
}

export function getListFilesCache(state: State) {
  return state.listFilesCache;
}

export function getDownloadFileCache(state: State) {
  return state.downloadFileCache;
}

export function getDownloadFileErrors(state: State) {
  return state.downloadFileErrors;
}

export function getListFilesErrors(state: State) {
  return state.listFileErrors;
}

export function getDownloadBlobCache(state: State) {
  return state.downloadBlobCache;
}

export function getPath(state: State) {
  return state.path;
}

export function getModifiedText(state: State) {
  return state.modifiedText;
}

export function getMessages(state: State) {
  return state.messages;
}

export function getHideEditor(state: State) {
  return state.hideEditor;
}

export function getIsDraggingSplitter(state: State) {
  return state.isDraggingSplitter;
}

export function shouldHideHeader(state: State) {
  return state.shouldHideHeader;
}

export function getOfflineDBConnection(state: State) {
  return state.offlineDB;
}

export function getOfflineDB(state: State) {
  return getOfflineDBConnection(state).db;
}

export function getFileMenu(state: State) {
  return state.fileMenu;
}

export function getRenameFile(state: State) {
  return state.renameFile;
}

export function getFilesIndex(state: State) {
  return state.filesIndex;
}

export function getSearchString(state: State) {
  return state.searchString;
}

/**
 * Returns the value of the selector and assert that it is non-null.
 */
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
    const fakeDropbox: Record<string, any> = {};

    for (const key in dropbox) {
      fakeDropbox[key] = (...args: any[]) => {
        // First log the request.
        const style = 'color: #006DFF; font-weight: bold';
        if (process.env.NODE_ENV !== 'test') {
          console.log(`[dropbox] calling %c"${key}"`, style, ...args);
        }

        // Monitor the response, and pass on the promise result.
        return new Promise((resolve, reject) => {
          const result = (dropbox as any)[key](...args);
          result.then(
            (response: any) => {
              if (process.env.NODE_ENV !== 'test') {
                console.log(`[dropbox] response %c"${key}"`, style, response);
              }
              resolve(response);
            },
            (error: any) => {
              if (process.env.NODE_ENV !== 'test') {
                console.log(`[dropbox] error %c"${key}"`, style, args, error);
              }
              reject(error);
            },
          );
        });
      };
    }
    return fakeDropbox as any;
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

export const getActiveFileOrNull = createSelector(
  getDownloadFileCache,
  getPath,
  (downloadFileCache, path): T.DownloadedTextFile | null => {
    return downloadFileCache.get(path) ?? null;
  },
);

export const getActiveFileTextOrNull = createSelector(
  getActiveFileOrNull,
  getModifiedText,
  (activeFile, modifiedText): string | null => {
    if (modifiedText) {
      return modifiedText;
    }
    if (!activeFile) {
      return null;
    }

    return activeFile.text;
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
  (downloadBlobCache, path): Blob | null =>
    downloadBlobCache.get(path)?.blob ?? null,
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
  (blob) => {
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
    const downloadedTextFile = downloadFilesCache.get(path);

    if (downloadedTextFile) {
      return downloadedTextFile.metadata.path;
    }

    const files = listFilesCache.get(path);
    if (files) {
      const file = files.find((file) => file.path === path);
      if (file?.path) {
        return file.path;
      }
      const activeFileWithSlash = path + '/';
      for (const file of files) {
        if (file?.path?.startsWith(activeFileWithSlash) && file.path) {
          const parts = path.split('/');
          const displayParts = file.path.split('/');
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
      return document.fullscreenEnabled && getHideEditor(state);
    case 'view-pdf':
    case 'view-image':
      return document.fullscreenEnabled;
    case 'list-files':
    case 'settings':
    case 'privacy':
      return false;
    default:
      throw new UnhandledCaseError(view, 'view');
  }
}

interface SongLink {
  url: string;
  name: string;
}

type NextPrevSong = Partial<{
  nextSong: SongLink;
  prevSong: SongLink;
}>;

export const getNextPrevSong = createSelector(
  getPath,
  getListFilesCache,
  (path, listFilesCache): NextPrevSong => {
    const results: NextPrevSong = {};
    const folder = getDirName(path);

    // Only return values if the folders are requested.
    const listFiles = listFilesCache.get(folder);
    if (!listFiles) {
      return results;
    }

    const pathLower = path.toLowerCase();

    const songLinks: SongLink[] = [];
    let index: number | null = null;
    for (const file of listFiles) {
      // Ignore folders.
      if (file.type === 'folder') {
        continue;
      }

      // Ensure it's something we can open.
      const url = getUrlForFile(file.path ?? '');
      if (!url) {
        continue;
      }

      // See if this is the current URL.
      if (file.path.toLowerCase() === pathLower) {
        index = songLinks.length;
      }

      songLinks.push({
        url,
        name: file.name,
      });
    }

    // Now determine the previous and next songs from the available songs.

    if (index === null) {
      console.error('File not found in folder listing.');
      return results;
    }

    if (index > 0) {
      results.prevSong = songLinks[index - 1];
    }

    if (index < songLinks.length - 1) {
      results.nextSong = songLinks[index + 1];
    }

    return results;
  },
);

export const getParsedSearch = createSelector(
  getSearchString,
  parseSearchString,
);

export const getSearchFilteredFiles = createSelector(
  getParsedSearch,
  getListFilesCache,
  getPath,
  getFilesIndex,
  (
    parsedSearch,
    listFilesCache,
    path,
    filesIndex,
  ): (T.FileMetadata | T.FolderMetadata)[] | null => {
    const listFiles = listFilesCache.get(path)?.filter(
      // Remove any dot files.
      (entry) => entry.name[0] !== '.',
    );

    if (!listFiles) {
      return null;
    }

    if (!parsedSearch) {
      return listFiles;
    }

    if (!filesIndex) {
      return null;
    }

    const { query, inFolder, path: searchPath, directives } = parsedSearch;

    // Do a full filesIndex search.
    let results = filesIndex.data.files;

    if (searchPath) {
      results = results.filter((fileIndex) =>
        fileIndex.metadata.path.toLowerCase().includes(searchPath),
      );
    }

    if (inFolder) {
      results = results.filter((fileIndex) =>
        fileIndex.metadata.path.toLowerCase().startsWith(inFolder),
      );
    }

    if (query.length > 0) {
      results = results.filter((fileIndex) => {
        for (const queryTerm of query) {
          // Match the path
          if (fileIndex.metadata.path.toLowerCase().includes(queryTerm)) {
            continue;
          }

          // Search through all of the directives
          for (const value of Object.values(fileIndex.directives)) {
            if (value.toLowerCase().includes(queryTerm)) {
              continue;
            }
          }

          // No match was found.
          return false;
        }

        // All query terms matched.
        return true;
      });
    }

    if (directives && Object.values(directives).length > 0) {
      results = results.filter((fileIndex) => {
        for (const [keyTerm, valueTerm] of Object.entries(directives)) {
          const fileValue = fileIndex.directives[keyTerm]?.toLowerCase();
          if (valueTerm === fileValue || (!valueTerm && !fileValue)) {
            continue;
          }
          return false;
        }

        // All directive terms match.
        return true;
      });
    }

    return results
      .map((fileIndex) => fileIndex.metadata)
      .sort((a, b) => {
        return a.path.localeCompare(b.path);
      });
  },
);
