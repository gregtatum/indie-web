import { describe as nodeDescribe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseFile } from 'music-metadata';
import type { IAudioMetadata, ITag } from 'music-metadata';
import { musicRoute } from '../music/route.ts';
import {
  ID3V1_TAG_SIZE,
  PREFER_COMPOSER_GROUPING_TAG_DESCRIPTION,
} from '../../shared/music.ts';
import { runFfmpeg } from '../music/ffmpeg.ts';
import type { T } from '../index.ts';
import {
  createTestServer,
  buildMp3WithTags,
  copyM4aFixture,
  withLogs,
  AUDIO_PAYLOAD,
  getBytesAfterId3,
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

async function writeTrackTags(
  server: TestServer,
  clientPath: string | string[],
  changes: T.TrackTagUpdate[],
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

  it(
    'writes the prefer composer grouping TXXX private tag',
    withLogs([], async () => {
      const filePath = join(server.mountDir, 'prefer-composer-txxx.mp3');
      await writeFile(filePath, buildMp3WithTags({}));

      const res = await writeTrackTags(server, '/prefer-composer-txxx.mp3', [
        {
          frameId: 'TXXX',
          description: 'indie-web:prefer-composer-grouping',
          value: 'true',
        },
      ]);
      assert.equal(res.status, 200);

      const meta = await parseFile(filePath);
      assert.equal(
        findFrameValue(meta, 'TXXX:indie-web:prefer-composer-grouping'),
        'true',
      );
    }),
  );

  it(
    'rewrites the prefer composer grouping TXXX private tag to false',
    withLogs([], async () => {
      const filePath = join(
        server.mountDir,
        'rewrite-prefer-composer-txxx.mp3',
      );
      await writeFile(
        filePath,
        buildMp3WithTags({
          title: 'Original Title',
          artist: 'Original Artist',
          preferComposerGrouping: 'true',
        }),
      );

      const res = await writeTrackTags(
        server,
        '/rewrite-prefer-composer-txxx.mp3',
        [
          {
            frameId: 'TXXX',
            description: 'indie-web:prefer-composer-grouping',
            value: 'false',
          },
        ],
      );
      assert.equal(res.status, 200);

      const meta = await parseFile(filePath);
      assert.equal(
        findFrameValue(meta, 'TXXX:indie-web:prefer-composer-grouping'),
        'false',
      );
      assert.equal(meta.common.title, 'Original Title');
      assert.equal(meta.common.artist, 'Original Artist');
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
        index: { status: 'skipped', message: 'Music index not found.' },
      });

      const firstMeta = await parseFile(firstPath);
      const secondMeta = await parseFile(secondPath);
      assert.deepEqual(firstMeta.common.genre, ['New Genre']);
      assert.deepEqual(secondMeta.common.genre, ['New Genre']);
    }),
  );

  it(
    'patches album artist in the durable music index',
    withLogs([], async () => {
      const filePath = join(server.mountDir, 'indexed-album-artist.mp3');
      await writeFile(
        filePath,
        buildMp3WithTags({
          title: 'Indexed Album Artist',
          artist: 'Track Artist',
          albumArtist: 'Old Album Artist',
        }),
      );

      const scanRes = await fetch(`${server.baseUrl}/music/music-index/scan`, {
        method: 'POST',
      });
      assert.equal(scanRes.status, 200);

      const res = await writeTrackTags(server, '/indexed-album-artist.mp3', [
        { frameId: 'TPE2', value: 'New Album Artist' },
      ]);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), {
        updated: ['/indexed-album-artist.mp3'],
        errors: [],
        index: { status: 'updated', message: null },
      });

      const index = JSON.parse(
        await readFile(join(server.mountDir, '.music-index.json'), 'utf-8'),
      );
      const track = index.tracks.find(
        (t: { path: string }) => t.path === '/indexed-album-artist.mp3',
      );
      assert.ok(track);
      assert.equal(track.artist, 'Track Artist');
      assert.equal(track.albumArtist, 'New Album Artist');
      await rm(join(server.mountDir, '.music-index.json'));
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
          {
            path: '/missing.mp3',
            message: 'File not found.',
            code: 'not-found',
          },
          {
            path: '/bulk-note.txt',
            message: 'Only MP3 and M4A files are supported for tag writing.',
            code: 'unsupported-format',
          },
        ],
        index: { status: 'skipped', message: 'Music index not found.' },
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

  it(
    'rejects malformed changes before writing any file',
    withLogs(['Invalid tag value.'], async () => {
      const filePath = join(server.mountDir, 'malformed-change.mp3');
      await writeFile(filePath, buildMp3WithTags({ title: 'Original Title' }));

      const res = await fetch(`${server.baseUrl}/music/write-track-tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paths: ['/malformed-change.mp3'],
          changes: [{ frameId: 'TIT2', value: 42 }],
        }),
      });
      assert.equal(res.status, 400);

      const meta = await parseFile(filePath);
      assert.equal(meta.common.title, 'Original Title');
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
    'preserves trailing audio bytes after the ID3v2 chunk byte-for-byte (aside from the regenerated ID3v1 tag appended after them)',
    withLogs([], async () => {
      const filePath = join(server.mountDir, 'audio.mp3');
      await writeFile(filePath, buildMp3WithTags({}));

      await writeTrackTags(server, '/audio.mp3', [
        { frameId: 'TIT2', value: 'Title that may grow the ID3 header' },
      ]);

      const written = await readFile(filePath);
      const trailing = getBytesAfterId3(written);
      // The write also backfills a fresh trailing ID3v1 tag (the fixture
      // starts with none), so the audio payload is followed by 128 more
      // bytes rather than ending the file.
      assert.equal(trailing.length, AUDIO_PAYLOAD.length + ID3V1_TAG_SIZE);
      assert.deepEqual(
        trailing.subarray(0, AUDIO_PAYLOAD.length),
        AUDIO_PAYLOAD,
        'bytes following the ID3v2 chunk must be unchanged',
      );
      assert.equal(
        trailing
          .subarray(AUDIO_PAYLOAD.length, AUDIO_PAYLOAD.length + 3)
          .toString('ascii'),
        'TAG',
      );
    }),
  );

  it(
    'preserves trailing audio bytes across successive writes (aside from the regenerated ID3v1 tag appended after them)',
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
      const trailing = getBytesAfterId3(written);
      assert.equal(trailing.length, AUDIO_PAYLOAD.length + ID3V1_TAG_SIZE);
      assert.deepEqual(
        trailing.subarray(0, AUDIO_PAYLOAD.length),
        AUDIO_PAYLOAD,
      );

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
      const trailing = getBytesAfterId3(written);
      // A fresh ID3v1 tag is backfilled too, since this file had none.
      assert.equal(trailing.length, AUDIO_PAYLOAD.length + ID3V1_TAG_SIZE);
      assert.deepEqual(
        trailing.subarray(0, AUDIO_PAYLOAD.length),
        AUDIO_PAYLOAD,
        'original audio bytes must follow the new ID3v2 chunk',
      );

      const meta = await parseFile(filePath);
      assert.equal(meta.common.title, 'Now Tagged');
    }),
  );
});

async function writeTrackTagsJson(
  server: TestServer,
  paths: string[],
  changes: T.TrackTagUpdate[],
) {
  const res = await writeTrackTags(server, paths, changes);
  return { status: res.status, body: (await res.json()) as any };
}

async function assertDecodes(path: string) {
  await runFfmpeg(['-i', path, '-f', 'null', '-']);
}

describe('POST /music/write-track-tags — m4a', () => {
  let server: TestServer;
  before(async () => {
    server = await createTestServer((app, mountPath) => {
      app.use('/music', musicRoute(mountPath));
    });
  });
  after(() => server.close());

  const FIELDS: Array<{
    frameId: string;
    value: string;
    read: (meta: IAudioMetadata) => unknown;
    expected: unknown;
  }> = [
    {
      frameId: 'TIT2',
      value: 'My Title',
      read: (meta) => meta.common.title,
      expected: 'My Title',
    },
    {
      frameId: 'TPE1',
      value: 'My Artist',
      read: (meta) => meta.common.artist,
      expected: 'My Artist',
    },
    {
      frameId: 'TPE2',
      value: 'My Album Artist',
      read: (meta) => meta.common.albumartist,
      expected: 'My Album Artist',
    },
    {
      frameId: 'TALB',
      value: 'My Album',
      read: (meta) => meta.common.album,
      expected: 'My Album',
    },
    {
      frameId: 'TCOM',
      value: 'My Composer',
      read: (meta) => meta.common.composer,
      expected: ['My Composer'],
    },
    {
      frameId: 'TCON',
      value: 'Rock',
      read: (meta) => meta.common.genre,
      expected: ['Rock'],
    },
    {
      frameId: 'TYER',
      value: '1999',
      read: (meta) => meta.common.year,
      expected: 1999,
    },
    {
      frameId: 'TRCK',
      value: '5/9',
      read: (meta) => meta.common.track,
      expected: { no: 5, of: 9 },
    },
    {
      frameId: 'TPOS',
      value: '2/3',
      read: (meta) => meta.common.disk,
      expected: { no: 2, of: 3 },
    },
    {
      frameId: 'COMM',
      value: 'My comment',
      read: (meta) => meta.common.comment?.map((c) => c.text),
      expected: ['My comment'],
    },
  ];

  for (const { frameId, value, read, expected } of FIELDS) {
    it(
      `round-trips ${frameId}`,
      withLogs([], async () => {
        const filePath = join(server.mountDir, `roundtrip-${frameId}.m4a`);
        await copyM4aFixture('tagged', filePath);

        const { status, body } = await writeTrackTagsJson(
          server,
          [`/roundtrip-${frameId}.m4a`],
          [{ frameId, value }],
        );
        assert.equal(status, 200);
        assert.deepEqual(body.updated, [`/roundtrip-${frameId}.m4a`]);
        assert.deepEqual(body.errors, []);

        assert.deepEqual(read(await parseFile(filePath)), expected);
        await assertDecodes(filePath);
      }),
    );
  }

  it(
    'keeps the other tags, the duration, and any cover art',
    withLogs([], async () => {
      const filePath = join(server.mountDir, 'preserve.m4a');
      await copyM4aFixture('tagged-with-art', filePath);
      const before = await parseFile(filePath);
      assert.equal(before.common.picture?.length, 1);

      const { body } = await writeTrackTagsJson(
        server,
        ['/preserve.m4a'],
        [{ frameId: 'TIT2', value: 'Only The Title' }],
      );
      assert.deepEqual(body.errors, []);

      const after = await parseFile(filePath);
      assert.equal(after.common.title, 'Only The Title');
      assert.deepEqual(
        { ...after.common, title: undefined },
        { ...before.common, title: undefined },
      );
      assert.equal(after.format.duration, before.format.duration);
      await assertDecodes(filePath);
    }),
  );

  it(
    'removes a tag when the value is empty',
    withLogs([], async () => {
      const filePath = join(server.mountDir, 'clear.m4a');
      await copyM4aFixture('tagged', filePath);

      const { body } = await writeTrackTagsJson(
        server,
        ['/clear.m4a'],
        [{ frameId: 'COMM', value: '' }],
      );
      assert.deepEqual(body.errors, []);

      const meta = await parseFile(filePath);
      assert.equal(meta.common.comment, undefined);
      assert.equal(meta.common.title, 'Fixture Title');
    }),
  );

  it(
    'stores awkward values literally',
    withLogs([], async () => {
      const filePath = join(server.mountDir, 'awkward.m4a');
      await copyM4aFixture('tagged', filePath);

      const title = `-i "quoted" 'single' $(echo hi) ☃ a=b`;
      const { body } = await writeTrackTagsJson(
        server,
        ['/awkward.m4a'],
        [
          { frameId: 'TIT2', value: title },
          { frameId: 'TALB', value: '-map 0' },
        ],
      );
      assert.deepEqual(body.errors, []);

      const meta = await parseFile(filePath);
      assert.equal(meta.common.title, title);
      assert.equal(meta.common.album, '-map 0');
    }),
  );

  it(
    'writes files whose paths have spaces and unicode',
    withLogs([], async () => {
      const dir = join(server.mountDir, 'Björk', 'Post (1995)');
      await mkdir(dir, { recursive: true });
      const filePath = join(dir, '01 Hyperballad ♫.m4a');
      await copyM4aFixture('tagged', filePath);

      const { body } = await writeTrackTagsJson(
        server,
        ['/Björk/Post (1995)/01 Hyperballad ♫.m4a'],
        [{ frameId: 'TIT2', value: 'Hyperballad' }],
      );
      assert.deepEqual(body.errors, []);
      assert.equal((await parseFile(filePath)).common.title, 'Hyperballad');
      assert.deepEqual(await readdir(dir), ['01 Hyperballad ♫.m4a']);
    }),
  );

  it(
    'leaves a corrupt file untouched and cleans up after itself',
    withLogs([], async () => {
      const dir = join(server.mountDir, 'corrupt');
      await mkdir(dir);
      const filePath = join(dir, 'broken.m4a');
      await copyM4aFixture('corrupt', filePath);
      const originalBytes = await readFile(filePath);

      const { status, body } = await writeTrackTagsJson(
        server,
        ['/corrupt/broken.m4a'],
        [{ frameId: 'TIT2', value: 'Nope' }],
      );
      assert.equal(status, 200);
      assert.deepEqual(body.updated, []);
      assert.equal(body.errors.length, 1);
      assert.equal(body.errors[0].path, '/corrupt/broken.m4a');
      assert.equal(body.errors[0].code, 'write-failed');
      assert.match(body.errors[0].message, /^ffmpeg failed/);

      assert.deepEqual(await readFile(filePath), originalBytes);
      assert.deepEqual(await readdir(dir), ['broken.m4a']);
    }),
  );

  it(
    'rejects frames that M4A cannot hold without writing anything',
    withLogs([], async () => {
      const filePath = join(server.mountDir, 'unsupported-frame.m4a');
      await copyM4aFixture('tagged', filePath);
      const originalBytes = await readFile(filePath);

      for (const change of [
        { frameId: 'TBPM', value: '120' },
        {
          frameId: 'TXXX',
          value: 'true',
          description: PREFER_COMPOSER_GROUPING_TAG_DESCRIPTION,
        },
      ]) {
        const { body } = await writeTrackTagsJson(
          server,
          ['/unsupported-frame.m4a'],
          [{ frameId: 'TIT2', value: 'Should Not Land' }, change],
        );
        assert.deepEqual(body.updated, []);
        assert.equal(body.errors.length, 1);
        assert.equal(body.errors[0].code, 'unsupported-frame');
        assert.match(body.errors[0].message, new RegExp(change.frameId));
      }
      assert.deepEqual(await readFile(filePath), originalBytes);
    }),
  );

  it(
    'writes supported tracks in a mixed batch and reports the rest',
    withLogs([], async () => {
      await writeFile(
        join(server.mountDir, 'mixed.mp3'),
        buildMp3WithTags({ title: 'Old' }),
      );
      await copyM4aFixture('tagged', join(server.mountDir, 'mixed.m4a'));
      await writeFile(join(server.mountDir, 'mixed.flac'), 'not really flac');

      const { body } = await writeTrackTagsJson(
        server,
        ['/mixed.mp3', '/mixed.m4a', '/mixed.flac'],
        [{ frameId: 'TIT2', value: 'Mixed Title' }],
      );
      assert.deepEqual(body.updated, ['/mixed.mp3', '/mixed.m4a']);
      assert.deepEqual(body.errors, [
        {
          path: '/mixed.flac',
          message: 'Only MP3 and M4A files are supported for tag writing.',
          code: 'unsupported-format',
        },
      ]);
      for (const name of ['mixed.mp3', 'mixed.m4a']) {
        const meta = await parseFile(join(server.mountDir, name));
        assert.equal(meta.common.title, 'Mixed Title');
      }
    }),
  );

  it(
    'keeps the durable index in step with an m4a write',
    withLogs([], async () => {
      const dir = join(server.mountDir, 'indexed');
      await mkdir(dir);
      await copyM4aFixture('tagged', join(dir, 'song.m4a'));
      await fetch(`${server.baseUrl}/music/music-index/scan`, {
        method: 'POST',
      });

      const { body } = await writeTrackTagsJson(
        server,
        ['/indexed/song.m4a'],
        [
          { frameId: 'TIT2', value: 'Indexed Title' },
          { frameId: 'TRCK', value: '7/9' },
        ],
      );
      assert.deepEqual(body.index, { status: 'updated', message: null });

      const index = await (
        await fetch(`${server.baseUrl}/music/music-index`)
      ).json();
      const track = index.tracks.find(
        (track: { path: string }) => track.path === '/indexed/song.m4a',
      );
      assert.equal(track.title, 'Indexed Title');
      assert.equal(track.track, 7);
    }),
  );
});
