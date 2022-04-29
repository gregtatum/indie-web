import { Action, Thunk } from 'src/@types';
import * as React from 'react';
import * as $ from 'src/store/selectors';
import * as T from 'src/@types';
import type { files } from 'dropbox';
import { getGeneration } from 'src/utils';
import NoSleep from 'nosleep.js';

const DEFAULT_MESSAGE_DELAY = 3000;

export function setDropboxAccessToken(token: string): Action {
  window.localStorage.setItem('dropboxAccessToken', token);
  return { type: 'set-dropbox-access-token', token };
}

export function removeDropboxAccessToken(): Action {
  window.localStorage.removeItem('dropboxAccessToken');
  return { type: 'remove-dropbox-access-token' };
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
      .catch((error) => {
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
          error:
            error?.message ??
            error?.toString() ??
            'There was a Dropbox API error',
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
      .then(async (response) => {
        const file = response.result as T.DownloadFileResponse;
        const value: T.DownloadedTextFile = {};
        try {
          value.text = await file.fileBlob.text();
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
      .catch((error) => {
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
          error:
            error?.message ??
            error?.toString() ??
            'There was a Dropbox API error',
        };
        dispatch(action);
      });
  };
}

export function clearApiCache(): Action {
  return { type: 'clear-api-cache' };
}

export function changeActiveFile(value: string): Action {
  return { type: 'change-active-file', value };
}

export function modifyActiveFile(value: string): Action {
  return { type: 'modify-active-file', value };
}

export function changeView(value: T.View): Action {
  return { type: 'change-view', value };
}

export function saveFile(
  path: string,
  contents: string,
  originalFileRequest: T.APICalls.DownloadFile,
): Thunk {
  return async (dispatch, getState) => {
    const dropbox = $.getDropbox(getState());
    const messageGeneration = dispatch(
      addMessage({
        message: (
          <>
            Saving <code>{path}</code>
          </>
        ),
      }),
    );
    return dropbox
      .filesUpload({
        path,
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
                  Saved <code>{path}</code>
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
                  Unable to save <code>{path}</code>
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
    dispatch({
      type: 'add-message',
      message,
      generation,
    });
    if (timeout) {
      setTimeout(
        () => {
          dispatch(dismissMessage(generation));
        },
        typeof timeout === 'number' ? timeout : DEFAULT_MESSAGE_DELAY,
      );
    }
    return generation;
  };
}

export function dismissMessage(generation: number): T.Action {
  return {
    type: 'dismiss-message',
    generation,
  };
}

export function dismissAllMessages(): Thunk {
  return (dispatch, getState) => {
    const messages = $.getMessages(getState());
    if (messages.length > 0) {
      dispatch({
        type: 'dismiss-all-messages',
      });
    }
  };
}

export function hideEditor(flag: boolean): Action {
  return {
    type: 'hide-editor',
    flag,
  };
}

let _noSleep: NoSleep | undefined;
export function keepAwake(flag: boolean): Thunk {
  return (dispatch) => {
    if (!_noSleep) {
      _noSleep = new NoSleep();
    }
    if (flag === _noSleep.isEnabled) {
      return;
    }
    if (flag) {
      _noSleep.enable();
    } else {
      _noSleep.disable();
    }
    dispatch({ type: 'keep-awake', flag });
  };
}
