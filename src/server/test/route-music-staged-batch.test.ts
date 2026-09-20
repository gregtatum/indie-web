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
    await stageTrack(server, 'batch1-track.mp3', { title: 'Staged' });

    const res = await fetch(`${server.baseUrl}/music/music-index/scan`, {
      method: 'POST',
    });
    assert.equal(res.status, 200);
    const index = (await res.json()) as T.MusicIndex;
    assert.deepEqual(index.tracks, []);
  });

  it('scan-paths resolves a staged track including its year, without writing the index', async () => {
    const path = await stageTrack(server, 'batch2-track.mp3', {
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

  it('round-trips a batch manifest through create, step, and discard', async () => {
    const path = await stageTrack(server, 'batch3-track.mp3', {
      title: 'Manifest Track',
    });

    const created = await fetch(`${server.baseUrl}/music/staged-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchId: 'batch-3', trackPaths: [path] }),
    });
    assert.equal(created.status, 200);
    const manifest = (await created.json()) as T.StagedBatchManifest;
    assert.equal(manifest.step, 'editing');
    assert.equal(manifest.template, null);

    const listed = await fetch(`${server.baseUrl}/music/staged-batches`);
    const summaries = (await listed.json()) as T.StagedBatchSummary[];
    assert.ok(
      summaries.some((s) => s.batchId === 'batch-3' && s.trackCount === 1),
    );

    const stepped = await fetch(`${server.baseUrl}/music/staged-batch/step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        batchId: 'batch-3',
        step: 'organizing',
        template: '{Artist}/{Title}',
      }),
    });
    assert.equal(stepped.status, 200);
    const steppedManifest = (await stepped.json()) as T.StagedBatchManifest;
    assert.equal(steppedManifest.step, 'organizing');
    assert.equal(steppedManifest.template, '{Artist}/{Title}');

    const discarded = await fetch(
      `${server.baseUrl}/music/staged-batch/discard`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: 'batch-3' }),
      },
    );
    assert.equal(discarded.status, 200);

    // The manifest is gone...
    const summariesAfter = (await (
      await fetch(`${server.baseUrl}/music/staged-batches`)
    ).json()) as T.StagedBatchSummary[];
    assert.ok(!summariesAfter.some((s) => s.batchId === 'batch-3'));
    // ...and so is the staged track file itself, not just the reference to it.
    const poolFiles = await readdir(join(server.mountDir, '.music-staging'));
    assert.ok(!poolFiles.includes('batch3-track.mp3'));
  });

  it('posting to an existing batchId merges trackPaths instead of overwriting', async () => {
    const pathA = await stageTrack(server, 'batch4-a.mp3', {
      title: 'Track A',
    });

    const created = await fetch(`${server.baseUrl}/music/staged-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchId: 'batch-4', trackPaths: [pathA] }),
    });
    const manifest = (await created.json()) as T.StagedBatchManifest;

    const pathB = await stageTrack(server, 'batch4-b.mp3', {
      title: 'Track B',
    });
    const added = await fetch(`${server.baseUrl}/music/staged-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchId: 'batch-4', trackPaths: [pathB] }),
    });
    assert.equal(added.status, 200);
    const updated = (await added.json()) as T.StagedBatchManifest;
    assert.deepEqual(updated.trackPaths, [pathA, pathB]);
    // Everything but trackPaths carries over from the original manifest.
    assert.equal(updated.createdAt, manifest.createdAt);
    assert.equal(updated.step, manifest.step);
  });

  it(
    'rejects a batchId that is not a safe path segment',
    withLogs(['[400err ]'], async () => {
      const res = await fetch(`${server.baseUrl}/music/staged-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchId: '../escape',
          trackPaths: ['/x.mp3'],
        }),
      });
      assert.equal(res.status, 400);
    }),
  );

  it('records a verifiable content hash for a staged track in .staging-index.json', async () => {
    const tags = { title: 'Hashed Track' };
    const bytes = buildMp3WithTags(tags);
    await stageTrack(server, 'hashed.mp3', tags);

    // Any staged-batches poll rescans the pool and (re)writes the index.
    await fetch(`${server.baseUrl}/music/staged-batches`);

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

    // No batch manifest references this file — it never went through the
    // staged-batch API — but a pool poll should still notice and hash it.
    await fetch(`${server.baseUrl}/music/staged-batches`);

    const indexPath = join(dir, '.staging-index.json');
    const index = JSON.parse(await readFile(indexPath, 'utf-8')) as {
      entries: Record<string, { hash: string }>;
    };
    const entry = index.entries['/.music-staging/dropped-by-hand.mp3'];
    assert.ok(entry, 'expected the manually-dropped file to be indexed');
    assert.equal(entry.hash, createHash('sha256').update(bytes).digest('hex'));
  });
});
