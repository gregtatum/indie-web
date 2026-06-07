import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import {
  buildMinimalMp3,
  buildMp3WithTags,
  removeMusicIndex,
  renderMusicApp,
  useMusicTestServer,
} from './utils/music';

const v1Fixture = readFileSync(
  join(__dirname, 'fixtures/music-index-v1.json'),
  'utf-8',
);

const jestDescribe = globalThis.describe;
let describe: (name: string, fn: () => void) => void = jestDescribe;
if (process.env.INDIE_WEB_SKIP_LOCALHOST_TESTS === '1') {
  // The check runner enables this in sandboxes that cannot bind localhost.
  describe = (name) => {
    process.stderr.write(`LOCALHOST_BIND_SKIPPED_TEST ${name}\n`);
  };
  it.skip('localhost-dependent tests skipped by check runner', () => {});
}

describe('<Music> with real server', () => {
  const { getServer } = useMusicTestServer();

  // The virtualizer reads offsetHeight/offsetWidth to determine how many rows to
  // render. Jsdom returns 0 for both, so without this the virtualizer renders
  // nothing and cleanup hits a broken ResizeObserver instance during unmount.
  beforeEach(() => {
    jest
      .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
      .mockReturnValue(600);
    jest
      .spyOn(HTMLElement.prototype, 'offsetWidth', 'get')
      .mockReturnValue(800);
  });

  afterEach(async () => {
    // All tests share a single server and mount directory for the lifetime of this
    // describe block. Tests that write .music-index.json (e.g. the v1 upgrade
    // tests) would otherwise leave stale state that silently affects later tests.
    await removeMusicIndex(getServer());
  });

  function setup(search = '') {
    return renderMusicApp({ server: getServer(), search });
  }

  it('renders the Scan Library button', async () => {
    setup();
    await screen.findByRole('button', { name: 'Scan Library' });
    await screen.findByText('Music library not found. Run a scan first.');
  });

  it('shows files from the server in the listing', async () => {
    await writeFile(join(getServer().mountDir, 'Blue.mp3'), buildMinimalMp3());

    setup('?view=files');

    // The filename is split across spans (name + "." + extension).
    // Match extension span ("mp3") and name within the display span ("Blue...").
    await screen.findByText('mp3');
    await screen.findByText('Blue', {
      selector: '.listFileDisplayName',
      exact: false,
    });
  });

  it('scans and reports the track count', async () => {
    await writeFile(
      join(getServer().mountDir, 'Track1.mp3'),
      buildMinimalMp3(),
    );
    await writeFile(
      join(getServer().mountDir, 'Track2.mp3'),
      buildMinimalMp3(),
    );

    setup();
    await screen.findByText('Music library not found. Run a scan first.');

    await act(async () => {
      await userEvent.click(
        await screen.findByRole('button', { name: 'Scan Library' }),
      );
    });

    await screen.findByText(/Found \d+ tracks\./);
  });

  it('shows "Scanning…" and disables the button while a scan is in progress', async () => {
    setup();
    await screen.findByText('Music library not found. Run a scan first.');

    const button = await screen.findByRole('button', {
      name: 'Scan Library',
    });
    void userEvent.click(button);

    const scanningButton = await screen.findByRole('button', {
      name: 'Scanning…',
    });
    expect((scanningButton as HTMLButtonElement).disabled).toBe(true);

    // Wait for the scan to finish so the process doesn't leak into the next test.
    await screen.findByRole('button', { name: 'Scan Library' });
  });

  it('picks up a newly added file on a second scan', async () => {
    await writeFile(join(getServer().mountDir, 'IncrA.mp3'), buildMinimalMp3());

    setup();
    await screen.findByText('Music library not found. Run a scan first.');

    // First scan — establishes the baseline count.
    await act(async () => {
      await userEvent.click(
        await screen.findByRole('button', { name: 'Scan Library' }),
      );
    });
    const firstResult = await screen.findByText(/Found \d+ tracks\./);
    const firstCount = parseInt(firstResult.textContent!.match(/\d+/)![0], 10);

    // Add another file, then scan again.
    await writeFile(join(getServer().mountDir, 'IncrB.mp3'), buildMinimalMp3());

    await act(async () => {
      await userEvent.click(
        screen.getByRole('button', { name: 'Scan Library' }),
      );
    });

    // The count must have gone up by exactly one.
    await screen.findByText(`Found ${firstCount + 1} tracks.`);
  });

  it('re-enables the Scan Library button after a scan completes', async () => {
    setup();
    await screen.findByText('Music library not found. Run a scan first.');

    await act(async () => {
      await userEvent.click(
        await screen.findByRole('button', { name: 'Scan Library' }),
      );
    });

    await waitFor(() => {
      const button = screen.getByRole('button', { name: 'Scan Library' });
      expect((button as HTMLButtonElement).disabled).toBe(false);
    });
  });

  it('does not show the rescan button after a fresh scan', async () => {
    setup();
    await screen.findByText('Music library not found. Run a scan first.');

    await act(async () => {
      await userEvent.click(
        await screen.findByRole('button', { name: 'Scan Library' }),
      );
    });

    await screen.findByText(/Found \d+ tracks\./);
    expect(
      screen.queryByRole('button', { name: 'Rescan recommended' }),
    ).toBeNull();
  });

  it('shows "Scan Library (updates detected)" when the served index is v1', async () => {
    await writeFile(join(getServer().mountDir, '.music-index.json'), v1Fixture);

    setup();

    await screen.findByRole('button', {
      name: 'Scan Library (updates detected)',
    });
  });

  it('reverts to "Scan Library" after scanning clears the stale index', async () => {
    await writeFile(join(getServer().mountDir, '.music-index.json'), v1Fixture);

    setup();

    await screen.findByRole('button', {
      name: 'Scan Library (updates detected)',
    });

    await act(async () => {
      await userEvent.click(
        screen.getByRole('button', {
          name: 'Scan Library (updates detected)',
        }),
      );
    });

    await screen.findByText(/Found \d+ tracks\./);
    await screen.findByRole('button', { name: 'Scan Library' });
  });

  it('edits a track title and persists it to the MP3 file', async () => {
    await writeFile(
      join(getServer().mountDir, 'EditTest.mp3'),
      buildMp3WithTags({ title: 'Original Title', artist: 'Test Artist' }),
    );

    setup();
    await screen.findByText('Music library not found. Run a scan first.');
    await act(async () => {
      await userEvent.click(
        await screen.findByRole('button', { name: 'Scan Library' }),
      );
    });
    await screen.findByText(/Found \d+ tracks\./);

    const trackEl = await screen.findByText('Original Title');
    await act(async () => {
      fireEvent.contextMenu(trackEl);
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    });

    // Wait for tags to fully load — the TagsTab shows "Loading…" while in-flight;
    // it's kept in the DOM even when the Details tab is active, so we can wait for
    // it to disappear without switching tabs.
    await waitFor(() => {
      expect(screen.queryByText('Loading…')).toBeNull();
      expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe(
        'Original Title',
      );
    });

    const titleInput = screen.getByLabelText('Title') as HTMLInputElement;
    await act(async () => {
      await userEvent.clear(titleInput);
      await userEvent.type(titleInput, 'Updated Title');
    });

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    // Save complete when the button is disabled again (isDirty is false).
    await waitFor(() => {
      expect(
        (screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement)
          .disabled,
      ).toBe(true);
    });

    // Confirm the tag was written by re-fetching from the real server.
    const tagsRes = await fetch(
      `${getServer().baseUrl}/music/track-tags?path=${encodeURIComponent('/EditTest.mp3')}`,
    );
    const tagsData = (await tagsRes.json()) as {
      native: Array<{
        format: string;
        tags: Array<{ id: string; value: string }>;
      }>;
    };
    const allTags = tagsData.native.flatMap((b) => b.tags);
    expect(allTags.find((t) => t.id === 'TIT2')?.value).toBe('Updated Title');
  }, 30_000);

  it('keeps saved edits visible after reloading the music index', async () => {
    await writeFile(
      join(getServer().mountDir, 'Optimistic.mp3'),
      buildMp3WithTags({ title: 'Indexed Title', artist: 'Test Artist' }),
    );

    setup();
    await screen.findByText('Music library not found. Run a scan first.');
    await act(async () => {
      await userEvent.click(
        await screen.findByRole('button', { name: 'Scan Library' }),
      );
    });
    await screen.findByText(/Found \d+ tracks\./);

    await act(async () => {
      fireEvent.contextMenu(await screen.findByText('Indexed Title'));
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    });
    await waitFor(() => {
      expect(screen.queryByText('Loading…')).toBeNull();
      expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe(
        'Indexed Title',
      );
    });

    await act(async () => {
      await userEvent.clear(screen.getByLabelText('Title'));
      await userEvent.type(screen.getByLabelText('Title'), 'Saved Title');
    });
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    await waitFor(() => {
      expect(
        (screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement)
          .disabled,
      ).toBe(true);
    });

    await screen.findByText('Saved Title', { selector: '.musicTrackTitle' });
    expect(
      screen.queryByRole('button', {
        name: 'Scan Library (updates detected)',
      }),
    ).toBeNull();

    cleanup();
    setup();
    await screen.findByText('Saved Title');
    expect(screen.queryByText('Indexed Title')).toBeNull();
    expect(
      screen.queryByRole('button', {
        name: 'Scan Library (updates detected)',
      }),
    ).toBeNull();
  }, 30_000);

  it('does not require a rescan after saving indexed track metadata', async () => {
    await writeFile(
      join(getServer().mountDir, 'RescanEdit.mp3'),
      buildMp3WithTags({ title: 'Before Rescan', artist: 'Test Artist' }),
    );

    setup();
    await screen.findByText('Music library not found. Run a scan first.');
    await act(async () => {
      await userEvent.click(
        await screen.findByRole('button', { name: 'Scan Library' }),
      );
    });
    await screen.findByText(/Found \d+ tracks\./);

    await act(async () => {
      fireEvent.contextMenu(await screen.findByText('Before Rescan'));
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    });
    await waitFor(() => {
      expect(screen.queryByText('Loading…')).toBeNull();
      expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe(
        'Before Rescan',
      );
    });

    await act(async () => {
      await userEvent.clear(screen.getByLabelText('Title'));
      await userEvent.type(screen.getByLabelText('Title'), 'After Rescan');
    });
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    await waitFor(() => {
      expect(
        (screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement)
          .disabled,
      ).toBe(true);
    });

    await screen.findByText('After Rescan', { selector: '.musicTrackTitle' });
    await screen.findByRole('button', { name: 'Scan Library' });
    expect(
      screen.queryByRole('button', {
        name: 'Scan Library (updates detected)',
      }),
    ).toBeNull();
  }, 30_000);

  it('refreshes the ID3 tab after saving Details changes', async () => {
    await writeFile(
      join(getServer().mountDir, 'Id3Refresh.mp3'),
      buildMp3WithTags({ title: 'ID3 Old Title', artist: 'Test Artist' }),
    );

    setup();
    await screen.findByText('Music library not found. Run a scan first.');
    await act(async () => {
      await userEvent.click(
        await screen.findByRole('button', { name: 'Scan Library' }),
      );
    });
    await screen.findByText(/Found \d+ tracks\./);

    await act(async () => {
      fireEvent.contextMenu(await screen.findByText('ID3 Old Title'));
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    });
    await waitFor(() => {
      expect(screen.queryByText('Loading…')).toBeNull();
      expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe(
        'ID3 Old Title',
      );
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: 'ID3' }));
    });
    expect(
      screen
        .getAllByDisplayValue('ID3 Old Title')
        .some((input) =>
          (input as HTMLInputElement).classList.contains(
            'editTrackModalInput-readonly',
          ),
        ),
    ).toBe(true);

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Details' }));
    });
    await act(async () => {
      await userEvent.clear(screen.getByLabelText('Title'));
      await userEvent.type(screen.getByLabelText('Title'), 'ID3 New Title');
    });
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    await waitFor(() => {
      expect(
        (screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement)
          .disabled,
      ).toBe(true);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: 'ID3' }));
    });
    await waitFor(() => {
      expect(
        screen
          .getAllByDisplayValue('ID3 New Title')
          .some((input) =>
            (input as HTMLInputElement).classList.contains(
              'editTrackModalInput-readonly',
            ),
          ),
      ).toBe(true);
    });
    expect(
      screen
        .queryAllByDisplayValue('ID3 Old Title')
        .some((input) =>
          (input as HTMLInputElement).classList.contains(
            'editTrackModalInput-readonly',
          ),
        ),
    ).toBe(false);
  }, 30_000);

  it('requires double-close to discard unsaved changes', async () => {
    await writeFile(
      join(getServer().mountDir, 'CloseTest.mp3'),
      buildMp3WithTags({ title: 'Close Test Track' }),
    );

    setup();
    await screen.findByText('Music library not found. Run a scan first.');
    await act(async () => {
      await userEvent.click(
        await screen.findByRole('button', { name: 'Scan Library' }),
      );
    });
    await screen.findByText(/Found \d+ tracks\./);

    const trackEl = await screen.findByText('Close Test Track');
    await act(async () => {
      fireEvent.contextMenu(trackEl);
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    });

    await waitFor(() => {
      const titleInput = screen.getByLabelText('Title') as HTMLInputElement;
      expect(titleInput.value).toBe('Close Test Track');
      expect(titleInput.disabled).toBe(false);
    });

    await act(async () => {
      await userEvent.clear(screen.getByLabelText('Title') as HTMLInputElement);
      await userEvent.type(
        screen.getByLabelText('Title') as HTMLInputElement,
        'Changed Title',
      );
    });

    // First close — modal should stay open, warning should appear.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    });
    expect(screen.queryByRole('dialog')).not.toBeNull();
    await screen.findByText('Close one more time to discard changes');

    // Second close — modal should close.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  }, 30_000);
});
