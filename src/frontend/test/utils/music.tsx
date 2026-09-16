import { render } from '@testing-library/react';
import { spawn } from 'child_process';
import { writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
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
import { MUSIC_INDEX_VERSION } from 'shared/music';
import { ensureExists } from '../../utils';
import { mockRealFetch, type RealFetchMock, settleApp } from './fixtures';

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
    composer: string;
    album: string;
    genre: string;
    /** Track number, written as a TRCK frame. */
    track: number;
    /**
     * When set, an APIC picture frame is embedded so a scan reports
     * hasEmbeddedArtwork and the ID3 tab shows an embedded-art row.
     */
    picture: {
      mimeType: 'image/jpeg' | 'image/png';
      description?: string;
      data: Buffer;
    };
    /** Raw TXXX private frames, keyed by description (e.g. app grouping flags). */
    txxx: Record<string, string>;
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
  if (tags.composer) {
    frames.push(textFrame('TCOM', tags.composer));
  }
  if (tags.album) {
    frames.push(textFrame('TALB', tags.album));
  }
  if (tags.genre) {
    frames.push(textFrame('TCON', tags.genre));
  }
  if (tags.track !== undefined) {
    frames.push(textFrame('TRCK', String(tags.track)));
  }
  for (const [description, value] of Object.entries(tags.txxx ?? {})) {
    // TXXX: encoding(1) + description + NUL + value.
    frames.push(
      frame(
        'TXXX',
        Buffer.concat([
          Buffer.from([0x00]),
          Buffer.from(description, 'latin1'),
          Buffer.from([0x00]),
          Buffer.from(value, 'latin1'),
        ]),
      ),
    );
  }
  if (tags.picture) {
    // APIC: encoding(1) + MIME + NUL + picture type(1)=0x03 (front cover) +
    // description + NUL + picture data.
    const description = tags.picture.description ?? 'Cover (front)';
    frames.push(
      frame(
        'APIC',
        Buffer.concat([
          Buffer.from([0x00]),
          Buffer.from(tags.picture.mimeType, 'latin1'),
          Buffer.from([0x00]),
          Buffer.from([0x03]),
          Buffer.from(description, 'latin1'),
          Buffer.from([0x00]),
          tags.picture.data,
        ]),
      ),
    );
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

/**
 * A byte buffer that sniffs as a real JPEG (SOI…EOI markers) so the server's
 * image detection accepts it as folder artwork. `size` pads the middle so tests
 * can assert a human-readable size label (e.g. "240 KB").
 */
export function buildJpegBytes(size = 245_760): Buffer {
  const head = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  const tail = Buffer.from([0xff, 0xd9]);
  const padLength = Math.max(0, size - head.length - tail.length);
  return Buffer.concat([head, Buffer.alloc(padLength, 0x20), tail]);
}

/**
 * Like {@link buildJpegBytes} but with a PNG signature.
 */
export function buildPngBytes(size = 4_096): Buffer {
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const padLength = Math.max(0, size - signature.length);
  return Buffer.concat([signature, Buffer.alloc(padLength, 0x00)]);
}

/**
 * Writes a `Folder.jpg` (or `Folder.png`) into an album directory under the
 * mount so the server serves real folder artwork and its HEAD size.
 */
export async function writeFolderArtwork(
  server: MusicTestServer,
  albumDirClientPath: string,
  bytes: Buffer = buildJpegBytes(),
): Promise<string> {
  const filename = bytes[0] === 0x89 ? 'Folder.png' : 'Folder.jpg';
  const dir = join(server.mountDir, albumDirClientPath);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), bytes);
  const normalizedDir = albumDirClientPath.startsWith('/')
    ? albumDirClientPath
    : '/' + albumDirClientPath;
  return `${normalizedDir.replace(/\/$/, '')}/${filename}`;
}

export function writeMusicIndex(
  server: MusicTestServer,
  tracks: Types.TrackMetadata[],
): void {
  const index: Types.MusicIndex = {
    version: MUSIC_INDEX_VERSION,
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

let networkMock: RealFetchMock | null = null;

export function isNetworkIdle(): boolean {
  return ensureExists(
    networkMock,
    'useMusicTestServer() must be called before isNetworkIdle()',
  ).isNetworkIdle();
}

export async function waitForNetworkIdle(): Promise<void> {
  await ensureExists(
    networkMock,
    'useMusicTestServer() must be called before waitForNetworkIdle()',
  ).waitForNetworkIdle();
}

export function useMusicTestServer() {
  let server: MusicTestServer | null = null;
  networkMock = mockRealFetch(nodeFetch);

  beforeAll(async () => {
    server = await startMusicTestServer();
  }, 15_000);

  let originalEventSource: typeof EventSource | undefined;
  beforeEach(() => {
    originalEventSource = (global as any).EventSource;
    (global as any).EventSource = NodeEventSource;
  });

  afterEach(() => {
    (global as any).EventSource = originalEventSource;
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

/**
 * Empties the shared mount directory so each test starts from a clean library.
 * Tests that assert on track titles need this — a leftover file from an earlier
 * test would make `findByText` match multiple rows.
 */
export async function clearMusicMount(server: MusicTestServer): Promise<void> {
  await React.act(async () => {
    await waitForNetworkIdle();
  });
  const entries = await readdir(server.mountDir);
  await Promise.all(
    entries.map((entry) =>
      rm(join(server.mountDir, entry), { recursive: true, force: true }),
    ),
  );
}

interface RenderMusicAppOptions {
  server: MusicTestServer;
  search?: string;
}

export async function renderMusicApp({
  server,
  search = '',
}: RenderMusicAppOptions) {
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
  await settleApp();

  return { store, testServer };
}
