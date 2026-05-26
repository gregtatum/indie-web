import { mkdtemp, rm } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import Express from 'express';

export interface TestServer {
  baseUrl: string;
  mountDir: string;
  close: () => Promise<void>;
}

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Wraps a test function to capture and assert console output.
 *
 * During the test, all console.log and console.error calls are intercepted.
 * After the test body runs, the captured messages (ANSI stripped) must account
 * for every entry in `expected` by substring match (unordered). Any captured
 * message left unmatched, or any expected substring with no matching message,
 * fails the test.
 *
 * Pass an empty array to assert the test produces no console output at all.
 */
export function withLogs(
  expected: string[],
  fn: () => Promise<void>,
): () => Promise<void> {
  return async () => {
    const captured: string[] = [];
    const originalLog = console.log;
    const originalError = console.error;

    const capture =
      (label: string) =>
      (...args: unknown[]) => {
        captured.push(label + args.map(String).join(' '));
      };

    console.log = capture('');
    console.error = capture('');

    try {
      await fn();
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }

    const stripped = captured.map(stripAnsi);
    const remaining = [...stripped];

    for (const substr of expected) {
      const idx = remaining.findIndex((m) => m.includes(substr));
      assert.ok(
        idx >= 0,
        `Expected a log containing "${substr}" but none was found.\nCaptured:\n${stripped.map((m) => `  ${JSON.stringify(m)}`).join('\n')}`,
      );
      remaining.splice(idx, 1);
    }

    assert.deepEqual(
      remaining,
      [],
      `Unexpected log output:\n${remaining.map((m) => `  ${JSON.stringify(m)}`).join('\n')}`,
    );
  };
}

/**
 * Spins up a minimal Express app on a random port with a temp mount directory.
 * Call close() in after() to shut down the server and delete the temp dir.
 */
export async function createTestServer(
  setupRoutes: (app: Express.Application, mountDir: string) => void,
): Promise<TestServer> {
  const mountDir = await mkdtemp(join(tmpdir(), 'indie-web-test-'));

  const app = Express();
  app.use(Express.json());
  setupRoutes(app, mountDir);

  const server = await new Promise<ReturnType<typeof createServer>>(
    (resolve, reject) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
      s.on('error', reject);
    },
  );

  const { port } = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    baseUrl,
    mountDir,
    close: async () => {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
      await rm(mountDir, { recursive: true, force: true });
    },
  };
}

/**
 * Builds a minimal MP3 buffer containing ID3v2.3 tags.
 * There is no actual audio data, so duration will be null when parsed.
 */
export function buildMp3WithTags(tags: {
  title?: string;
  artist?: string;
  album?: string;
  genre?: string;
}): Buffer {
  const frames: Buffer[] = [];

  function textFrame(id: string, text: string): Buffer {
    // encoding byte 0x00 = Latin-1, followed by the text
    const content = Buffer.concat([
      Buffer.from([0x00]),
      Buffer.from(text, 'latin1'),
    ]);
    const header = Buffer.alloc(10);
    header.write(id, 0, 4, 'ascii');
    header.writeUInt32BE(content.length, 4);
    header.writeUInt16BE(0, 8); // flags
    return Buffer.concat([header, content]);
  }

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

  // ID3v2.3 header (10 bytes)
  const id3Header = Buffer.alloc(10);
  id3Header.write('ID3', 0, 3, 'ascii');
  id3Header.writeUInt8(3, 3); // version 2.3
  id3Header.writeUInt8(0, 4); // revision
  id3Header.writeUInt8(0, 5); // flags
  // Size as syncsafe integer (4 x 7 bits)
  const size = frameData.length;
  id3Header.writeUInt8((size >> 21) & 0x7f, 6);
  id3Header.writeUInt8((size >> 14) & 0x7f, 7);
  id3Header.writeUInt8((size >> 7) & 0x7f, 8);
  id3Header.writeUInt8(size & 0x7f, 9);

  return Buffer.concat([id3Header, frameData]);
}
