import { describe as nodeDescribe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdir,
  readdir,
  readFile,
  stat,
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

describe('organizing staged tracks with an import quality', () => {
  let server: TestServer;
  const stagingDir = () => join(server.mountDir, '.music-staging');
  const libraryDir = () => join(server.mountDir, 'Library');
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

  function organize(
    from: string,
    to: string,
    importQuality: unknown,
  ): Promise<Response> {
    return fetch(`${server.baseUrl}/music/organize-track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, importQuality }),
    });
  }

  async function organizeOk(
    from: string,
    to: string,
    importQuality: unknown,
  ): Promise<T.OrganizeTrackResponse> {
    const res = await organize(from, to, importQuality);
    assert.equal(res.status, 200);
    return (await res.json()) as T.OrganizeTrackResponse;
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

  const missing = async (clientPath: string) =>
    readFile(join(server.mountDir, clientPath)).then(
      () => false,
      () => true,
    );

  it('moves a track untouched when the maximum quality is Original', async () => {
    const from = await stageHiResFlac('original.flac');
    const before = await readFile(join(server.mountDir, from));

    const moved = await organizeOk(from, '/Library/Original/original.flac', {
      maximumQuality: 'original',
      lossyFormat: 'm4a',
    });

    assert.equal(moved.path, '/Library/Original/original.flac');
    assert.deepEqual(await readFile(join(server.mountDir, moved.path)), before);
    assert.ok(await missing(from));
  });

  it('reduces hi-res FLAC to CD quality at Lossless, keeping tags and cover art', async () => {
    const from = await stageHiResFlac('lossless-hires.flac');

    const moved = await organizeOk(from, '/Library/Lossless/hires.flac', {
      maximumQuality: 'lossless',
      lossyFormat: 'm4a',
    });

    assert.equal(moved.path, '/Library/Lossless/hires.flac');
    const info = await audioInfo(moved.path);
    assert.equal(info.container, 'FLAC');
    assert.equal(info.sampleRate, 44100);
    assert.equal(info.bitsPerSample, 16);
    assert.equal(info.title, 'Hi-Res Title');
    assert.equal(info.artist, 'Hi-Res Artist');
    assert.equal(info.pictures, 1);
    assert.ok(await missing(from));
  });

  it('moves a FLAC that is already CD quality untouched at Lossless', async () => {
    const from = await stageAudio(
      'lossless-cd.flac',
      [`sine=frequency=${tone++}:duration=1:sample_rate=44100`],
      ['-sample_fmt', 's16', '-c:a', 'flac'],
    );
    const before = await readFile(join(server.mountDir, from));

    const moved = await organizeOk(from, '/Library/Lossless/cd.flac', {
      maximumQuality: 'lossless',
      lossyFormat: 'm4a',
    });

    assert.deepEqual(await readFile(join(server.mountDir, moved.path)), before);
  });

  it('converts FLAC to AAC at High, changing the extension and discarding the staged file', async () => {
    const from = await stageHiResFlac('high-aac.flac');

    const moved = await organizeOk(from, '/Library/High/track.flac', {
      maximumQuality: 'high',
      lossyFormat: 'm4a',
    });

    assert.equal(moved.path, '/Library/High/track.m4a');
    const stats = await stat(join(server.mountDir, moved.path));
    assert.equal(moved.size, stats.size);
    const info = await audioInfo(moved.path);
    assert.ok(info.container?.startsWith('M4A'));
    assert.ok(Math.abs(info.duration - 2) < 0.5);
    assert.equal(info.title, 'Hi-Res Title');
    assert.equal(info.pictures, 1);
    assert.deepEqual(await readdir(join(libraryDir(), 'High')), ['track.m4a']);
    assert.ok(await missing(from));
  });

  it('converts FLAC to MP3 at Standard when MP3 is chosen', async () => {
    const from = await stageHiResFlac('standard-mp3.flac');

    const moved = await organizeOk(from, '/Library/Standard/track.flac', {
      maximumQuality: 'standard',
      lossyFormat: 'mp3',
    });

    assert.equal(moved.path, '/Library/Standard/track.mp3');
    const info = await audioInfo(moved.path);
    assert.equal(info.container, 'MPEG');
    assert.equal(info.title, 'Hi-Res Title');
    assert.equal(info.pictures, 1);
  });

  it('re-encodes lossy files only when above the limit by more than the tolerance', async () => {
    const quality = { maximumQuality: 'standard', lossyFormat: 'm4a' };
    const above = await stageMp3('lossy-320.mp3', 320);
    const withinTolerance = await stageMp3('lossy-192.mp3', 192);
    const below = await stageMp3('lossy-128.mp3', 128);
    const beforeWithin = await readFile(join(server.mountDir, withinTolerance));
    const beforeBelow = await readFile(join(server.mountDir, below));

    const movedAbove = await organizeOk(
      above,
      '/Library/Lossy/320.mp3',
      quality,
    );
    const movedWithin = await organizeOk(
      withinTolerance,
      '/Library/Lossy/192.mp3',
      quality,
    );
    const movedBelow = await organizeOk(
      below,
      '/Library/Lossy/128.mp3',
      quality,
    );

    const converted = await audioInfo(movedAbove.path);
    assert.equal(converted.container, 'MPEG');
    assert.ok(
      converted.kbps < 200,
      `expected a smaller file: ${converted.kbps}`,
    );
    assert.deepEqual(
      await readFile(join(server.mountDir, movedWithin.path)),
      beforeWithin,
    );
    assert.deepEqual(
      await readFile(join(server.mountDir, movedBelow.path)),
      beforeBelow,
    );
  });

  it(
    'refuses to overwrite a file in the library and keeps the staged track',
    withLogs(['A file already exists at taken.m4a'], async () => {
      await mkdir(join(libraryDir(), 'Taken'), { recursive: true });
      await writeFile(join(libraryDir(), 'Taken', 'taken.m4a'), 'existing');
      const from = await stageHiResFlac('taken.flac');

      const res = await organize(from, '/Library/Taken/taken.flac', {
        maximumQuality: 'high',
        lossyFormat: 'm4a',
      });

      assert.equal(res.status, 400);
      assert.equal(
        await readFile(join(libraryDir(), 'Taken', 'taken.m4a'), 'utf-8'),
        'existing',
      );
      assert.ok(!(await missing(from)));
      assert.deepEqual(await readdir(join(libraryDir(), 'Taken')), [
        'taken.m4a',
      ]);
    }),
  );

  it(
    'keeps the staged track when the conversion fails',
    withLogs(['Could not convert truncated.flac'], async () => {
      const from = await stageHiResFlac('truncated.flac', 4);
      const fullPath = join(server.mountDir, from);
      const bytes = await readFile(fullPath);
      await truncate(fullPath, Math.floor(bytes.length / 2));

      const res = await organize(from, '/Library/Broken/truncated.flac', {
        maximumQuality: 'high',
        lossyFormat: 'm4a',
      });

      assert.equal(res.status, 400);
      assert.ok(!(await missing(from)));
      assert.deepEqual(await readdir(join(libraryDir(), 'Broken')), []);
    }),
  );

  it(
    'only organizes tracks that are in the staging area',
    withLogs(['Only staged tracks can be organized.'], async () => {
      await mkdir(join(libraryDir(), 'Existing'), { recursive: true });
      await writeFile(join(libraryDir(), 'Existing', 'song.flac'), 'x');

      const res = await organize(
        '/Library/Existing/song.flac',
        '/Library/Elsewhere/song.flac',
        { maximumQuality: 'high', lossyFormat: 'm4a' },
      );

      assert.equal(res.status, 400);
      assert.equal(
        await readFile(join(libraryDir(), 'Existing', 'song.flac'), 'utf-8'),
        'x',
      );
    }),
  );

  it(
    'refuses to organize into the staging area, including folders that start with two dots',
    withLogs(
      [
        'Tracks cannot be organized into the staging area.',
        'Tracks cannot be organized into the staging area.',
        'Tracks cannot be organized into the staging area.',
      ],
      async () => {
        const from = await stageMp3('into-staging.mp3', 64);
        const quality = { maximumQuality: 'original', lossyFormat: 'm4a' };

        for (const to of [
          '/.music-staging/into-staging-copy.mp3',
          '/.music-staging/sub/into-staging.mp3',
          '/.music-staging/..dots/into-staging.mp3',
        ]) {
          const res = await organize(from, to, quality);
          assert.equal(res.status, 400, to);
        }
        assert.ok(!(await missing(from)));
      },
    ),
  );

  it('allows a folder that only shares the staging folder name prefix', async () => {
    const from = await stageMp3('prefix-sibling.mp3', 64);

    const moved = await organizeOk(from, '/.music-staging-old/track.mp3', {
      maximumQuality: 'original',
      lossyFormat: 'm4a',
    });

    assert.equal(moved.path, '/.music-staging-old/track.mp3');
  });

  it(
    'rejects an unknown quality level',
    withLogs(['Invalid importQuality.'], async () => {
      const from = await stageMp3('invalid-quality.mp3', 64);

      const res = await organize(from, '/Library/Invalid/track.mp3', {
        maximumQuality: 'ultra',
        lossyFormat: 'm4a',
      });

      assert.equal(res.status, 400);
      assert.ok(!(await missing(from)));
    }),
  );
});
