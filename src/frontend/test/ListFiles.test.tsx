import { render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from 'frontend/components/App';
import { createStore } from 'frontend/store/create-store';
import { A } from 'frontend';
import { IDBFS, openIDBFS } from 'frontend/logic/file-store/indexeddb-fs';
import { ensureExists } from 'frontend/utils';
import { getFileTree } from './utils/fixtures';

describe('ListFiles', () => {
  const DB_NAME = 'list-files-test';
  let idbfs: IDBFS | null = null;
  let renderResult: ReturnType<typeof render> | null = null;

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
    renderResult?.unmount();
    renderResult = null;
    await deleteDatabase(DB_NAME);
  });

  async function setupWithListing(paths: string[]) {
    const store = createStore();
    store.dispatch(A.changeFileStore('browser'));
    store.dispatch(A.setHasOnboarded(true));

    idbfs = await openIDBFS(DB_NAME);
    store.dispatch(A.connectIDBFS(idbfs));

    // Build out the files.
    await idbfs.addFolderListing('/', []);
    for (const path of paths) {
      const normalized = path.startsWith('/') ? path : `/${path}`;
      if (normalized.endsWith('/')) {
        await idbfs.addFolderListing(normalized.slice(0, -1), []);
      } else {
        await idbfs.saveText(
          normalized,
          'overwrite',
          `${normalized} contents for tests`,
        );
      }
    }

    renderResult = render(
      <MemoryRouter initialEntries={['/']}>
        <Provider store={store as any}>
          <AppRoutes />
        </Provider>
      </MemoryRouter>,
    );

    return {
      store,
      renderTree: () => getFileTree(ensureExists(idbfs)),
    };
  }

  it('renders a folder listing', async () => {
    const { renderTree } = await setupWithListing([
      'README.md',
      '01 - Stone End/NPCs.md',
      '01 - Stone End/Enemies.md',
      '01 - Stone End/Scenery.md',
      '02 - Lark Bastion/',
    ]);

    await waitFor(() => screen.getByTestId('list-files'));
    await waitFor(() =>
      screen.getByText((content) => content.includes('README')),
    );

    expect(await renderTree()).toMatchInlineSnapshot(`
      "
      .
      ├── README.md
      ├── 01 - Stone End
      │   ├── Enemies.md
      │   ├── NPCs.md
      │   └── Scenery.md
      └── 02 - Lark Bastion
      "
    `);
  });
});
