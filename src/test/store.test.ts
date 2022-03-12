import { createStore } from 'src/store/create-store';
import * as $ from 'src/store/selectors';
import * as A from 'src/store/actions';

describe('store', () => {
  it('can be run and initted', () => {
    const { getState, dispatch } = createStore();
    expect($.getInit(getState())).toBe(false);
    dispatch(A.init());
    expect($.getInit(getState())).toBe(true);
  });
});
