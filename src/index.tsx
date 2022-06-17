import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Provider } from 'react-redux';
import { createStore } from './store/create-store';
import * as T from 'src/@types';
import { App } from 'src/components/App';
import { maybeMockGoogleAnalytics } from 'src/utils';

import * as A from 'src/store/actions';
import * as $ from 'src/store/selectors';
import { openDB } from 'src/logic/offline-db';

export * as A from 'src/store/actions';
export * as $ from 'src/store/selectors';
export * as T from 'src/@types';

if (process.env.NODE_ENV !== 'test') {
  init();
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

  await store.dispatch(openDB());
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
  const mountElement = document.createElement('div');
  mountElement.className = 'appRoot';
  const body = document.body;
  if (!body) {
    throw new Error(
      'Attempting to mount the <App> React component but no document body was found.',
    );
  }
  body.appendChild(mountElement);
  ReactDOM.render(createRootApp(store), mountElement);
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
      const registration = await navigator.serviceWorker.register(
        '/service-worker.js',
      );
      console.log('Service worker registered: ', registration);
    } catch (error) {
      console.log('Service worker registration failed:', error);
    }
  });
}
