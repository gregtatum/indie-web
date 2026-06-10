import { mkdtemp, rm } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import Express from 'express';
import { MountPath } from '../utils.ts';

export const AUDIO_PAYLOAD = Buffer.concat([
  // The mpeg audio frame header.
  Buffer.from([0xff, 0xfb, 0x90, 0x44]),
  // The faked audio data payload.
  Buffer.alloc(
    256, // Size of the placeholder audio payload.
    0x41, // Repeated filler byte ('A').
  ),
]);

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
  setupRoutes: (app: Express.Application, mountPath: MountPath) => void,
): Promise<TestServer> {
  const mountDir = await mkdtemp(join(tmpdir(), 'indie-web-test-'));

  const app = Express();
  app.use(Express.json());
  setupRoutes(app, new MountPath(mountDir));

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

// Minimal 1×1 white JPEG — valid enough for music-metadata to recognise as an image.
export const MINIMAL_JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01,
  0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08,
  0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a,
  0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12, 0x13, 0x0f, 0x14, 0x1d,
  0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20, 0x22,
  0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34,
  0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0,
  0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4,
  0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06,
  0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff, 0xc4, 0x00, 0xb5, 0x10, 0x00, 0x02, 0x01,
  0x03, 0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7d,
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13,
  0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42,
  0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a,
  0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x34, 0x35,
  0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a,
  0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67,
  0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84,
  0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98,
  0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3,
  0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7,
  0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1,
  0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4,
  0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00,
  0x00, 0x3f, 0x00, 0xfb, 0xd2, 0x8a, 0x28, 0x03, 0xff, 0xd9,
]);

interface Mp3Tags {
  title: string;
  artist: string;
  albumArtist: string;
  album: string;
  genre: string;
  apic: Buffer;
}

/**
 * Builds a minimal MP3 with ID3v2.3 tags and a faked audio payload.
 */
export function buildMp3WithTags(tags: Partial<Mp3Tags> = {}): Buffer {
  const frames: Buffer[] = [];

  function frame(id: string, content: Buffer): Buffer {
    const header = Buffer.alloc(10);
    header.write(id, 0, 4, 'ascii');
    header.writeUInt32BE(content.length, 4);
    header.writeUInt16BE(0, 8); // flags
    return Buffer.concat([header, content]);
  }

  function textFrame(id: string, text: string): Buffer {
    // encoding byte 0x00 = Latin-1, followed by the text
    return frame(
      id,
      Buffer.concat([Buffer.from([0x00]), Buffer.from(text, 'latin1')]),
    );
  }

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
  if (tags.apic) {
    // APIC content: encoding(1) + mime\0 + picType(1) + description\0 + data
    const mime = Buffer.from('image/jpeg\0', 'latin1');
    const apicContent = Buffer.concat([
      Buffer.from([0x00]), // encoding: Latin-1
      mime,
      Buffer.from([0x03]), // picture type: Cover (front)
      Buffer.from([0x00]), // description: empty string (null-terminated)
      tags.apic,
    ]);
    frames.push(frame('APIC', apicContent));
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

  return Buffer.concat([id3Header, frameData, AUDIO_PAYLOAD]);
}
