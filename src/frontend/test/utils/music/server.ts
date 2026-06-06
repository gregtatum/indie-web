import { spawn } from 'child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as net from 'node:net';
import nodeFetch from 'node-fetch';

export interface MusicTestServer {
  baseUrl: string;
  mountDir: string;
  close: () => Promise<void>;
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
  const serverDir = join(__dirname, '../../../../server');

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
