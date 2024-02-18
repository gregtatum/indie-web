import { Thunk } from 'src/@types';
import * as React from 'react';
import { $, T } from 'src';
import {
  canonicalizePath,
  downloadBlobForUser,
  dropboxErrorMessage,
  ensureExists,
  getDirName,
  getGeneration,
  getPathFileName,
  insertTextAtLine,
} from 'src/utils';
import * as Plain from './plain';
import { FilesIndex, tryUpgradeIndexJSON } from 'src/logic/files-index';
import { FileSystemError } from 'src/logic/file-system';
import { IDBError } from 'src/logic/file-system/indexeddb-fs';

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
  // See PlainActions in src/@types/index.ts for details on this next line.
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

  export function deleteFileDone(metadata: T.FileMetadata | T.FolderMetadata) {
    return { type: 'delete-file-done' as const, metadata };
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

  export function changeListFileActive(path: string, index: number) {
    return { type: 'change-list-file-active' as const, path, index };
  }
}

export function listFiles(path = ''): Thunk<Promise<void>> {
  return async (dispatch, getState) => {
    let dropboxPath = path;
    if (path === '/') {
      // Dropbox doesn't like the root `/`.
      dropboxPath = '';
    }
    const fileSystem = $.getCurrentFS(getState());

    dispatch(PlainInternal.listFilesRequested(path));

    if (fileSystem.cache) {
      try {
        const offlineListing = await fileSystem.cache.listFiles(path);
        if (offlineListing) {
          dispatch(PlainInternal.listFilesReceived(path, offlineListing));
        }
      } catch (error) {
        (error as IDBError)?.cacheLog();
      }
    }

    try {
      const files = await fileSystem.listFiles(dropboxPath);
      dispatch(PlainInternal.listFilesReceived(path, files));
    } catch (response) {
      dispatch(PlainInternal.listFilesError(path, String(response)));
    }
  };
}

export function changeListFilesActive(direction: 1 | -1): Thunk<void> {
  return (dispatch, getState) => {
    const listFilesActive = $.getListFilesActive(getState());
    let index = -1;
    const path = $.getPath(getState());
    if (listFilesActive?.path === path) {
      index = listFilesActive.index;
    }
    const files = $.getSearchFilteredFiles(getState());
    if (!files) {
      return;
    }
    if (index === null) {
      index = 0;
    } else {
      index += direction;
    }
    index = (index + files.length) % files.length;
    dispatch(PlainInternal.changeListFileActive(path, index));
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
    const fileSystem = $.getCurrentFS(getState());

    if (fileSystem.cache) {
      try {
        cachedFile = await fileSystem.cache.loadText(path);
        handleFile(cachedFile);
      } catch (error) {
        (error as IDBError)?.cacheLog();
      }
    }

    // Kick off the request, even if an offline version was found.
    try {
      const { text, metadata } = await fileSystem.loadText(path);
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
          (error as FileSystemError).toString(),
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

    const fileSystem = $.getCurrentFS(getState());
    if (fileSystem.cache) {
      try {
        handleBlob(await fileSystem.cache.loadBlob(path));
      } catch (error) {
        console.error('Error with indexeddb', error);
      }
    }

    try {
      handleBlob(await fileSystem.loadBlob(path));
    } catch (error) {
      dispatch(
        PlainInternal.downloadFileError(path, dropboxErrorMessage(error)),
      );
    }
  };
}

export function saveTextFile(path: string, text: string): Thunk<Promise<void>> {
  return async (dispatch, getState) => {
    const fileSystem = $.getCurrentFS(getState());

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
      const metadata = await fileSystem.saveText(path, 'overwrite', text);
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
      throw new Error('Unable to save the file with Dropbox.');
    }
  };
}

export function moveFile(
  fromPath: string,
  toPath: string,
): Thunk<Promise<void>> {
  return async (dispatch, getState) => {
    toPath = canonicalizePath(toPath);
    const fileSystem = $.getCurrentFS(getState());
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
      const metadata = await fileSystem.move(fromPath, toPath);

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
      throw new Error('Unable to save the file with Dropbox.');
    }
  };
}

interface MessageArgs {
  message: React.ReactNode;
  // A unique generation number to identify a message, useful if
  // the message needs dismissing or can be replaced.
  generation?: number;
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
    const fileSystem = $.getCurrentFS(getState());
    const fileSystemName = $.getCurrentFileSystemName(getState());
    let hasFailure = hasFailureMap.get(fileSystemName);
    const setFailure = (error: any) => {
      hasFailure = true;
      hasFailureMap.set(fileSystemName, true);
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
        await fileSystem.saveText('/' + file, 'add', contents);
        const files = await fileSystem.listFiles('/');
        if (files.length === 0) {
          setFailure(new Error('Failed to create files in the FileSystem'));
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

    await $.getCurrentFS(getState())
      .delete(file.path)
      .then(
        () => {
          dispatch(PlainInternal.deleteFileDone(file));

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

    const fileSystem = $.getCurrentFS(getState());

    async function attemptRecreateFile(
      message: string,
    ): Promise<FilesIndex | null> {
      if (!isSecondAttempt && confirm(message)) {
        try {
          await fileSystem.delete(FilesIndex.path);
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
      const response = await fileSystem.loadText(FilesIndex.path);
      text = response.text;
    } catch (error: any) {
      if ((error as FileSystemError)?.isNotFound?.()) {
        const filesIndex = new FilesIndex(fileSystem, getState());
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
      fileSystem,
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
    const fileSystem = $.getCurrentFS(getState());
    const path = `${folder}/assets/${fileName}`;

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
      const metadata = await fileSystem.saveBlob(path, 'add', contents);

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
              {(error as FileSystemError)?.toString()}
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
