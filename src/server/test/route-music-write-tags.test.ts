import { describe as nodeDescribe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
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
  copyFlacFixture,
  withLogs,
  AUDIO_PAYLOAD,
  buildId3v2Block,
  getBytesAfterId3,
} from './helpers.ts';
import type { FlacFixture, M4aFixture, TestServer } from './helpers.ts';
import {
  FRAME_COMMENTS,
  assertFlacVerifies,
  assertOnlyTheseCommentsChanged,
  changedComments,
  snapshotFlac,
} from './flac-oracle.ts';
import {
  FRAME_ATOMS,
  assertDecodesCleanly,
  assertOnlyTheseAtomsChanged,
  changedAtoms,
  ffprobeTags,
  snapshotM4a,
} from './m4a-oracle.ts';
import {
  FIXTURE_TAGS,
  assertAudioUntouched,
  assertOnlyTheseFramesChanged,
  makeBareMp3,
  makeTaggedMp3,
  snapshotMp3,
} from './mp3-oracle.ts';

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
            message:
              'Only MP3, M4A, and FLAC files are supported for tag writing.',
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
  await runFfmpeg(['-i', path, '-f', 'null', '-'], 'quick');
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
      frameId: 'TBPM',
      value: '128',
      read: (meta) => meta.common.bpm,
      expected: 128,
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
      assert.match(body.errors[0].message, /^Corrupt m4a/);

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
      await writeFile(join(server.mountDir, 'mixed.ogg'), 'not really ogg');

      const { body } = await writeTrackTagsJson(
        server,
        ['/mixed.mp3', '/mixed.m4a', '/mixed.ogg'],
        [{ frameId: 'TIT2', value: 'Mixed Title' }],
      );
      assert.deepEqual(body.updated, ['/mixed.mp3', '/mixed.m4a']);
      assert.deepEqual(body.errors, [
        {
          path: '/mixed.ogg',
          message:
            'Only MP3, M4A, and FLAC files are supported for tag writing.',
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

const M4A_FIDELITY_FIXTURES: M4aFixture[] = [
  'tagged',
  'tagged-with-art',
  'itunes-padded',
  'itunes-tight',
  'itunes-moov-last',
  'itunes-co64',
  'itunes-gnre',
];

const M4A_READERS: Record<string, (meta: IAudioMetadata) => unknown> = {
  TIT2: (meta) => meta.common.title,
  TPE1: (meta) => meta.common.artist,
  TPE2: (meta) => meta.common.albumartist,
  TALB: (meta) => meta.common.album,
  TCOM: (meta) => meta.common.composer?.[0],
  COMM: (meta) => meta.common.comment?.[0]?.text,
  TCON: (meta) => meta.common.genre?.[0],
  TYER: (meta) => meta.common.year?.toString(),
  TBPM: (meta) => meta.common.bpm?.toString(),
  TRCK: (meta) =>
    meta.common.track.no === null
      ? undefined
      : `${meta.common.track.no}/${meta.common.track.of ?? 0}`,
  TPOS: (meta) =>
    meta.common.disk.no === null
      ? undefined
      : `${meta.common.disk.no}/${meta.common.disk.of ?? 0}`,
};

function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomEdit(random: () => number): T.TrackTagUpdate {
  const frameIds = Object.keys(M4A_READERS);
  const frameId = frameIds[Math.floor(random() * frameIds.length)];
  if (random() < 0.25) {
    return { frameId, value: '' };
  }
  const pair = () =>
    `${1 + Math.floor(random() * 30)}/${31 + Math.floor(random() * 30)}`;
  switch (frameId) {
    case 'TRCK':
    case 'TPOS':
      return { frameId, value: pair() };
    case 'TYER':
      return { frameId, value: String(1950 + Math.floor(random() * 80)) };
    case 'TBPM':
      return { frameId, value: String(1 + Math.floor(random() * 250)) };
    default: {
      const alphabet = ['a', 'Z', 'é', '☃', '日本語', '𝄞', ' ', '-', '"'];
      const length = random() < 0.15 ? 2500 : 1 + Math.floor(random() * 40);
      let value = '';
      while (value.length < length) {
        value += alphabet[Math.floor(random() * alphabet.length)];
      }
      return { frameId, value: `x${value}x` };
    }
  }
}

describe('POST /music/write-track-tags — m4a fidelity', () => {
  let server: TestServer;
  before(async () => {
    server = await createTestServer((app, mountPath) => {
      app.use('/music', musicRoute(mountPath));
    });
  });
  after(() => server.close());

  async function copyFixture(fixture: M4aFixture, name: string) {
    await copyM4aFixture(fixture, join(server.mountDir, name));
    return join(server.mountDir, name);
  }

  async function writeTags(name: string, changes: T.TrackTagUpdate[]) {
    const { body } = await writeTrackTagsJson(server, [`/${name}`], changes);
    assert.deepEqual(body.errors, []);
    assert.deepEqual(body.updated, [`/${name}`]);
  }

  it(
    'the oracle detects what an ffmpeg stream copy loses',
    withLogs([], async () => {
      const original = await copyFixture('itunes-padded', 'ffmpeg-source.m4a');
      const rewritten = join(server.mountDir, 'ffmpeg-copy.m4a');
      await runFfmpeg(
        [
          '-i',
          original,
          '-map',
          '0',
          '-c',
          'copy',
          '-map_metadata',
          '0',
          '-f',
          'ipod',
          rewritten,
        ],
        'quick',
      );
      const before = await snapshotM4a(original);
      const after = await snapshotM4a(rewritten);
      assert.deepEqual(
        changedAtoms(before, after).filter((name) =>
          [
            '----:com.apple.iTunes:iTunNORM',
            '----:com.apple.iTunes:iTunSMPB',
            '----:com.apple.iTunes:iTunMOVI',
            'rtng',
            'soar',
            'apID',
            'ownr',
            'tmpo',
          ].includes(name),
        ).length,
        8,
      );
      assert.throws(() => assertOnlyTheseAtomsChanged(before, after, ['©nam']));
    }),
  );

  for (const fixture of M4A_FIDELITY_FIXTURES) {
    it(
      `${fixture}: changes only the requested atoms`,
      withLogs([], async () => {
        const name = `${fixture}-edit.m4a`;
        const path = await copyFixture(fixture, name);
        const before = await snapshotM4a(path);
        const changes: T.TrackTagUpdate[] = [
          { frameId: 'TIT2', value: 'Edited Title ☃' },
          { frameId: 'TPE1', value: 'Edited Artist' },
          { frameId: 'TCON', value: 'Rock' },
          { frameId: 'TBPM', value: '99' },
          { frameId: 'TRCK', value: '7/14' },
          { frameId: 'COMM', value: 'Edited comment' },
        ];

        await writeTags(name, changes);

        const after = await snapshotM4a(path);
        const requested = changes.map(({ frameId }) => FRAME_ATOMS[frameId]);
        const expected = before.ilst.has('gnre')
          ? [...requested, 'gnre']
          : requested;
        assertOnlyTheseAtomsChanged(before, after, expected);
        assert.deepEqual(changedAtoms(before, after), expected.sort());
        await assertDecodesCleanly(path);

        const meta = await parseFile(path);
        assert.equal(meta.common.title, 'Edited Title ☃');
        assert.equal(meta.common.artist, 'Edited Artist');
        assert.deepEqual(meta.common.genre, ['Rock']);
        assert.equal(meta.common.bpm, 99);
        assert.deepEqual(meta.common.track, { no: 7, of: 14 });
        const probed = await ffprobeTags(path);
        assert.equal(probed.title, 'Edited Title ☃');
        assert.equal(probed.artist, 'Edited Artist');
        assert.equal(probed.genre, 'Rock');
        assert.equal(probed.comment, 'Edited comment');
      }),
    );

    it(
      `${fixture}: restoring a title restores the ilst`,
      withLogs([], async () => {
        const name = `${fixture}-roundtrip.m4a`;
        const path = await copyFixture(fixture, name);
        const before = await snapshotM4a(path);
        const title = (await parseFile(path)).common.title ?? '';

        await writeTags(name, [{ frameId: 'TIT2', value: 'Something Else' }]);
        await writeTags(name, [{ frameId: 'TIT2', value: title }]);

        const after = await snapshotM4a(path);
        assert.deepEqual([...after.ilst], [...before.ilst]);
        assertOnlyTheseAtomsChanged(before, after, []);
      }),
    );

    it(
      `${fixture}: survives growing past any padding and shrinking again`,
      withLogs([], async () => {
        const name = `${fixture}-grow.m4a`;
        const path = await copyFixture(fixture, name);
        const before = await snapshotM4a(path);
        const huge = 'long comment ☃ '.repeat(1500);

        await writeTags(name, [{ frameId: 'COMM', value: huge }]);
        const grown = await snapshotM4a(path);
        assertOnlyTheseAtomsChanged(before, grown, ['©cmt']);
        assert.equal((await parseFile(path)).common.comment?.[0]?.text, huge);
        await assertDecodesCleanly(path);

        await writeTags(name, [{ frameId: 'COMM', value: '' }]);
        const shrunk = await snapshotM4a(path);
        assertOnlyTheseAtomsChanged(before, shrunk, ['©cmt']);
        assert.equal((await parseFile(path)).common.comment, undefined);
        await assertDecodesCleanly(path);
      }),
    );

    it(
      `${fixture}: seeded random edits keep every invariant`,
      withLogs([], async () => {
        const name = `${fixture}-random.m4a`;
        const path = await copyFixture(fixture, name);
        const random = seededRandom(
          [...fixture].reduce((sum, char) => sum * 31 + char.charCodeAt(0), 7),
        );
        const model = new Map<string, string>();
        let before = await snapshotM4a(path);

        for (let round = 0; round < 10; round++) {
          const changes = Array.from(
            { length: 1 + Math.floor(random() * 3) },
            () => randomEdit(random),
          );
          const dropped = ['TCON', ...[]];
          await writeTags(name, changes);
          for (const { frameId, value } of changes) {
            model.set(frameId, value);
          }

          const after = await snapshotM4a(path);
          const allowed = changes.map(({ frameId }) => FRAME_ATOMS[frameId]);
          assertOnlyTheseAtomsChanged(
            before,
            after,
            changes.some(({ frameId }) => dropped.includes(frameId))
              ? [...allowed, 'gnre']
              : allowed,
          );
          await assertDecodesCleanly(path);

          const meta = await parseFile(path);
          for (const [frameId, value] of model) {
            assert.equal(
              M4A_READERS[frameId](meta) ?? '',
              value,
              `${frameId} after round ${round}`,
            );
          }
          before = after;
        }
      }),
    );
  }

  it(
    'creates the tag atoms for a file that has none',
    withLogs([], async () => {
      const source = await copyFixture('tagged', 'tagless-source.m4a');
      const path = join(server.mountDir, 'tagless.m4a');
      await runFfmpeg(
        [
          '-i',
          source,
          '-map',
          '0:a',
          '-c',
          'copy',
          '-map_metadata',
          '-1',
          '-fflags',
          '+bitexact',
          '-f',
          'ipod',
          path,
        ],
        'quick',
      );
      const before = await snapshotM4a(path);
      assert.equal(before.ilst.size, 0);

      await writeTags('tagless.m4a', [{ frameId: 'TIT2', value: 'Fresh' }]);

      const after = await snapshotM4a(path);
      assertOnlyTheseAtomsChanged(before, after, ['©nam']);
      assert.equal((await parseFile(path)).common.title, 'Fresh');
      await assertDecodesCleanly(path);
    }),
  );

  it(
    'refuses fragmented and QuickTime-keyed files without touching them',
    withLogs([], async () => {
      const source = await copyFixture('tagged', 'structure-source.m4a');
      const variants: Record<string, string[]> = {
        'fragmented.m4a': [
          '-movflags',
          'frag_keyframe+empty_moov',
          '-f',
          'ipod',
        ],
        'keyed.m4a': ['-movflags', 'use_metadata_tags', '-f', 'mov'],
      };
      for (const [name, args] of Object.entries(variants)) {
        const path = join(server.mountDir, name);
        await runFfmpeg(
          ['-i', source, '-map', '0:a', '-c', 'copy', ...args, path],
          'quick',
        );
        const originalBytes = await readFile(path);

        const { body } = await writeTrackTagsJson(
          server,
          [`/${name}`],
          [{ frameId: 'TIT2', value: 'Nope' }],
        );

        assert.deepEqual(body.updated, []);
        assert.equal(body.errors[0].code, 'unsupported-format');
        assert.deepEqual(await readFile(path), originalBytes);
        assert.ok(
          !(await readdir(server.mountDir)).some((f) => f.endsWith('.tmp')),
        );
      }
    }),
  );

  it(
    'rejects malformed numbers without writing anything',
    withLogs(
      [
        '[400err ] "TRCK must be numeric, got: "three""',
        '[400err ] "TBPM must be numeric, got: "12.5""',
      ],
      async () => {
        const path = await copyFixture('itunes-padded', 'bad-numbers.m4a');
        const originalBytes = await readFile(path);

        for (const change of [
          { frameId: 'TRCK', value: 'three' },
          { frameId: 'TBPM', value: '12.5' },
          { frameId: 'TPOS', value: '70000/2' },
        ]) {
          const res = await writeTrackTags(
            server,
            ['/bad-numbers.m4a'],
            [{ frameId: 'TIT2', value: 'Should Not Land' }, change],
          );
          assert.ok(
            res.status === 400 ||
              (await res.json()).errors[0].code === 'write-failed',
          );
        }
        assert.deepEqual(await readFile(path), originalBytes);
      },
    ),
  );
});

function id3v23Tag(frames: Buffer[], options: { padding?: number } = {}) {
  const body = Buffer.concat([...frames, Buffer.alloc(options.padding ?? 0)]);
  const header = Buffer.from([0x49, 0x44, 0x33, 3, 0, 0]);
  const size = Buffer.from([
    (body.length >> 21) & 0x7f,
    (body.length >> 14) & 0x7f,
    (body.length >> 7) & 0x7f,
    body.length & 0x7f,
  ]);
  return Buffer.concat([header, size, body]);
}

function id3v23Frame(id: string, data: Buffer) {
  const header = Buffer.alloc(10);
  header.write(id, 0, 4, 'latin1');
  header.writeUInt32BE(data.length, 4);
  return Buffer.concat([header, data]);
}

function commentFrame(description: string, text: string) {
  return id3v23Frame(
    'COMM',
    Buffer.concat([
      Buffer.from([0]),
      Buffer.from('eng', 'latin1'),
      Buffer.from(`${description}\0${text}`, 'latin1'),
    ]),
  );
}

function latin1TextFrame(id: string, text: string) {
  return id3v23Frame(
    id,
    Buffer.concat([Buffer.from([0]), Buffer.from(text, 'latin1')]),
  );
}

describe('POST /music/write-track-tags — mp3 fidelity', () => {
  let server: TestServer;
  let fixtureDir: string;
  let bare: string;
  let v23: string;
  let v24: string;
  let withArt: string;

  before(async () => {
    server = await createTestServer((app, mountPath) => {
      app.use('/music', musicRoute(mountPath));
    });
    fixtureDir = await mkdtemp(join(tmpdir(), 'indie-web-mp3-'));
    bare = join(fixtureDir, 'bare.mp3');
    v23 = join(fixtureDir, 'v23.mp3');
    v24 = join(fixtureDir, 'v24.mp3');
    withArt = join(fixtureDir, 'art.mp3');
    const cover = join(fixtureDir, 'cover.jpg');
    await makeBareMp3(bare);
    await makeTaggedMp3(bare, v23, { version: 3, id3v1: true });
    await makeTaggedMp3(bare, v24, { version: 4 });
    await runFfmpeg(
      [
        '-f',
        'lavfi',
        '-i',
        'color=c=red:s=16x16',
        '-frames:v',
        '1',
        '-update',
        '1',
        cover,
      ],
      'quick',
    );
    await makeTaggedMp3(bare, withArt, { version: 3, cover });
  });
  after(async () => {
    await server.close();
    await rm(fixtureDir, { recursive: true, force: true });
  });

  async function place(source: string, name: string) {
    const path = join(server.mountDir, name);
    await copyFile(source, path);
    return path;
  }

  async function writeTags(name: string, changes: T.TrackTagUpdate[]) {
    const { body } = await writeTrackTagsJson(server, [`/${name}`], changes);
    assert.deepEqual(body.errors, []);
    assert.deepEqual(body.updated, [`/${name}`]);
  }

  it(
    'the oracle detects a frame that changed',
    withLogs([], async () => {
      const path = await place(v23, 'oracle-self-test.mp3');
      const before = await snapshotMp3(path);
      await writeTags('oracle-self-test.mp3', [
        { frameId: 'TIT2', value: 'Different' },
      ]);
      const after = await snapshotMp3(path);
      assert.throws(() => assertOnlyTheseFramesChanged(before, after, []));
      assertOnlyTheseFramesChanged(before, after, ['TIT2']);
    }),
  );

  it(
    'reads the fixture tags the way the oracle expects',
    withLogs([], async () => {
      assert.deepEqual(
        Object.fromEntries(
          Object.entries(await ffprobeTags(v23)).filter(
            ([key]) => key in FIXTURE_TAGS,
          ),
        ),
        FIXTURE_TAGS,
      );
    }),
  );

  const FRAME_CASES = [
    { frameId: 'TIT2', key: 'title' },
    { frameId: 'TPE1', key: 'artist' },
    { frameId: 'TPE2', key: 'album_artist' },
    { frameId: 'TALB', key: 'album' },
    { frameId: 'TCOM', key: 'composer' },
    { frameId: 'TRCK', key: 'track' },
    { frameId: 'TPOS', key: 'disc' },
    { frameId: 'TYER', key: 'date' },
    { frameId: 'TCON', key: 'genre' },
    { frameId: 'TBPM', key: 'tbpm' },
    { frameId: 'TEXT', key: 'text' },
  ];
  const EDIT_VALUES: Record<string, string> = {
    TYER: '1999',
    TBPM: '7',
    TRCK: '7',
    TPOS: '7',
  };
  for (const { frameId, key } of FRAME_CASES) {
    const value = EDIT_VALUES[frameId] ?? 'Edited';
    it(
      `${frameId} edits only that frame, as ffprobe reads it`,
      withLogs([], async () => {
        const name = `edit-${frameId}.mp3`;
        const path = await place(v23, name);
        const before = await snapshotMp3(path);
        await writeTags(name, [{ frameId, value }]);
        const after = await snapshotMp3(path);
        assertOnlyTheseFramesChanged(before, after, [frameId]);
        assert.equal((await ffprobeTags(path))[key], value);
        await assertDecodesCleanly(path);
      }),
    );
  }

  it(
    'keeps other TXXX frames when writing the private grouping tag',
    withLogs([], async () => {
      const path = await place(v23, 'txxx.mp3');
      const before = await snapshotMp3(path);
      await writeTags('txxx.mp3', [
        {
          frameId: 'TXXX',
          description: 'indie-web:prefer-composer-grouping',
          value: 'true',
        },
      ]);
      const after = await snapshotMp3(path);
      assertOnlyTheseFramesChanged(before, after, [
        'TXXX:indie-web:prefer-composer-grouping',
      ]);
      const tags = await ffprobeTags(path);
      assert.equal(tags.mood, 'Calm');
      assert.equal(tags['indie-web:prefer-composer-grouping'], 'true');
    }),
  );

  it(
    'removes a frame when its value is cleared',
    withLogs([], async () => {
      const path = await place(v23, 'clear.mp3');
      const before = await snapshotMp3(path);
      await writeTags('clear.mp3', [{ frameId: 'TCOM', value: '' }]);
      const after = await snapshotMp3(path);
      assertOnlyTheseFramesChanged(before, after, ['TCOM']);
      assert.equal(after.frames.has('TCOM'), false);
      assert.equal((await ffprobeTags(path)).composer, undefined);
    }),
  );

  it(
    'round-trips non-Latin-1 text through ffprobe',
    withLogs([], async () => {
      const path = await place(v23, 'unicode-fidelity.mp3');
      const value = 'Ωμέγα — café 🎵';
      await writeTags('unicode-fidelity.mp3', [{ frameId: 'TIT2', value }]);
      assert.equal((await ffprobeTags(path)).title, value);
      await assertDecodesCleanly(path);
    }),
  );

  it(
    'grows the tag past its padding, then shrinks it back to the original frames',
    withLogs([], async () => {
      const path = await place(v23, 'grow.mp3');
      const before = await snapshotMp3(path);
      const originalSize = (await stat(path)).size;

      await writeTags('grow.mp3', [
        { frameId: 'COMM', value: 'long '.repeat(12_000) },
      ]);
      const grown = await snapshotMp3(path);
      assertOnlyTheseFramesChanged(before, grown, ['COMM']);
      assert.ok((await stat(path)).size > originalSize + 50_000);
      await assertDecodesCleanly(path);

      await writeTags('grow.mp3', [{ frameId: 'COMM', value: '' }]);
      const shrunk = await snapshotMp3(path);
      assertAudioUntouched(before, shrunk);
      assert.deepEqual(shrunk.frames, before.frames);
      assert.ok((await stat(path)).size < originalSize + 2000);
      await assertDecodesCleanly(path);
    }),
  );

  it(
    'upgrades a leading ID3v2.4 tag to ID3v2.3 without losing its frames',
    withLogs([], async () => {
      const path = await place(v24, 'upgrade.mp3');
      const before = await snapshotMp3(path);
      const tagsBefore = await ffprobeTags(path);
      assert.equal(before.version, 4);

      await writeTags('upgrade.mp3', [{ frameId: 'TALB', value: 'New Album' }]);

      const after = await snapshotMp3(path);
      assert.equal(after.version, 3);
      assertAudioUntouched(before, after);
      assert.deepEqual(await ffprobeTags(path), {
        ...tagsBefore,
        album: 'New Album',
      });
      await assertDecodesCleanly(path);
    }),
  );

  it(
    'converts the UTF-8 text of an ID3v2.4 tag',
    withLogs([], async () => {
      const audio = (await readFile(bare)) as Buffer;
      const utf8Frame = (id: string, text: string) =>
        Buffer.concat([
          Buffer.from(id, 'latin1'),
          Buffer.from([0, 0, 0, 1 + Buffer.byteLength(text), 0, 0]),
          Buffer.from([3]),
          Buffer.from(text, 'utf8'),
        ]);
      const body = Buffer.concat([
        utf8Frame('TIT2', 'Ωμέγα 🎵'),
        utf8Frame('TPE1', 'Zoë'),
      ]);
      const header = Buffer.from([
        0x49,
        0x44,
        0x33,
        4,
        0,
        0,
        0,
        0,
        0,
        body.length,
      ]);
      const path = join(server.mountDir, 'utf8-v24.mp3');
      await writeFile(path, Buffer.concat([header, body, audio]));

      await writeTags('utf8-v24.mp3', [{ frameId: 'TALB', value: 'Album' }]);

      const tags = await ffprobeTags(path);
      assert.equal(tags.title, 'Ωμέγα 🎵');
      assert.equal(tags.artist, 'Zoë');
      assert.equal((await snapshotMp3(path)).version, 3);
      await assertDecodesCleanly(path);
    }),
  );

  it(
    'upgrades a leading ID3v2.2 tag',
    withLogs([], async () => {
      const audio = (await readFile(bare)) as Buffer;
      const path = join(server.mountDir, 'upgrade-v22.mp3');
      await writeFile(
        path,
        Buffer.concat([
          buildId3v2Block(2, [
            { id: 'TT2', text: 'Old V22 Title' },
            { id: 'TP1', text: 'Old V22 Artist' },
          ]),
          audio,
        ]),
      );

      await writeTags('upgrade-v22.mp3', [{ frameId: 'TALB', value: 'Album' }]);

      const tags = await ffprobeTags(path);
      assert.equal(tags.title, 'Old V22 Title');
      assert.equal(tags.artist, 'Old V22 Artist');
      assert.equal(tags.album, 'Album');
      const after = await snapshotMp3(path);
      assert.equal(after.version, 3);
      assert.equal(after.audioSha, (await snapshotMp3(bare)).audioSha);
      await assertDecodesCleanly(path);
    }),
  );

  it(
    'writes in place when the tag fits in its padding',
    withLogs([], async () => {
      const audio = (await readFile(bare)) as Buffer;
      const path = join(server.mountDir, 'in-place.mp3');
      const tag = id3v23Tag([latin1TextFrame('TIT2', 'Short')], {
        padding: 4096,
      });
      await writeFile(path, Buffer.concat([tag, audio]));

      await writeTags('in-place.mp3', [
        { frameId: 'TIT2', value: 'A somewhat longer title' },
      ]);

      const written = await readFile(path);
      assert.equal(written.length, tag.length + audio.length + ID3V1_TAG_SIZE);
      assert.deepEqual(
        written.subarray(tag.length, tag.length + audio.length),
        audio,
      );
      assert.equal((await ffprobeTags(path)).title, 'A somewhat longer title');
      assert.deepEqual(
        await readdir(server.mountDir).then((names) =>
          names.filter((name) => name.endsWith('.tmp')),
        ),
        [],
      );
    }),
  );

  it(
    "keeps other apps' frames through an unsynchronised tag with an extended header",
    withLogs([], async () => {
      const audio = (await readFile(bare)) as Buffer;
      const privData = Buffer.concat([
        Buffer.from('owner@example.com\0', 'latin1'),
        Buffer.from([0xff, 0xe0, 0xff, 0x00, 0x12, 0xff]),
      ]);
      const popmData = Buffer.concat([
        Buffer.from('user@example.com\0', 'latin1'),
        Buffer.from([196, 0, 0, 0, 4]),
      ]);
      const normalization = commentFrame('iTunNORM', ' 00000000 00000000');
      const extendedHeader = Buffer.from([0, 0, 0, 6, 0, 0, 0, 0, 0, 0]);
      const plain = Buffer.concat([
        extendedHeader,
        latin1TextFrame('TIT2', 'Original'),
        id3v23Frame('PRIV', privData),
        id3v23Frame('POPM', popmData),
        commentFrame('', 'Original comment'),
        normalization,
      ]);
      const unsynchronised: number[] = [];
      plain.forEach((byte, index) => {
        unsynchronised.push(byte);
        const next = plain[index + 1];
        if (
          byte === 0xff &&
          (next === undefined || next === 0 || next >= 0xe0)
        ) {
          unsynchronised.push(0);
        }
      });
      const body = Buffer.from(unsynchronised);
      const header = Buffer.from([
        0x49,
        0x44,
        0x33,
        3,
        0,
        0xc0,
        (body.length >> 21) & 0x7f,
        (body.length >> 14) & 0x7f,
        (body.length >> 7) & 0x7f,
        body.length & 0x7f,
      ]);
      const path = join(server.mountDir, 'foreign-frames.mp3');
      await writeFile(path, Buffer.concat([header, body, audio]));

      await writeTags('foreign-frames.mp3', [
        { frameId: 'TIT2', value: 'Edited' },
        { frameId: 'COMM', value: 'Edited comment' },
      ]);

      const after = await snapshotMp3(path);
      assert.equal(after.frames.get('PRIV'), '0000' + privData.toString('hex'));
      assert.equal(after.frames.get('POPM'), '0000' + popmData.toString('hex'));
      assert.equal(
        after.frames.get('COMM#2'),
        '0000' + normalization.subarray(10).toString('hex'),
      );
      assert.equal((await ffprobeTags(path)).title, 'Edited');
      assert.equal(after.audioSha, (await snapshotMp3(bare)).audioSha);
      await assertDecodesCleanly(path);
    }),
  );

  it(
    'keeps the embedded picture when editing text',
    withLogs([], async () => {
      const path = await place(withArt, 'keep-art.mp3');
      const before = await snapshotMp3(path);
      assert.ok(before.frames.has('APIC'));
      await writeTags('keep-art.mp3', [{ frameId: 'TIT2', value: 'Edited' }]);
      assertOnlyTheseFramesChanged(before, await snapshotMp3(path), ['TIT2']);
      assert.equal((await parseFile(path)).common.picture?.length, 1);
      await assertDecodesCleanly(path);
    }),
  );

  it(
    'leaves a file with a corrupt tag untouched',
    withLogs([], async () => {
      const path = join(server.mountDir, 'broken-tag.mp3');
      const bytes = Buffer.concat([
        Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, 0, 0x7f, 0x7f, 0x7f]),
        Buffer.alloc(200, 0x41),
      ]);
      await writeFile(path, bytes);

      const { body } = await writeTrackTagsJson(
        server,
        ['/broken-tag.mp3'],
        [{ frameId: 'TIT2', value: 'Nope' }],
      );

      assert.equal(body.errors[0].path, '/broken-tag.mp3');
      assert.match(body.errors[0].message, /^Corrupt mp3/);
      assert.deepEqual(await readFile(path), bytes);
      assert.equal(
        (await readdir(server.mountDir)).some((name) => name.endsWith('.tmp')),
        false,
      );
    }),
  );

  it(
    'reports an unknown ID3 version as an unsupported format',
    withLogs([], async () => {
      const path = join(server.mountDir, 'future-tag.mp3');
      const bytes = Buffer.concat([
        Buffer.from([0x49, 0x44, 0x33, 5, 0, 0, 0, 0, 0, 20]),
        Buffer.alloc(100),
      ]);
      await writeFile(path, bytes);

      const { body } = await writeTrackTagsJson(
        server,
        ['/future-tag.mp3'],
        [{ frameId: 'TIT2', value: 'Nope' }],
      );

      assert.equal(body.errors[0].code, 'unsupported-format');
      assert.deepEqual(await readFile(path), bytes);
    }),
  );
});

const FLAC_FIXTURES: FlacFixture[] = ['tagged', 'flac-rich', 'flac-tight'];

function flacBlock(type: number, body: Buffer, last = false) {
  const header = Buffer.alloc(4);
  header[0] = type | (last ? 0x80 : 0);
  header.writeUIntBE(body.length, 1, 3);
  return Buffer.concat([header, body]);
}

function insertFlacBlockAfterStreaminfo(data: Buffer, block: Buffer) {
  const streaminfoEnd = 4 + 4 + data.readUIntBE(5, 3);
  return Buffer.concat([
    data.subarray(0, streaminfoEnd),
    block,
    data.subarray(streaminfoEnd),
  ]);
}

function vorbisCommentBody(entries: Buffer[]) {
  const word = (n: number) => {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(n);
    return b;
  };
  return Buffer.concat([
    word(0),
    word(entries.length),
    ...entries.flatMap((entry) => [word(entry.length), entry]),
  ]);
}

describe('POST /music/write-track-tags — flac', () => {
  let server: TestServer;
  before(async () => {
    server = await createTestServer((app, mountPath) => {
      app.use('/music', musicRoute(mountPath));
    });
  });
  after(() => server.close());

  async function place(fixture: FlacFixture, name: string) {
    const path = join(server.mountDir, name);
    await copyFlacFixture(fixture, path);
    return path;
  }

  async function writeTags(name: string, changes: T.TrackTagUpdate[]) {
    const { body } = await writeTrackTagsJson(server, [`/${name}`], changes);
    assert.deepEqual(body.errors, []);
    assert.deepEqual(body.updated, [`/${name}`]);
  }

  const FIELDS: Array<[string, string, (meta: IAudioMetadata) => unknown]> = [
    ['TIT2', 'My Title', (meta) => meta.common.title],
    ['TPE1', 'My Artist', (meta) => meta.common.artist],
    ['TPE2', 'My Album Artist', (meta) => meta.common.albumartist],
    ['TALB', 'My Album', (meta) => meta.common.album],
    ['TCOM', 'My Composer', (meta) => meta.common.composer?.[0]],
    ['TYER', '1999', (meta) => String(meta.common.year)],
    ['TCON', 'Rock', (meta) => meta.common.genre?.[0]],
    ['TBPM', '128', (meta) => meta.common.bpm],
    ['COMM', 'My comment', (meta) => meta.common.comment?.[0].text],
  ];

  for (const [frameId, value, read] of FIELDS) {
    it(
      `writes ${frameId} where music-metadata and ffprobe read it`,
      withLogs([], async () => {
        const name = `field-${frameId}.flac`;
        const path = await place('tagged', name);
        await writeTags(name, [{ frameId, value }]);
        assert.equal(
          read(await parseFile(path)),
          frameId === 'TBPM' ? 128 : value,
        );
        const probed = await ffprobeTags(path);
        assert.equal(
          probed[FRAME_COMMENTS[frameId].toLowerCase()] ??
            probed[{ TYER: 'date', TPE2: 'album_artist' }[frameId] ?? ''],
          value,
        );
        await assertDecodesCleanly(path);
        await assertFlacVerifies(path);
      }),
    );
  }

  for (const fixture of FLAC_FIXTURES) {
    it(
      `${fixture}: changes only the requested comments`,
      withLogs([], async () => {
        const name = `${fixture}-edit.flac`;
        const path = await place(fixture, name);
        const before = await snapshotFlac(path);
        const changes: T.TrackTagUpdate[] = [
          { frameId: 'TIT2', value: 'Edited Title ☃' },
          { frameId: 'TPE1', value: 'Edited Artist' },
          { frameId: 'TCON', value: 'Rock' },
          { frameId: 'TRCK', value: '7' },
          { frameId: 'COMM', value: 'Edited comment' },
        ];

        await writeTags(name, changes);

        const after = await snapshotFlac(path);
        const requested = changes.map(({ frameId }) => FRAME_COMMENTS[frameId]);
        assertOnlyTheseCommentsChanged(before, after, requested);
        assert.deepEqual(changedComments(before, after), requested.sort());
        assert.deepEqual(after.comments.get('TITLE'), ['Edited Title ☃']);
        await assertDecodesCleanly(path);
        await assertFlacVerifies(path);
        assert.deepEqual(
          await readdir(server.mountDir).then((names) =>
            names.filter((n) => n.endsWith('.tmp')),
          ),
          [],
        );
      }),
    );
  }

  it(
    'replaces a differently cased name instead of adding a second one',
    withLogs([], async () => {
      const path = await place('tagged', 'case.flac');
      await writeTags('case.flac', [{ frameId: 'TIT2', value: 'Cased' }]);
      const after = await snapshotFlac(path);
      assert.deepEqual([...after.comments.keys()].sort(), [
        'ALBUM',
        'ARTIST',
        'ENCODER',
        'TITLE',
      ]);
      assert.equal(after.comments.get('TITLE')?.[0], 'Cased');
    }),
  );

  it(
    'removes a comment when the value is empty',
    withLogs([], async () => {
      const path = await place('flac-rich', 'remove.flac');
      const before = await snapshotFlac(path);
      await writeTags('remove.flac', [
        { frameId: 'TPE1', value: '' },
        { frameId: 'TRCK', value: '' },
      ]);
      const after = await snapshotFlac(path);
      assert.deepEqual(changedComments(before, after), [
        'ARTIST',
        'TOTALTRACKS',
        'TRACKNUMBER',
      ]);
      assert.equal((await parseFile(path)).common.artist, undefined);
    }),
  );

  it(
    'collapses a multi-value field only when it is written',
    withLogs([], async () => {
      const path = await place('flac-rich', 'multi.flac');
      await writeTags('multi.flac', [{ frameId: 'TIT2', value: 'Other' }]);
      assert.deepEqual((await snapshotFlac(path)).comments.get('ARTIST'), [
        'Fixture Artist',
        'Second Artist',
      ]);
      await writeTags('multi.flac', [{ frameId: 'TPE1', value: 'Solo' }]);
      assert.deepEqual((await snapshotFlac(path)).comments.get('ARTIST'), [
        'Solo',
      ]);
    }),
  );

  it(
    'keeps an existing total unless the track value brings its own',
    withLogs([], async () => {
      const path = await place('flac-rich', 'total.flac');
      await writeTags('total.flac', [{ frameId: 'TRCK', value: '4' }]);
      let comments = (await snapshotFlac(path)).comments;
      assert.deepEqual(comments.get('TRACKNUMBER'), ['4']);
      assert.deepEqual(comments.get('TOTALTRACKS'), ['9']);

      await writeTags('total.flac', [{ frameId: 'TRCK', value: '4/12' }]);
      comments = (await snapshotFlac(path)).comments;
      assert.deepEqual(comments.get('TRACKNUMBER'), ['4/12']);
      assert.equal(comments.has('TOTALTRACKS'), false);
      assert.deepEqual((await parseFile(path)).common.track, { no: 4, of: 12 });
    }),
  );

  it(
    'fits the edit in the padding without moving the audio',
    withLogs([], async () => {
      const path = await place('flac-rich', 'fits.flac');
      const size = (await readFile(path)).length;
      await writeTags('fits.flac', [
        { frameId: 'COMM', value: 'a short comment' },
      ]);
      assert.equal((await readFile(path)).length, size);
    }),
  );

  it(
    'grows the file with fresh padding when a tight chain overflows',
    withLogs([], async () => {
      const path = await place('flac-tight', 'grows.flac');
      const before = await snapshotFlac(path);
      const size = (await readFile(path)).length;
      await writeTags('grows.flac', [
        { frameId: 'COMM', value: 'x'.repeat(500) },
      ]);
      assert.ok((await readFile(path)).length > size);
      assertOnlyTheseCommentsChanged(before, await snapshotFlac(path), [
        'COMMENT',
      ]);
      await assertFlacVerifies(path);
    }),
  );

  it(
    'restores the original chain when the original values are written back',
    withLogs([], async () => {
      const path = await place('flac-rich', 'restore.flac');
      const original = await readFile(path);
      await writeTags('restore.flac', [
        { frameId: 'TIT2', value: 'Temporary' },
        { frameId: 'COMM', value: 'Temporary comment' },
      ]);
      await writeTags('restore.flac', [
        { frameId: 'TIT2', value: 'Fixture Title' },
        { frameId: 'COMM', value: '' },
      ]);
      const restored = await readFile(path);
      assert.equal(restored.length, original.length);
      assert.equal(restored.subarray(0, 4).toString('latin1'), 'fLaC');
      const after = await snapshotFlac(path);
      const before = await snapshotFlac(
        await place('flac-rich', 'pristine.flac'),
      );
      assert.deepEqual(
        after.blocks.map((b) => b.type),
        before.blocks.map((b) => b.type),
      );
      assert.deepEqual([...after.comments], [...before.comments]);
    }),
  );

  it(
    'preserves an ID3v2 tag in front of the stream',
    withLogs([], async () => {
      const path = join(server.mountDir, 'prefixed.flac');
      const prefix = buildId3v2Block(3, [{ id: 'TIT2', text: 'Legacy' }]);
      await copyFlacFixture('tagged', path);
      const flac = await readFile(path);
      await writeFile(path, Buffer.concat([prefix, flac]));
      const before = await snapshotFlac(path);

      await writeTags('prefixed.flac', [
        { frameId: 'TALB', value: 'New Album' },
      ]);

      const after = await snapshotFlac(path);
      assertOnlyTheseCommentsChanged(before, after, ['ALBUM']);
      assert.deepEqual(
        (await readFile(path)).subarray(0, prefix.length),
        prefix,
      );
      await assertDecodesCleanly(path);
    }),
  );

  it(
    'keeps blocks it does not understand and comments it cannot decode',
    withLogs([], async () => {
      const path = join(server.mountDir, 'foreign.flac');
      await copyFlacFixture('flac-rich', path);
      const application = flacBlock(2, Buffer.from('abcdthe payload'));
      await writeFile(
        path,
        insertFlacBlockAfterStreaminfo(await readFile(path), application),
      );
      const before = await snapshotFlac(path);

      await writeTags('foreign.flac', [{ frameId: 'TALB', value: 'Changed' }]);

      assertOnlyTheseCommentsChanged(before, await snapshotFlac(path), [
        'ALBUM',
      ]);
      await assertDecodesCleanly(path);
    }),
  );

  it(
    'rejects a file with two Vorbis comment blocks without touching it',
    withLogs([], async () => {
      const path = join(server.mountDir, 'twice.flac');
      await copyFlacFixture('tagged', path);
      const second = flacBlock(
        4,
        vorbisCommentBody([Buffer.from('TITLE=Two')]),
      );
      await writeFile(
        path,
        insertFlacBlockAfterStreaminfo(await readFile(path), second),
      );
      const bytes = await readFile(path);

      const { body } = await writeTrackTagsJson(
        server,
        ['/twice.flac'],
        [{ frameId: 'TIT2', value: 'X' }],
      );

      assert.equal(body.errors[0].code, 'unsupported-format');
      assert.deepEqual(await readFile(path), bytes);
    }),
  );

  it(
    'fails cleanly on a truncated file',
    withLogs([], async () => {
      const path = join(server.mountDir, 'truncated.flac');
      await copyFlacFixture('tagged', path);
      const bytes = (await readFile(path)).subarray(0, 20);
      await writeFile(path, bytes);

      const { body } = await writeTrackTagsJson(
        server,
        ['/truncated.flac'],
        [{ frameId: 'TIT2', value: 'X' }],
      );

      assert.equal(body.errors[0].code, 'write-failed');
      assert.deepEqual(await readFile(path), bytes);
      assert.equal(
        (await readdir(server.mountDir)).filter((n) => n.endsWith('.tmp'))
          .length,
        0,
      );
    }),
  );

  it(
    'rejects frames flac cannot hold',
    withLogs([], async () => {
      const path = await place('tagged', 'frames.flac');
      const bytes = await readFile(path);
      const { body } = await writeTrackTagsJson(
        server,
        ['/frames.flac'],
        [
          { frameId: 'TIT2', value: 'Should Not Land' },
          {
            frameId: 'TXXX',
            value: 'true',
            description: PREFER_COMPOSER_GROUPING_TAG_DESCRIPTION,
          },
        ],
      );
      assert.equal(body.errors[0].code, 'unsupported-frame');
      assert.deepEqual(await readFile(path), bytes);
    }),
  );
});
