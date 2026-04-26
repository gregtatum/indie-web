import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { musicRoute } from '../route-music.ts';
import { createTestServer, buildMp3WithTags } from './helpers.ts';
import type { TestServer } from './helpers.ts';

describe('GET /music/music-index', () => {
  let server: TestServer;

  before(async () => {
    server = await createTestServer((app, mountDir) => {
      app.use('/music', musicRoute(mountDir));
    });
  });

  after(() => server.close());

  it('returns 404 before any scan has been run', async () => {
    const res = await fetch(`${server.baseUrl}/music/music-index`);
    assert.equal(res.status, 404);
  });
});

describe('POST /music/music-index/scan', () => {
  let server: TestServer;

  before(async () => {
    server = await createTestServer((app, mountDir) => {
      app.use('/music', musicRoute(mountDir));
    });
  });

  after(() => server.close());

  it('returns an empty index when the mount has no audio files', async () => {
    const res = await fetch(`${server.baseUrl}/music/music-index/scan`, {
      method: 'POST',
    });
    assert.equal(res.status, 200);
    const index = await res.json();
    assert.equal(index.version, 1);
    assert.ok(typeof index.scannedAt === 'string');
    assert.deepEqual(index.tracks, []);
  });

  it('finds mp3 files and includes them in the index', async () => {
    await writeFile(join(server.mountDir, 'song.mp3'), buildMp3WithTags({}));

    const res = await fetch(`${server.baseUrl}/music/music-index/scan`, {
      method: 'POST',
    });
    const index = await res.json();
    const paths = index.tracks.map((t: { path: string }) => t.path);
    assert.ok(paths.includes('/song.mp3'));
  });

  it('extracts ID3 tags (title, artist, album) from mp3 files', async () => {
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
  });

  it('discovers audio files in subdirectories', async () => {
    await mkdir(join(server.mountDir, 'Artist', 'Album'), { recursive: true });
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
  });

  it('does not index non-audio files', async () => {
    await writeFile(join(server.mountDir, 'readme.txt'), 'hello');

    const res = await fetch(`${server.baseUrl}/music/music-index/scan`, {
      method: 'POST',
    });
    const index = await res.json();
    const paths = index.tracks.map((t: { path: string }) => t.path);
    assert.ok(!paths.includes('/readme.txt'));
  });

  it('does not index hidden files (dot-prefixed)', async () => {
    await writeFile(join(server.mountDir, '.hidden.mp3'), buildMp3WithTags({}));

    const res = await fetch(`${server.baseUrl}/music/music-index/scan`, {
      method: 'POST',
    });
    const index = await res.json();
    const paths = index.tracks.map((t: { path: string }) => t.path);
    assert.ok(
      !paths.some((p: string) => p.includes('.hidden')),
      'hidden files should not appear in the index',
    );
  });

  it('returns 409 when a scan is already in progress', async () => {
    // Fire two scans simultaneously. The first sets scanInProgress = true
    // before its first await, so the second will see it and return 409.
    const [res1, res2] = await Promise.all([
      fetch(`${server.baseUrl}/music/music-index/scan`, { method: 'POST' }),
      fetch(`${server.baseUrl}/music/music-index/scan`, { method: 'POST' }),
    ]);
    const statuses = [res1.status, res2.status].sort();
    assert.deepEqual(statuses, [200, 409]);
  });
});

describe('POST /music/music-index/scan incremental behavior', () => {
  let server: TestServer;

  before(async () => {
    server = await createTestServer((app, mountDir) => {
      app.use('/music', musicRoute(mountDir));
    });
  });

  after(() => server.close());

  it('re-scans a file when its content changes (mtime differs)', async () => {
    const filePath = join(server.mountDir, 'evolving.mp3');

    await writeFile(filePath, buildMp3WithTags({ title: 'First' }));
    await fetch(`${server.baseUrl}/music/music-index/scan`, { method: 'POST' });

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
  });

  it('removes deleted files from the index on subsequent scans', async () => {
    const filePath = join(server.mountDir, 'to-delete.mp3');
    await writeFile(filePath, buildMp3WithTags({}));

    await fetch(`${server.baseUrl}/music/music-index/scan`, { method: 'POST' });

    await rm(filePath);

    const res = await fetch(`${server.baseUrl}/music/music-index/scan`, {
      method: 'POST',
    });
    const index = await res.json();
    const paths = index.tracks.map((t: { path: string }) => t.path);
    assert.ok(!paths.includes('/to-delete.mp3'));
  });
});

describe('GET /music/music-index/scan (SSE)', () => {
  let server: TestServer;

  before(async () => {
    server = await createTestServer((app, mountDir) => {
      app.use('/music', musicRoute(mountDir));
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

  it('emits total=0 and done with empty tracks for an empty mount', async () => {
    const events = await collectSseEvents(
      `${server.baseUrl}/music/music-index/scan`,
    );
    assert.deepEqual(events[0], { type: 'total', count: 0 });
    const done = events[events.length - 1];
    assert.equal(done.type, 'done');
    assert.deepEqual((done as any).tracks, []);
  });

  it('emits total=1, one progress event, and done with 1 track for one mp3', async () => {
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
  });

  it('total event comes before any progress event and done event is last', async () => {
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
  });
});

describe('GET /music/music-index after scan', () => {
  let server: TestServer;

  before(async () => {
    server = await createTestServer((app, mountDir) => {
      app.use('/music', musicRoute(mountDir));
    });
  });

  after(() => server.close());

  it('returns the index written by the most recent scan', async () => {
    await writeFile(
      join(server.mountDir, 'persisted.mp3'),
      buildMp3WithTags({ title: 'Persisted' }),
    );

    await fetch(`${server.baseUrl}/music/music-index/scan`, { method: 'POST' });

    const res = await fetch(`${server.baseUrl}/music/music-index`);
    assert.equal(res.status, 200);
    const index = await res.json();
    const track = index.tracks.find(
      (t: { path: string }) => t.path === '/persisted.mp3',
    );
    assert.ok(track);
    assert.equal(track.title, 'Persisted');
  });
});
