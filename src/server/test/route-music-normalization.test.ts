import { describe as nodeDescribe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { musicRoute, MUSIC_INDEX_FILENAME } from '../route-music.ts';
import type { T } from '../index.ts';
import {
  createTestServer,
  buildMp3WithNativeBlocks,
  withLogs,
  getBytesAfterId3,
} from './helpers.ts';
import type { TestServer } from './helpers.ts';

/**
 * These tests prove the ID3v2.3-first normalization strategy end to end
 * through the server's public HTTP endpoints. The tests do not access server
 * internals.
 */

let describe: (name: string, fn: () => void) => void = nodeDescribe;
if (process.env.INDIE_WEB_SKIP_LOCALHOST_TESTS === '1') {
  // The check runner enables this in sandboxes that cannot bind localhost.
  describe = (name) => {
    console.error(`LOCALHOST_BIND_SKIPPED_TEST ${name}`);
  };
}

async function scan(server: TestServer): Promise<T.MusicIndex> {
  const res = await fetch(`${server.baseUrl}/music/music-index/scan`, {
    method: 'POST',
  });
  return res.json();
}

async function getTrackTags(
  server: TestServer,
  clientPath: string,
): Promise<T.TrackTagsResponse> {
  const res = await fetch(
    `${server.baseUrl}/music/track-tags?path=${encodeURIComponent(clientPath)}`,
  );
  return res.json();
}

async function writeTags(
  server: TestServer,
  paths: string[],
  changes: T.TrackTagUpdate[],
): Promise<T.WriteTrackTagsResponse> {
  const res = await fetch(`${server.baseUrl}/music/write-track-tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths, changes }),
  });
  return res.json();
}

function trackByPath(index: T.MusicIndex, clientPath: string): T.TrackMetadata {
  const track = index.tracks.find((t) => t.path === clientPath);
  assert.ok(track, `${clientPath} should appear in the index`);
  return track!;
}

function tagsOf(response: T.TrackTagsResponse, format: string) {
  const block = response.native.find((b) => b.format === format);
  assert.ok(block, `expected a ${format} block in the native tags`);
  return new Map(block!.tags.map((t) => [t.id, t.value]));
}

describe('scan resolves fields by ID3v2.3 > ID3v2.4 > ID3v2.2 > ID3v1 priority', () => {
  let server: TestServer;
  before(async () => {
    server = await createTestServer((app, mountPath) => {
      app.use('/music', musicRoute(mountPath));
    });
  });
  after(() => server.close());

  it(
    'prefers ID3v2.3 over co-located ID3v2.4 and ID3v1 values for the same field',
    withLogs([], async () => {
      await writeFile(
        join(server.mountDir, 'chain-a.mp3'),
        buildMp3WithNativeBlocks({
          id3v2Blocks: [
            { version: 3, frames: [{ id: 'TIT2', text: 'Chain-A-V23' }] },
            { version: 4, frames: [{ id: 'TIT2', text: 'Chain-A-V24' }] },
          ],
          id3v1: { title: 'Chain-A-V1' },
        }),
      );
      const index = await scan(server);
      assert.equal(trackByPath(index, '/chain-a.mp3').title, 'Chain-A-V23');
    }),
  );

  it(
    'falls back to ID3v2.4 when ID3v2.3 is absent',
    withLogs([], async () => {
      await writeFile(
        join(server.mountDir, 'chain-b.mp3'),
        buildMp3WithNativeBlocks({
          id3v2Blocks: [
            { version: 4, frames: [{ id: 'TIT2', text: 'Chain-B-V24' }] },
            { version: 2, frames: [{ id: 'TT2', text: 'Chain-B-V22' }] },
          ],
          id3v1: { title: 'Chain-B-V1' },
        }),
      );
      const index = await scan(server);
      assert.equal(trackByPath(index, '/chain-b.mp3').title, 'Chain-B-V24');
    }),
  );

  it(
    'falls back to ID3v2.2 when ID3v2.3 and ID3v2.4 are absent',
    withLogs([], async () => {
      await writeFile(
        join(server.mountDir, 'chain-c.mp3'),
        buildMp3WithNativeBlocks({
          id3v2Blocks: [
            { version: 2, frames: [{ id: 'TT2', text: 'Chain-C-V22' }] },
          ],
          id3v1: { title: 'Chain-C-V1' },
        }),
      );
      const index = await scan(server);
      assert.equal(trackByPath(index, '/chain-c.mp3').title, 'Chain-C-V22');
    }),
  );

  it(
    'falls back to ID3v1 when no ID3v2 tag is present at all',
    withLogs([], async () => {
      await writeFile(
        join(server.mountDir, 'chain-d.mp3'),
        buildMp3WithNativeBlocks({ id3v1: { title: 'Chain-D-V1' } }),
      );
      const index = await scan(server);
      assert.equal(trackByPath(index, '/chain-d.mp3').title, 'Chain-D-V1');
    }),
  );

  it(
    'resolves per field rather than per block: ID3v2.3 wins genre while its missing title falls through to ID3v2.4',
    withLogs([], async () => {
      await writeFile(
        join(server.mountDir, 'per-field.mp3'),
        buildMp3WithNativeBlocks({
          id3v2Blocks: [
            // No TIT2 in this block on purpose.
            {
              version: 3,
              frames: [{ id: 'TCON', text: 'PerField-V23-Genre' }],
            },
            {
              version: 4,
              frames: [
                { id: 'TIT2', text: 'PerField-V24-Title' },
                { id: 'TCON', text: 'PerField-V24-Genre-ignored' },
              ],
            },
          ],
        }),
      );
      const index = await scan(server);
      const track = trackByPath(index, '/per-field.mp3');
      assert.equal(track.genre, 'PerField-V23-Genre');
      assert.equal(track.title, 'PerField-V24-Title');
    }),
  );

  it(
    'reproduces the real-world bug: ID3v2.3 genre wins over a co-located legacy ID3v2.4 tag left by an old iTunes version',
    withLogs([], async () => {
      await writeFile(
        join(server.mountDir, 'real-bug.mp3'),
        buildMp3WithNativeBlocks({
          id3v2Blocks: [
            {
              version: 3,
              frames: [
                { id: 'TCON', text: 'Rock' },
                { id: 'TIT2', text: 'To Sheila' },
              ],
            },
            {
              version: 4,
              frames: [{ id: 'TCON', text: 'Alternative & Punk' }],
            },
          ],
          id3v1: { genre: 17 }, // 17 = "Rock" in the ID3v1 genre table
        }),
      );
      const index = await scan(server);
      assert.equal(trackByPath(index, '/real-bug.mp3').genre, 'Rock');
    }),
  );
});

describe('GET /music/track-tags resolved values agree with the scanner; raw native stays complete', () => {
  let server: TestServer;
  before(async () => {
    server = await createTestServer((app, mountPath) => {
      app.use('/music', musicRoute(mountPath));
    });
  });
  after(() => server.close());

  it(
    'resolved matches the index, while native still exposes every original source block for the raw tag browser',
    withLogs([], async () => {
      await writeFile(
        join(server.mountDir, 'resolved.mp3'),
        buildMp3WithNativeBlocks({
          id3v2Blocks: [
            {
              version: 3,
              frames: [{ id: 'TCON', text: 'Resolved-V23-Genre' }],
            },
            {
              version: 4,
              frames: [
                { id: 'TCON', text: 'Resolved-V24-Genre-ignored' },
                { id: 'TIT2', text: 'Resolved-V24-Title' },
              ],
            },
          ],
          id3v1: { title: 'Resolved-V1-Title-ignored' },
        }),
      );

      const index = await scan(server);
      const track = trackByPath(index, '/resolved.mp3');

      const tags = await getTrackTags(server, '/resolved.mp3');
      assert.equal(tags.resolved.TCON, track.genre);
      assert.equal(tags.resolved.TIT2, track.title);
      assert.equal(tags.resolved.TCON, 'Resolved-V23-Genre');
      assert.equal(tags.resolved.TIT2, 'Resolved-V24-Title');

      // The raw browser (TagsTab.tsx) still needs every original block,
      // unmodified — normalization must not collapse it away.
      const formats = tags.native.map((b) => b.format).sort();
      assert.deepEqual(formats, ['ID3v1', 'ID3v2.3', 'ID3v2.4']);
      assert.equal(
        tagsOf(tags, 'ID3v2.4').get('TCON'),
        'Resolved-V24-Genre-ignored',
      );
      assert.equal(
        tagsOf(tags, 'ID3v1').get('title'),
        'Resolved-V1-Title-ignored',
      );
    }),
  );
});

describe('POST /music/write-track-tags eagerly migrates missing fields into ID3v2.3', () => {
  let server: TestServer;
  before(async () => {
    server = await createTestServer((app, mountPath) => {
      app.use('/music', musicRoute(mountPath));
    });
  });
  after(() => server.close());

  it(
    'backfills ID3v2.3 from legacy tags, keeps its own pre-existing field, and never touches the legacy tags on disk',
    withLogs([], async () => {
      const clientPath = '/migrate.mp3';
      await writeFile(
        join(server.mountDir, 'migrate.mp3'),
        buildMp3WithNativeBlocks({
          id3v2Blocks: [
            // v2.3 owns genre only.
            { version: 3, frames: [{ id: 'TCON', text: 'Migrate-V23-Genre' }] },
            {
              version: 4,
              frames: [
                { id: 'TCON', text: 'Migrate-V24-Genre-should-not-win' },
                { id: 'TIT2', text: 'Migrate-V24-Title' },
                { id: 'TPE1', text: 'Migrate-V24-Artist' },
              ],
            },
          ],
          id3v1: { album: 'Migrate-V1-Album' },
        }),
      );

      const before = await getTrackTags(server, clientPath);
      const v24Before = tagsOf(before, 'ID3v2.4');
      const v1Before = tagsOf(before, 'ID3v1');

      const fileBefore = await readFile(join(server.mountDir, 'migrate.mp3'));
      const tailBefore = getBytesAfterId3(fileBefore);

      // Write a field with nothing to do with genre/title/artist.
      const writeRes = await writeTags(
        server,
        [clientPath],
        [{ frameId: 'TALB', value: 'Migrate-New-Album' }],
      );
      assert.deepEqual(writeRes.errors, []);

      const after = await getTrackTags(server, clientPath);
      const v23After = tagsOf(after, 'ID3v2.3');

      // The requested edit landed.
      assert.equal(v23After.get('TALB'), 'Migrate-New-Album');
      // v2.3's own pre-existing field survives — not overwritten by the
      // lower-priority ID3v2.4 value for the same frame.
      assert.equal(v23After.get('TCON'), 'Migrate-V23-Genre');
      // Fields v2.3 didn't have were migrated in from ID3v2.4 (which
      // outranks ID3v1), not from ID3v1.
      assert.equal(v23After.get('TIT2'), 'Migrate-V24-Title');
      assert.equal(v23After.get('TPE1'), 'Migrate-V24-Artist');

      // Legacy tags: same values...
      assert.deepEqual(tagsOf(after, 'ID3v2.4'), v24Before);
      assert.deepEqual(tagsOf(after, 'ID3v1'), v1Before);

      // ...and byte-for-byte identical on disk, not just re-derived to the
      // same values by coincidence.
      const fileAfter = await readFile(join(server.mountDir, 'migrate.mp3'));
      const tailAfter = getBytesAfterId3(fileAfter);
      assert.deepEqual(tailAfter, tailBefore);
    }),
  );

  it(
    'promotes ID3v2.4 to ID3v2.3 (absorbing its fields) when no ID3v2.3 exists yet, leaving a separate trailing legacy tag untouched',
    withLogs([], async () => {
      const clientPath = '/promote.mp3';
      await writeFile(
        join(server.mountDir, 'promote.mp3'),
        buildMp3WithNativeBlocks({
          id3v2Blocks: [
            {
              version: 4,
              frames: [
                { id: 'TIT2', text: 'Promote-V24-Title' },
                { id: 'TPE1', text: 'Promote-V24-Artist' },
              ],
            },
          ],
          id3v1: { album: 'Promote-V1-Album' },
        }),
      );

      const before = await getTrackTags(server, clientPath);
      assert.equal(
        before.native.find((b) => b.format === 'ID3v2.3'),
        undefined,
      );
      const v1Before = tagsOf(before, 'ID3v1');
      const fileBefore = await readFile(join(server.mountDir, 'promote.mp3'));
      const tailBefore = getBytesAfterId3(fileBefore);

      const writeRes = await writeTags(
        server,
        [clientPath],
        [{ frameId: 'TALB', value: 'Promote-Album' }],
      );
      assert.deepEqual(writeRes.errors, []);

      const after = await getTrackTags(server, clientPath);
      // The old leading ID3v2.4 tag is gone: it was the only ID3v2 tag, so
      // node-id3 rewrote it in place — and this app always writes ID3v2.3.
      assert.equal(
        after.native.find((b) => b.format === 'ID3v2.4'),
        undefined,
      );
      const v23After = tagsOf(after, 'ID3v2.3');
      assert.equal(v23After.get('TIT2'), 'Promote-V24-Title');
      assert.equal(v23After.get('TPE1'), 'Promote-V24-Artist');
      assert.equal(v23After.get('TALB'), 'Promote-Album');

      // The separate, trailing ID3v1 tag was never the leading tag, so it's
      // untouched — same values, same bytes.
      assert.deepEqual(tagsOf(after, 'ID3v1'), v1Before);
      const fileAfter = await readFile(join(server.mountDir, 'promote.mp3'));
      const tailAfter = getBytesAfterId3(fileAfter);
      assert.deepEqual(tailAfter, tailBefore);
    }),
  );

  it(
    'is idempotent: a second write does not duplicate migrated frames or re-touch legacy tags',
    withLogs([], async () => {
      const clientPath = '/idempotent.mp3';
      await writeFile(
        join(server.mountDir, 'idempotent.mp3'),
        buildMp3WithNativeBlocks({
          id3v2Blocks: [
            {
              version: 3,
              frames: [{ id: 'TCON', text: 'Idempotent-V23-Genre' }],
            },
            {
              version: 4,
              frames: [{ id: 'TIT2', text: 'Idempotent-V24-Title' }],
            },
          ],
        }),
      );

      await writeTags(
        server,
        [clientPath],
        [{ frameId: 'TALB', value: 'First Album' }],
      );
      const afterFirst = await getTrackTags(server, clientPath);
      const v24AfterFirst = tagsOf(afterFirst, 'ID3v2.4');
      const fileAfterFirst = await readFile(
        join(server.mountDir, 'idempotent.mp3'),
      );
      const tailAfterFirst = getBytesAfterId3(fileAfterFirst);

      await writeTags(
        server,
        [clientPath],
        [{ frameId: 'TALB', value: 'Second Album' }],
      );
      const afterSecond = await getTrackTags(server, clientPath);
      const v23TagsAfterSecond = afterSecond.native.find(
        (b) => b.format === 'ID3v2.3',
      )!.tags;

      // No duplicate frames from being gap-filled a second time.
      assert.equal(v23TagsAfterSecond.filter((t) => t.id === 'TIT2').length, 1);
      assert.equal(v23TagsAfterSecond.filter((t) => t.id === 'TCON').length, 1);
      const v23AfterSecond = tagsOf(afterSecond, 'ID3v2.3');
      assert.equal(v23AfterSecond.get('TALB'), 'Second Album');
      assert.equal(v23AfterSecond.get('TIT2'), 'Idempotent-V24-Title');
      assert.equal(v23AfterSecond.get('TCON'), 'Idempotent-V23-Genre');

      // The legacy tag is still untouched after the second write too.
      assert.deepEqual(tagsOf(afterSecond, 'ID3v2.4'), v24AfterFirst);
      const fileAfterSecond = await readFile(
        join(server.mountDir, 'idempotent.mp3'),
      );
      const tailAfterSecond = getBytesAfterId3(fileAfterSecond);
      assert.deepEqual(tailAfterSecond, tailAfterFirst);
    }),
  );
});

describe('write -> rescan keeps the index and the details panel in agreement', () => {
  let server: TestServer;
  before(async () => {
    server = await createTestServer((app, mountPath) => {
      app.use('/music', musicRoute(mountPath));
    });
  });
  after(() => server.close());

  it(
    'a rescan after a write reflects both the edit and the migrated fields, matching /track-tags resolved',
    withLogs([], async () => {
      const clientPath = '/e2e.mp3';
      await writeFile(
        join(server.mountDir, 'e2e.mp3'),
        buildMp3WithNativeBlocks({
          id3v2Blocks: [
            { version: 3, frames: [{ id: 'TCON', text: 'E2E-V23-Genre' }] },
            { version: 4, frames: [{ id: 'TPE1', text: 'E2E-V24-Artist' }] },
          ],
        }),
      );

      // Baseline scan, mirroring a file that was already indexed before the
      // user opens the edit panel.
      await scan(server);

      await writeTags(
        server,
        [clientPath],
        [{ frameId: 'TIT2', value: 'E2E-New-Title' }],
      );

      const rescanned = await scan(server);
      const track = trackByPath(rescanned, clientPath);
      assert.equal(track.title, 'E2E-New-Title');
      assert.equal(track.genre, 'E2E-V23-Genre');
      // Migrated in by the write, even though it was never explicitly
      // written by this request.
      assert.equal(track.artist, 'E2E-V24-Artist');

      const tags = await getTrackTags(server, clientPath);
      assert.equal(tags.resolved.TIT2, track.title);
      assert.equal(tags.resolved.TCON, track.genre);
      assert.equal(tags.resolved.TPE1, track.artist);
    }),
  );
});

describe('the incremental scan cache is invalidated by a MUSIC_INDEX_VERSION bump', () => {
  let server: TestServer;
  before(async () => {
    server = await createTestServer((app, mountPath) => {
      app.use('/music', musicRoute(mountPath));
    });
  });
  after(() => server.close());

  it(
    'reparses a file from scratch — ignoring a stale cached value — when the on-disk index predates a version bump, even though the file itself (mtime/size) never changed',
    withLogs([], async () => {
      const clientPath = '/song.mp3';
      const filePath = join(server.mountDir, 'song.mp3');
      await writeFile(
        filePath,
        buildMp3WithNativeBlocks({
          id3v2Blocks: [
            { version: 3, frames: [{ id: 'TCON', text: 'Correct-Genre' }] },
          ],
        }),
      );
      const stats = await stat(filePath);

      // Simulate a pre-bump index on disk: an OLD version number, with a
      // stale genre for this exact file, but mtime/size matching the real
      // file exactly — the only way the incremental cache could plausibly
      // reuse it is by fingerprint, not version. This is deliberately not
      // v7's real schema — the version mismatch alone must be what defeats
      // the cache, not a shape difference the incremental path might choke
      // on for some other reason.
      const staleIndex = {
        version: 1,
        scannedAt: '2020-01-01T00:00:00.000Z',
        tracks: [
          {
            path: clientPath,
            title: null,
            artist: null,
            albumArtist: null,
            composer: null,
            album: null,
            genre: 'STALE-WRONG-GENRE',
            preferComposerGrouping: null,
            track: null,
            duration: null,
            size: stats.size,
            mtime: stats.mtime.toISOString(),
            coverArt: null,
            hasEmbeddedArt: false,
          },
        ],
      };
      await writeFile(
        join(server.mountDir, MUSIC_INDEX_FILENAME),
        JSON.stringify(staleIndex),
      );

      const index = await scan(server);
      assert.equal(
        trackByPath(index, clientPath).genre,
        'Correct-Genre',
        'the stale, wrong-version cached genre must not survive the scan',
      );
    }),
  );
});
