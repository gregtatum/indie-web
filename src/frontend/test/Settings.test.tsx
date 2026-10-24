import * as React from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, within } from '@testing-library/react';
import { act } from 'react';
import userEvent from '@testing-library/user-event';
import { AppRoutes } from 'frontend/components/App';
import { createStore } from 'frontend/store/create-store';
import { A, T } from 'frontend';
import { IDB_CACHE_NAME } from 'frontend/logic/file-store/dropbox-fs';
import { BROWSER_FILES_DB_NAME } from 'frontend/logic/file-store/indexeddb-fs';
import { connectBrowserFiles, useTestIDBFS } from './utils/idbfs';
import {
  buildTestFiles,
  mockDropboxListFolder,
  settleApp,
} from './utils/fixtures';

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

async function renderSettings(store: Store) {
  render(
    <MemoryRouter initialEntries={['/settings']}>
      <Provider store={store as any}>
        <AppRoutes />
      </Provider>
    </MemoryRouter>,
  );
  await settleApp();
}

function watchDatabaseDeletes() {
  return jest.spyOn(indexedDB, 'deleteDatabase');
}

function confirmPrompts() {
  return jest.spyOn(window, 'confirm').mockReturnValue(true);
}

async function requestBrowserFileDeletion() {
  await screen.findByText('1 file stored in the browser');
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

const MUSIC_STORAGE = {
  id: 'music-storage',
  name: 'Music Storage',
  url: 'http://localhost:6544',
  storeType: 'music' as const,
};

const PLAYING_TRACK: T.TrackMetadata = {
  path: '/music/a.mp3',
  title: 'Song A',
  artist: 'Artist A',
  albumArtist: null,
  composer: null,
  album: 'Album A',
  genre: 'Rock',
  year: null,
  preferComposerGrouping: null,
  track: 1,
  duration: 180,
  size: 1024,
  mtime: '2024-01-01T00:00:00Z',
  folderArtworkPath: null,
  hasEmbeddedArtwork: false,
};

function startPlayingFrom(store: Store, server: T.FileStoreServer) {
  store.dispatch(A.changeFileStore('server', server));
  store.dispatch(A.viewMusic(server, '/'));
  store.dispatch(A.setMusicTracks([PLAYING_TRACK], false));
  store.dispatch(A.musicPlaybackLoad(PLAYING_TRACK.path));
  store.dispatch(A.musicPlaybackReady());
}

async function removeFolderNamed(name: string) {
  const input = await screen.findByDisplayValue(name);
  const form = input.closest('form');
  if (!form) {
    throw new Error('Expected the folder to be in a form.');
  }
  await act(async () => {
    await userEvent.click(within(form).getByRole('button', { name: 'Remove' }));
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
  const { getIDBFS: getDropboxCache } = useTestIDBFS(IDB_CACHE_NAME);

  it('returns to the onboarding home screen after deleting the last storage', async () => {
    const store = createStore();
    onboard(store);
    await connectBrowserFiles(store, getIDBFS());
    const deleteDatabase = watchDatabaseDeletes();

    await renderSettings(store);
    await requestBrowserFileDeletion();
    await confirmBrowserFileDeletion();

    expectBrowserFilesDeleted(deleteDatabase);
    expectDropboxCacheDeleted(deleteDatabase);
    await expectOnboardingHomeScreen();

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
    mockDropboxListFolder([]);
    const deleteDatabase = watchDatabaseDeletes();

    await renderSettings(store);
    await requestBrowserFileDeletion();
    await confirmBrowserFileDeletion();

    expectBrowserFilesDeleted(deleteDatabase);
    expect(deleteDatabase).not.toHaveBeenCalledWith(IDB_CACHE_NAME);
    expect(window.localStorage.length).toBeGreaterThan(0);
    // Deleting the active storage switches to the remaining Dropbox storage and
    // navigates to its (empty) file list, matching the folder-removal behavior below.
    expect(
      await screen.findByRole('button', { name: 'Add File or Folder' }),
    ).toBeTruthy();
    expect(await screen.findByTestId('list-files')).toBeTruthy();
  });

  it('only removes Dropbox data when another storage is still configured', async () => {
    const store = createStore();
    onboard(store);
    connectDropbox(store);
    await connectBrowserFiles(store, getIDBFS());
    const confirm = confirmPrompts();
    const deleteDatabase = watchDatabaseDeletes();

    await renderSettings(store);
    await screen.findByText('1 file stored in the browser');
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

  it('shows each store cache in a disclosure and clears it after confirming', async () => {
    const store = createStore();
    onboard(store);
    connectDropbox(store);
    store.dispatch(A.setFileStoreCacheEnabled(true));
    addNasStorage(store);
    await buildTestFiles(getDropboxCache(), ['/a.md', '/b.md']);
    const confirm = confirmPrompts();

    await renderSettings(store);

    expect(
      await screen.findByRole('button', {
        name: 'NAS Storage cache: Empty',
      }),
    ).toBeTruthy();
    const toggle = await screen.findByRole('button', {
      name: /^Dropbox cache: \d.* [KMG]?B$/,
      expanded: false,
    });
    expect(screen.queryByText('2 files.')).toBeNull();

    await act(async () => {
      await userEvent.click(toggle);
    });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('2 files.')).toBeTruthy();

    await act(async () => {
      await userEvent.click(
        screen.getByRole('button', { name: 'Clear Dropbox Cache' }),
      );
    });

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Dropbox'));
    expect(
      await screen.findByRole('button', {
        name: 'Dropbox cache: Empty',
      }),
    ).toBeTruthy();
  });

  it('keeps the cache when clearing is not confirmed', async () => {
    const store = createStore();
    onboard(store);
    connectDropbox(store);
    store.dispatch(A.setFileStoreCacheEnabled(true));
    await buildTestFiles(getDropboxCache(), ['/a.md']);
    jest.spyOn(window, 'confirm').mockReturnValue(false);

    await renderSettings(store);
    const toggle = await screen.findByRole('button', {
      name: /^Dropbox cache: \d.* [KMG]?B$/,
    });
    await act(async () => {
      await userEvent.click(toggle);
    });
    await act(async () => {
      await userEvent.click(
        screen.getByRole('button', { name: 'Clear Dropbox Cache' }),
      );
    });

    expect(toggle.getAttribute('aria-label')).toMatch(/[KMG]?B$/);
  });

  it('hides the store caches when offline caching is disabled', async () => {
    const store = createStore();
    onboard(store);
    connectDropbox(store);
    addNasStorage(store);

    await renderSettings(store);

    expect(screen.queryByRole('button', { name: /cache:/ })).toBeNull();
  });

  it('returns to onboarding after removing Dropbox as the last storage', async () => {
    const store = createStore();
    onboard(store);
    connectDropbox(store);
    const confirm = confirmPrompts();
    const deleteDatabase = watchDatabaseDeletes();

    await renderSettings(store);
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

    await renderSettings(store);

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

    await renderSettings(store);

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

    await renderSettings(store);

    expect(await screen.findByDisplayValue('NAS Storage')).toBeTruthy();

    await removeFolder();

    expect(confirm).toHaveBeenCalledWith(
      'Are you sure you want to remove this folder?',
    );
    expectBrowserFilesDeleted(deleteDatabase);
    expectDropboxCacheDeleted(deleteDatabase);
    await expectOnboardingHomeScreen();
  });

  it('stops playback when the playing music storage is removed', async () => {
    const store = createStore();
    onboard(store);
    await connectBrowserFiles(store, getIDBFS());
    addNasStorage(store);
    store.dispatch(A.addFileStoreServer(MUSIC_STORAGE));
    startPlayingFrom(store, MUSIC_STORAGE);
    confirmPrompts();

    await renderSettings(store);
    screen.getByRole('region', { name: 'Playback controls' });

    await removeFolderNamed('Music Storage');

    expect(screen.queryByDisplayValue('Music Storage')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Playback controls' })).toBe(
      null,
    );
  });

  it('keeps playing when a different storage is removed', async () => {
    const store = createStore();
    onboard(store);
    await connectBrowserFiles(store, getIDBFS());
    addNasStorage(store);
    store.dispatch(A.addFileStoreServer(MUSIC_STORAGE));
    startPlayingFrom(store, MUSIC_STORAGE);
    confirmPrompts();

    await renderSettings(store);

    await removeFolderNamed('NAS Storage');

    expect(screen.queryByDisplayValue('NAS Storage')).toBeNull();
    screen.getByRole('region', { name: 'Playback controls' });
  });

  it('stops playback when the last storage is removed', async () => {
    const store = createStore();
    onboard(store);
    store.dispatch(A.addFileStoreServer(MUSIC_STORAGE));
    startPlayingFrom(store, MUSIC_STORAGE);
    confirmPrompts();

    await renderSettings(store);
    screen.getByRole('region', { name: 'Playback controls' });

    await removeFolderNamed('Music Storage');

    await expectOnboardingHomeScreen();
    expect(screen.queryByRole('region', { name: 'Playback controls' })).toBe(
      null,
    );
  });

  it('changes the input mode setting via the radio group', async () => {
    const store = createStore();
    onboard(store);

    await renderSettings(store);

    expect(store.getState().inputMode).toBe('auto');

    await act(async () => {
      await userEvent.click(screen.getByLabelText('Touch'));
    });
    expect(store.getState().inputMode).toBe('touch');

    await act(async () => {
      await userEvent.click(screen.getByLabelText('Mouse & Keyboard'));
    });
    expect(store.getState().inputMode).toBe('mouse');
  });
});
