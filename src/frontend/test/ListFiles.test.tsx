import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { act } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from 'frontend/components/App';
import { createStore } from 'frontend/store/create-store';
import { A } from 'frontend';
import { IDBFS, openIDBFS } from 'frontend/logic/file-store/indexeddb-fs';
import { canonicalizePath, ensureExists } from 'frontend/utils';
import { buildTestFiles, getFileTree } from './utils/fixtures';

/**
 * Handles the life cycle of creating and deleted a test-only IDBFS.
 */
function useTestIDBFS() {
  const dbName = 'test-only-db';
  let idbfs: IDBFS | null = null;

  beforeEach(async () => {
    idbfs = await openIDBFS(dbName);
  });

  afterEach(async () => {
    idbfs?.close();
    idbfs = null;
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(dbName);
      request.onsuccess = () => resolve();
      request.onblocked = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });

  return {
    getIDBFS() {
      return ensureExists(idbfs);
    },
  };
}

describe('ListFiles', () => {
  const { getIDBFS } = useTestIDBFS();

  async function setupWithListing(
    paths: string[],
    userOptions?: Parameters<typeof userEvent.setup>[0],
  ) {
    const idbfs = getIDBFS();
    const store = createStore();
    store.dispatch(A.changeFileStore('browser'));
    store.dispatch(A.setHasOnboarded(true));
    store.dispatch(A.connectIDBFS(idbfs));

    await buildTestFiles(idbfs, paths);

    render(
      <MemoryRouter initialEntries={['/']}>
        <Provider store={store as any}>
          <AppRoutes />
        </Provider>
      </MemoryRouter>,
    );

    function getSelectedFilePath() {
      const element = screen.queryByRole('option', { selected: true });
      if (!element) {
        return null;
      }
      return getFilePath(element);
    }

    const user = userEvent.setup(userOptions);
    return {
      user,
      getSelectedFilePath,
      renderTree: () => getFileTree(idbfs),
      async navigateByKeyboard(key: string, path: string | null) {
        await act(() => user.keyboard(key));
        expect(getSelectedFilePath()).toEqual(path);
      },
    };
  }

  function getFilePath(container: HTMLElement) {
    const results = container.querySelectorAll('[data-file-path]');
    if (results.length > 1) {
      throw new Error('Found too many file paths');
    }
    const [element] = results;
    if (!element) {
      return null;
    }
    const filePath = element.getAttribute('data-file-path');
    if (!filePath) {
      throw new Error('The file path did not have a value.');
    }
    return filePath;
  }

  it('renders a folder listing', async () => {
    const { renderTree } = await setupWithListing([
      'README.md',
      '01 - Stone End/NPCs.md',
      '01 - Stone End/Enemies.md',
      '01 - Stone End/Scenery.md',
      '02 - Lark Bastion/',
    ]);

    await waitFor(() => screen.getByText(/README/));

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

  it('copies a file into a folder using keyboard navigation', async () => {
    const { renderTree, navigateByKeyboard, getSelectedFilePath, user } =
      await setupWithListing([
        'README.md',
        '01 - Stone End/Enemies.md',
        '01 - Stone End/NPCs.md',
        '01 - Stone End/Scenery.md',
        '02 - Lark Bastion/',
      ]);

    // Navigate into 01 - Stone End.
    expect(getSelectedFilePath()).toBeNull();

    await navigateByKeyboard('{ArrowDown}', '/01 - Stone End');

    // Navigate to the subfolder.
    await navigateByKeyboard('{Enter}', null);
    await navigateByKeyboard('{ArrowDown}', '/01 - Stone End/Enemies.md');
    await navigateByKeyboard('{ArrowDown}', '/01 - Stone End/NPCs.md');

    // Copy the file.
    await act(() => user.keyboard('{Meta>}c{/Meta}'));

    // Navigate into the Lark Bastion subfolder.
    await navigateByKeyboard('{Meta>}{ArrowUp}{/Meta}', '/01 - Stone End');
    await navigateByKeyboard('{ArrowDown}', '/02 - Lark Bastion');
    await navigateByKeyboard('{Meta>}{ArrowDown}{/Meta}', null);

    // Paste the file NPCs file.
    await act(() => user.keyboard('{Meta>}v{/Meta}'));

    expect(await renderTree()).toMatchInlineSnapshot(`
      "
      .
      ├── README.md
      ├── 01 - Stone End
      │   ├── Enemies.md
      │   ├── NPCs.md
      │   └── Scenery.md
      └── 02 - Lark Bastion
          └── NPCs.md
      "
    `);
  });

  it('filters files via the search input', async () => {
    jest.useFakeTimers();
    const { user } = await setupWithListing(
      ['README.md', 'Lyrics.txt', 'NPCs.md', 'Ideas.md'],
      {
        advanceTimers: jest.advanceTimersByTime,
      },
    );

    await waitFor(() => screen.getByText(/README/));

    const searchInput = screen.getByPlaceholderText('Search');
    await user.type(searchInput, 'npc');

    await act(() => {
      // The searchbox is debounced.
      jest.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      const options = screen.getAllByRole('option');
      expect(options).toHaveLength(1);
      expect(getFilePath(options[0])).toEqual('/NPCs.md');
    });
  });
});
