/**
 * Re-exports.
 */
export * from './app';

export type { OfflineDB } from 'src/logic/offline-db';
import type { State } from 'src/store/reducers';
export type { State } from 'src/store/reducers';
import type * as Thunks from 'src/store/actions/thunks';
import type * as PlainActions from 'src/store/actions/plain';

export type Values<T> = T[keyof T];

type PlainActions = Values<{
  [FnName in keyof typeof PlainActions]: ReturnType<
    (typeof PlainActions)[FnName]
  >;
}>;

export type Action = Thunks.PlainActions | PlainActions;

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
