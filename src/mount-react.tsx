import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Provider, useSelector } from 'react-redux';
import { createStore } from 'src/create-store';
import * as A from 'src/actions';
import * as T from 'src/@types';
import * as $ from 'src/selectors';

export function init(): void {
  mockGoogleAnalytics();

  const store = createStore();
  store.dispatch(A.init());
  Object.assign(window as any, { store });
  mountReact(store);
}

export function createRootApp(store: T.Store): JSX.Element {
  return (
    <Provider store={store as any}>
      <App />
    </Provider>
  );
}

function mountReact(store: T.Store): void {
  const mountElement = document.createElement('div');
  mountElement.className = 'AppRoot';
  const body = document.body;
  if (!body) {
    throw new Error(
      'Attempting to mount the <App> React component but no document body was found.',
    );
  }
  body.appendChild(mountElement);
  ReactDOM.render(createRootApp(store), mountElement);
}

/**
 * Mock out Google Analytics for anything that's not production so that we have run-time
 * code coverage in development and testing.
 */
function mockGoogleAnalytics() {
  if (process.env.NODE_ENV === 'development') {
    (window as any).ga = (event: any, ...payload: any[]) => {
      const style = 'color: #FF6D00; font-weight: bold';
      console.log(`[analytics] %c"${event}"`, style, ...payload);
    };
  } else if (process.env.NODE_ENV !== 'production') {
    (window as any).ga = () => {};
  }
}

function App() {
  const isInit = useSelector($.getInit);
  if (!isInit) {
    throw new Error('Expected store to be init.');
  }
  return <h1>React is loaded</h1>;
}
