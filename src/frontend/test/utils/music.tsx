import { render } from '@testing-library/react';
import { spawn } from 'child_process';
import { writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import * as net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import nodeFetch from 'node-fetch';
import * as React from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { A, T } from 'frontend';
import { AppRoutes } from 'frontend/components/App';
import { createStore } from 'frontend/store/create-store';
import * as Types from 'frontend/@types';

export interface MusicTestServer {
  baseUrl: string;
  mountDir: string;
  close: () => Promise<void>;
}

export function buildMp3WithTags(
  tags: Partial<{
    title: string;
    artist: string;
    albumArtist: string;
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
  if (tags.albumArtist) {
    frames.push(textFrame('TPE2', tags.albumArtist));
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
export function buildMinimalMp3(): Buffer {
  const header = Buffer.alloc(10);
  header.write('ID3', 0, 3); // ID3v2 marker
  header.writeUInt8(3, 3); // version 2.3
  header.writeUInt8(0, 4); // revision
  header.writeUInt8(0, 5); // flags
  header.writeUInt32BE(0, 6); // size = 0 (no frames)
  return header;
}

export function writeMusicIndex(
  server: MusicTestServer,
  tracks: Types.TrackMetadata[],
): void {
  const index: Types.MusicIndex = {
    version: 6,
    scannedAt: '2024-01-01T00:00:00Z',
    tracks,
  };
  writeFileSync(
    join(server.mountDir, '.music-index.json'),
    JSON.stringify(index),
  );
}

/**
 * Spawns the real music server as a subprocess with a temporary mount directory.
 * The server binary is started the same way `task start-server` does it, but with
 * MOUNT_PATH and PORT overridden so it's isolated and won't collide with other tests.
 */
export async function startMusicTestServer(): Promise<MusicTestServer> {
  if (process.env.INDIE_WEB_SKIP_LOCALHOST_TESTS) {
    throw new Error(
      'Running in a sandboxed environtment, please skip this test with the ' +
        'INDIE_WEB_SKIP_LOCALHOST_TESTS pattern.',
    );
  }
  const mountDir = await mkdtemp(join(tmpdir(), 'indie-web-music-test-'));
  const port = await new Promise<number>((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
  const serverDir = join(__dirname, '../../../server');

  const child = spawn('node', ['--disable-warning=ExperimentalWarning', '.'], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      MOUNT_PATH: mountDir,
    },
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('Timed out waiting for music server to start'));
    }, 10_000);

    child.stdout?.on('data', (chunk: Buffer) => {
      if (chunk.toString().includes('Server started at')) {
        clearTimeout(timeout);
        resolve();
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      console.error('[music-server]', chunk.toString());
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    child.on('exit', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`Music server exited unexpectedly with code ${code}`));
      }
    });
  });

  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    baseUrl,
    mountDir,
    close: async () => {
      await new Promise<void>((resolve) => {
        child.on('exit', () => resolve());
        child.kill('SIGTERM');
      });
      await rm(mountDir, { recursive: true, force: true });
    },
  };
}

/**
 * Minimal EventSource polyfill for jsdom (which lacks a native implementation).
 * Uses node-fetch to buffer the full SSE response then replays events synchronously.
 * Sufficient for tests because the server completes quickly.
 */
class NodeEventSource {
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  private controller = new AbortController();

  constructor(url: string) {
    nodeFetch(url, { signal: this.controller.signal as any })
      .then((res) => res.text())
      .then((text) => {
        for (const chunk of text.split('\n\n')) {
          if (chunk.startsWith('data: ') && this.onmessage) {
            this.onmessage({ data: chunk.slice(6) });
          }
        }
      })
      .catch(() => {
        this.onerror?.();
      });
  }

  close() {
    this.controller.abort();
  }
}

export function useMusicTestServer() {
  let server: MusicTestServer | null = null;

  beforeAll(async () => {
    server = await startMusicTestServer();
  }, 15_000);

  beforeEach(() => {
    (global as any).fetch = nodeFetch;
    (global as any).EventSource = NodeEventSource;
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

export async function removeMusicIndex(server: MusicTestServer): Promise<void> {
  await rm(join(server.mountDir, '.music-index.json'), {
    force: true,
  });
}

interface RenderMusicAppOptions {
  server: MusicTestServer;
  search?: string;
}

export function renderMusicApp({ server, search = '' }: RenderMusicAppOptions) {
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

export function mockMusicMediaElement() {
  jest.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation();
  jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation();
  jest
    .spyOn(HTMLMediaElement.prototype, 'play')
    .mockImplementation(() => Promise.resolve());
}
