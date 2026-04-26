import { spawn, type ChildProcess } from 'child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as net from 'node:net';

export interface MusicTestServer {
  baseUrl: string;
  mountDir: string;
  close: () => Promise<void>;
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

function killProcess(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    child.on('exit', () => resolve());
    child.kill('SIGTERM');
  });
}

/**
 * Spawns the real music server as a subprocess with a temporary mount directory.
 * The server binary is started the same way `task start-server` does it, but with
 * MOUNT_PATH and PORT overridden so it's isolated and won't collide with other tests.
 *
 * Call close() in afterEach to kill the process and delete the temp directory.
 */
export async function startMusicTestServer(): Promise<MusicTestServer> {
  const mountDir = await mkdtemp(join(tmpdir(), 'indie-web-music-test-'));
  const port = await getFreePort();
  const serverDir = join(__dirname, '../../../../src/server');

  const child = spawn(
    'node',
    ['--disable-warning=ExperimentalWarning', '.'],
    {
      cwd: serverDir,
      env: {
        ...process.env,
        PORT: String(port),
        HOST: '127.0.0.1',
        MOUNT_PATH: mountDir,
      },
    },
  );

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
      await killProcess(child);
      await rm(mountDir, { recursive: true, force: true });
    },
  };
}
