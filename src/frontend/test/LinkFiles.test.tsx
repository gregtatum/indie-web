import { render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from 'frontend/components/App';
import { createStore } from 'frontend/store/create-store';
import { A } from 'frontend';
import { createFileMetadata, createFolderMetadata } from './utils/fixtures';
import { IDBFS, openIDBFS } from 'frontend/logic/file-store/indexeddb-fs';

describe('LinkFiles', () => {
  const DB_NAME = 'link-files-test';
  let idbfs: IDBFS | null = null;

  async function deleteDatabase(name: string) {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onblocked = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  afterEach(async () => {
    idbfs?.close();
    idbfs = null;
    await deleteDatabase(DB_NAME);
  });

  it('renders a folder listing', async () => {
    const store = createStore();
    store.dispatch(A.changeFileStore('browser'));
    store.dispatch(A.setHasOnboarded(true));

    idbfs = await openIDBFS(DB_NAME);
    store.dispatch(A.connectIDBFS(idbfs));

    await idbfs.addFolderListing('/', [
      createFolderMetadata('/Rehearsals'),
      createFileMetadata('/Setlist.txt'),
    ]);

    render(
      <MemoryRouter initialEntries={['/']}>
        <Provider store={store as any}>
          <AppRoutes />
        </Provider>
      </MemoryRouter>,
    );

    await waitFor(() => screen.getByTestId('list-files'));
    await waitFor(() => screen.getByText('Rehearsals'));
  });
});
