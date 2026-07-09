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
import type { FetchMockSandbox } from 'fetch-mock';
import { connectBrowserFiles, useTestIDBFS } from './utils/idbfs';

beforeEach(() => {
  window.localStorage.clear();
});

describe('Settings', () => {
  const { getIDBFS } = useTestIDBFS('settings-test-db');

  it('returns to the onboarding home screen after deleting the last storage', async () => {
    const store = createStore();
    store.dispatch(A.setHasOnboarded(true));
    await connectBrowserFiles(store, getIDBFS());
    const deleteDatabase = jest.spyOn(indexedDB, 'deleteDatabase');

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Provider store={store as any}>
          <AppRoutes />
        </Provider>
      </MemoryRouter>,
    );

    await screen.findByText('1 file stored locally');

    await act(async () => {
      await userEvent.click(
        screen.getByRole('button', { name: 'Delete Files' }),
      );
    });

    expect(
      await screen.findByText(/This removes the files stored in this browser/),
    ).toBeTruthy();

    await act(async () => {
      await userEvent.click(
        screen.getByRole('button', { name: 'Delete Local Files' }),
      );
    });

    expect(deleteDatabase).toHaveBeenCalledWith(BROWSER_FILES_DB_NAME);
    expect(deleteDatabase).toHaveBeenCalledWith(IDB_CACHE_NAME);
    expect(window.localStorage.length).toBe(0);
    expect(await screen.findByText(/On your storage/)).toBeTruthy();
    expect(screen.queryByText('Enable experimental features')).toBeNull();

    (window.fetch as FetchMockSandbox).get(
      '/guide/Getting Started.chopro',
      'Getting started',
    );

    await act(async () => {
      await userEvent.click(
        screen.getByRole('button', { name: 'Start a Blank Workspace' }),
      );
    });

    expect(await screen.findByText('Add File or Folder')).toBeTruthy();
  });

  it('only deletes browser files when another storage is still configured', async () => {
    const store = createStore();
    store.dispatch(A.setHasOnboarded(true));
    store.dispatch(A.setDropboxAccessToken('token', 1000, 'refresh-token'));
    store.dispatch(A.setFileStoreCacheEnabled(false));
    await connectBrowserFiles(store, getIDBFS());
    const deleteDatabase = jest.spyOn(indexedDB, 'deleteDatabase');

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Provider store={store as any}>
          <AppRoutes />
        </Provider>
      </MemoryRouter>,
    );

    await screen.findByText('1 file stored locally');

    await act(async () => {
      await userEvent.click(
        screen.getByRole('button', { name: 'Delete Files' }),
      );
    });

    expect(
      await screen.findByText(/This removes the files stored in this browser/),
    ).toBeTruthy();

    await act(async () => {
      await userEvent.click(
        screen.getByRole('button', { name: 'Delete Local Files' }),
      );
    });

    expect(deleteDatabase).toHaveBeenCalledWith(BROWSER_FILES_DB_NAME);
    expect(deleteDatabase).not.toHaveBeenCalledWith(IDB_CACHE_NAME);
    expect(window.localStorage.length).toBeGreaterThan(0);
    expect(await screen.findByText('No local files stored')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Developer' })).toBeTruthy();
    expect(screen.queryByText(/On your storage/)).toBeNull();
  });

  it('only removes Dropbox data when another storage is still configured', async () => {
    const store = createStore();
    store.dispatch(A.setHasOnboarded(true));
    store.dispatch(A.setDropboxAccessToken('token', 1000, 'refresh-token'));
    store.dispatch(A.setFileStoreCacheEnabled(false));
    await connectBrowserFiles(store, getIDBFS());
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
    const deleteDatabase = jest.spyOn(indexedDB, 'deleteDatabase');

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Provider store={store as any}>
          <AppRoutes />
        </Provider>
      </MemoryRouter>,
    );

    await act(async () => {
      await userEvent.click(
        await screen.findByRole('button', { name: 'Sign Out' }),
      );
    });

    expect(confirm).toHaveBeenCalled();
    expect(deleteDatabase).toHaveBeenCalledWith(IDB_CACHE_NAME);
    expect(deleteDatabase).not.toHaveBeenCalledWith(BROWSER_FILES_DB_NAME);
    expect(window.localStorage.length).toBeGreaterThan(0);
    expect(
      await screen.findByText(
        'Connect Dropbox to browse and edit files directly.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Developer' })).toBeTruthy();
    expect(screen.queryByText(/On your storage/)).toBeNull();
  });

  it('returns to onboarding after removing Dropbox as the last storage', async () => {
    const store = createStore();
    store.dispatch(A.setHasOnboarded(true));
    store.dispatch(A.setDropboxAccessToken('token', 1000, 'refresh-token'));
    store.dispatch(A.setFileStoreCacheEnabled(false));
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
    const deleteDatabase = jest.spyOn(indexedDB, 'deleteDatabase');

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Provider store={store as any}>
          <AppRoutes />
        </Provider>
      </MemoryRouter>,
    );

    await act(async () => {
      await userEvent.click(
        await screen.findByRole('button', { name: 'Sign Out' }),
      );
    });

    expect(confirm).toHaveBeenCalled();
    expect(deleteDatabase).toHaveBeenCalledWith(BROWSER_FILES_DB_NAME);
    expect(deleteDatabase).toHaveBeenCalledWith(IDB_CACHE_NAME);
    expect(window.localStorage.length).toBe(0);
    expect(await screen.findByText(/On your storage/)).toBeTruthy();
    expect(screen.queryByText('Enable experimental features')).toBeNull();
  });

  it('removes self-hosted storage from settings', async () => {
    const store = createStore();
    store.dispatch(A.setHasOnboarded(true));
    store.dispatch(A.setDropboxAccessToken('token', 1000, 'refresh-token'));
    store.dispatch(A.setFileStoreCacheEnabled(false));
    store.dispatch(
      A.addFileStoreServer({
        id: 'nas-storage',
        name: 'NAS Storage',
        url: 'http://localhost:6543',
        storeType: 'files',
      }),
    );
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Provider store={store as any}>
          <AppRoutes />
        </Provider>
      </MemoryRouter>,
    );

    expect(await screen.findByDisplayValue('NAS Storage')).toBeTruthy();
    expect(screen.getByText('1 configured')).toBeTruthy();

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    });

    expect(confirm).toHaveBeenCalledWith(
      'Are you sure you want to remove this storage provider?',
    );
    expect(screen.queryByDisplayValue('NAS Storage')).toBeNull();
    expect(
      screen.getByText('Connect a local server, NAS, or music library.'),
    ).toBeTruthy();
  });

  it('switches to browser storage after removing the active self-hosted storage', async () => {
    const store = createStore();
    store.dispatch(A.setHasOnboarded(true));
    await connectBrowserFiles(store, getIDBFS());
    const server = {
      id: 'nas-storage',
      name: 'NAS Storage',
      url: 'http://localhost:6543',
      storeType: 'files' as const,
    };
    store.dispatch(A.addFileStoreServer(server));
    store.dispatch(A.changeFileStore('server', server));
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Provider store={store as any}>
          <AppRoutes />
        </Provider>
      </MemoryRouter>,
    );

    expect(await screen.findByDisplayValue('NAS Storage')).toBeTruthy();

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    });

    expect(confirm).toHaveBeenCalledWith(
      'Are you sure you want to remove this storage provider?',
    );
    expect(screen.queryByDisplayValue('NAS Storage')).toBeNull();
    expect(
      await screen.findByRole('button', { name: 'Browser Storage' }),
    ).toBeTruthy();
    expect(await screen.findByTestId('list-files')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Welcome/ })).toBeTruthy();
    expect(window.localStorage.length).toBeGreaterThan(0);
  });

  it('returns to onboarding after removing self-hosted storage as the last storage', async () => {
    const store = createStore();
    store.dispatch(A.setHasOnboarded(true));
    store.dispatch(
      A.addFileStoreServer({
        id: 'nas-storage',
        name: 'NAS Storage',
        url: 'http://localhost:6543',
        storeType: 'files',
      }),
    );
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
    const deleteDatabase = jest.spyOn(indexedDB, 'deleteDatabase');

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Provider store={store as any}>
          <AppRoutes />
        </Provider>
      </MemoryRouter>,
    );

    expect(await screen.findByDisplayValue('NAS Storage')).toBeTruthy();

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    });

    expect(confirm).toHaveBeenCalledWith(
      'Are you sure you want to remove this storage provider?',
    );
    expect(deleteDatabase).toHaveBeenCalledWith(BROWSER_FILES_DB_NAME);
    expect(deleteDatabase).toHaveBeenCalledWith(IDB_CACHE_NAME);
    expect(window.localStorage.length).toBe(0);
    expect(await screen.findByText(/On your storage/)).toBeTruthy();
    expect(screen.queryByText('Enable experimental features')).toBeNull();
  });
});
