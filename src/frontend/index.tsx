import * as React from 'react';
import { Provider, useSelector } from 'react-redux';
import { createStore } from './store/create-store';
import * as T from 'frontend/@types';
import { App } from 'frontend/components/App';
import { ensureExists, maybeMockGoogleAnalytics } from 'frontend/utils';
import { createRoot } from 'react-dom/client';

import * as A from 'frontend/store/actions';
import * as $ from 'frontend/store/selectors/index';
import {
  BROWSER_FILES_DB_NAME,
  openIDBFS,
} from './logic/file-system/indexeddb-fs';

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

  // Expose the $$ as a global for the webconsole.
  const $$ = {};
  for (const [name, fn] of Object.entries($)) {
    ($$ as any)[name] = () => (fn as any)(store.getState());
  }

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
