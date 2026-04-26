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
import {
  startMusicTestServer,
  type MusicTestServer,
} from './utils/musicTestServer';
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

let server: MusicTestServer;

beforeAll(async () => {
  server = await startMusicTestServer();
}, 15_000);

beforeEach(() => {
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
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    if (url.startsWith(server.baseUrl)) {
      return nodeFetch(url, init as any) as any;
    }
    return sandbox(input, init);
  };
});

afterAll(async () => {
  await server.close();
});

function setup() {
  const testServer: T.FileStoreServer = {
    url: server.baseUrl,
    name: 'Test Music',
    id: 'test-music',
    storeType: 'music',
  };

  const store = createStore();
  store.dispatch(A.addFileStoreServer(testServer));

  render(
    <MemoryRouter initialEntries={[`/${testServer.id}/music`]}>
      <Provider store={store as any}>
        <AppRoutes />
      </Provider>
    </MemoryRouter>,
  );

  return { store, testServer };
}

describe('<Music> (integration)', () => {
  it('renders the Scan Library button', async () => {
    setup();
    await screen.findByRole('button', { name: 'Scan Library' });
  });

  it('shows files from the server in the listing', async () => {
    await writeFile(join(server.mountDir, 'Blue.mp3'), buildMinimalMp3());

    setup();

    // The filename is split across spans (name + "." + extension).
    // Match extension span ("mp3") and name within the display span ("Blue...").
    await screen.findByText('mp3');
    await screen.findByText('Blue', {
      selector: '.listFileDisplayName',
      exact: false,
    });
  });

  it('scans and reports the track count', async () => {
    await writeFile(join(server.mountDir, 'Track1.mp3'), buildMinimalMp3());
    await writeFile(join(server.mountDir, 'Track2.mp3'), buildMinimalMp3());

    setup();

    await act(async () => {
      await userEvent.click(await screen.findByRole('button', { name: 'Scan Library' }));
    });

    // The scan found the two MP3s we wrote.
    await screen.findByText(/Found \d+ tracks\./);
  });

  it('shows "Scanning…" and disables the button while a scan is in progress', async () => {
    setup();

    const button = await screen.findByRole('button', { name: 'Scan Library' });
    void userEvent.click(button);

    const scanningButton = await screen.findByRole('button', { name: 'Scanning…' });
    expect((scanningButton as HTMLButtonElement).disabled).toBe(true);

    // Wait for the scan to finish so the process doesn't leak into the next test.
    await screen.findByRole('button', { name: 'Scan Library' });
  });

  it('re-enables the Scan Library button after a scan completes', async () => {
    setup();

    await act(async () => {
      await userEvent.click(await screen.findByRole('button', { name: 'Scan Library' }));
    });

    await waitFor(() => {
      const button = screen.getByRole('button', { name: 'Scan Library' });
      expect((button as HTMLButtonElement).disabled).toBe(false);
    });
  });
});
