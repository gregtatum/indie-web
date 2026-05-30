import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { musicRoute } from '../route-music.ts';
import {
  createTestServer,
  buildMp3WithTags,
  withLogs,
  MINIMAL_JPEG,
} from './helpers.ts';
import type { TestServer } from './helpers.ts';

describe('GET /music/music-index', () => {
  let server: TestServer;

  before(async () => {
    server = await createTestServer((app, mountPath) => {
      app.use('/music', musicRoute(mountPath));
    });
  });

  after(() => server.close());

  it(
    'returns 404 before any scan has been run',
    withLogs(['[400err ]'], async () => {
      const res = await fetch(`${server.baseUrl}/music/music-index`);
      assert.equal(res.status, 404);
    }),
  );
});

describe('POST /music/music-index/scan', () => {
  let server: TestServer;

  before(async () => {
    server = await createTestServer((app, mountPath) => {
      app.use('/music', musicRoute(mountPath));
    });
  });

  after(() => server.close());

  it(
    'returns an empty index when the mount has no audio files',
    withLogs([], async () => {
      const res = await fetch(`${server.baseUrl}/music/music-index/scan`, {
        method: 'POST',
      });
      assert.equal(res.status, 200);
      const index = await res.json();
      assert.ok(typeof index.scannedAt === 'string');
      assert.deepEqual(index.tracks, []);
    }),
  );

  it(
    'finds mp3 files and includes them in the index',
    withLogs([], async () => {
      await writeFile(join(server.mountDir, 'song.mp3'), buildMp3WithTags({}));

      const res = await fetch(`${server.baseUrl}/music/music-index/scan`, {
        method: 'POST',
      });
      const index = await res.json();
      const paths = index.tracks.map((t: { path: string }) => t.path);
      assert.ok(paths.includes('/song.mp3'));
    }),
  );

  it(
    'extracts ID3 tags (title, artist, album) from mp3 files',
    withLogs([], async () => {
      await writeFile(
        join(server.mountDir, 'tagged.mp3'),
        buildMp3WithTags({
          title: 'My Song',
          artist: 'My Artist',
          album: 'My Album',
        }),
      );

      const res = await fetch(`${server.baseUrl}/music/music-index/scan`, {
        method: 'POST',
      });
      const index = await res.json();
      const track = index.tracks.find(
        (t: { path: string }) => t.path === '/tagged.mp3',
      );
      assert.ok(track, 'tagged.mp3 should appear in the index');
      assert.equal(track.title, 'My Song');
      assert.equal(track.artist, 'My Artist');
      assert.equal(track.album, 'My Album');
    }),
  );

  it(
    'extracts genre from the ID3 TCON tag',
    withLogs([], async () => {
      await writeFile(
        join(server.mountDir, 'genre.mp3'),
        buildMp3WithTags({ title: 'Genre Track', genre: 'Rock' }),
      );

      const res = await fetch(`${server.baseUrl}/music/music-index/scan`, {
        method: 'POST',
      });
      const index = await res.json();
      const track = index.tracks.find(
        (t: { path: string }) => t.path === '/genre.mp3',
      );
      assert.ok(track, 'genre.mp3 should appear in the index');
      assert.equal(track.genre, 'Rock');
    }),
  );

  it(
    'sets genre to null when the TCON tag is absent',
    withLogs([], async () => {
      await writeFile(
        join(server.mountDir, 'no-genre.mp3'),
        buildMp3WithTags({ title: 'No Genre Track' }),
      );

      const res = await fetch(`${server.baseUrl}/music/music-index/scan`, {
        method: 'POST',
      });
      const index = await res.json();
      const track = index.tracks.find(
        (t: { path: string }) => t.path === '/no-genre.mp3',
      );
      assert.ok(track, 'no-genre.mp3 should appear in the index');
      assert.equal(track.genre, null);
    }),
  );

  it(
    'discovers audio files in subdirectories',
    withLogs([], async () => {
      await mkdir(join(server.mountDir, 'Artist', 'Album'), {
        recursive: true,
      });
      await writeFile(
        join(server.mountDir, 'Artist', 'Album', 'track.mp3'),
        buildMp3WithTags({}),
      );

      const res = await fetch(`${server.baseUrl}/music/music-index/scan`, {
        method: 'POST',
      });
      const index = await res.json();
      const paths = index.tracks.map((t: { path: string }) => t.path);
      assert.ok(paths.includes('/Artist/Album/track.mp3'));
    }),
  );

  it(
    'does not index non-audio files',
    withLogs([], async () => {
      await writeFile(join(server.mountDir, 'readme.txt'), 'hello');

      const res = await fetch(`${server.baseUrl}/music/music-index/scan`, {
        method: 'POST',
      });
      const index = await res.json();
      const paths = index.tracks.map((t: { path: string }) => t.path);
      assert.ok(!paths.includes('/readme.txt'));
    }),
  );

  it(
    'does not index hidden files (dot-prefixed)',
    withLogs([], async () => {
      await writeFile(
        join(server.mountDir, '.hidden.mp3'),
        buildMp3WithTags({}),
      );

      const res = await fetch(`${server.baseUrl}/music/music-index/scan`, {
        method: 'POST',
      });
      const index = await res.json();
      const paths = index.tracks.map((t: { path: string }) => t.path);
      assert.ok(
        !paths.some((p: string) => p.includes('.hidden')),
        'hidden files should not appear in the index',
      );
    }),
  );

  it(
    'returns 409 when a scan is already in progress',
    withLogs(['[400err ]'], async () => {
      // Fire two scans simultaneously. The first sets scanInProgress = true
      // before its first await, so the second will see it and return 409.
      const [res1, res2] = await Promise.all([
        fetch(`${server.baseUrl}/music/music-index/scan`, { method: 'POST' }),
        fetch(`${server.baseUrl}/music/music-index/scan`, { method: 'POST' }),
      ]);
      const statuses = [res1.status, res2.status].sort();
      assert.deepEqual(statuses, [200, 409]);
    }),
  );
});

describe('POST /music/music-index/scan incremental behavior', () => {
  let server: TestServer;

  before(async () => {
    server = await createTestServer((app, mountPath) => {
      app.use('/music', musicRoute(mountPath));
    });
  });

  after(() => server.close());

  it(
    're-scans a file when its content changes (mtime differs)',
    withLogs([], async () => {
      const filePath = join(server.mountDir, 'evolving.mp3');

      await writeFile(filePath, buildMp3WithTags({ title: 'First' }));
      await fetch(`${server.baseUrl}/music/music-index/scan`, {
        method: 'POST',
      });

      // Overwrite with different tags — mtime will be updated by the OS
      await writeFile(filePath, buildMp3WithTags({ title: 'Second' }));
      const res = await fetch(`${server.baseUrl}/music/music-index/scan`, {
        method: 'POST',
      });
      const index = await res.json();
      const track = index.tracks.find(
        (t: { path: string }) => t.path === '/evolving.mp3',
      );
      assert.equal(track.title, 'Second');
    }),
  );

  it(
    'removes deleted files from the index on subsequent scans',
    withLogs([], async () => {
      const filePath = join(server.mountDir, 'to-delete.mp3');
      await writeFile(filePath, buildMp3WithTags({}));

      await fetch(`${server.baseUrl}/music/music-index/scan`, {
        method: 'POST',
      });

      await rm(filePath);

      const res = await fetch(`${server.baseUrl}/music/music-index/scan`, {
        method: 'POST',
      });
      const index = await res.json();
      const paths = index.tracks.map((t: { path: string }) => t.path);
      assert.ok(!paths.includes('/to-delete.mp3'));
    }),
  );
});

describe('GET /music/music-index/scan (SSE)', () => {
  let server: TestServer;

  before(async () => {
    server = await createTestServer((app, mountPath) => {
      app.use('/music', musicRoute(mountPath));
    });
  });

  after(() => server.close());

  async function collectSseEvents(
    url: string,
  ): Promise<Array<Record<string, unknown>>> {
    const res = await fetch(url);
    const text = await res.text();
    return text
      .split('\n\n')
      .filter((chunk) => chunk.startsWith('data: '))
      .map((chunk) => JSON.parse(chunk.slice(6)));
  }

  it(
    'emits total=0 and done with empty tracks for an empty mount',
    withLogs([], async () => {
      const events = await collectSseEvents(
        `${server.baseUrl}/music/music-index/scan`,
      );
      assert.deepEqual(events[0], { type: 'total', count: 0 });
      const done = events[events.length - 1];
      assert.equal(done.type, 'done');
      assert.deepEqual((done as any).tracks, []);
    }),
  );

  it(
    'emits total=1, one progress event, and done with 1 track for one mp3',
    withLogs([], async () => {
      await writeFile(
        join(server.mountDir, 'sse-song.mp3'),
        buildMp3WithTags({}),
      );

      const events = await collectSseEvents(
        `${server.baseUrl}/music/music-index/scan`,
      );

      const total = events.find((e) => e.type === 'total') as any;
      assert.ok(total.count >= 1);

      const progress = events.filter((e) => e.type === 'progress');
      assert.ok(progress.length >= 1);

      const done = events[events.length - 1] as any;
      assert.equal(done.type, 'done');
      assert.ok(
        done.tracks.some((t: { path: string }) => t.path === '/sse-song.mp3'),
      );
    }),
  );

  it(
    'total event comes before any progress event and done event is last',
    withLogs([], async () => {
      await writeFile(join(server.mountDir, 'order.mp3'), buildMp3WithTags({}));

      const events = await collectSseEvents(
        `${server.baseUrl}/music/music-index/scan`,
      );

      const types = events.map((e) => e.type);
      const totalIdx = types.indexOf('total');
      const firstProgressIdx = types.indexOf('progress');
      const lastType = types[types.length - 1];

      assert.ok(totalIdx !== -1, 'total event must exist');
      assert.ok(
        firstProgressIdx === -1 || firstProgressIdx > totalIdx,
        'total must precede progress',
      );
      assert.equal(lastType, 'done', 'done must be last event');
    }),
  );
});

describe('POST /music/music-index/scan stale-cache bypass', () => {
  let server: TestServer;

  before(async () => {
    server = await createTestServer((app, mountPath) => {
      app.use('/music', musicRoute(mountPath));
    });
  });

  after(() => server.close());

  it(
    'ignores cached v1 tracks and populates genre on upgrade scan',
    withLogs([], async () => {
      const filePath = join(server.mountDir, 'cached.mp3');
      await writeFile(
        filePath,
        buildMp3WithTags({ title: 'Cached', genre: 'Jazz' }),
      );

      // Simulate a prior v1 scan by writing a v1 index directly to disk.
      // The cached entry has no genre field, mimicking real v1 data.
      const stats = await (await import('node:fs/promises')).stat(filePath);
      const v1Index = {
        version: 1,
        scannedAt: new Date().toISOString(),
        tracks: [
          {
            path: '/cached.mp3',
            title: 'Cached',
            artist: null,
            album: null,
            duration: null,
            size: stats.size,
            mtime: stats.mtime.toISOString(),
          },
        ],
      };
      await writeFile(
        join(server.mountDir, '.music-index.json'),
        JSON.stringify(v1Index),
      );

      const res = await fetch(`${server.baseUrl}/music/music-index/scan`, {
        method: 'POST',
      });
      assert.equal(res.status, 200);
      const index = await res.json();
      assert.equal(index.version, 5);

      const track = index.tracks.find(
        (t: { path: string }) => t.path === '/cached.mp3',
      );
      assert.ok(track, 'cached.mp3 should appear in upgraded index');
      // Genre must be populated — confirms the v1 cache was not reused.
      assert.equal(track.genre, 'Jazz');
    }),
  );
});

describe('POST /music/music-index/scan APIC backfill', () => {
  let server: TestServer;

  before(async () => {
    server = await createTestServer((app, mountPath) => {
      app.use('/music', musicRoute(mountPath));
    });
  });

  after(() => server.close());

  it(
    'sets hasEmbeddedArt: false for a track with no embedded picture',
    withLogs([], async () => {
      await writeFile(
        join(server.mountDir, 'no-art.mp3'),
        buildMp3WithTags({ title: 'No Art' }),
      );

      const res = await fetch(`${server.baseUrl}/music/music-index/scan`, {
        method: 'POST',
      });
      const index = await res.json();
      const track = index.tracks.find(
        (t: { path: string }) => t.path === '/no-art.mp3',
      );
      assert.ok(track, 'no-art.mp3 should appear in the index');
      assert.equal(track.hasEmbeddedArt, false);
    }),
  );

  it(
    'sets hasEmbeddedArt: true for a track with an embedded APIC frame',
    withLogs([], async () => {
      await writeFile(
        join(server.mountDir, 'has-art.mp3'),
        buildMp3WithTags({ title: 'Has Art', apic: MINIMAL_JPEG }),
      );

      const res = await fetch(`${server.baseUrl}/music/music-index/scan`, {
        method: 'POST',
      });
      const index = await res.json();
      const track = index.tracks.find(
        (t: { path: string }) => t.path === '/has-art.mp3',
      );
      assert.ok(track, 'has-art.mp3 should appear in the index');
      assert.equal(track.hasEmbeddedArt, true);
    }),
  );

  it(
    'writes Folder.jpg from APIC when no folder art exists, and sets coverArt',
    withLogs([], async () => {
      await mkdir(join(server.mountDir, 'ApicArtist', 'ApicAlbum'), {
        recursive: true,
      });
      await writeFile(
        join(server.mountDir, 'ApicArtist', 'ApicAlbum', 'track.mp3'),
        buildMp3WithTags({ title: 'APIC Track', apic: MINIMAL_JPEG }),
      );

      const res = await fetch(`${server.baseUrl}/music/music-index/scan`, {
        method: 'POST',
      });
      const index = await res.json();
      const track = index.tracks.find(
        (t: { path: string }) => t.path === '/ApicArtist/ApicAlbum/track.mp3',
      );
      assert.ok(track, 'track should appear in the index');
      assert.equal(track.coverArt, '/ApicArtist/ApicAlbum/Folder.jpg');

      // Verify the file was actually written with the correct bytes
      const { readFile } = await import('node:fs/promises');
      const written = await readFile(
        join(server.mountDir, 'ApicArtist', 'ApicAlbum', 'Folder.jpg'),
      );
      assert.deepEqual(written, MINIMAL_JPEG);
    }),
  );

  it(
    'does not overwrite an existing Folder.jpg when APIC is also present',
    withLogs([], async () => {
      await mkdir(join(server.mountDir, 'ExistingArt', 'Album'), {
        recursive: true,
      });
      const existingArt = Buffer.from('existing-art-bytes');
      await writeFile(
        join(server.mountDir, 'ExistingArt', 'Album', 'Folder.jpg'),
        existingArt,
      );
      await writeFile(
        join(server.mountDir, 'ExistingArt', 'Album', 'track.mp3'),
        buildMp3WithTags({ title: 'Has Both', apic: MINIMAL_JPEG }),
      );

      await fetch(`${server.baseUrl}/music/music-index/scan`, {
        method: 'POST',
      });

      const { readFile } = await import('node:fs/promises');
      const afterScan = await readFile(
        join(server.mountDir, 'ExistingArt', 'Album', 'Folder.jpg'),
      );
      assert.deepEqual(
        afterScan,
        existingArt,
        'existing Folder.jpg must not be overwritten',
      );
    }),
  );
});

describe('GET /music/music-index after scan', () => {
  let server: TestServer;

  before(async () => {
    server = await createTestServer((app, mountPath) => {
      app.use('/music', musicRoute(mountPath));
    });
  });

  after(() => server.close());

  it(
    'returns the index written by the most recent scan',
    withLogs([], async () => {
      await writeFile(
        join(server.mountDir, 'persisted.mp3'),
        buildMp3WithTags({ title: 'Persisted' }),
      );

      await fetch(`${server.baseUrl}/music/music-index/scan`, {
        method: 'POST',
      });

      const res = await fetch(`${server.baseUrl}/music/music-index`);
      assert.equal(res.status, 200);
      const index = await res.json();
      const track = index.tracks.find(
        (t: { path: string }) => t.path === '/persisted.mp3',
      );
      assert.ok(track);
      assert.equal(track.title, 'Persisted');
    }),
  );
});
