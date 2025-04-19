import * as T from 'frontend/@types';
import { combineReducers } from 'redux';
import {
  getStringProp,
  getNumberProp,
  getDirName,
  updatePathRoot,
  sluggify,
} from 'frontend/utils';
import { FilesIndex } from 'frontend/logic/files-index';
import { IDBFS } from 'frontend/logic/file-store/indexeddb-fs';
import { toFileStoreName } from 'frontend/logic/app-logic';
import { languageCoachReducer } from './language-coach';

function getDropboxOauth(): T.DropboxOauth | null {
  const oauthString = window.localStorage.getItem('dropboxOauth');
  if (!oauthString) {
    return null;
  }

  let oauthRaw: unknown;
  try {
    oauthRaw = JSON.parse(oauthString);
  } catch (error) {
    console.error(
      'Could not parse the Dropbox oauth data from localStorage',
      error,
    );
    return null;
  }

  const accessToken = getStringProp(oauthRaw, 'accessToken');
  const refreshToken = getStringProp(oauthRaw, 'refreshToken');
  const expires = getNumberProp(oauthRaw, 'expires');

  if (accessToken !== null && refreshToken !== null && expires !== null) {
    return { accessToken, refreshToken, expires };
  }

  console.error(
    'Could not find all of the required Dropbox oauth data from localStorage',
    { accessToken, refreshToken, expires },
  );
  return null;
}

function dropboxOauth(
  state: T.DropboxOauth | null = getDropboxOauth(),
  action: T.Action,
): T.DropboxOauth | null {
  switch (action.type) {
    case 'set-dropbox-oauth':
      return action.oauth;
    case 'remove-dropbox-oauth':
      return null;
    default:
      return state;
  }
}

function getServers(): T.FileStoreServer[] {
  const serversString = window.localStorage.getItem('fileStoreServers');
  if (!serversString) {
    return [];
  }

  let serversUnknown: unknown;
  try {
    serversUnknown = JSON.parse(serversString);
  } catch (error) {
    console.error(
      'Could not parse the file store server data from localStorage',
      error,
    );
    return [];
  }

  const servers: T.FileStoreServer[] = [];
  if (Array.isArray(serversUnknown)) {
    for (const serverUnknown of serversUnknown) {
      const url = getStringProp(serverUnknown, 'url');
      const name = getStringProp(serverUnknown, 'name');
      let id = getStringProp(serverUnknown, 'id');
      if (url && name) {
        if (!id) {
          id = sluggify(name);
        }
        servers.push({ url, name, id });
      }
    }
  }
  return servers;
}

export function serverId(
  state: string | null = window.localStorage.getItem('fileStoreServer') ?? null,
  action: T.Action,
): string | null {
  switch (action.type) {
    case 'change-file-system': {
      const { fileStoreServer } = action;
      if (fileStoreServer) {
        window.localStorage.setItem('fileStoreServer', fileStoreServer.id);
      } else {
        window.localStorage.removeItem('fileStoreServer');
      }
      return action.fileStoreServer?.id ?? null;
    }
    default:
      return state;
  }
}

function servers(
  state: T.FileStoreServer[] = getServers(),
  action: T.Action,
): T.FileStoreServer[] {
  switch (action.type) {
    case 'add-server': {
      const { server } = action;
      const servers = [...state, server];
      window.localStorage.setItem('fileStoreServers', JSON.stringify(servers));
      return servers;
    }
    case 'remove-server': {
      const servers = state.filter(
        (server) =>
          server.url !== action.server.url &&
          server.name !== action.server.name,
      );
      window.localStorage.setItem('fileStoreServers', JSON.stringify(servers));
      return servers;
    }
    case 'update-server': {
      // Ensure the ordering of the updated server stays the same.
      const servers: T.FileStoreServer[] = [];
      const { oldServer, newServer } = action;
      for (const server of state) {
        if (server.name === oldServer.name && server.url === oldServer.url) {
          servers.push(newServer);
        } else {
          servers.push(server);
        }
      }
      window.localStorage.setItem('fileStoreServers', JSON.stringify(servers));
      return servers;
    }
    default:
      return state;
  }
}

function listFileErrors(
  state: Map<string, string> = new Map(),
  action: T.Action,
): Map<string, string> {
  switch (action.type) {
    case 'list-files-received': {
      const { path } = action;
      if (state.has(path)) {
        const newState = new Map(state);
        newState.delete(path);
        return newState;
      }
      return state;
    }
    case 'list-files-error': {
      const { error, path } = action;
      const newState = new Map(state);
      newState.set(path, error);
      return newState;
    }
    case 'change-file-system':
    case 'remove-dropbox-oauth':
    case 'remove-browser-files':
      return new Map();
    default:
      return state;
  }
}

function listFilesCache(
  state: T.ListFilesCache = new Map(),
  action: T.Action,
): T.ListFilesCache {
  switch (action.type) {
    case 'move-file-done': {
      const { oldPath, metadata } = action;

      if (metadata.type === 'folder') {
        const newState: T.ListFilesCache = new Map();
        for (const [path, files] of state) {
          let key = path;
          if (path === oldPath || path.startsWith(oldPath + '/')) {
            key = updatePathRoot(path, oldPath, metadata.path);
          }
          newState.set(
            key,
            files.map((file) => {
              if (file.path === oldPath) {
                return metadata;
              }
              if (file.path.startsWith(oldPath + '/')) {
                return {
                  ...file,
                  path: updatePathRoot(file.path, oldPath, metadata.path),
                };
              }
              return file;
            }),
          );
        }
        return newState;
      }

      // This is a file.
      const newState: T.ListFilesCache = new Map(state);
      const folder = getDirName(metadata.path);
      const files = newState.get(folder);
      if (files) {
        for (let i = 0; i < files.length; i++) {
          const otherMetadata = files[i];
          if (otherMetadata.path === oldPath) {
            const newFiles = files.slice();
            newFiles[i] = metadata;
            newState.set(folder, newFiles);
            return newState;
          }
        }
      }

      return state;
    }
    case 'delete-file-done': {
      const { metadata } = action;
      const newState: T.ListFilesCache = new Map(state);

      const containingFolder = getDirName(metadata.path);
      const listing = state.get(containingFolder);
      if (listing) {
        // Filter out this folder or file.
        newState.set(
          containingFolder,
          listing.filter((file) => file.path !== metadata.path),
        );
      }

      if (metadata.type === 'folder') {
        newState.delete(metadata.path);
        for (const [path] of state) {
          if (path.startsWith(metadata.path + '/')) {
            newState.delete(path);
          }
        }
      }

      return newState;
    }
    case 'list-files-received': {
      const { path, files } = action;
      const newState = new Map(state);
      newState.set(path, files);
      return newState;
    }
    case 'change-file-system':
    case 'clear-api-cache':
    case 'remove-dropbox-oauth':
    case 'remove-browser-files':
      return new Map();
    case 'invalidate-path':
      if (state.has(action.path)) {
        const newState = new Map(state);
        newState.delete(action.path);
        return newState;
      }
      return state;
    default:
      return state;
  }
}

function downloadFileErrors(
  state: Map<string, string> = new Map(),
  action: T.Action,
): Map<string, string> {
  switch (action.type) {
    case 'download-file-received':
    case 'download-blob-received': {
      const { path } = action;
      if (state.has(path)) {
        const newState = new Map(state);
        newState.delete(path);
        return newState;
      }
      return state;
    }
    case 'download-file-error': {
      const { error, path } = action;
      const newState = new Map(state);
      newState.set(path, error);
      return newState;
    }
    case 'change-file-system':
    case 'remove-dropbox-oauth':
    case 'remove-browser-files':
      return new Map();
    default:
      return state;
  }
}

function downloadFileCache(
  state: T.DownloadFileCache = new Map(),
  action: T.Action,
): T.DownloadFileCache {
  switch (action.type) {
    case 'move-file-done': {
      const { oldPath, metadata } = action;
      const file = state.get(oldPath);
      if (file && metadata.type === 'file') {
        // Update the metadata.
        const newState = new Map(state);
        newState.delete(oldPath);
        newState.set(metadata.path, {
          metadata,
          text: file.text,
        });
        return newState;
      }
      if (metadata.type === 'folder') {
        const newState: T.DownloadFileCache = new Map();
        for (const [path, value] of state) {
          if (path.startsWith(oldPath + '/') || path === oldPath) {
            const newPath = updatePathRoot(path, oldPath, metadata.path);
            newState.set(newPath, {
              ...value,
              metadata: {
                ...value.metadata,
                path: newPath,
              },
            });
          } else {
            newState.set(path, value);
          }
        }
        return newState;
      }
      return state;
    }
    case 'delete-file-done': {
      const newState = new Map(state);
      const { metadata } = action;

      newState.delete(metadata.path);

      if (metadata.type === 'folder') {
        for (const [path] of state) {
          if (path.startsWith(metadata.path + '/')) {
            newState.delete(path);
          }
        }
      }

      return newState;
    }
    case 'download-file-received': {
      const newState = new Map(state);
      const { path, file } = action;
      newState.set(path, file);
      return newState;
    }
    case 'change-file-system':
    case 'clear-api-cache':
    case 'remove-dropbox-oauth':
    case 'remove-browser-files':
      return new Map();
    case 'invalidate-path':
      if (state.has(action.path)) {
        const newState = new Map(state);
        newState.delete(action.path);
        return newState;
      }
      return state;
    default:
      return state;
  }
}

function downloadBlobCache(
  state: T.DownloadBlobCache = new Map(),
  action: T.Action,
): T.DownloadBlobCache {
  switch (action.type) {
    case 'move-file-done': {
      const { oldPath, metadata } = action;
      const file = state.get(oldPath);
      if (file && metadata.type === 'file') {
        // Update the metadata.
        state.set(metadata.path, {
          metadata,
          blob: file.blob,
        });
      }
      return state;
    }
    case 'download-blob-received': {
      const newState = new Map(state);
      const { path, blobFile } = action;
      newState.set(path, blobFile);
      return newState;
    }
    case 'change-file-system':
    case 'clear-api-cache':
    case 'remove-dropbox-oauth':
    case 'remove-browser-files':
      return new Map();
    default:
      return state;
  }
}

function path(state = '/', action: T.Action): string {
  switch (action.type) {
    case 'change-active-file':
    case 'view-list-files':
    case 'view-language-coach':
    case 'view-file':
    case 'view-pdf':
    case 'view-image':
    case 'view-markdown':
      return action.path;
    case 'change-file-system':
      return '/';
    default:
      return state;
  }
}

function modifiedTextByPath(
  state = new Map(),
  action: T.Action,
): Map<string, { text: string | null; generation: number; path: string }> {
  switch (action.type) {
    case 'modify-active-file': {
      const path = action.path;
      const newState = new Map(state);
      const oldModifiedText = state.get(path);
      const generation = oldModifiedText?.generation ?? 0;
      newState.set(path, {
        text: action.modifiedText,
        // The textarea needs a signal that the text has been modified by something
        // external, so that it can update the textarea.value.
        generation: action.forceRefresh ? generation + 1 : generation,
      });
      return newState;
    }
    case 'download-file-received': {
      if (!state.has(action.path)) {
        return state;
      }
      const newState = new Map(state);
      newState.delete(action.path);
      return newState;
    }
    default:
      return state;
  }
}

function view(state: T.View | null = null, action: T.Action): T.View | null {
  switch (action.type) {
    case 'change-active-file':
      return 'view-file';
    case 'change-file-system':
    case 'view-list-files':
      return 'list-files';
    case 'view-file':
      return 'view-file';
    case 'view-language-coach':
      return 'language-coach';
    case 'view-pdf':
      return 'view-pdf';
    case 'view-image':
      return 'view-image';
    case 'view-markdown':
      return 'view-markdown';
    case 'view-settings':
      return 'settings';
    case 'view-file-storage':
      return 'file-storage';
    case 'view-privacy':
      return 'privacy';
    default:
      return state;
  }
}

function hideEditor(
  state: boolean = localStorage.getItem('appHideEditor') !== 'false',
  action: T.Action,
): boolean {
  switch (action.type) {
    case 'hide-editor':
      localStorage.setItem('appHideEditor', action.flag.toString());
      return action.flag;
    default:
      return state;
  }
}

function messages(state: T.Message[] = [], action: T.Action): T.Message[] {
  switch (action.type) {
    case 'add-message':
      return [
        ...state.filter((message) => message.generation !== action.generation),
        {
          message: action.message,
          generation: action.generation,
        },
      ];
    case 'dismiss-message':
      return state.filter(
        (message) => message.generation !== action.generation,
      );
    case 'dismiss-all-messages':
      return [];
    default:
      return state;
  }
}

function isDraggingSplitter(state = false, action: T.Action): boolean {
  if (action.type === 'dragging-splitter') {
    return action.isDragging;
  }
  return state;
}

function shouldHideHeader(state: boolean = false, action: T.Action): boolean {
  switch (action.type) {
    case 'should-hide-header':
      return action.hide;
    default:
      return state;
  }
}

/**
 * Remember the previously viewed file system name.
 */
function getSavedFSName() {
  return (
    toFileStoreName(window.localStorage.getItem('fileStoreName')) ?? 'browser'
  );
}

function currentFileStoreName(
  state: T.FileStoreName = getSavedFSName(),
  action: T.Action,
): T.FileStoreName {
  switch (action.type) {
    case 'change-file-system': {
      const { fileStoreName } = action;
      window.localStorage.setItem('fileStoreName', fileStoreName);
      return fileStoreName;
    }
    case 'view-list-files':
      return action.fileStoreName;
    default:
      return state;
  }
}

/**
 * Adjust the capo or transpose a song.
 */
export function songKeySettings(
  state: Map<string, T.SongKeySettings> = new Map(),
  action: T.Action,
): Map<string, T.SongKeySettings> {
  switch (action.type) {
    case 'apply-capo': {
      const { path, capo } = action;
      const newKeys = new Map(state);
      newKeys.set(path, { type: 'capo', capo });
      return newKeys;
    }
    case 'transpose-key': {
      const { path, songKey } = action;
      const newKeys = new Map(state);
      newKeys.set(path, { type: 'transpose', songKey });
      return newKeys;
    }
    case 'remove-key-settings': {
      const { path } = action;
      const newKeys = new Map(state);
      newKeys.delete(path);
      return newKeys;
    }
    default:
      return state;
  }
}

function renameFile(
  state: T.RenameFileState = { phase: 'none', path: null },
  action: T.Action,
): T.RenameFileState {
  switch (action.type) {
    case 'start-rename-file':
      return { phase: 'editing', path: action.path };
    case 'move-file-requested':
      return { phase: 'sending', path: action.path };
    case 'stop-rename-file':
    case 'move-file-done':
      return { phase: 'none', path: null };
    default:
      return state;
  }
}

function filesIndex(
  state: FilesIndex | null = null,
  action: T.Action,
): FilesIndex | null {
  switch (action.type) {
    case 'files-index-received':
      return action.filesIndex;
    default:
      return state;
  }
}

function searchString(state = '', action: T.Action) {
  switch (action.type) {
    case 'set-search-string':
      return action.search;
    default:
      return state;
  }
}

function idbfs(state: IDBFS | null = null, action: T.Action): IDBFS | null {
  switch (action.type) {
    case 'connect-idbfs':
      return action.idbfs;
    case 'remove-browser-files':
      return null;
    default:
      return state;
  }
}

function openAIApiKey(
  state: string | null = localStorage.getItem('openAIAPIKey'),
  action: T.Action,
): string | null {
  switch (action.type) {
    case 'set-open-ai-api-key':
      return action.apiKey;
    default:
      return state;
  }
}

export const reducers = combineReducers({
  currentFileStoreName,
  downloadBlobCache,
  downloadFileCache,
  downloadFileErrors,
  dropboxOauth,
  filesIndex,
  serverId,
  servers,
  hideEditor,
  idbfs,
  isDraggingSplitter,
  languageCoach: languageCoachReducer,
  listFileErrors,
  listFilesCache,
  messages,
  modifiedTextByPath,
  path,
  renameFile,
  searchString,
  shouldHideHeader,
  songKeySettings,
  view,
  openAIApiKey,
});

function wrapReducer<S>(
  reducer: T.Reducer<S>,
  fn: (state: S, action: T.Action) => S,
): T.Reducer<S> {
  return (state, action) => {
    const nextState = reducer(state, action);
    return fn(nextState, action);
  };
}

export type State = ReturnType<typeof reducers>;

export const mainReducer: T.Reducer<State> = wrapReducer(
  reducers,
  (state, action) => {
    state.filesIndex?.reducer(state, action);
    return state;
  },
);
