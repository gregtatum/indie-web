import userEvent from '@testing-library/user-event';
import { render, screen, waitFor, within } from '@testing-library/react';
import * as React from 'react';
import { act } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from 'frontend/components/App';
import { createStore } from 'frontend/store/create-store';
import { A } from 'frontend';
import { ensureExists } from 'frontend/utils';
import { getFileTree } from './utils/fixtures';
import { connectBrowserFiles, useTestIDBFS } from './utils/idbfs';

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
    await connectBrowserFiles(store, idbfs, paths);

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

    function getSelectedFilePaths() {
      return screen
        .queryAllByRole('option', { selected: true })
        .map((element) => getFilePath(element))
        .sort();
    }

    const user = userEvent.setup(userOptions);
    return {
      user,
      getSelectedFilePath,
      getSelectedFilePaths,
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

  function getFileListing(path: string) {
    const option = screen
      .queryAllByRole('option')
      .find((element) => getFilePath(element) === path);
    return ensureExists(option, 'Could not find file option for path.');
  }

  function getFileLink(path: string) {
    return within(getFileListing(path)).getByRole('link');
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

    await waitFor(() => screen.getByText(/01 - Stone End/));

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

  it('renames a file inline', async () => {
    const { renderTree, user, navigateByKeyboard } = await setupWithListing([
      'README.md',
      'lyrics/NPCs.md',
      'lyrics/Scenery.md',
    ]);

    await waitFor(() => getFileListing('/README.md'));

    await navigateByKeyboard('{ArrowDown}', '/lyrics');
    await navigateByKeyboard('{ArrowDown}', '/README.md');

    const fileOption = getFileListing('/README.md');
    const menuButton = within(fileOption).getByRole('button', {
      name: /File Menu/i,
    });
    await act(async () => {
      await user.click(menuButton);
    });

    const renameButton = await screen.findByRole('button', { name: /Rename/i });
    await act(async () => {
      await user.click(renameButton);
    });

    const renameInput = await screen.findByDisplayValue('README.md');
    await act(async () => {
      await user.clear(renameInput);
      await user.type(renameInput, 'Journal.md{Enter}');
    });

    await waitFor(() => getFileListing('/Journal.md'));

    expect(await renderTree()).toMatchInlineSnapshot(`
      "
      .
      ├── lyrics
      │   ├── NPCs.md
      │   └── Scenery.md
      └── Journal.md
      "
    `);
  });

  it('selects a folder with a plain desktop click, without opening it', async () => {
    const { user, getSelectedFilePaths } = await setupWithListing([
      'README.md',
      'Notes/Ideas.md',
    ]);

    await waitFor(() => getFileListing('/README.md'));

    await act(async () => {
      await user.click(getFileLink('/Notes'));
    });

    expect(getSelectedFilePaths()).toEqual(['/Notes']);
    expect(getFileListing('/README.md')).toBeTruthy();
    expect(screen.queryByText(/Ideas/)).toBeNull();
  });

  it('clears the selection when clicking empty space in the list', async () => {
    const { user, getSelectedFilePaths } = await setupWithListing([
      'README.md',
      'Notes/Ideas.md',
    ]);

    await waitFor(() => getFileListing('/README.md'));

    await act(async () => {
      await user.click(getFileLink('/README.md'));
    });
    expect(getSelectedFilePaths()).toEqual(['/README.md']);

    await act(async () => {
      await user.click(screen.getByRole('listbox'));
    });
    expect(getSelectedFilePaths()).toEqual([]);
  });

  it('opens a folder with a desktop double-click', async () => {
    const { user } = await setupWithListing(['README.md', 'Notes/Ideas.md']);

    await waitFor(() => getFileListing('/README.md'));

    await act(async () => {
      await user.dblClick(getFileLink('/Notes'));
    });

    await waitFor(() => screen.getByText(/Ideas/));
  });

  it('opens a folder immediately on a real touch tap', async () => {
    const { user } = await setupWithListing(['README.md', 'Notes/Ideas.md']);

    await waitFor(() => getFileListing('/README.md'));

    await act(async () => {
      await user.pointer({ keys: '[TouchA]', target: getFileLink('/Notes') });
    });

    await waitFor(() => screen.getByText(/Ideas/));
  });

  it('toggles multi-selection with ctrl-click', async () => {
    const { user, getSelectedFilePaths } = await setupWithListing([
      'A.md',
      'B.md',
      'C.md',
    ]);

    await waitFor(() => getFileListing('/A.md'));

    await act(async () => {
      await user.click(getFileLink('/A.md'));
    });
    expect(getSelectedFilePaths()).toEqual(['/A.md']);

    await act(async () => {
      await user.keyboard('{Control>}');
      await user.click(getFileLink('/C.md'));
      await user.keyboard('{/Control}');
    });
    expect(getSelectedFilePaths()).toEqual(['/A.md', '/C.md']);

    // Ctrl-clicking the same file again removes it from the selection.
    await act(async () => {
      await user.keyboard('{Control>}');
      await user.click(getFileLink('/C.md'));
      await user.keyboard('{/Control}');
    });
    expect(getSelectedFilePaths()).toEqual(['/A.md']);
  });

  it('selects a range with shift-click', async () => {
    const { user, getSelectedFilePaths } = await setupWithListing([
      'A.md',
      'B.md',
      'C.md',
      'D.md',
    ]);

    await waitFor(() => getFileListing('/A.md'));

    await act(async () => {
      await user.click(getFileLink('/A.md'));
    });

    await act(async () => {
      await user.keyboard('{Shift>}');
      await user.click(getFileLink('/D.md'));
      await user.keyboard('{/Shift}');
    });

    expect(getSelectedFilePaths()).toEqual([
      '/A.md',
      '/B.md',
      '/C.md',
      '/D.md',
    ]);
  });

  it('keeps arrow-key navigation working after a mouse click selects a file', async () => {
    const { user, navigateByKeyboard } = await setupWithListing([
      'A.md',
      'B.md',
    ]);

    await waitFor(() => getFileListing('/A.md'));

    await act(async () => {
      await user.click(getFileLink('/A.md'));
    });

    await navigateByKeyboard('{ArrowDown}', '/B.md');
  });
});
