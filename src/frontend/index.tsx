import * as React from 'react';
import { Provider, useSelector } from 'react-redux';
import { createRoot } from 'react-dom/client';
import * as T from 'frontend/@types';
import { App } from 'frontend/components/App';
import { WorkerClient } from 'frontend/worker/client';
import { ensureExists, maybeMockGoogleAnalytics } from 'frontend/utils';
import { createStore } from './store/create-store';

import * as A from 'frontend/store/actions';
import * as $ from 'frontend/store/selectors/index';
import {
  BROWSER_FILES_DB_NAME,
  openIDBFS,
} from './logic/file-store/indexeddb-fs';
import { WorkerServer } from './worker/server';

export * as A from 'frontend/store/actions';
export * as $ from 'frontend/store/selectors/index';
export * as T from 'frontend/@types';
export * as Hooks from 'frontend/hooks';

type HookedSelectors = {
  [FnName in keyof typeof $]: () => ReturnType<(typeof $)[FnName]>;
};

/**
 * Exports all of the selectors as hooks that can be used directly inside of
 * a React component.
 *
 * e.g. instead of:
 *
 * const view = Hooks.useSelector($.getView);
 *
 * Write:
 *
 * const view = $$.getView();
 */
export const $$: HookedSelectors = {} as any;
for (const [name, fn] of Object.entries($)) {
  ($$ as any)[name] = () => useSelector(fn as any);
}

if (isWorkerContext()) {
  new WorkerServer();
} else if (process.env.NODE_ENV !== 'test') {
  // This script has been loaded in a real browser, trigger the initialization
  // of the frontent.
  document.addEventListener('DOMContentLoaded', () => {
    initializeFrontend().catch((error) => {
      console.error('Error during initialization', error);
    });
  });
}

export async function initializeFrontend(): Promise<void> {
  maybeMockGoogleAnalytics();
  initServiceWorker();

  const store = createStore();

  validateFileStoreSelection(store);
  const workerClient = initSharedWorker();
  console.log(`!!! workerClient`, workerClient);

  // Expose the $$ as a global for the webconsole.
  const $$ = {};
  for (const [name, fn] of Object.entries($)) {
    ($$ as any)[name] = () => (fn as any)(store.getState());
  }

  // Expose a bunch of useful features to the window object for use in DevTools.
  Object.assign(window as any, {
    store,
    dispatch: store.dispatch,
    getState: store.getState,
    $,
    $$,
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

function initSharedWorker(): WorkerClient | null {
  if (typeof SharedWorker === 'undefined') {
    // SharedWorker isn't supported on some systems like Chrome Android.
    // https://developer.mozilla.org/en-US/docs/Web/API/SharedWorker#browser_compatibility
    return null;
  }
  const client = new WorkerClient();
  client.ping();
  return client;
}

function isWorkerContext(): boolean {
  return typeof document === 'undefined' && typeof self !== 'undefined';
}

function initServiceWorker() {
  if (
    process.env.NODE_ENV === 'development' ||
    process.env.NODE_ENV === 'test'
  ) {
    return;
  }
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

/**
 * Since the file stores come from localStorage, do some extra validation after
 * the initial state load.
 */
function validateFileStoreSelection({ getState, dispatch }: T.Store) {
  const serverId = $.getServerId(getState());
  const fileStoreName = $.getCurrentFileStoreName(getState());
  if (fileStoreName === 'server') {
    const servers = $.getServers(getState());
    if (servers.find((server) => server.id === serverId)) {
      return;
    }
    dispatch(A.changeFileStore('browser'));
    if (serverId) {
      alert(
        'An invalid file store server was found, switching to browser storage' +
          serverId,
      );
    }
    return;
  }
  if (serverId) {
    console.error('A dangling serverId was found.');
    dispatch(A.changeFileStore(fileStoreName));
  }
}
