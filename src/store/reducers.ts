import * as T from 'src/@types';
import { combineReducers } from 'redux';
import { getStringProp, getNumberProp } from 'src/utils';

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
    default:
      return state;
  }
}

function listFilesCache(
  state: T.ListFilesCache = new Map(),
  action: T.Action,
): T.ListFilesCache {
  switch (action.type) {
    case 'list-files-received': {
      const { path, files } = action;
      const newState = new Map(state);
      newState.set(path, files);
      return newState;
    }
    case 'clear-api-cache':
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
    default:
      return state;
  }
}

function downloadFileCache(
  state: T.DownloadFileCache = new Map(),
  action: T.Action,
): T.DownloadFileCache {
  switch (action.type) {
    case 'download-file-received': {
      const newState = new Map(state);
      const { path, file } = action;
      newState.set(path, file);
      return newState;
    }
    case 'clear-api-cache':
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
    case 'download-blob-received': {
      const newState = new Map(state);
      const { path, blobFile } = action;
      newState.set(path, blobFile);
      return newState;
    }

    case 'clear-api-cache':
      return new Map();
    default:
      return state;
  }
}

function path(state = '/', action: T.Action): string {
  switch (action.type) {
    case 'change-active-file':
    case 'view-list-files':
    case 'view-file':
    case 'view-pdf':
    case 'view-image':
      return action.path;
    default:
      return state;
  }
}

function modifiedText(state = '', action: T.Action): string {
  switch (action.type) {
    case 'modify-active-file':
      return action.modifiedText;
    case 'download-file-received':
      return '';
    default:
      return state;
  }
}

function view(state: T.View | null = null, action: T.Action): T.View | null {
  switch (action.type) {
    case 'change-active-file':
      return 'view-file';
    case 'view-list-files':
      return 'list-files';
    case 'view-file':
      return 'view-file';
    case 'view-pdf':
      return 'view-pdf';
    case 'view-image':
      return 'view-image';
    case 'view-settings':
      return 'settings';
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

function offlineDB(
  state: T.OfflineDBState = { phase: 'connecting', db: null },
  action: T.Action,
): T.OfflineDBState {
  switch (action.type) {
    case 'disconnect-offline-db':
      return { phase: 'disconnected', db: null };
    case 'connect-offline-db':
      return { phase: 'connected', db: action.db };
    default:
      return state;
  }
}

function shouldHideHeader(state: boolean = false, action: T.Action): boolean {
  switch (action.type) {
    case 'should-hide-header':
      return action.hide;
    default:
      return state;
  }
}

function fileMenu(
  state: T.ClickedFileMenu | null = null,
  action: T.Action,
): T.ClickedFileMenu | null {
  switch (action.type) {
    case 'view-file-menu':
      return action.clickedFileMenu;
    case 'dismiss-file-menu':
      return null;
      break;
    default:
      return state;
  }
}

export const app = combineReducers({
  dropboxOauth,
  listFilesCache,
  listFileErrors,
  downloadFileCache,
  downloadFileErrors,
  downloadBlobCache,
  path,
  view,
  modifiedText,
  messages,
  hideEditor,
  isDraggingSplitter,
  offlineDB,
  shouldHideHeader,
  fileMenu,
});

export type AppState = ReturnType<typeof app>;

export const reducers = { app };
export type State = {
  app: AppState;
};
