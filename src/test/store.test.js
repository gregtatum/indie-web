import { createStore } from 'src/create-store';
import * as $ from 'src/selectors';
import * as A from 'src/actions';

describe('store', () => {
  it('can be run and initted', () => {
    const { getState, dispatch } = createStore();
    expect($.getInit(getState())).toBe(false);
    dispatch(A.init());
    expect($.getInit(getState())).toBe(true);
  });
});
