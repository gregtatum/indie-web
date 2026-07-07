import * as React from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { act } from 'react';
import userEvent from '@testing-library/user-event';
import { AppRoutes } from 'frontend/components/App';
import { Connect } from 'frontend/components/Page';
import { persistedState } from 'frontend/logic/persisted-state';
import { createStore } from 'frontend/store/create-store';

beforeEach(() => {
  window.localStorage.clear();
});

describe('Connect', () => {
  function setup() {
    render(
      <MemoryRouter>
        <Provider store={createStore() as any}>
          <Connect />
        </Provider>
      </MemoryRouter>,
    );
  }

  it('does not select Dropbox before Dropbox auth completes', async () => {
    render(
      <MemoryRouter initialEntries={['/connect']}>
        <Provider store={createStore() as any}>
          <AppRoutes />
        </Provider>
      </MemoryRouter>,
    );

    await act(async () => {
      await userEvent.click(
        screen.getByRole('button', { name: 'Connect Dropbox' }),
      );
    });

    expect(await screen.findByText('Store Files on Dropbox')).toBeTruthy();
    expect(persistedState.fileStoreName.read()).toBeNull();
  });

  it('selects browser storage when browser storage is chosen', async () => {
    persistedState.fileStoreName.write('dropbox');
    setup();

    await act(async () => {
      await userEvent.click(
        screen.getByRole('button', { name: /Use .* Storage/ }),
      );
    });

    expect(persistedState.fileStoreName.read()).toBe('browser');
  });
});
