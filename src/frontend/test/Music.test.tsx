import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import * as React from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { AppRoutes } from 'frontend/components/App';
import { createStore } from 'frontend/store/create-store';
import { A, T } from 'frontend';
import type { FetchMockSandbox } from 'fetch-mock';
import { readFileSync } from 'node:fs';
import {
  startMusicTestServer,
  type MusicTestServer,
} from './utils/musicTestServer';
import { NodeEventSource } from './utils/nodeEventSource';
// node-fetch provides real HTTP for the fetch-mock sandbox's fallbackToNetwork.
import nodeFetch from 'node-fetch';

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

function buildMp3WithTags(
  tags: Partial<{
    title: string;
    artist: string;
    album: string;
    genre: string;
  }>,
): Buffer {
  function frame(id: string, content: Buffer): Buffer {
    const header = Buffer.alloc(10);
    header.write(id, 0, 4, 'ascii');
    header.writeUInt32BE(content.length, 4);
    header.writeUInt16BE(0, 8);
    return Buffer.concat([header, content]);
  }
  function textFrame(id: string, text: string): Buffer {
    return frame(
      id,
      Buffer.concat([Buffer.from([0x00]), Buffer.from(text, 'latin1')]),
    );
  }
  const frames: Buffer[] = [];
  if (tags.title) {
    frames.push(textFrame('TIT2', tags.title));
  }
  if (tags.artist) {
    frames.push(textFrame('TPE1', tags.artist));
  }
  if (tags.album) {
    frames.push(textFrame('TALB', tags.album));
  }
  if (tags.genre) {
    frames.push(textFrame('TCON', tags.genre));
  }
  const frameData = Buffer.concat(frames);
  const id3Header = Buffer.alloc(10);
  id3Header.write('ID3', 0, 3, 'ascii');
  id3Header.writeUInt8(3, 3);
  id3Header.writeUInt8(0, 4);
  id3Header.writeUInt8(0, 5);
  const size = frameData.length;
  id3Header.writeUInt8((size >> 21) & 0x7f, 6);
  id3Header.writeUInt8((size >> 14) & 0x7f, 7);
  id3Header.writeUInt8((size >> 7) & 0x7f, 8);
  id3Header.writeUInt8(size & 0x7f, 9);
  return Buffer.concat([id3Header, frameData]);
}

// Minimal valid MP3: ID3v2.3 header with no frames (11 bytes).
// Enough for the server to recognise it as an audio file without needing
// the full music-metadata tag parsing to succeed.
function buildMinimalMp3(): Buffer {
  const header = Buffer.alloc(10);
  header.write('ID3', 0, 3, 'ascii');
  header.writeUInt8(3, 3); // version 2.3
  header.writeUInt8(0, 4); // revision
  header.writeUInt8(0, 5); // flags
  header.writeUInt32BE(0, 6); // size = 0 (no frames)
  return header;
}

/**
 * Handles the lifecycle of starting and stopping the real music test server,
 * and installs the EventSource polyfill + fetch routing needed by each test.
 */
function useMusicTestServer() {
  let server: MusicTestServer | null = null;

  beforeAll(async () => {
    server = await startMusicTestServer();
  }, 15_000);

  beforeEach(() => {
    // Install the NodeEventSource polyfill so the Music component can use
    // EventSource in jsdom (which has no native implementation).
    (global as any).EventSource = NodeEventSource;

    // setupAfterEnv replaces window.fetch with a fetch-mock sandbox. We replace
    // it again with a wrapper that routes requests to the real test server through
    // node-fetch (direct HTTP), while everything else still goes to the sandbox
    // (returning 404 by default for unrelated calls).
    const sandbox = window.fetch as FetchMockSandbox;
    sandbox.config.fallbackToNetwork = false;
    (global as any).fetch = async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      let url: string;
      if (typeof input === 'string') {
        url = input;
      } else if (input instanceof URL) {
        url = input.toString();
      } else {
        url = (input as Request).url;
      }
      if (url.startsWith(getServer().baseUrl)) {
        return nodeFetch(url, init as any) as any;
      }
      return sandbox(input instanceof URL ? url : input, init);
    };
  });

  afterAll(async () => {
    await server?.close();
  });

  function getServer(): MusicTestServer {
    if (!server) {
      throw new Error('Music test server not started');
    }
    return server;
  }

  return { getServer };
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
    await rm(join(getServer().mountDir, '.music-index.json'), {
      force: true,
    });
  });

  function setup(search = '') {
    const server = getServer();
    const testServer: T.FileStoreServer = {
      url: server.baseUrl,
      name: 'Test Music',
      id: 'test-music',
      storeType: 'music',
    };

    const store = createStore();
    store.dispatch(A.addFileStoreServer(testServer));

    render(
      <MemoryRouter initialEntries={[`/${testServer.id}/music${search}`]}>
        <Provider store={store as any}>
          <AppRoutes />
        </Provider>
      </MemoryRouter>,
    );

    return { store, testServer };
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
      expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe(
        'Close Test Track',
      );
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
