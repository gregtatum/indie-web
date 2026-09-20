import { describe as nodeDescribe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { musicRoute } from '../music/route.ts';
import { buildMp3WithTags, createTestServer, withLogs } from './helpers.ts';
import type { TestServer } from './helpers.ts';
import type { T } from '../index.ts';

let describe: (name: string, fn: () => void) => void = nodeDescribe;
if (process.env.INDIE_WEB_SKIP_LOCALHOST_TESTS === '1') {
  describe = (name) => {
    console.error(`LOCALHOST_BIND_SKIPPED_TEST ${name}`);
  };
}

async function stageTrack(
  server: TestServer,
  filename: string,
  tags: Parameters<typeof buildMp3WithTags>[0],
): Promise<string> {
  const dir = join(server.mountDir, '.music-staging');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), buildMp3WithTags(tags));
  return `/.music-staging/${filename}`;
}

describe('drag-and-drop import staging', () => {
  let server: TestServer;

  before(async () => {
    server = await createTestServer((app, mountPath) => {
      app.use('/music', musicRoute(mountPath));
    });
  });

  after(() => server.close());

  it('a staged track is invisible to a real library scan', async () => {
    await stageTrack(server, 'invisible-track.mp3', { title: 'Staged' });

    const res = await fetch(`${server.baseUrl}/music/music-index/scan`, {
      method: 'POST',
    });
    assert.equal(res.status, 200);
    const index = (await res.json()) as T.MusicIndex;
    assert.deepEqual(index.tracks, []);
  });

  it('scan-paths resolves a staged track including its year, without writing the index', async () => {
    const path = await stageTrack(server, 'scan-paths-track.mp3', {
      title: 'Time',
      artist: 'Pink Floyd',
      year: '1973',
      track: '2',
    });

    const res = await fetch(`${server.baseUrl}/music/music-index/scan-paths`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths: [path] }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as T.ScanTrackPathsResponse;
    assert.equal(body.errors.length, 0);
    assert.equal(body.tracks.length, 1);
    assert.equal(body.tracks[0].title, 'Time');
    assert.equal(body.tracks[0].year, '1973');
    assert.equal(body.tracks[0].track, 2);

    const indexRes = await fetch(`${server.baseUrl}/music/music-index`);
    assert.equal(indexRes.status, 200);
    const index = (await indexRes.json()) as T.MusicIndex;
    assert.deepEqual(index.tracks, []);
  });

  it(
    'reports a missing path as an error rather than throwing',
    withLogs([], async () => {
      const res = await fetch(
        `${server.baseUrl}/music/music-index/scan-paths`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paths: ['/.music-staging/nope.mp3'] }),
        },
      );
      assert.equal(res.status, 200);
      const body = (await res.json()) as T.ScanTrackPathsResponse;
      assert.equal(body.tracks.length, 0);
      assert.equal(body.errors.length, 1);
    }),
  );

  it('stages a track and lists it in the pool', async () => {
    const path = await stageTrack(server, 'pool-track.mp3', {
      title: 'Pool Track',
    });

    const created = await fetch(`${server.baseUrl}/music/staging-pool`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackPaths: [path] }),
    });
    assert.equal(created.status, 200);
    const body = (await created.json()) as T.StagingUploadResponse;
    assert.equal(body.duplicateCount, 0);
    assert.equal(body.tracks.length, 1);
    assert.equal(body.tracks[0].title, 'Pool Track');

    const listed = await fetch(`${server.baseUrl}/music/staging-pool`);
    assert.equal(listed.status, 200);
    const tracks = (await listed.json()) as T.TrackMetadata[];
    assert.ok(tracks.some((t) => t.path === path && t.title === 'Pool Track'));
  });

  it(
    'rejects an empty trackPaths array',
    withLogs(['Missing or empty trackPaths array.'], async () => {
      const res = await fetch(`${server.baseUrl}/music/staging-pool`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackPaths: [] }),
      });
      assert.equal(res.status, 400);
    }),
  );

  it('records a verifiable content hash for a staged track in .staging-index.json', async () => {
    const tags = { title: 'Hashed Track' };
    const bytes = buildMp3WithTags(tags);
    await stageTrack(server, 'hashed.mp3', tags);

    await fetch(`${server.baseUrl}/music/staging-pool`);

    const indexPath = join(
      server.mountDir,
      '.music-staging',
      '.staging-index.json',
    );
    const index = JSON.parse(await readFile(indexPath, 'utf-8')) as {
      entries: Record<string, { hash: string; size: number }>;
    };
    const entry = index.entries['/.music-staging/hashed.mp3'];
    assert.ok(entry, 'expected an index entry for the staged track');
    assert.equal(entry.size, bytes.length);
    assert.equal(entry.hash, createHash('sha256').update(bytes).digest('hex'));
  });

  it('picks up a file dropped directly into the pool from outside the app', async () => {
    const tags = { title: 'Manually Dropped' };
    const bytes = buildMp3WithTags(tags);
    const dir = join(server.mountDir, '.music-staging');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'dropped-by-hand.mp3'), bytes);

    const listed = await fetch(`${server.baseUrl}/music/staging-pool`);
    const tracks = (await listed.json()) as T.TrackMetadata[];
    assert.ok(
      tracks.some((t) => t.path === '/.music-staging/dropped-by-hand.mp3'),
    );

    const indexPath = join(dir, '.staging-index.json');
    const index = JSON.parse(await readFile(indexPath, 'utf-8')) as {
      entries: Record<string, { hash: string }>;
    };
    const entry = index.entries['/.music-staging/dropped-by-hand.mp3'];
    assert.ok(entry, 'expected the manually-dropped file to be indexed');
    assert.equal(entry.hash, createHash('sha256').update(bytes).digest('hex'));
  });

  it('drops a duplicate upload and reports it, keeping the original in place', async () => {
    const tags = { title: 'Dup Source' };
    const existingPath = await stageTrack(server, 'dup-source.mp3', tags);
    await fetch(`${server.baseUrl}/music/staging-pool`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackPaths: [existingPath] }),
    });

    const dupPath = await stageTrack(server, 'dup-copy.mp3', tags);
    const created = await fetch(`${server.baseUrl}/music/staging-pool`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackPaths: [dupPath] }),
    });
    assert.equal(created.status, 200);
    const body = (await created.json()) as T.StagingUploadResponse;
    assert.equal(body.duplicateCount, 1);
    assert.deepEqual(body.tracks, []);

    const poolFiles = await readdir(join(server.mountDir, '.music-staging'));
    assert.ok(!poolFiles.includes('dup-copy.mp3'));
    assert.ok(poolFiles.includes('dup-source.mp3'));
  });

  it('collapses duplicates within the same upload request, keeping the first', async () => {
    const tags = { title: 'Same Request Dup' };
    const pathA = await stageTrack(server, 'reqdup-a.mp3', tags);
    const pathB = await stageTrack(server, 'reqdup-b.mp3', tags);

    const created = await fetch(`${server.baseUrl}/music/staging-pool`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackPaths: [pathA, pathB] }),
    });
    assert.equal(created.status, 200);
    const body = (await created.json()) as T.StagingUploadResponse;
    assert.equal(body.duplicateCount, 1);
    assert.equal(body.tracks.length, 1);
    assert.equal(body.tracks[0].path, pathA);

    const poolFiles = await readdir(join(server.mountDir, '.music-staging'));
    assert.ok(poolFiles.includes('reqdup-a.mp3'));
    assert.ok(!poolFiles.includes('reqdup-b.mp3'));
  });
});
