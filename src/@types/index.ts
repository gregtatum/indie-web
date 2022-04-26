import { State } from 'src/store/reducers';

/**
 * Re-exports.
 */
export { AppState, State } from 'src/store/reducers';
export * from './app';
import * as App from './app';

export type APIAction<Type extends string, Args, T> =
  | { type: `${Type}-requested`; generation: number; args: Args }
  | { type: `${Type}-received`; generation: number; args: Args; value: T }
  | {
      type: `${Type}-failed`;
      generation: number;
      args: Args;
      // The old value could be retained.
      value?: T;
      error: unknown;
    };

export type ListFilesCache = Map<string, APICalls.ListFiles>;
export type DownloadFileCache = Map<string, APICalls.DownloadFile>;

export namespace APICalls {
  export type ListFiles = APIAction<
    'list-files',
    { path: string },
    Array<App.DropboxFile>
  >;
  export type DownloadFile = APIAction<
    'download-file',
    { path: string },
    App.DownloadedTextFile
  >;
}

export type Action =
  | { type: 'set-dropbox-access-token'; token: string }
  | { type: 'remove-dropbox-access-token' }
  | { type: 'clear-api-cache' }
  | { type: 'set-api-cache' }
  | { type: 'change-active-file'; value: string }
  | { type: 'modify-active-file'; value: string }
  | { type: 'change-view'; value: App.View }
  | APICalls.ListFiles
  | APICalls.DownloadFile;

/**
 * Selectors always take the root state, and return some part of it.
 */
export type Selector<Returns> = (state: State) => Returns;

/**
 * Provide a mechanism to easily define reducers that are bound to the current
 * set of Actions, and enforce the constraint that the first parameter must be
 * the same as the return value.
 *
 * See src/reducers for practical examples of how this is used.
 */
export type Reducer<S> = (state: S, action: Action) => S;

export type Thunk<Returns = void> = (
  dispatch: Dispatch,
  getState: () => State,
) => Returns;

// type DeThunkFn<T extends Thunk<Returns>, Returns> = (thunk: T) => Returns;

// export type DeThunk<
//   T extends Thunk<Returns>,
//   Returns = ReturnType<ReturnType<Thunk>>
// > = ReturnType<
//   DeThunkFn<T, ReturnType<ReturnType<Returns>>
// >;

/**
 * The rest of these pre-fill Redux with all of the configured Actions and middlewares.
 */
type ThunkDispatch = <Returns>(action: Thunk<Returns>) => Returns;
type PlainDispatch = (action: Action) => Action;
export type GetState = () => State;
export type Dispatch = PlainDispatch & ThunkDispatch;
export type Store = {
  dispatch: Dispatch;
  getState(): State;
  subscribe(listener: () => void): unknown;
  replaceReducer(nextReducer: Reducer<State>): void;
};
