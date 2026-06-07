import { describe as nodeDescribe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseFile } from 'music-metadata';
import type { IAudioMetadata, ITag } from 'music-metadata';
import { musicRoute } from '../route-music.ts';
import {
  createTestServer,
  buildMp3WithTags,
  withLogs,
  AUDIO_PAYLOAD,
} from './helpers.ts';
import type { TestServer } from './helpers.ts';

/**
 * Correctness tests for POST /music/write-track-tags.
 */

function findFrames(meta: IAudioMetadata, id: string): ITag[] {
  return Object.values(meta.native).flatMap((frames) =>
    frames.filter((f) => f.id === id),
  );
}

function findFrameValue(meta: IAudioMetadata, id: string): unknown {
  const frame = findFrames(meta, id)[0];
  return frame?.value;
}

/**
 * Returns the bytes after the ID3v2 chunk (size is syncsafe in bytes 6..9).
 */
function getBytesAfterId3(buffer: Buffer): Buffer {
  assert.equal(buffer.subarray(0, 3).toString('ascii'), 'ID3');
  const size =
    (buffer.readUInt8(6) << 21) |
    (buffer.readUInt8(7) << 14) |
    (buffer.readUInt8(8) << 7) |
    buffer.readUInt8(9);
  return buffer.subarray(10 + size);
}

async function writeTrackTags(
  server: TestServer,
  clientPath: string | string[],
  changes: Array<{ frameId: string; value: string }>,
) {
  const paths = Array.isArray(clientPath) ? clientPath : [clientPath];
  return fetch(`${server.baseUrl}/music/write-track-tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths, changes }),
  });
}

let describe: (name: string, fn: () => void) => void = nodeDescribe;
if (process.env.INDIE_WEB_SKIP_LOCALHOST_TESTS === '1') {
  // The check runner enables this in sandboxes that cannot bind localhost.
  describe = (name) => {
    console.error(`LOCALHOST_BIND_SKIPPED_TEST ${name}`);
  };
}

describe('POST /music/write-track-tags — frame-ID mapping', () => {
  let server: TestServer;
  before(async () => {
    server = await createTestServer((app, mountPath) => {
      app.use('/music', musicRoute(mountPath));
    });
  });
  after(() => server.close());

  // Test data for roundtripping id3 text frame rewrites.
  const TEXT_FRAMES = [
    { frameId: 'TIT2', value: 'My Title', commonKey: 'title' },
    { frameId: 'TPE1', value: 'My Artist', commonKey: 'artist' },
    { frameId: 'TPE2', value: 'My Album Artist', commonKey: 'albumartist' },
    { frameId: 'TALB', value: 'My Album', commonKey: 'album' },
    { frameId: 'TCON', value: 'Jazz', commonKey: 'genre' },
    { frameId: 'TYER', value: '2024', commonKey: 'year' },
    { frameId: 'TBPM', value: '128', commonKey: 'bpm' },
    { frameId: 'TCOM', value: 'My Composer', commonKey: 'composer' },
    { frameId: 'TEXT', value: 'My Lyricist', commonKey: 'lyricist' },
    { frameId: 'TRCK', value: '3', commonKey: 'track' },
    { frameId: 'TPOS', value: '2', commonKey: 'disk' },
  ] as const;

  for (const { frameId, value, commonKey } of TEXT_FRAMES) {
    it(
      `writes ${frameId} and round-trips through music-metadata`,
      withLogs([], async () => {
        const fileName = `${frameId}.mp3`;
        const filePath = join(server.mountDir, fileName);
        await writeFile(filePath, buildMp3WithTags({}));

        const res = await writeTrackTags(server, `/${fileName}`, [
          { frameId, value },
        ]);
        assert.equal(res.status, 200);

        const meta = await parseFile(filePath);

        // Native frame is present with exactly the value we sent.
        assert.equal(
          findFrameValue(meta, frameId),
          value,
          `native ${frameId} frame should round-trip exactly`,
        );

        // The normalized common value should reflect the native frame, using
        // music-metadata's field-specific value shapes.
        const common = meta.common as unknown as Record<string, unknown>;
        if (commonKey === 'track' || commonKey === 'disk') {
          const slot = common[commonKey] as { no: number | null };
          assert.equal(slot.no, Number(value));
        } else if (commonKey === 'year' || commonKey === 'bpm') {
          assert.equal(common[commonKey], Number(value));
        } else if (
          commonKey === 'genre' ||
          commonKey === 'composer' ||
          commonKey === 'lyricist'
        ) {
          assert.deepEqual(common[commonKey], [value]);
        } else {
          assert.equal(common[commonKey], value);
        }
      }),
    );
  }

  it(
    'writes COMM with empty short-text and English language',
    withLogs([], async () => {
      const filePath = join(server.mountDir, 'comm.mp3');
      await writeFile(filePath, buildMp3WithTags({}));

      const res = await writeTrackTags(server, '/comm.mp3', [
        { frameId: 'COMM', value: 'Some comment text' },
      ]);
      assert.equal(res.status, 200);

      const meta = await parseFile(filePath);
      const comm = findFrameValue(meta, 'COMM') as
        | Partial<{ language: string; description: string; text: string }>
        | undefined;
      assert.ok(comm, 'COMM frame should exist');
      assert.equal(comm.text, 'Some comment text');
      assert.equal(comm.language, 'eng');
    }),
  );
});

describe('POST /music/write-track-tags — diff semantics', () => {
  let server: TestServer;
  before(async () => {
    server = await createTestServer((app, mountPath) => {
      app.use('/music', musicRoute(mountPath));
    });
  });
  after(() => server.close());

  it(
    'preserves untouched frames when writing a single frame',
    withLogs([], async () => {
      const filePath = join(server.mountDir, 'partial.mp3');
      await writeFile(
        filePath,
        buildMp3WithTags({
          title: 'Original Title',
          artist: 'Original Artist',
          album: 'Original Album',
          genre: 'Original Genre',
        }),
      );

      // Only rewrite the title — every other frame must survive.
      const res = await writeTrackTags(server, '/partial.mp3', [
        { frameId: 'TIT2', value: 'New Title' },
      ]);
      assert.equal(res.status, 200);

      const meta = await parseFile(filePath);
      assert.equal(meta.common.title, 'New Title');
      assert.equal(meta.common.artist, 'Original Artist');
      assert.equal(meta.common.album, 'Original Album');
      assert.deepEqual(meta.common.genre, ['Original Genre']);
    }),
  );

  it(
    'updates an existing frame in place — no duplicate frames are produced',
    withLogs([], async () => {
      const filePath = join(server.mountDir, 'update.mp3');
      await writeFile(
        filePath,
        buildMp3WithTags({
          title: 'Old Title',
        }),
      );

      await writeTrackTags(server, '/update.mp3', [
        { frameId: 'TIT2', value: 'Newest Title' },
      ]);

      const meta = await parseFile(filePath);
      const tit2Frames = findFrames(meta, 'TIT2');
      assert.equal(
        tit2Frames.length,
        1,
        `expected exactly one TIT2 frame, got ${tit2Frames.length}`,
      );
      assert.equal(tit2Frames[0].value, 'Newest Title');
    }),
  );

  it(
    'writes multiple frames in a single request',
    withLogs([], async () => {
      const filePath = join(server.mountDir, 'multi.mp3');
      await writeFile(filePath, buildMp3WithTags({}));

      const res = await writeTrackTags(server, '/multi.mp3', [
        { frameId: 'TIT2', value: 'Multi Title' },
        { frameId: 'TPE1', value: 'Multi Artist' },
        { frameId: 'TALB', value: 'Multi Album' },
      ]);
      assert.equal(res.status, 200);

      const meta = await parseFile(filePath);
      assert.equal(meta.common.title, 'Multi Title');
      assert.equal(meta.common.artist, 'Multi Artist');
      assert.equal(meta.common.album, 'Multi Album');
    }),
  );
});

describe('POST /music/write-track-tags — bulk semantics', () => {
  let server: TestServer;
  before(async () => {
    server = await createTestServer((app, mountPath) => {
      app.use('/music', musicRoute(mountPath));
    });
  });
  after(() => server.close());

  it(
    'applies the same changes to multiple files in one request',
    withLogs([], async () => {
      const firstPath = join(server.mountDir, 'bulk-a.mp3');
      const secondPath = join(server.mountDir, 'bulk-b.mp3');
      await writeFile(firstPath, buildMp3WithTags({ genre: 'Old Genre' }));
      await writeFile(secondPath, buildMp3WithTags({ genre: 'Old Genre' }));

      const res = await writeTrackTags(
        server,
        ['/bulk-a.mp3', '/bulk-b.mp3'],
        [{ frameId: 'TCON', value: 'New Genre' }],
      );
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), {
        updated: ['/bulk-a.mp3', '/bulk-b.mp3'],
        errors: [],
      });

      const firstMeta = await parseFile(firstPath);
      const secondMeta = await parseFile(secondPath);
      assert.deepEqual(firstMeta.common.genre, ['New Genre']);
      assert.deepEqual(secondMeta.common.genre, ['New Genre']);
    }),
  );

  it(
    'continues after per-file failures and reports the failed paths',
    withLogs([], async () => {
      const filePath = join(server.mountDir, 'bulk-valid.mp3');
      await writeFile(filePath, buildMp3WithTags({ album: 'Old Album' }));
      await writeFile(join(server.mountDir, 'bulk-note.txt'), 'not audio');

      const res = await writeTrackTags(
        server,
        ['/bulk-valid.mp3', '/missing.mp3', '/bulk-note.txt'],
        [{ frameId: 'TALB', value: 'New Album' }],
      );
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), {
        updated: ['/bulk-valid.mp3'],
        errors: [
          { path: '/missing.mp3', message: 'File not found.' },
          {
            path: '/bulk-note.txt',
            message: 'Only MP3 files are supported for tag writing.',
          },
        ],
      });

      const meta = await parseFile(filePath);
      assert.equal(meta.common.album, 'New Album');
    }),
  );

  it(
    'rejects unsupported frame IDs before writing any file',
    withLogs(['Unsupported frame ID: XXXX'], async () => {
      const firstPath = join(server.mountDir, 'unsupported-a.mp3');
      const secondPath = join(server.mountDir, 'unsupported-b.mp3');
      await writeFile(firstPath, buildMp3WithTags({ title: 'Original A' }));
      await writeFile(secondPath, buildMp3WithTags({ title: 'Original B' }));

      const res = await writeTrackTags(
        server,
        ['/unsupported-a.mp3', '/unsupported-b.mp3'],
        [{ frameId: 'XXXX', value: 'Should Not Write' }],
      );
      assert.equal(res.status, 400);

      const firstMeta = await parseFile(firstPath);
      const secondMeta = await parseFile(secondPath);
      assert.equal(firstMeta.common.title, 'Original A');
      assert.equal(secondMeta.common.title, 'Original B');
    }),
  );
});

describe('POST /music/write-track-tags — audio data preservation', () => {
  let server: TestServer;
  before(async () => {
    server = await createTestServer((app, mountPath) => {
      app.use('/music', musicRoute(mountPath));
    });
  });
  after(() => server.close());

  it(
    'preserves trailing bytes after the ID3v2 chunk byte-for-byte',
    withLogs([], async () => {
      const filePath = join(server.mountDir, 'audio.mp3');
      await writeFile(filePath, buildMp3WithTags({}));

      await writeTrackTags(server, '/audio.mp3', [
        { frameId: 'TIT2', value: 'Title that may grow the ID3 header' },
      ]);

      const written = await readFile(filePath);
      const trailing = getBytesAfterId3(written);
      assert.deepEqual(
        trailing,
        AUDIO_PAYLOAD,
        'bytes following the ID3v2 chunk must be unchanged',
      );
    }),
  );

  it(
    'preserves trailing bytes across successive writes',
    withLogs([], async () => {
      const filePath = join(server.mountDir, 'repeated.mp3');
      await writeFile(filePath, buildMp3WithTags({}));

      await writeTrackTags(server, '/repeated.mp3', [
        { frameId: 'TIT2', value: 'First' },
      ]);
      await writeTrackTags(server, '/repeated.mp3', [
        { frameId: 'TPE1', value: 'Second' },
      ]);
      await writeTrackTags(server, '/repeated.mp3', [
        { frameId: 'TALB', value: 'Third' },
      ]);

      const written = await readFile(filePath);
      assert.deepEqual(getBytesAfterId3(written), AUDIO_PAYLOAD);

      const meta = await parseFile(filePath);
      assert.equal(meta.common.title, 'First');
      assert.equal(meta.common.artist, 'Second');
      assert.equal(meta.common.album, 'Third');
    }),
  );
});

describe('POST /music/write-track-tags — value encoding', () => {
  let server: TestServer;
  before(async () => {
    server = await createTestServer((app, mountPath) => {
      app.use('/music', musicRoute(mountPath));
    });
  });
  after(() => server.close());

  it(
    'round-trips Unicode text (non-Latin-1 characters)',
    withLogs([], async () => {
      const filePath = join(server.mountDir, 'unicode.mp3');
      await writeFile(filePath, buildMp3WithTags());

      // Greek + emoji + accented Latin — would be lossy under Latin-1.
      const value = 'Ωμέγα — café 🎵';
      const res = await writeTrackTags(server, '/unicode.mp3', [
        { frameId: 'TIT2', value },
      ]);
      assert.equal(res.status, 200);

      const meta = await parseFile(filePath);
      assert.equal(meta.common.title, value);
    }),
  );

  it(
    'round-trips an empty string value',
    withLogs([], async () => {
      const filePath = join(server.mountDir, 'empty.mp3');
      await writeFile(
        filePath,
        buildMp3WithTags({
          title: 'Will be cleared',
        }),
      );

      const res = await writeTrackTags(server, '/empty.mp3', [
        { frameId: 'TIT2', value: '' },
      ]);
      assert.equal(res.status, 200);

      const meta = await parseFile(filePath);
      // Either the title is absent (frame stripped) or present and empty —
      // both are acceptable shapes; what must not happen is the old value
      // surviving.
      assert.notEqual(meta.common.title, 'Will be cleared');
    }),
  );
});

describe('POST /music/write-track-tags — tag-less files', () => {
  let server: TestServer;
  before(async () => {
    server = await createTestServer((app, mountPath) => {
      app.use('/music', musicRoute(mountPath));
    });
  });
  after(() => server.close());

  it(
    'adds an ID3v2 tag to a file that started with no tags',
    withLogs([], async () => {
      // Just the audio payload — no ID3v2 chunk at the head.
      const filePath = join(server.mountDir, 'no-id3.mp3');
      await writeFile(filePath, AUDIO_PAYLOAD);

      const res = await writeTrackTags(server, '/no-id3.mp3', [
        { frameId: 'TIT2', value: 'Now Tagged' },
      ]);
      assert.equal(res.status, 200);

      const written = await readFile(filePath);
      assert.equal(
        written.slice(0, 3).toString('ascii'),
        'ID3',
        'file should now begin with an ID3v2 header',
      );
      assert.deepEqual(
        getBytesAfterId3(written),
        AUDIO_PAYLOAD,
        'original audio bytes must follow the new ID3v2 chunk',
      );

      const meta = await parseFile(filePath);
      assert.equal(meta.common.title, 'Now Tagged');
    }),
  );
});
