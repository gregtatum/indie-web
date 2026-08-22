import userEvent from '@testing-library/user-event';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import * as React from 'react';
import { act } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from 'frontend/components/App';
import { createStore } from 'frontend/store/create-store';
import { A, $ } from 'frontend';
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
      store,
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

  it('renames the focused file with the F2 shortcut', async () => {
    const { renderTree, user } = await setupWithListing(['A.md', 'B.md']);

    await waitFor(() => getFileListing('/A.md'));

    await act(async () => {
      await user.click(getFileLink('/A.md'));
    });

    await act(() => user.keyboard('{F2}'));

    const renameInput = await screen.findByDisplayValue('A.md');
    await act(async () => {
      await user.clear(renameInput);
      await user.type(renameInput, 'Journal.md{Enter}');
    });

    await waitFor(() => getFileListing('/Journal.md'));

    expect(await renderTree()).toMatchInlineSnapshot(`
      "
      .
      ├── B.md
      └── Journal.md
      "
    `);
  });

  it('renames multiple selected files with F2, starting on the focused file', async () => {
    const { renderTree, user, store, getSelectedFilePaths } =
      await setupWithListing(['A.md', 'B.md', 'C.md']);

    await waitFor(() => getFileListing('/A.md'));

    // Select all three, but focus B.md (the middle item) rather than the
    // first item, to prove F2 opens the rename box on the focused file.
    await act(async () => {
      store.dispatch(A.setFileSelection('/', ['A.md', 'B.md', 'C.md']));
      store.dispatch(A.changeFileFocus('/', 'B.md'));
    });
    expect(getSelectedFilePaths()).toEqual(['/A.md', '/B.md', '/C.md']);

    await act(async () => {
      screen.getByRole('listbox').focus();
    });
    await act(() => user.keyboard('{F2}'));

    // F2 opens the rename box on the focused file (B.md), not the first
    // item in the selection.
    const renameInput = await screen.findByDisplayValue('B.md');
    await act(async () => {
      await user.clear(renameInput);
      await user.type(renameInput, 'Song.md{Enter}');
    });

    await waitFor(() => {
      expect(screen.getAllByText('Renamed 3 items')).toHaveLength(1);
    });

    expect(await renderTree()).toMatchInlineSnapshot(`
      "
      .
      ├── Song (1).md
      ├── Song (2).md
      └── Song.md
      "
    `);
  });

  it('renames multiple selected files via the right-click context menu (Windows pattern)', async () => {
    const { renderTree, user, getSelectedFilePaths } = await setupWithListing([
      'A.md',
      'B.md',
      'C.md',
    ]);

    await waitFor(() => getFileListing('/A.md'));

    // Select all three files with a shift-click range.
    await act(async () => {
      await user.click(getFileLink('/A.md'));
    });
    await act(async () => {
      await user.keyboard('{Shift>}');
      await user.click(getFileLink('/C.md'));
      await user.keyboard('{/Shift}');
    });
    expect(getSelectedFilePaths()).toEqual(['/A.md', '/B.md', '/C.md']);

    // Right-click A.md to open its context menu. It's already part of the
    // selection, so the right-click shouldn't collapse it down to just A.md.
    await act(async () => {
      fireEvent.contextMenu(getFileListing('/A.md'));
    });

    const renameButton = await screen.findByRole('button', {
      name: /Rename 3 Items/i,
    });
    await act(async () => {
      await user.click(renameButton);
    });

    const renameInput = await screen.findByDisplayValue('A.md');
    await act(async () => {
      await user.clear(renameInput);
      await user.type(renameInput, 'Song.md{Enter}');
    });

    // A single consolidated toast is shown once the whole batch finishes,
    // not one per file. Wait for it before inspecting the result, since the
    // primary file's rename can land in the UI before its siblings finish.
    await waitFor(() => {
      expect(screen.getAllByText('Renamed 3 items')).toHaveLength(1);
    });

    // Windows Explorer convention: the file whose name was typed gets the
    // exact name, and each other selected file gets the same base name with
    // an incrementing counter appended before the extension.
    expect(await renderTree()).toMatchInlineSnapshot(`
      "
      .
      ├── Song (1).md
      ├── Song (2).md
      └── Song.md
      "
    `);

    expect(getSelectedFilePaths()).toEqual([
      '/Song (1).md',
      '/Song (2).md',
      '/Song.md',
    ]);
  });

  it('skips a counter suffix already taken by an existing file when batch renaming', async () => {
    const { renderTree, user, getSelectedFilePaths } = await setupWithListing([
      'A.md',
      'B.md',
      'Song (1).md',
    ]);

    await waitFor(() => getFileListing('/A.md'));

    // Select A.md and B.md with a ctrl-click.
    await act(async () => {
      await user.click(getFileLink('/A.md'));
    });
    await act(async () => {
      await user.keyboard('{Control>}');
      await user.click(getFileLink('/B.md'));
      await user.keyboard('{/Control}');
    });
    expect(getSelectedFilePaths()).toEqual(['/A.md', '/B.md']);

    await act(async () => {
      fireEvent.contextMenu(getFileListing('/A.md'));
    });

    const renameButton = await screen.findByRole('button', {
      name: /Rename 2 Items/i,
    });
    await act(async () => {
      await user.click(renameButton);
    });

    const renameInput = await screen.findByDisplayValue('A.md');
    await act(async () => {
      await user.clear(renameInput);
      await user.type(renameInput, 'Song.md{Enter}');
    });

    // Wait for the whole batch to finish before inspecting the result.
    await waitFor(() => {
      expect(screen.getAllByText('Renamed 2 items')).toHaveLength(1);
    });

    // "Song (1).md" already existed, so B.md should skip straight to (2)
    // rather than colliding with it.
    expect(await renderTree()).toMatchInlineSnapshot(`
      "
      .
      ├── Song (1).md
      ├── Song (2).md
      └── Song.md
      "
    `);

    expect(getSelectedFilePaths()).toEqual(['/Song (2).md', '/Song.md']);
  });

  it('refuses to rename a file onto a name that already exists', async () => {
    const { renderTree, user } = await setupWithListing(['A.md', 'B.md']);

    await waitFor(() => getFileListing('/A.md'));

    // Right-clicking a non-selected file selects just that file.
    await act(async () => {
      fireEvent.contextMenu(getFileListing('/A.md'));
    });

    const renameButton = await screen.findByRole('button', {
      name: /^Rename$/i,
    });
    await act(async () => {
      await user.click(renameButton);
    });

    const renameInput = await screen.findByDisplayValue('A.md');
    await act(async () => {
      await user.clear(renameInput);
      await user.type(renameInput, 'B.md{Enter}');
    });

    await screen.findByText(/already exists in this folder/i);

    // Neither file was touched, and the rename input is still open so the
    // user can correct the name.
    expect(await renderTree()).toMatchInlineSnapshot(`
      "
      .
      ├── A.md
      └── B.md
      "
    `);
    expect(screen.getByDisplayValue('B.md')).toBeTruthy();
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

  it('adds an arrow-key focused file to a ctrl-click selection', async () => {
    const { user, navigateByKeyboard, getSelectedFilePaths } =
      await setupWithListing(['A.md', 'B.md', 'C.md', 'D.md']);

    await waitFor(() => getFileListing('/A.md'));

    // Arrow down to focus B.md, without a mouse click.
    await navigateByKeyboard('{ArrowDown}', '/A.md');
    await navigateByKeyboard('{ArrowDown}', '/B.md');

    await act(async () => {
      await user.keyboard('{Control>}');
      await user.click(getFileLink('/D.md'));
      await user.keyboard('{/Control}');
    });

    expect(getSelectedFilePaths()).toEqual(['/B.md', '/D.md']);
  });

  it('copies multiple selected files into a folder', async () => {
    const { renderTree, user, getSelectedFilePaths } = await setupWithListing([
      'A.md',
      'B.md',
      'C.md',
      'Dest/',
    ]);

    await waitFor(() => getFileListing('/A.md'));

    // Select A.md and C.md with a ctrl-click.
    await act(async () => {
      await user.click(getFileLink('/A.md'));
    });
    await act(async () => {
      await user.keyboard('{Control>}');
      await user.click(getFileLink('/C.md'));
      await user.keyboard('{/Control}');
    });
    expect(getSelectedFilePaths()).toEqual(['/A.md', '/C.md']);

    // Copy the selection.
    await act(() => user.keyboard('{Meta>}c{/Meta}'));

    // Navigate into the Dest folder.
    await act(async () => {
      await user.dblClick(getFileLink('/Dest'));
    });
    await waitFor(() => screen.getByRole('listbox'));

    // Paste the selection.
    await act(() => user.keyboard('{Meta>}v{/Meta}'));

    await waitFor(() => {
      expect(getSelectedFilePaths()).toEqual(['/Dest/A.md', '/Dest/C.md']);
    });

    // A single consolidated toast is shown for the batch, not one per file.
    expect(screen.getAllByText('Copied 2 files')).toHaveLength(1);

    expect(await renderTree()).toMatchInlineSnapshot(`
      "
      .
      ├── A.md
      ├── B.md
      ├── C.md
      └── Dest
          ├── A.md
          └── C.md
      "
    `);
  });

  it('cuts multiple selected files into a folder', async () => {
    const { renderTree, user, getSelectedFilePaths } = await setupWithListing([
      'A.md',
      'B.md',
      'C.md',
      'Dest/',
    ]);

    await waitFor(() => getFileListing('/A.md'));

    // Select A.md through B.md with a shift-click range.
    await act(async () => {
      await user.click(getFileLink('/A.md'));
    });
    await act(async () => {
      await user.keyboard('{Shift>}');
      await user.click(getFileLink('/B.md'));
      await user.keyboard('{/Shift}');
    });
    expect(getSelectedFilePaths()).toEqual(['/A.md', '/B.md']);

    // Cut the selection.
    await act(() => user.keyboard('{Meta>}x{/Meta}'));

    // Navigate into the Dest folder.
    await act(async () => {
      await user.dblClick(getFileLink('/Dest'));
    });
    await waitFor(() => screen.getByRole('listbox'));

    // Paste the selection.
    await act(() => user.keyboard('{Meta>}v{/Meta}'));

    await waitFor(() => {
      expect(getSelectedFilePaths()).toEqual(['/Dest/A.md', '/Dest/B.md']);
    });

    // A single consolidated toast is shown for the batch, not one per file.
    expect(screen.getAllByText('Moved 2 files')).toHaveLength(1);

    expect(await renderTree()).toMatchInlineSnapshot(`
      "
      .
      ├── C.md
      └── Dest
          ├── A.md
          └── B.md
      "
    `);
  });

  it('deletes multiple selected files with the Delete key (Windows/Linux)', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    try {
      const { renderTree, user, getSelectedFilePaths } = await setupWithListing(
        ['A.md', 'B.md', 'C.md'],
      );

      await waitFor(() => getFileListing('/A.md'));

      // Select A.md and C.md with a ctrl-click.
      await act(async () => {
        await user.click(getFileLink('/A.md'));
      });
      await act(async () => {
        await user.keyboard('{Control>}');
        await user.click(getFileLink('/C.md'));
        await user.keyboard('{/Control}');
      });
      expect(getSelectedFilePaths()).toEqual(['/A.md', '/C.md']);

      // Delete the selection.
      await act(() => user.keyboard('{Delete}'));

      expect(confirmSpy).toHaveBeenCalledWith(
        'Are you sure you want to delete these 2 items?',
      );

      // A single consolidated toast is shown for the batch, not one per file.
      await waitFor(() => {
        expect(screen.getAllByText('Deleted 2 items')).toHaveLength(1);
      });

      expect(screen.queryAllByRole('option').map(getFilePath)).toEqual([
        '/B.md',
      ]);

      expect(await renderTree()).toMatchInlineSnapshot(`
        "
        .
        └── B.md
        "
      `);
    } finally {
      confirmSpy.mockRestore();
    }
  });

  it('deletes multiple selected files with Cmd+Delete (macOS)', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    try {
      const { renderTree, user, getSelectedFilePaths } = await setupWithListing(
        ['A.md', 'B.md', 'C.md'],
      );

      await waitFor(() => getFileListing('/A.md'));

      // Select A.md and C.md with a ctrl-click.
      await act(async () => {
        await user.click(getFileLink('/A.md'));
      });
      await act(async () => {
        await user.keyboard('{Control>}');
        await user.click(getFileLink('/C.md'));
        await user.keyboard('{/Control}');
      });
      expect(getSelectedFilePaths()).toEqual(['/A.md', '/C.md']);

      // Delete the selection with the macOS Finder shortcut, Cmd+Delete
      // (the physical key most Mac keyboards ship with reports as
      // Backspace).
      await act(() => user.keyboard('{Meta>}{Backspace}{/Meta}'));

      expect(confirmSpy).toHaveBeenCalledWith(
        'Are you sure you want to delete these 2 items?',
      );

      await waitFor(() => {
        expect(screen.getAllByText('Deleted 2 items')).toHaveLength(1);
      });

      expect(screen.queryAllByRole('option').map(getFilePath)).toEqual([
        '/B.md',
      ]);

      expect(await renderTree()).toMatchInlineSnapshot(`
        "
        .
        └── B.md
        "
      `);
    } finally {
      confirmSpy.mockRestore();
    }
  });

  it('cuts and pastes a folder into another folder', async () => {
    const { renderTree, user, getSelectedFilePaths } = await setupWithListing([
      'Source/Song A.md',
      'Source/Song B.md',
      'Dest/',
    ]);

    await waitFor(() => getFileListing('/Source'));

    // Select the Source folder.
    await act(async () => {
      await user.click(getFileLink('/Source'));
    });
    expect(getSelectedFilePaths()).toEqual(['/Source']);

    // Cut the folder.
    await act(() => user.keyboard('{Meta>}x{/Meta}'));

    // Navigate into the Dest folder.
    await act(async () => {
      await user.dblClick(getFileLink('/Dest'));
    });
    await waitFor(() => screen.getByRole('listbox'));

    // Paste the folder.
    await act(() => user.keyboard('{Meta>}v{/Meta}'));

    await waitFor(() => {
      expect(getSelectedFilePaths()).toEqual(['/Dest/Source']);
    });

    expect(await renderTree()).toMatchInlineSnapshot(`
      "
      .
      └── Dest
          └── Source
              ├── Song A.md
              └── Song B.md
      "
    `);
  });

  it('drops stale focus and selection state for a folder after its only file moves out', async () => {
    const idbfs = getIDBFS();
    const store = createStore();
    store.dispatch(A.changeFileStore('browser'));
    await connectBrowserFiles(store, idbfs, ['Source/Song.md', 'Dest/']);

    // Simulate having Song.md focused and selected while browsing Source.
    store.dispatch(A.changeFileFocus('/Source', 'Song.md'));
    store.dispatch(A.setFileSelection('/Source', ['Song.md']));

    // Move the only file out of Source, e.g. via cut/paste into Dest.
    await store.dispatch(A.moveFile('/Source/Song.md', '/Dest/Song.md'));

    const state = store.getState();
    expect($.getFileFocusByPath(state)['/Source']).toBeUndefined();
    expect($.getFileSelectionByPath(state)['/Source']).toBeUndefined();
  });
});
