import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AppRoutes } from 'frontend/components/App';
import { createStore } from 'frontend/store/create-store';
import { A, T } from 'frontend';
import type { FetchMockSandbox } from 'fetch-mock';
import v1Fixture from './fixtures/music-index-v1.json';
import {
  startMusicTestServer,
  type MusicTestServer,
} from './utils/musicTestServer';
import { NodeEventSource } from './utils/nodeEventSource';
// node-fetch provides real HTTP for the fetch-mock sandbox's fallbackToNetwork.
import nodeFetch from 'node-fetch';

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

    await act(async () => {
      await userEvent.click(
        await screen.findByRole('button', { name: 'Scan Library' }),
      );
    });

    await screen.findByText(/Found \d+ tracks\./);
  });

  it('shows "Scanning…" and disables the button while a scan is in progress', async () => {
    setup();

    const button = await screen.findByRole('button', { name: 'Scan Library' });
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

  it('shows the rescan button when the served index is v1', async () => {
    await writeFile(
      join(getServer().mountDir, '.music-index.json'),
      JSON.stringify(v1Fixture),
    );

    setup();

    await screen.findByRole('button', { name: 'Rescan recommended' });
  });

  it('rescan button disappears after clicking it and a scan completes', async () => {
    await writeFile(
      join(getServer().mountDir, '.music-index.json'),
      JSON.stringify(v1Fixture),
    );

    setup();

    await screen.findByRole('button', { name: 'Rescan recommended' });

    await act(async () => {
      await userEvent.click(
        screen.getByRole('button', { name: 'Rescan recommended' }),
      );
    });

    await screen.findByText(/Found \d+ tracks\./);
    expect(
      screen.queryByRole('button', { name: 'Rescan recommended' }),
    ).toBeNull();
  });
});
