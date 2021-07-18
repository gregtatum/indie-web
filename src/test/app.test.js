import * as A from 'src/actions';
import { createStore } from 'src/create-store';
import { createRootApp } from 'src/mount-react';

import { render, screen } from '@testing-library/react';

describe('app', () => {
  it('can render', () => {
    const store = createStore();
    store.dispatch(A.init());
    render(createRootApp(store));
    expect(screen.getByText(/React/)).toBeTruthy();
  });
});
