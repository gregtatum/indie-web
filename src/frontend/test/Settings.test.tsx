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

type Store = ReturnType<typeof createStore>;

const NAS_STORAGE = {
  id: 'nas-storage',
  name: 'NAS Storage',
  url: 'http://localhost:6543',
  storeType: 'files' as const,
};

beforeEach(() => {
  window.localStorage.clear();
});

function onboard(store: Store) {
  store.dispatch(A.setHasOnboarded(true));
}

function connectDropbox(store: Store) {
  store.dispatch(A.setDropboxAccessToken('token', 1000, 'refresh-token'));
  store.dispatch(A.setFileStoreCacheEnabled(false));
}

function addNasStorage(store: Store) {
  store.dispatch(A.addFileStoreServer(NAS_STORAGE));
}

function renderSettings(store: Store) {
  render(
    <MemoryRouter initialEntries={['/settings']}>
      <Provider store={store as any}>
        <AppRoutes />
      </Provider>
    </MemoryRouter>,
  );
}

function watchDatabaseDeletes() {
  return jest.spyOn(indexedDB, 'deleteDatabase');
}

function confirmPrompts() {
  return jest.spyOn(window, 'confirm').mockReturnValue(true);
}

async function requestBrowserFileDeletion() {
  await screen.findByText('1 file stored locally');
  await act(async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Delete Files' }));
  });
  expect(
    await screen.findByText(/This removes the files stored in this browser/),
  ).toBeTruthy();
}

async function confirmBrowserFileDeletion() {
  await act(async () => {
    await userEvent.click(
      screen.getByRole('button', { name: 'Delete Local Files' }),
    );
  });
}

async function signOutOfDropbox() {
  await act(async () => {
    await userEvent.click(
      await screen.findByRole('button', { name: 'Sign Out' }),
    );
  });
}

async function removeFolder() {
  await act(async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
  });
}

function expectBrowserFilesDeleted(deleteDatabase: jest.SpyInstance) {
  expect(deleteDatabase).toHaveBeenCalledWith(BROWSER_FILES_DB_NAME);
}

function expectDropboxCacheDeleted(deleteDatabase: jest.SpyInstance) {
  expect(deleteDatabase).toHaveBeenCalledWith(IDB_CACHE_NAME);
}

async function expectOnboardingHomeScreen() {
  expect(window.localStorage.length).toBe(0);
  expect(await screen.findByText(/On your storage/)).toBeTruthy();
  expect(screen.queryByText('Enable experimental features')).toBeNull();
}

describe('Settings', () => {
  const { getIDBFS } = useTestIDBFS('settings-test-db');

  it('returns to the onboarding home screen after deleting the last storage', async () => {
    const store = createStore();
    onboard(store);
    await connectBrowserFiles(store, getIDBFS());
    const deleteDatabase = watchDatabaseDeletes();

    renderSettings(store);
    await requestBrowserFileDeletion();
    await confirmBrowserFileDeletion();

    expectBrowserFilesDeleted(deleteDatabase);
    expectDropboxCacheDeleted(deleteDatabase);
    await expectOnboardingHomeScreen();

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
    onboard(store);
    connectDropbox(store);
    await connectBrowserFiles(store, getIDBFS());
    const deleteDatabase = watchDatabaseDeletes();

    renderSettings(store);
    await requestBrowserFileDeletion();
    await confirmBrowserFileDeletion();

    expectBrowserFilesDeleted(deleteDatabase);
    expect(deleteDatabase).not.toHaveBeenCalledWith(IDB_CACHE_NAME);
    expect(window.localStorage.length).toBeGreaterThan(0);
    expect(await screen.findByText('No local files stored')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Developer' })).toBeTruthy();
    expect(screen.queryByText(/On your storage/)).toBeNull();
  });

  it('only removes Dropbox data when another storage is still configured', async () => {
    const store = createStore();
    onboard(store);
    connectDropbox(store);
    await connectBrowserFiles(store, getIDBFS());
    const confirm = confirmPrompts();
    const deleteDatabase = watchDatabaseDeletes();

    renderSettings(store);
    await signOutOfDropbox();

    expect(confirm).toHaveBeenCalled();
    expectDropboxCacheDeleted(deleteDatabase);
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
    onboard(store);
    connectDropbox(store);
    const confirm = confirmPrompts();
    const deleteDatabase = watchDatabaseDeletes();

    renderSettings(store);
    await signOutOfDropbox();

    expect(confirm).toHaveBeenCalled();
    expectBrowserFilesDeleted(deleteDatabase);
    expectDropboxCacheDeleted(deleteDatabase);
    await expectOnboardingHomeScreen();
  });

  it('removes self-hosted storage from settings', async () => {
    const store = createStore();
    onboard(store);
    connectDropbox(store);
    addNasStorage(store);
    const confirm = confirmPrompts();

    renderSettings(store);

    expect(await screen.findByDisplayValue('NAS Storage')).toBeTruthy();
    expect(screen.getByText('1 configured')).toBeTruthy();

    await removeFolder();

    expect(confirm).toHaveBeenCalledWith(
      'Are you sure you want to remove this folder?',
    );
    expect(screen.queryByDisplayValue('NAS Storage')).toBeNull();
    expect(
      screen.getByText(
        'Access folders from your computer, home server, or NAS.',
      ),
    ).toBeTruthy();
  });

  it('switches to browser storage after removing the active self-hosted storage', async () => {
    const store = createStore();
    onboard(store);
    await connectBrowserFiles(store, getIDBFS());
    addNasStorage(store);
    store.dispatch(A.changeFileStore('server', NAS_STORAGE));
    const confirm = confirmPrompts();

    renderSettings(store);

    expect(await screen.findByDisplayValue('NAS Storage')).toBeTruthy();

    await removeFolder();

    expect(confirm).toHaveBeenCalledWith(
      'Are you sure you want to remove this folder?',
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
    onboard(store);
    addNasStorage(store);
    const confirm = confirmPrompts();
    const deleteDatabase = watchDatabaseDeletes();

    renderSettings(store);

    expect(await screen.findByDisplayValue('NAS Storage')).toBeTruthy();

    await removeFolder();

    expect(confirm).toHaveBeenCalledWith(
      'Are you sure you want to remove this folder?',
    );
    expectBrowserFilesDeleted(deleteDatabase);
    expectDropboxCacheDeleted(deleteDatabase);
    await expectOnboardingHomeScreen();
  });
});
