import { describe as nodeDescribe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdir,
  readdir,
  readFile,
  truncate,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { parseFile } from 'music-metadata';
import { musicRoute } from '../music/route.ts';
import { runFfmpeg } from '../music/ffmpeg.ts';
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

describe('POST /music/add-tracks', () => {
  let server: TestServer;

  before(async () => {
    server = await createTestServer((app, mountPath) => {
      app.use('/music', musicRoute(mountPath));
    });
  });

  after(() => server.close());

  async function scanPaths(paths: string[]): Promise<T.TrackMetadata[]> {
    const res = await fetch(`${server.baseUrl}/music/music-index/scan-paths`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as T.ScanTrackPathsResponse;
    assert.equal(body.errors.length, 0);
    return body.tracks;
  }

  it('merges newly moved tracks into an existing index in sorted order', async () => {
    const dir = join(server.mountDir, 'Artist', 'Album');
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, '01 - First.mp3'),
      buildMp3WithTags({
        title: 'First',
        artist: 'Artist',
        album: 'Album',
        track: '1',
      }),
    );

    const scanRes = await fetch(`${server.baseUrl}/music/music-index/scan`, {
      method: 'POST',
    });
    assert.equal(scanRes.status, 200);
    const scanned = (await scanRes.json()) as T.MusicIndex;
    assert.equal(scanned.tracks.length, 1);

    await writeFile(
      join(dir, '03 - Third.mp3'),
      buildMp3WithTags({
        title: 'Third',
        artist: 'Artist',
        album: 'Album',
        track: '3',
      }),
    );
    await writeFile(
      join(dir, '02 - Second.mp3'),
      buildMp3WithTags({
        title: 'Second',
        artist: 'Artist',
        album: 'Album',
        track: '2',
      }),
    );
    const addedTracks = await scanPaths([
      '/Artist/Album/03 - Third.mp3',
      '/Artist/Album/02 - Second.mp3',
    ]);

    const addRes = await fetch(`${server.baseUrl}/music/add-tracks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tracks: addedTracks }),
    });
    assert.equal(addRes.status, 200);
    const addBody = (await addRes.json()) as T.AddTracksResponse;
    assert.equal(addBody.index.status, 'updated');

    const indexRes = await fetch(`${server.baseUrl}/music/music-index`);
    const index = (await indexRes.json()) as T.MusicIndex;
    assert.deepEqual(
      index.tracks.map((track) => track.title),
      ['First', 'Second', 'Third'],
    );
  });

  it('skips tracks whose paths already exist in the index', async () => {
    const dir = join(server.mountDir, 'Existing', 'Album');
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'track.mp3'),
      buildMp3WithTags({ title: 'Already Indexed' }),
    );

    const scanRes = await fetch(`${server.baseUrl}/music/music-index/scan`, {
      method: 'POST',
    });
    const before = (await scanRes.json()) as T.MusicIndex;
    const existingCount = before.tracks.length;

    const tracks = await scanPaths(['/Existing/Album/track.mp3']);
    const addRes = await fetch(`${server.baseUrl}/music/add-tracks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tracks }),
    });
    assert.equal(addRes.status, 200);
    const addBody = (await addRes.json()) as T.AddTracksResponse;
    assert.equal(addBody.index.status, 'skipped');

    const indexRes = await fetch(`${server.baseUrl}/music/music-index`);
    const index = (await indexRes.json()) as T.MusicIndex;
    assert.equal(index.tracks.length, existingCount);
  });

  it(
    'rejects an empty tracks array',
    withLogs(['Missing or empty tracks array.'], async () => {
      const res = await fetch(`${server.baseUrl}/music/add-tracks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracks: [] }),
      });
      assert.equal(res.status, 400);
    }),
  );
});

describe('import quality conversion', () => {
  let server: TestServer;
  const stagingDir = () => join(server.mountDir, '.music-staging');
  const cover = () => join(server.mountDir, 'cover.jpg');
  let tone = 200;

  before(async () => {
    server = await createTestServer((app, mountPath) => {
      app.use('/music', musicRoute(mountPath));
    });
    await mkdir(stagingDir(), { recursive: true });
    await runFfmpeg(
      [
        '-f',
        'lavfi',
        '-i',
        'color=c=red:s=64x64',
        '-frames:v',
        '1',
        '-update',
        '1',
        cover(),
      ],
      'quick',
    );
  });

  after(() => server.close());

  async function stageAudio(
    filename: string,
    inputArgs: string[],
    outputArgs: string[],
  ): Promise<string> {
    await runFfmpeg(
      [
        '-f',
        'lavfi',
        '-i',
        ...inputArgs,
        ...outputArgs,
        join(stagingDir(), filename),
      ],
      'quick',
    );
    return `/.music-staging/${filename}`;
  }

  function stageHiResFlac(filename: string, seconds = 2): Promise<string> {
    return stageAudio(
      filename,
      [`sine=frequency=${tone++}:duration=${seconds}:sample_rate=96000`],
      [
        '-i',
        cover(),
        '-map',
        '0:a',
        '-map',
        '1:v',
        '-sample_fmt',
        's32',
        '-c:a',
        'flac',
        '-disposition:v:0',
        'attached_pic',
        '-metadata',
        'title=Hi-Res Title',
        '-metadata',
        'artist=Hi-Res Artist',
      ],
    );
  }

  function stageMp3(filename: string, kbps: number): Promise<string> {
    return stageAudio(
      filename,
      [`sine=frequency=${tone++}:duration=2`],
      ['-c:a', 'libmp3lame', '-b:a', `${kbps}k`],
    );
  }

  async function importTracks(
    trackPaths: string[],
    importQuality?: unknown,
    folderArtworkPathByPath?: Record<string, string>,
  ): Promise<T.StagingUploadResponse> {
    const res = await fetch(`${server.baseUrl}/music/staging-pool`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trackPaths,
        importQuality,
        folderArtworkPathByPath,
      }),
    });
    assert.equal(res.status, 200);
    return (await res.json()) as T.StagingUploadResponse;
  }

  async function audioInfo(clientPath: string) {
    const meta = await parseFile(join(server.mountDir, clientPath), {
      duration: true,
    });
    return {
      container: meta.format.container,
      sampleRate: meta.format.sampleRate,
      bitsPerSample: meta.format.bitsPerSample,
      kbps: (meta.format.bitrate ?? 0) / 1000,
      duration: meta.format.duration ?? 0,
      title: meta.common.title,
      artist: meta.common.artist,
      pictures: meta.common.picture?.length ?? 0,
    };
  }

  it('leaves files exactly as they are when no quality limit is set or it is Original', async () => {
    const path = await stageHiResFlac('untouched.flac');
    const before = await readFile(join(server.mountDir, path));

    await importTracks([path]);
    await importTracks([path], {
      maximumQuality: 'original',
      lossyFormat: 'm4a',
    });

    assert.deepEqual(await readFile(join(server.mountDir, path)), before);
  });

  it('reduces hi-res FLAC to CD quality at Lossless, keeping tags and cover art', async () => {
    const path = await stageHiResFlac('lossless-hires.flac');

    const { tracks, conversionErrors } = await importTracks([path], {
      maximumQuality: 'lossless',
      lossyFormat: 'm4a',
    });

    assert.deepEqual(conversionErrors, []);
    assert.equal(tracks[0].path, path);
    const info = await audioInfo(path);
    assert.equal(info.container, 'FLAC');
    assert.equal(info.sampleRate, 44100);
    assert.equal(info.bitsPerSample, 16);
    assert.equal(info.title, 'Hi-Res Title');
    assert.equal(info.artist, 'Hi-Res Artist');
    assert.equal(info.pictures, 1);
  });

  it('does not touch a FLAC that is already CD quality at Lossless', async () => {
    const path = await stageAudio(
      'lossless-cd.flac',
      [`sine=frequency=${tone++}:duration=1:sample_rate=44100`],
      ['-sample_fmt', 's16', '-c:a', 'flac'],
    );
    const before = await readFile(join(server.mountDir, path));

    await importTracks([path], {
      maximumQuality: 'lossless',
      lossyFormat: 'm4a',
    });

    assert.deepEqual(await readFile(join(server.mountDir, path)), before);
  });

  it('converts FLAC to AAC at High, discards the original, and carries tags, art, and folder artwork over', async () => {
    const path = await stageHiResFlac('high-aac.flac');
    const artwork = '/.music-staging/.artwork/high-aac/Folder.jpg';

    const { tracks, conversionErrors } = await importTracks(
      [path],
      { maximumQuality: 'high', lossyFormat: 'm4a' },
      { [path]: artwork },
    );

    assert.deepEqual(conversionErrors, []);
    assert.equal(tracks.length, 1);
    assert.equal(tracks[0].path, '/.music-staging/high-aac.m4a');
    assert.equal(tracks[0].folderArtworkPath, artwork);
    assert.equal(tracks[0].title, 'Hi-Res Title');
    const info = await audioInfo(tracks[0].path);
    assert.ok(info.container?.startsWith('M4A'));
    assert.ok(Math.abs(info.duration - 2) < 0.5);
    assert.equal(info.pictures, 1);
    assert.deepEqual(
      (await readdir(stagingDir())).filter(
        (name) => name.startsWith('high-aac') || name.startsWith('.converting'),
      ),
      ['high-aac.m4a'],
    );

    const listed = await fetch(`${server.baseUrl}/music/staging-pool`);
    const pool = (await listed.json()) as T.TrackMetadata[];
    assert.equal(
      pool.find((track) => track.path === tracks[0].path)?.folderArtworkPath,
      artwork,
    );
  });

  it('converts FLAC to MP3 at Standard when MP3 is chosen', async () => {
    const path = await stageHiResFlac('standard-mp3.flac');

    const { tracks } = await importTracks([path], {
      maximumQuality: 'standard',
      lossyFormat: 'mp3',
    });

    assert.equal(tracks[0].path, '/.music-staging/standard-mp3.mp3');
    const info = await audioInfo(tracks[0].path);
    assert.equal(info.container, 'MPEG');
    assert.equal(info.title, 'Hi-Res Title');
    assert.equal(info.pictures, 1);
  });

  it('does not overwrite an existing file when the converted name is taken', async () => {
    const taken = await stageAudio(
      'collision.m4a',
      [`sine=frequency=${tone++}:duration=1`],
      ['-c:a', 'aac'],
    );
    const path = await stageHiResFlac('collision.flac');

    const { tracks } = await importTracks([path], {
      maximumQuality: 'high',
      lossyFormat: 'm4a',
    });

    assert.equal(tracks[0].path, '/.music-staging/collision (2).m4a');
    assert.ok((await readFile(join(server.mountDir, taken))).length > 0);
  });

  it('re-encodes lossy files only when above the limit by more than the tolerance', async () => {
    const above = await stageMp3('lossy-320.mp3', 320);
    const withinTolerance = await stageMp3('lossy-192.mp3', 192);
    const below = await stageMp3('lossy-128.mp3', 128);
    const beforeWithin = await readFile(join(server.mountDir, withinTolerance));
    const beforeBelow = await readFile(join(server.mountDir, below));

    await importTracks([above, withinTolerance, below], {
      maximumQuality: 'standard',
      lossyFormat: 'm4a',
    });

    const converted = await audioInfo(above);
    assert.equal(converted.container, 'MPEG');
    assert.ok(
      converted.kbps < 200,
      `expected a smaller file: ${converted.kbps}`,
    );
    assert.deepEqual(
      await readFile(join(server.mountDir, withinTolerance)),
      beforeWithin,
    );
    assert.deepEqual(await readFile(join(server.mountDir, below)), beforeBelow);
  });

  it('keeps a file it could not convert and reports it', async () => {
    const path = await stageHiResFlac('truncated.flac', 4);
    const fullPath = join(server.mountDir, path);
    const bytes = await readFile(fullPath);
    await truncate(fullPath, Math.floor(bytes.length / 2));

    const { tracks, conversionErrors } = await importTracks([path], {
      maximumQuality: 'high',
      lossyFormat: 'm4a',
    });

    assert.equal(conversionErrors.length, 1);
    assert.equal(conversionErrors[0].path, path);
    assert.equal(tracks[0].path, path);
    assert.deepEqual(
      (await readdir(stagingDir())).filter((name) =>
        name.startsWith('.converting'),
      ),
      [],
    );
  });

  it('still counts a converted FLAC as a duplicate when the same file is imported again', async () => {
    const first = await stageHiResFlac('dupe-a.flac');
    const original = await readFile(join(server.mountDir, first));
    const quality = { maximumQuality: 'high', lossyFormat: 'm4a' };
    await importTracks([first], quality);

    const second = '/.music-staging/dupe-b.flac';
    await writeFile(join(server.mountDir, second), original);
    const { tracks, duplicateCount } = await importTracks([second], quality);

    assert.equal(duplicateCount, 1);
    assert.deepEqual(tracks, []);
  });

  it(
    'rejects an unknown quality level',
    withLogs(['Invalid importQuality.'], async () => {
      const path = await stageMp3('invalid-quality.mp3', 64);
      const res = await fetch(`${server.baseUrl}/music/staging-pool`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackPaths: [path],
          importQuality: { maximumQuality: 'ultra', lossyFormat: 'm4a' },
        }),
      });
      assert.equal(res.status, 400);
    }),
  );
});
