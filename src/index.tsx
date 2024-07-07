import * as React from 'react';
import { Provider } from 'react-redux';
import { createStore } from './store/create-store';
import * as T from 'src/@types';
import { App } from 'src/components/App';
import { ensureExists, maybeMockGoogleAnalytics } from 'src/utils';
import { createRoot } from 'react-dom/client';

import * as A from 'src/store/actions';
import * as $ from 'src/store/selectors/index';
import {
  BROWSER_FILES_DB_NAME,
  openIDBFS,
} from './logic/file-system/indexeddb-fs';

export * as A from 'src/store/actions';
export * as $ from 'src/store/selectors/index';
export * as T from 'src/@types';
export * as Hooks from 'src/hooks';

if (process.env.NODE_ENV !== 'test') {
  document.addEventListener('DOMContentLoaded', () => {
    init().catch((error) => {
      console.error('Error during initialization', error);
    });
  });
}

export async function init(): Promise<void> {
  maybeMockGoogleAnalytics();
  initServiceWorker();

  const store = createStore();

  Object.assign(window as any, {
    store,
    dispatch: store.dispatch,
    getState: store.getState,
    $,
    A,
    expireOauth() {
      const oauth = $.getDropboxOauth(store.getState());
      if (!oauth) {
        return;
      }
      store.dispatch(
        A.setDropboxAccessToken(oauth.accessToken, 0, oauth.refreshToken),
      );
    },
  });

  const cachePromise = $.getCurrentFSOrNull(store.getState())?.cachePromise;
  if (cachePromise) {
    await cachePromise;
  }
  const ipdbfs = await openIDBFS(BROWSER_FILES_DB_NAME);
  store.dispatch(A.connectIDBFS(ipdbfs));

  mountReact(store);
}

export function createRootApp(store: T.Store): JSX.Element {
  return (
    <Provider store={store as any}>
      <App key="app" />
    </Provider>
  );
}

function mountReact(store: T.Store): void {
  const mountElement = ensureExists(
    document.querySelector('.appRoot'),
    'Could not find the app root',
  );
  const root = createRoot(mountElement);
  root.render(createRootApp(store));
}

function initServiceWorker() {
  if (
    process.env.NODE_ENV === 'development' ||
    process.env.NODE_ENV === 'test'
  ) {
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  window.addEventListener('load', async () => {
    try {
      const registration =
        await navigator.serviceWorker.register('/service-worker.js');
      console.log('Service worker registered: ', registration);
    } catch (error) {
      console.log('Service worker registration failed:', error);
    }
  });
}
