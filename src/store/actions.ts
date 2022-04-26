import { Action, Thunk } from 'src/@types';
import * as $ from 'src/store/selectors';
import * as T from 'src/@types';
import type { files } from 'dropbox';
import { getGeneration } from 'src/utils';

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

export function changeView(value: T.View): Action {
  return { type: 'change-view', value };
}
