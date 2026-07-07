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
import { mockServerListFiles } from './utils/fixtures';

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

  it('shows the storage files after adding a storage provider', async () => {
    render(
      <MemoryRouter initialEntries={['/add-storage-provider']}>
        <Provider store={createStore() as any}>
          <AppRoutes />
        </Provider>
      </MemoryRouter>,
    );

    mockServerListFiles({
      id: 'nas-storage',
      name: 'NAS Storage',
      url: 'http://localhost:6543',
      storeType: 'files',
    });

    await userEvent.type(
      screen.getByLabelText('Storage Provider Name'),
      'NAS Storage',
    );
    await userEvent.clear(screen.getByLabelText('Storage Provider Address'));
    await userEvent.type(
      screen.getByLabelText('Storage Provider Address'),
      'http://localhost:6543',
    );

    await act(async () => {
      await userEvent.click(
        screen.getByRole('button', { name: 'Add Storage Provider' }),
      );
    });

    expect(await screen.findByTestId('list-files')).toBeTruthy();
    expect(
      screen.queryByRole('heading', { name: 'Add Self-Hosted Storage' }),
    ).toBeNull();
    expect(persistedState.fileStoreName.read()).toBe('server');
    expect(persistedState.fileStoreServer.read()).toBe('nas-storage');
  });
});
