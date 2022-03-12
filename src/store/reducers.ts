import * as T from 'src/@types';
import { combineReducers } from 'redux';

function init(state = false, action: T.Action): boolean {
  switch (action.type) {
    case 'init':
      return true;
    default:
      return state;
  }
}

export const app = combineReducers({ init });
export type AppState = ReturnType<typeof app>;

export const reducers = { app };
export type State = {
  app: AppState;
};
