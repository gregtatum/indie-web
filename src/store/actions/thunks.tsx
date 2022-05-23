import { Thunk } from 'src/@types';
import * as React from 'react';
import { $, T } from 'src';
import { dropboxErrorMessage, getGeneration } from 'src/utils';
import type { files } from 'dropbox';
import * as Plain from './plain';

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
  | T.APICalls.ListFiles
  | T.APICalls.DownloadFile
  | T.APICalls.DownloadBlob
  // See PlainActions in src/@types/index.ts for details on this next line.
  | T.Values<{
      [FnName in keyof typeof PlainInternal]: ReturnType<
        typeof PlainInternal[FnName]
      >;
    }>;

/**
 * These should only be used internally in thunks.
 */
namespace PlainInternal {
  export function addMessage(message: React.ReactNode, generation: number) {
    return { type: 'add-message' as const, message, generation };
  }

  export function dismissAllMessages() {
    return { type: 'dismiss-all-messages' as const };
  }
}

export function listFiles(path = ''): Thunk {
  return (dispatch, getState) => {
    let dropboxPath = path;
    if (path === '/') {
      // Dropbox doesn't like the root `/`.
      dropboxPath = '';
    }
    const generation = getGeneration();
    const args = { path };
    dispatch({ type: 'list-files-requested', generation, args });
    $.getDropbox(getState())
      .filesListFolder({ path: dropboxPath })
      .then((response) => {
        const value: Array<
          files.FileMetadataReference | files.FolderMetadataReference
        > = [];
        for (const entry of response.result.entries) {
          if (entry['.tag'] === 'file' || entry['.tag'] === 'folder') {
            value.push(entry);
          }
        }
        value.sort((a, b) => {
          // Sort folders first
          if (a['.tag'] === 'file' && b['.tag'] === 'folder') {
            return 1;
          }
          if (b['.tag'] === 'file' && a['.tag'] === 'folder') {
            return -1;
          }
          // Sort by file name second.
          return a.name.localeCompare(b.name);
        });
        dispatch({
          type: 'list-files-received',
          generation,
          args,
          value,
        });
      })
      .catch((response) => {
        const cache = $.getListFilesCache(getState()).get(path);

        dispatch({
          type: 'list-files-failed',
          generation,
          args,
          value:
            cache?.type === 'list-files-received' ||
            cache?.type === 'list-files-failed'
              ? cache.value
              : undefined,
          error: dropboxErrorMessage(response),
        });
      });
  };
}

export function downloadFile(path: string): Thunk {
  return (dispatch, getState) => {
    const generation = getGeneration();
    const args = { path };
    dispatch({ type: 'download-file-requested', generation, args });
    $.getDropbox(getState())
      .filesDownload({ path })
      .then(async ({ result }) => {
        const { fileBlob } = result as T.DownloadFileResponse;
        // The file blob was left off of this type.
        delete (result as any).fileBlob;
        const value: T.DownloadedTextFile = {};
        value.metadata = result;
        try {
          value.text = await fileBlob.text();
        } catch (error) {
          value.error = error;
        }
        const action: T.Action = {
          type: 'download-file-received',
          generation,
          args,
          value,
        };
        dispatch(action);
      })
      .catch((response) => {
        let error;
        if (response?.error?.error?.path['.tag'] === 'not_found') {
          error = 'The file does not exist. ' + path;
        } else {
          error = dropboxErrorMessage(response);
        }
        const cache = $.getDownloadFileCache(getState()).get(path);
        const action: T.Action = {
          type: 'download-file-failed',
          generation,
          args,
          value:
            cache?.type === 'download-file-received' ||
            cache?.type === 'download-file-failed'
              ? cache.value
              : undefined,
          error,
        };
        dispatch(action);
      });
  };
}

export function downloadBlob(path: string): Thunk {
  return (dispatch, getState) => {
    const generation = getGeneration();
    const args = { path };
    dispatch({ type: 'download-blob-requested', generation, args });
    $.getDropbox(getState())
      .filesDownload({ path })
      .then(async (response) => {
        const file = response.result as T.DownloadFileResponse;
        const value: T.DownloadedBlob = {};
        try {
          value.fileBlob = file.fileBlob;
        } catch (error) {
          value.error = error;
        }
        const action: T.Action = {
          type: 'download-blob-received',
          generation,
          args,
          value,
        };
        dispatch(action);
      })
      .catch((error) => {
        const cache = $.getDownloadFileCache(getState()).get(path);
        const action: T.Action = {
          type: 'download-blob-failed',
          generation,
          args,
          value:
            cache?.type === 'download-file-received' ||
            cache?.type === 'download-file-failed'
              ? cache.value
              : undefined,
          error:
            error?.message ??
            error?.toString() ??
            'There was a Dropbox API error',
        };
        dispatch(action);
      });
  };
}

export function saveFile(
  pathLowercase: string,
  contents: string,
  originalFileRequest: T.APICalls.DownloadFile,
): Thunk {
  return async (dispatch, getState) => {
    const dropbox = $.getDropbox(getState());
    if (originalFileRequest.type === 'download-file-requested') {
      throw new Error('Logic error, the download file is being requested');
    }
    const savePath =
      originalFileRequest.value?.metadata?.path_display ?? pathLowercase;

    const messageGeneration = dispatch(
      addMessage({
        message: (
          <>
            Saving <code>{savePath}</code>
          </>
        ),
      }),
    );
    return dropbox
      .filesUpload({
        path: savePath,
        contents,
        mode: {
          '.tag': 'overwrite',
        },
      })
      .then(
        () => {
          dispatch({
            type: 'download-file-received',
            generation: originalFileRequest.generation,
            args: originalFileRequest.args,
            value: {
              text: contents,
            },
          });
          dispatch(
            addMessage({
              message: (
                <>
                  Saved <code>{savePath}</code>
                </>
              ),
              generation: messageGeneration,
              timeout: true,
            }),
          );
        },
        (error) => {
          dispatch(
            addMessage({
              message: (
                <>
                  Unable to save <code>{savePath}</code>
                </>
              ),
              generation: messageGeneration,
            }),
          );
          console.error(error);
          return Promise.reject(
            new Error('Unable to save the file with Dropbox.'),
          );
        },
      );
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

export function createInitialFiles(): Thunk<Promise<void>> {
  return async (dispatch, getState) => {
    const dropbox = $.getDropbox(getState());
    const files = ['Getting started.chopro'];
    let hasFailure = false;
    let dropboxError: string = '';

    for (const file of files) {
      // Load the file locally first.
      let contents: string;
      try {
        const response = await fetch('/guide/' + file);
        contents = await response.text();
      } catch (error) {
        hasFailure = true;
        console.error(error);
        continue;
      }

      // Upload it Dropbox.
      try {
        await dropbox.filesUpload({
          path: '/' + file,
          contents,
          mode: { '.tag': 'add' },
        });
      } catch (error) {
        console.error(error);
        hasFailure = true;
        dropboxError = dropboxErrorMessage(error);
      }
    }
    if (hasFailure) {
      dispatch(
        addMessage({
          message: `Could not create the initial demo files. ${dropboxError}`,
        }),
      );
    }
    dispatch(Plain.invalidatePath('/'));
  };
}
