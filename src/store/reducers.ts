import * as T from 'src/@types';
import { combineReducers } from 'redux';

function getDropboxAccessTokenLocalStorage(): string | null {
  const token = window.localStorage.getItem('dropboxAccessToken');
  if (token) {
    return token;
  }
  return null;
}

function dropboxAccessToken(
  state: string | null = getDropboxAccessTokenLocalStorage(),
  action: T.Action,
): string | null {
  switch (action.type) {
    case 'set-dropbox-access-token':
      return action.token;
    case 'remove-dropbox-access-token':
      return null;
    default:
      return state;
  }
}

function listFilesCache(
  state: T.ListFilesCache = new Map(),
  action: T.Action,
): T.ListFilesCache {
  switch (action.type) {
    case 'list-files-requested': {
      const newState = new Map(state);
      newState.set(action.args.path, action);
      return newState;
    }
    case 'list-files-received':
    case 'list-files-failed': {
      const newState = new Map(state);
      const cache = state.get(action.args.path);
      if (cache) {
        if (cache.generation > action.generation) {
          return state; // The request is stale.
        }
      }
      newState.set(action.args.path, action);
      return newState;
    }
    case 'clear-api-cache':
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
    case 'download-file-requested': {
      const newState = new Map(state);
      newState.set(action.args.path, action);
      return newState;
    }
    case 'download-file-received':
    case 'download-file-failed': {
      const newState = new Map(state);
      const cache = state.get(action.args.path);
      if (cache) {
        if (cache.generation > action.generation) {
          return state; // The request is stale.
        }
      }
      newState.set(action.args.path, action);
      return newState;
    }
    case 'clear-api-cache':
      return new Map();
    default:
      return state;
  }
}

function activeFile(state = '', action: T.Action): string {
  switch (action.type) {
    case 'change-active-file':
      return action.value;
    default:
      return state;
  }
}

function modifiedText(state = '', action: T.Action): string {
  switch (action.type) {
    case 'modify-active-file':
      return action.value;
    default:
      return state;
  }
}

function view(state: T.View = 'link-dropbox', action: T.Action): T.View {
  switch (action.type) {
    case 'change-active-file':
      return 'view-file';
    case 'change-view':
      return action.value;
    default:
      return state;
  }
}

export const app = combineReducers({
  dropboxAccessToken,
  listFilesCache,
  downloadFileCache,
  activeFile,
  view,
  modifiedText,
});
export type AppState = ReturnType<typeof app>;

export const reducers = { app };
export type State = {
  app: AppState;
};
