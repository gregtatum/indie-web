import { State } from 'src/reducers';

/**
 * Re-exports.
 */
export { AppState, State } from 'src/reducers';

export type Action = { type: 'init' };

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

export type Thunk<Returns> = (
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
