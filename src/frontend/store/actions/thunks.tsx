import { Thunk } from 'frontend/@types';
import * as React from 'react';
import { $, T } from 'frontend';
import {
  canonicalizePath,
  downloadBlobForUser,
  dropboxErrorMessage,
  ensureExists,
  getDirName,
  getGeneration,
  getPathFileName,
  insertTextAtLine,
  pathJoin,
  getZipJs,
  processInChunks,
} from 'frontend/utils';
import * as Plain from './plain';
import { FilesIndex, tryUpgradeIndexJSON } from 'frontend/logic/files-index';
import { FileStoreError } from 'frontend/logic/file-store';
import { IDBError } from 'frontend/logic/file-store/indexeddb-fs';

/**
 * This file contains all of the thunk actions, that contain extra logic,
 * such as conditional dispatches, and multiple async calls.
 */

const DEFAULT_MESSAGE_DELAY = 3000;

/**
 * Plain actions defined in thunks.tsx should either be APICalls, or internal.
 * These will all be collected on the global `T` export in `src`.
 */
export type PlainActions =
  // See PlainActions in src/frontent/@types/index.ts for details on this next line.
  T.Values<{
    [FnName in keyof typeof PlainInternal]: ReturnType<
      (typeof PlainInternal)[FnName]
    >;
  }>;

/**
 * These should only be used internally in thunks.
 */
export namespace PlainInternal {
  export function addMessage(message: React.ReactNode, generation: number) {
    return { type: 'add-message' as const, message, generation };
  }

  export function dismissAllMessages() {
    return { type: 'dismiss-all-messages' as const };
  }

  export function listFilesRequested(path: string) {
    return { type: 'list-files-requested' as const, path };
  }

  export function listFilesReceived(path: string, files: T.FolderListing) {
    return { type: 'list-files-received' as const, path, files };
  }

  export function listFilesError(path: string, error: string) {
    return { type: 'list-files-error' as const, path, error };
  }

  export function moveFileRequested(path: string) {
    return { type: 'move-file-requested' as const, path };
  }

  export function moveFileDone(
    oldPath: string,
    metadata: T.FileMetadata | T.FolderMetadata,
  ) {
    return { type: 'move-file-done' as const, oldPath, metadata };
  }

  export function deleteFileDone(
    metadata: T.FileMetadata | T.FolderMetadata,
    folder: string,
    fileFocus: string | null,
  ) {
    return { type: 'delete-file-done' as const, metadata, folder, fileFocus };
  }

  export function downloadFileRequested(path: string) {
    return { type: 'download-file-requested' as const, path };
  }

  export function downloadFileReceived(path: string, file: T.TextFile) {
    return { type: 'download-file-received' as const, path, file };
  }

  export function downloadFileError(path: string, error: string) {
    return { type: 'download-file-error' as const, path, error };
  }

  export function downloadBlobRequested(path: string) {
    return { type: 'download-blob-requested' as const, path };
  }

  export function downloadBlobReceived(path: string, blobFile: T.BlobFile) {
    return { type: 'download-blob-received' as const, path, blobFile };
  }

  export function fileIndexReceived(filesIndex: FilesIndex) {
    return { type: 'files-index-received' as const, filesIndex };
  }

  export function undoLearnStem(stem: string) {
    return { type: 'undo-learn-stem' as const, stem };
  }

  export function undoIgnoreStem(stem: string) {
    return { type: 'undo-ignore-stem' as const, stem };
  }

  export function nextSentence(stem: T.Stem, direction: -1 | 1) {
    return {
      type: 'next-sentence' as const,
      direction,
      stem,
    };
  }
}

export function listFiles(path = ''): Thunk<Promise<void>> {
  return async (dispatch, getState) => {
    let dropboxPath = path;
    if (path === '/') {
      // Dropbox doesn't like the root `/`.
      dropboxPath = '';
    }
    const fileStore = $.getCurrentFS(getState());

    dispatch(PlainInternal.listFilesRequested(path));

    if (fileStore.cache) {
      try {
        const offlineListing = await fileStore.cache.listFiles(path);
        if (offlineListing) {
          dispatch(PlainInternal.listFilesReceived(path, offlineListing));
        }
      } catch (error) {
        (error as IDBError)?.cacheLog();
      }
    }

    try {
      const files = await fileStore.listFiles(dropboxPath);
      dispatch(PlainInternal.listFilesReceived(path, files));
    } catch (response) {
      dispatch(PlainInternal.listFilesError(path, String(response)));
    }
  };
}

export function downloadFile(path: string): Thunk<Promise<void>> {
  return async (dispatch, getState) => {
    dispatch(PlainInternal.downloadFileRequested(path));

    const handleFile = (file: T.TextFile) => {
      dispatch(PlainInternal.downloadFileReceived(path, file));

      // For things like back and next, ensure we have a copy of the prev/next
      // songs in the folder.
      const listFilesCache = $.getListFilesCache(getState());
      const folder = getDirName(path);
      if (!listFilesCache.get(folder)) {
        dispatch(listFiles(folder)).catch((error) => {
          console.error('Failed to list files after downloading file', error);
        });
      }
    };

    let cachedFile: T.TextFile | undefined;
    const fileStore = $.getCurrentFS(getState());

    if (fileStore.cache) {
      try {
        cachedFile = await fileStore.cache.loadText(path);
        handleFile(cachedFile);
      } catch (error) {
        (error as IDBError)?.cacheLog();
      }
    }

    // Kick off the request, even if an offline version was found.
    try {
      const { text, metadata } = await fileStore.loadText(path);
      // The file blob was left off of this type.
      if (cachedFile?.metadata.hash === metadata.hash) {
        // The files are the same.
        return;
      }

      handleFile({
        metadata,
        text,
      });
    } catch (error) {
      dispatch(
        PlainInternal.downloadFileError(
          path,
          (error as FileStoreError).toString(),
        ),
      );
    }
  };
}

export function downloadBlob(path: string): Thunk<Promise<void>> {
  return async (dispatch, getState) => {
    dispatch(PlainInternal.downloadBlobRequested(path));

    const handleBlob = (blobFile: T.BlobFile) => {
      dispatch(PlainInternal.downloadBlobReceived(path, blobFile));

      // For things like back and next, ensure we have a copy of the prev/next
      // songs in the folder.
      const cache = $.getListFilesCache(getState());
      const folder = getDirName(path);
      if (!cache.get(folder)) {
        dispatch(listFiles(folder)).catch((error) => {
          console.error('Failed to list files after downloading a blob', error);
        });
      }
    };

    const fileStore = $.getCurrentFS(getState());
    if (fileStore.cache) {
      try {
        handleBlob(await fileStore.cache.loadBlob(path));
      } catch (error) {
        console.error('Error with indexeddb', error);
      }
    }

    try {
      handleBlob(await fileStore.loadBlob(path));
    } catch (error) {
      dispatch(
        PlainInternal.downloadFileError(path, dropboxErrorMessage(error)),
      );
    }
  };
}

export function saveTextFile(path: string, text: string): Thunk<Promise<void>> {
  return async (dispatch, getState) => {
    const fileStore = $.getCurrentFS(getState());
    const fileStoreDisplayName = $.getFileStoreDisplayName(getState());

    const messageGeneration = dispatch(
      addMessage({
        message: (
          <>
            Saving <code>{path}</code>
          </>
        ),
      }),
    );
    try {
      const metadata = await fileStore.saveText(path, 'overwrite', text);
      dispatch(
        PlainInternal.downloadFileReceived(path, {
          metadata,
          text,
        }),
      );
      dispatch(
        addMessage({
          message: (
            <>
              Saved <code>{path}</code>
            </>
          ),
          generation: messageGeneration,
          timeout: true,
        }),
      );
    } catch (error) {
      dispatch(
        addMessage({
          message: (
            <>
              Unable to save <code>{path}</code>
            </>
          ),
          generation: messageGeneration,
        }),
      );
      console.error(error);
      throw new Error(`Unable to save the file with ${fileStoreDisplayName}.`);
    }
  };
}

export function moveFile(
  fromPath: string,
  toPath: string,
): Thunk<Promise<void>> {
  return async (dispatch, getState) => {
    toPath = canonicalizePath(toPath);
    const fileStore = $.getCurrentFS(getState());
    const fileStoreDisplayName = $.getFileStoreDisplayName(getState());
    const name = getPathFileName(toPath);

    dispatch(PlainInternal.moveFileRequested(fromPath));
    const messageGeneration = dispatch(
      addMessage({
        message: (
          <>
            Moving file <code>{name}</code>
          </>
        ),
      }),
    );

    try {
      const metadata = await fileStore.move(fromPath, toPath);

      dispatch(PlainInternal.moveFileDone(fromPath, metadata));

      dispatch(
        addMessage({
          message: (
            <>
              Moved <code>{toPath}</code>
            </>
          ),
          generation: messageGeneration,
          timeout: true,
        }),
      );

      void dispatch(listFiles(getDirName(fromPath)));
      void dispatch(listFiles(getDirName(toPath)));
    } catch (error) {
      dispatch(
        addMessage({
          message: (
            <>
              Unable to move <code>{toPath}</code>
            </>
          ),
          generation: messageGeneration,
        }),
      );
      console.error(error);
      throw new Error(`Unable to save the file with ${fileStoreDisplayName}.`);
    }
  };
}

interface MessageArgs {
  message: React.ReactNode;
  // A unique generation number to identify a message, useful if
  // the message needs dismissing or can be replaced.
  generation?: number | void;
  // If a number, the number of milliseconds before hiding.
  // If `true`, then use the default delay.
  // If falsey, do not auto-hide the message.
  timeout?: number | boolean;
}

export function addMessage({
  message,
  generation = getGeneration(),
  timeout = false,
}: MessageArgs): Thunk<number> {
  return (dispatch) => {
    dispatch(PlainInternal.addMessage(message, generation));
    if (timeout) {
      setTimeout(
        () => {
          dispatch(Plain.dismissMessage(generation));
        },
        typeof timeout === 'number' ? timeout : DEFAULT_MESSAGE_DELAY,
      );
    }
    return generation;
  };
}

export function dismissAllMessages(): Thunk {
  return (dispatch, getState) => {
    const messages = $.getMessages(getState());
    if (messages.length > 0) {
      dispatch(PlainInternal.dismissAllMessages());
    }
  };
}

/**
 * This is useful for testing purposes from the command line.
 *
 * dispatch($.forceExpiration())
 */
export function forceExpiration(): Thunk {
  return (dispatch, getState) => {
    const oauth = $.getDropboxOauth(getState());
    if (!oauth) {
      return;
    }
    dispatch(
      Plain.setDropboxAccessToken(oauth.accessToken, 0, oauth.refreshToken),
    );
  };
}

const hasFailureMap = new Map<string, boolean>();
export function createInitialFiles(): Thunk<Promise<void>> {
  return async (dispatch, getState) => {
    const fileStore = $.getCurrentFS(getState());
    const fsSlug = $.getCurrentFileStoreSlug(getState());
    let hasFailure = hasFailureMap.get(fsSlug);
    const setFailure = (error: any) => {
      hasFailure = true;
      hasFailureMap.set(fsSlug, true);
      console.error(error);
    };
    if (hasFailure) {
      console.error('Attempting to createInitialFiles after failiure');
      return;
    }

    let files;
    if (process.env.SITE === 'floppydisk') {
      files = ['Getting Started.md'];
    } else {
      files = ['Getting Started.chopro'];
    }
    const fsError: string = '';

    for (const file of files) {
      // Load the file locally first.
      let contents: string;
      try {
        const response = await fetch('/guide/' + file);
        contents = await response.text();
      } catch (error) {
        setFailure(error);
        continue;
      }

      // Upload it Dropbox.
      try {
        await fileStore.saveText('/' + file, 'add', contents);
        const files = await fileStore.listFiles('/');
        if (files.length === 0) {
          setFailure(new Error('Failed to create files in the file store'));
        }
      } catch (error) {
        setFailure(error);
      }
    }
    if (hasFailure) {
      dispatch(
        addMessage({
          message: `Could not create the initial demo files. ${fsError}`,
        }),
      );
    }
    dispatch(Plain.invalidatePath('/'));
  };
}

export function downloadFileForUser(
  file: T.FileMetadata,
): Thunk<Promise<void>> {
  return async (dispatch, getState) => {
    const messageGeneration = dispatch(
      addMessage({
        message: (
          <>
            Downloading <code>{file.name}</code>
          </>
        ),
      }),
    );

    await $.getCurrentFS(getState())
      .loadBlob(file.path)
      .then(
        ({ blob }) => {
          downloadBlobForUser(file.name, blob);

          dispatch(
            addMessage({
              message: (
                <>
                  Downloaded <code>{file.name}</code>
                </>
              ),
              generation: messageGeneration,
              timeout: true,
            }),
          );
        },
        (error) => {
          console.error(error);
          dispatch(
            addMessage({
              message: (
                <>
                  Failed to download <code>{file.name}</code>
                </>
              ),
              generation: messageGeneration,
              timeout: true,
            }),
          );
        },
      );
  };
}

export function downloadFolderForUser(
  file: T.FolderMetadata,
): Thunk<Promise<void>> {
  return async (dispatch, getState) => {
    const messageGeneration = dispatch(
      addMessage({
        message: (
          <>
            Zipping <code>{file.name}</code>
          </>
        ),
      }),
    );

    await $.getCurrentFS(getState())
      .compressFolder(file.path)
      .then(
        (blob) => {
          downloadBlobForUser(file.name, blob);

          dispatch(
            addMessage({
              message: (
                <>
                  Downloaded <code>{file.name}</code>
                </>
              ),
              generation: messageGeneration,
              timeout: true,
            }),
          );
        },
        (error) => {
          console.error(error);
          dispatch(
            addMessage({
              message: (
                <>
                  Failed to download <code>{file.name}</code>
                </>
              ),
              generation: messageGeneration,
              timeout: true,
            }),
          );
        },
      );
  };
}

export function deleteFile(
  file: T.FileMetadata | T.FolderMetadata,
): Thunk<Promise<void>> {
  return async (dispatch, getState) => {
    if (
      !confirm(
        file.type === 'file'
          ? `Are you sure you want to delete ${file.name}?`
          : `Are you sure you want to delete the folder ${file.name} and all of its contents?`,
      )
    ) {
      return;
    }
    const messageGeneration = dispatch(
      addMessage({
        message: (
          <>
            Deleting <code>{file.name}</code>
          </>
        ),
      }),
    );

    const fileFocusIndex = $.getFileFocusIndex(getState());

    await $.getCurrentFS(getState())
      .delete(file.path)
      .then(
        () => {
          // Adjust the file focus if needed.
          let fileFocus = $.getFileFocus(getState());
          if (fileFocus === file.name) {
            // We deleted the focused file, go ahead and focus the next file.
            const files = $.getSearchFilteredFiles(getState());
            fileFocus = null;
            if (files) {
              const file = files[fileFocusIndex + 1];
              if (file) {
                fileFocus = file.name;
              } else {
                const file = files[fileFocusIndex - 1];
                if (file) {
                  fileFocus = file.name;
                }
              }
            }
          }
          dispatch(
            PlainInternal.deleteFileDone(
              file,
              getDirName(file.path),
              fileFocus,
            ),
          );

          dispatch(
            addMessage({
              message: (
                <>
                  Deleted <code>{file.name}</code>
                </>
              ),
              generation: messageGeneration,
              timeout: true,
            }),
          );
        },
        (error) => {
          console.error(error);
          dispatch(
            addMessage({
              message: (
                <>
                  Failed to delete <code>{file.name}</code>
                </>
              ),
              generation: messageGeneration,
              timeout: true,
            }),
          );
        },
      );
  };
}

export function loadFilesIndex(
  isSecondAttempt = false,
): Thunk<Promise<FilesIndex | null>> {
  return async (dispatch, getState) => {
    function dispatchError(error: unknown, message: React.ReactNode) {
      console.error(error);
      dispatch(
        addMessage({
          message,
          timeout: true,
        }),
      );
    }

    const fileStore = $.getCurrentFS(getState());

    async function attemptRecreateFile(
      message: string,
    ): Promise<FilesIndex | null> {
      if (!isSecondAttempt && confirm(message)) {
        try {
          await fileStore.delete(FilesIndex.path);
        } catch (error) {
          dispatchError(
            error,
            <>
              Failed to delete <code>{FilesIndex.path}</code>
            </>,
          );
        }
        const filesIndex = await dispatch(loadFilesIndex(true));
        return filesIndex;
      }
      return null;
    }

    let text: string;
    try {
      const response = await fileStore.loadText(FilesIndex.path);
      text = response.text;
    } catch (error: any) {
      if ((error as FileStoreError)?.isNotFound?.()) {
        const filesIndex = new FilesIndex(fileStore, getState());
        dispatch(PlainInternal.fileIndexReceived(filesIndex));
        return filesIndex;
      }

      // This is not a path not found error, so dispatch an error.
      dispatchError(
        error,
        <>
          Failed to load the files index <code>{FilesIndex.path}</code>
        </>,
      );
      return null;
    }

    let json: any;
    try {
      json = JSON.parse(text);
    } catch (error) {
      console.error(error);
      return attemptRecreateFile(
        `Browser Chord's file index "${FilesIndex.path}" appears corrupted, would you like to ` +
          `delete and try recreating it?`,
      );
    }

    const indexJSON = tryUpgradeIndexJSON(json);
    if (indexJSON === null) {
      return attemptRecreateFile(
        `Browser Chord's file index "${FilesIndex.path}" appeared malformed, would you like to ` +
          `delete and try recreating it?`,
      );
    }
    const filesIndex = new FilesIndex(
      fileStore,
      getState(),
      // For some reason type narrowing `T.IndexJSON | null` to `T.IndexJSON` is
      // not working here.
      ensureExists(indexJSON),
    );
    dispatch(PlainInternal.fileIndexReceived(filesIndex));
    return filesIndex;
  };
}

/**
 * @param folder The folder containing the file, it will be placed in folder/assets
 * @param fileName The folder containing the thing.
 * @param folder The folder containing the thing.
 */
export function saveAssetFile(
  folder: string,
  fileName: string,
  contents: Blob,
): Thunk<Promise<string | null>> {
  return async (dispatch, getState) => {
    const fileStore = $.getCurrentFS(getState());
    let path = `${folder}/assets/${fileName}`;

    // See if there is a root asset folder, as this is the preferred place to put assets.
    const rootFolder = folder.split('/')[1];
    if (rootFolder) {
      const files = await fileStore.listFiles('/' + rootFolder);
      if (
        files.find((file) => file.name === 'assets' && file.type === 'folder')
      ) {
        path = `/${rootFolder}/assets/${fileName}`;
      }
    }

    const messageGeneration = dispatch(
      addMessage({
        message: (
          <>
            Saving <code>{path}</code>
          </>
        ),
      }),
    );
    try {
      const metadata = await fileStore.saveBlob(path, 'add', contents);

      dispatch(
        addMessage({
          message: (
            <>
              Saved <code>{path}</code>
            </>
          ),
          generation: messageGeneration,
          timeout: true,
        }),
      );

      // The path will be different if there is a conflict.
      return metadata.path;
    } catch (error) {
      console.error(error);

      dispatch(
        addMessage({
          message: (
            <>
              Unable to save <code>{path}</code>.{' '}
              {(error as FileStoreError)?.toString()}
            </>
          ),
          generation: messageGeneration,
        }),
      );
    }

    return null;
  };
}

/**
 * Inserts a line of text into the active text file.
 */
export function insertTextAtLineInActiveFile(
  lineIndex: number,
  insert: string,
): Thunk<void> {
  return (dispatch, getState) => {
    const path = $.getPath(getState());
    const oldText = $.getActiveFileText(getState());
    const newText = insertTextAtLine(oldText, lineIndex, insert);
    dispatch(Plain.modifyActiveFile(newText, path, true));
  };
}

export function selectNextStem(direction: -1 | 1): Thunk<number> {
  return (dispatch, getState) => {
    const stems = $.getUnknownStems(getState());
    if (!stems) {
      throw new Error('Expected stems when selecting a new stem');
    }
    let stemIndex = $.getSelectedStemIndex(getState()) ?? -1;
    stemIndex += direction;
    // Keep the index in bounds.
    stemIndex = Math.max(0, Math.min(stemIndex, stems.length - 1));
    dispatch(Plain.selectStem(stemIndex));
    return stemIndex;
  };
}

export function ignoreSelectedStem(): Thunk {
  return (dispatch, getState) => {
    const stem = $.getSelectedStem(getState());
    if (stem) {
      dispatch(Plain.ignoreStem(stem.stem));
    }
  };
}

export function learnSelectedStem(): Thunk {
  return (dispatch, getState) => {
    const stem = $.getSelectedStem(getState());
    if (stem) {
      dispatch(Plain.learnStem(stem.stem));
    }
  };
}

export function applyUndo(): Thunk {
  return (dispatch, getState) => {
    const undoList = $.getUndoList(getState());
    const action = undoList[undoList.length - 1];
    if (!action) {
      return;
    }
    switch (action.type) {
      case 'learn-stem':
        dispatch(PlainInternal.undoLearnStem(action.stem));
        break;
      case 'ignore-stem':
        dispatch(PlainInternal.undoIgnoreStem(action.stem));
        break;
      default:
        throw new Error('Unknown undo action: ' + action.type);
    }
  };
}

export function nextSentence(direction: -1 | 1, stemIndex?: number): Thunk {
  return (dispatch, getState) => {
    if (stemIndex === undefined) {
      stemIndex = ensureExists($.getSelectedStemIndex(getState()));
    }
    const stem = ensureExists($.getUnknownStems(getState()))[stemIndex];

    dispatch(PlainInternal.nextSentence(stem, direction));
  };
}

let timeoutId: NodeJS.Timeout;
let unloadHandler: null | (() => string);
let savePromise: Promise<unknown> = Promise.resolve();
let unloadMessageGeneration: null | number = null;

export function languageCoachSaveTimer(): Thunk {
  return (dispatch, getState) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (!unloadHandler) {
      unloadHandler = () => {
        unloadMessageGeneration = dispatch(
          addMessage({
            message: (
              <>
                Saving <code>{fullPath}</code>
              </>
            ),
          }),
        );
        return 'There is a pending language coach save, are you sure you want to leave?';
      };
      window.addEventListener('beforeunload', unloadHandler);
    }

    const fileStore = $.getCurrentFS(getState());
    const data = $.getLanguageCoachData(getState());
    const path = $.getLanguageCoachPath(getState());
    const fullPath = pathJoin(path, 'words.json');

    async function saveLanguageCoatchData() {
      try {
        // If there is a previous save attempt, wait for it to be settled.
        await savePromise.catch(() => {});

        // Kick off the save.
        savePromise = fileStore.saveText(
          fullPath,
          'overwrite',
          JSON.stringify(data),
        );

        await savePromise;

        if (unloadMessageGeneration !== null) {
          // We finished saving after a user tried to leave the page.
          dispatch(
            addMessage({
              message: (
                <>
                  Finished saving <code>{fullPath}</code>. Feel free to close
                  the tab.
                </>
              ),
              generation: unloadMessageGeneration,
            }),
          );
        }
      } catch (error) {
        // The save failed, notify the user.
        console.error(error);
        dispatch(
          addMessage({
            message: (
              <>
                Unable to save <code>{fullPath}</code>
              </>
            ),
          }),
        );
      }

      if (unloadHandler) {
        window.removeEventListener('beforeunload', unloadHandler);
        unloadHandler = null;
      }
      unloadMessageGeneration = null;
    }

    timeoutId = setTimeout(saveLanguageCoatchData, 5000);
  };
}

async function extractAndUploadZip(
  dispatch: T.Dispatch,
  getState: T.GetState,
  folderPath: string,
  file: File,
) {
  const fileStore = $.getCurrentFS(getState());
  const zip = await getZipJs();
  const zipReader = new zip.ZipReader(new zip.BlobReader(file));
  const entries = await zipReader.getEntries();
  const fileEntries = entries.filter((entry) => !entry.directory);

  let count = 0;
  let generation: number | void = undefined;
  function updateMessage(message: React.ReactNode) {
    generation = dispatch(
      addMessage({
        message,
        generation,
      }),
    );
  }

  processInChunks(fileEntries, 5, async (entry) => {
    count++;

    updateMessage(
      <>
        Adding file {count} of {entries.length} from <code>{file.name}</code>.
      </>,
    );

    const writer = new zip.BlobWriter();

    await fileStore.saveBlob(
      pathJoin(folderPath, entry.filename),
      'add',
      await entry.getData(writer),
    );
  }).then(
    () => {
      dispatch(listFiles(folderPath)).catch((error) => console.error(error));

      updateMessage(
        <>
          Added all files from <code>{file.name}</code>.
        </>,
      );
    },
    () => {
      updateMessage(
        <>
          There was an error adding files from <code>{file.name}</code>.
        </>,
      );
    },
  );
}

/**
 * Upload files into a folder. This function is infallible, and errors will be reported
 * with messages.
 */
export function uploadFilesWithMessages(
  folderPath: string,
  files: FileList,
): Thunk<Promise<void>> {
  return async (dispatch, getState) => {
    const fileStore = $.getCurrentFS(getState());

    if (files.length === 1) {
      const [file] = files;
      if (file.type === 'application/zip') {
        const extract = confirm(
          'The zip file will be automatically extracted. Click cancel to upload it instead.',
        );
        if (extract) {
          await extractAndUploadZip(dispatch, getState, folderPath, file);
          return;
        }
      }
    }

    for (const file of files) {
      if (!file.type && file.size === 0) {
        dispatch(
          addMessage({
            message: (
              <>
                Browsers do not support dragging and dropping folders, cannot
                add <code>{file.name}</code>.
              </>
            ),
          }),
        );
        continue;
      }
      const path = pathJoin(folderPath, file.name);
      const messageGeneration = dispatch(
        addMessage({
          message: (
            <>
              Adding <code>{file.name}</code>
            </>
          ),
        }),
      );

      try {
        await fileStore.saveBlob(path, 'add', file);
        dispatch(
          addMessage({
            message: (
              <>
                Added <code>{file.name}</code>
              </>
            ),
            generation: messageGeneration,
            timeout: true,
          }),
        );
        dispatch(listFiles(folderPath)).catch((error) => {
          console.error(error);
          dispatch(
            addMessage({
              message: (
                <>
                  Error listing files <code>{folderPath}</code>
                </>
              ),
              timeout: true,
              generation: messageGeneration,
            }),
          );
        });
      } catch (error) {
        console.error(error);
        dispatch(
          addMessage({
            message: (
              <>
                Error saving <code>{path}</code>
              </>
            ),
            timeout: true,
            generation: messageGeneration,
          }),
        );
      }
    }
  };
}
