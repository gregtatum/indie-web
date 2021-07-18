import {
  createStore as reduxCreateStore,
  combineReducers,
  applyMiddleware,
  Middleware,
} from 'redux';
import thunk from 'redux-thunk';
import { reducers } from 'src/reducers';
import { Store, Action } from 'src/@types';

/**
 * Create a more minimalist action logger.
 */
export const logger =
  (store: Store) => (next: (action: Action) => any) => (action: Action) => {
    const style = 'font-weight: bold; color: #fa0';
    const prevState = store.getState();
    const result = next(action);
    const nextState = store.getState();
    console.log(`[action] %c${action.type}`, style, {
      action,
      prevState,
      nextState,
      stack: (new Error().stack || '(no stack)').split('\n'),
    });
    return result;
  };

/**
 * Isolate the store creation into a function, so that it can be used outside of the
 * app's execution context, e.g. for testing.
 */
export function createStore(): Store {
  const middlewares: Middleware[] = [thunk];

  if (process.env.NODE_ENV === 'development') {
    middlewares.push(logger as any);
  }
  const store = reduxCreateStore(
    combineReducers(reducers),
    applyMiddleware(...middlewares),
  );

  return store as any;
}
