import * as React from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { act } from 'react';
import userEvent from '@testing-library/user-event';
import { AppRoutes } from 'frontend/components/App';
import { createStore } from 'frontend/store/create-store';
import { A } from 'frontend';
import { IDB_CACHE_NAME } from 'frontend/logic/file-store/dropbox-fs';
import { BROWSER_FILES_DB_NAME } from 'frontend/logic/file-store/indexeddb-fs';
import type { FileStoreCache } from 'frontend/logic/file-store';

beforeEach(() => {
  window.localStorage.clear();
});

describe('Settings', () => {
  function connectBrowserFiles(store: ReturnType<typeof createStore>) {
    store.dispatch(
      A.connectIDBFS({
        getFileCount: () => Promise.resolve(1),
      } as FileStoreCache),
    );
  }

  it('returns to the onboarding home screen after deleting the last storage', async () => {
    const store = createStore();
    store.dispatch(A.setHasOnboarded(true));
    connectBrowserFiles(store);
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
    const deleteDatabase = jest.spyOn(indexedDB, 'deleteDatabase');

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Provider store={store as any}>
          <AppRoutes />
        </Provider>
      </MemoryRouter>,
    );

    await screen.findByText(/There are 1 files stored in the browser/);

    await act(async () => {
      await userEvent.click(
        screen.getByRole('button', { name: 'Delete files' }),
      );
    });

    expect(confirm).toHaveBeenCalled();
    expect(deleteDatabase).toHaveBeenCalledWith(BROWSER_FILES_DB_NAME);
    expect(deleteDatabase).toHaveBeenCalledWith(IDB_CACHE_NAME);
    expect(window.localStorage.length).toBe(0);
    expect(await screen.findByText(/On your storage/)).toBeTruthy();
    expect(screen.queryByText('Enable experimental features')).toBeNull();
  });

  it('only deletes browser files when another storage is still configured', async () => {
    const store = createStore();
    store.dispatch(A.setHasOnboarded(true));
    store.dispatch(A.setDropboxAccessToken('token', 1000, 'refresh-token'));
    connectBrowserFiles(store);
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
    const deleteDatabase = jest.spyOn(indexedDB, 'deleteDatabase');

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Provider store={store as any}>
          <AppRoutes />
        </Provider>
      </MemoryRouter>,
    );

    await screen.findByText(/There are 1 files stored in the browser/);

    await act(async () => {
      await userEvent.click(
        screen.getByRole('button', { name: 'Delete files' }),
      );
    });

    expect(confirm).toHaveBeenCalled();
    expect(deleteDatabase).toHaveBeenCalledWith(BROWSER_FILES_DB_NAME);
    expect(deleteDatabase).not.toHaveBeenCalledWith(IDB_CACHE_NAME);
    expect(window.localStorage.length).toBeGreaterThan(0);
    expect(
      await screen.findByText('All files have been deleted.'),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Enable experimental features' }),
    ).toBeTruthy();
    expect(screen.queryByText(/On your storage/)).toBeNull();
  });
});
