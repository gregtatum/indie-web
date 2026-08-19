import { describe as nodeDescribe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { musicRoute, MUSIC_INDEX_FILENAME } from '../route-music.ts';
import type { T } from '../index.ts';
import {
  createTestServer,
  buildMp3WithNativeBlocks,
  withLogs,
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
