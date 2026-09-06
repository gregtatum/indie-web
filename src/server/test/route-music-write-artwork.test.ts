import { describe as nodeDescribe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { writeFile, readFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseFile } from 'music-metadata';
import { musicRoute } from '../music/route.ts';
import type { T } from '../index.ts';
import {
  createTestServer,
  buildMp3WithTags,
  withLogs,
  getBytesAfterId3,
  MINIMAL_JPEG,
} from './helpers.ts';
import type { TestServer } from './helpers.ts';

let describe: (name: string, fn: () => void) => void = nodeDescribe;
if (process.env.INDIE_WEB_SKIP_LOCALHOST_TESTS === '1') {
  describe = (name) => {
    console.error(`LOCALHOST_BIND_SKIPPED_TEST ${name}`);
  };
}

// Payloads the size of a real cover.
const LARGE_JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  randomBytes(300_000),
]);
const LARGE_PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  randomBytes(300_000),
]);

interface FolderArtworkRequest {
  path: string;
  embedInTracks?: string[];
  body?: Buffer;
  contentType?: 'image/jpeg' | 'image/png';
}

async function postFolderArtwork(
  server: TestServer,
  { path, embedInTracks, body, contentType }: FolderArtworkRequest,
) {
  const params = new URLSearchParams({ path });
  if (embedInTracks) {
    // URLSearchParams handles percent-encoding; join the raw paths with a
    // comma the handler splits on.
    params.set('embedInTracks', embedInTracks.join(','));
  }
  const headers: Record<string, string> = {};
  if (body) {
    headers['Content-Type'] = contentType ?? 'image/jpeg';
  }
  return fetch(`${server.baseUrl}/music/artwork?${params}`, {
    method: 'POST',
    headers,
    body: body ? new Uint8Array(body) : undefined,
  });
}

async function scan(server: TestServer) {
  const res = await fetch(`${server.baseUrl}/music/music-index/scan`, {
    method: 'POST',
  });
  return (await res.json()) as {
    tracks: Array<{ path: string; folderArtworkPath: string | null }>;
  };
}

describe('POST /music/artwork — extract from embedded APIC (no body)', () => {
  let server: TestServer;
  before(async () => {
    server = await createTestServer((app, mountPath) => {
      app.use('/music', musicRoute(mountPath));
    });
  });
  after(() => server.close());

  it(
    'writes Folder.jpg from the first embedded picture',
    withLogs([], async () => {
      await mkdir(join(server.mountDir, 'A', 'JpgAlbum'), { recursive: true });
      await writeFile(
        join(server.mountDir, 'A', 'JpgAlbum', '01.mp3'),
        buildMp3WithTags({ title: 'One', apic: MINIMAL_JPEG }),
      );

      const res = await postFolderArtwork(server, {
        path: '/A/JpgAlbum/01.mp3',
      });
      assert.equal(res.status, 200);
      const json = (await res.json()) as T.WriteFolderArtworkResponse;
      assert.equal(json.folderArtworkPath, '/A/JpgAlbum/Folder.jpg');
      assert.equal(json.tracksEmbedded, undefined);
      assert.equal(json.removedFolderArtwork, undefined);

      const written = await readFile(
        join(server.mountDir, 'A', 'JpgAlbum', 'Folder.jpg'),
      );
      assert.equal(Buffer.compare(written, MINIMAL_JPEG), 0);
    }),
  );

  it(
    'returns 400 when the file has no embedded picture',
    withLogs(['No embedded picture found in this file.'], async () => {
      await writeFile(
        join(server.mountDir, 'bare.mp3'),
        buildMp3WithTags({ title: 'Bare' }),
      );
      const res = await postFolderArtwork(server, { path: '/bare.mp3' });
      assert.equal(res.status, 400);
    }),
  );

  it(
    'returns 400 when the path query parameter is missing',
    withLogs(['Missing path query parameter.'], async () => {
      const res = await fetch(`${server.baseUrl}/music/artwork`, {
        method: 'POST',
      });
      assert.equal(res.status, 400);
    }),
  );

  it(
    'returns 400 for a path that escapes the mount',
    withLogs(['Invalid path.'], async () => {
      const res = await postFolderArtwork(server, { path: '/../escape.mp3' });
      assert.equal(res.status, 400);
    }),
  );
});

describe('POST /music/artwork — upload an image body', () => {
  let server: TestServer;
  before(async () => {
    server = await createTestServer((app, mountPath) => {
      app.use('/music', musicRoute(mountPath));
    });
  });
  after(() => server.close());

  it(
    'writes the uploaded JPEG verbatim as Folder.jpg',
    withLogs([], async () => {
      await mkdir(join(server.mountDir, 'Up', 'Jpg'), { recursive: true });
      await writeFile(
        join(server.mountDir, 'Up', 'Jpg', '01.mp3'),
        buildMp3WithTags({ title: 'One' }),
      );

      const res = await postFolderArtwork(server, {
        path: '/Up/Jpg/01.mp3',
        body: LARGE_JPEG,
      });
      assert.equal(res.status, 200);
      const json = (await res.json()) as T.WriteFolderArtworkResponse;
      assert.equal(json.folderArtworkPath, '/Up/Jpg/Folder.jpg');
      assert.equal(json.tracksEmbedded, undefined);

      const written = await readFile(
        join(server.mountDir, 'Up', 'Jpg', 'Folder.jpg'),
      );
      assert.equal(
        Buffer.compare(written, LARGE_JPEG),
        0,
        'a full-size cover must round-trip byte for byte',
      );
    }),
  );

  it(
    'writes an uploaded PNG as Folder.png that a later scan resolves',
    withLogs([], async () => {
      await mkdir(join(server.mountDir, 'Up', 'Png'), { recursive: true });
      await writeFile(
        join(server.mountDir, 'Up', 'Png', '01.mp3'),
        buildMp3WithTags({ title: 'One' }),
      );

      const res = await postFolderArtwork(server, {
        path: '/Up/Png/01.mp3',
        body: LARGE_PNG,
        contentType: 'image/png',
      });
      assert.equal(res.status, 200);
      const json = (await res.json()) as T.WriteFolderArtworkResponse;
      assert.equal(json.folderArtworkPath, '/Up/Png/Folder.png');

      const written = await readFile(
        join(server.mountDir, 'Up', 'Png', 'Folder.png'),
      );
      assert.equal(Buffer.compare(written, LARGE_PNG), 0);

      const index = await scan(server);
      const track = index.tracks.find((t) => t.path === '/Up/Png/01.mp3');
      assert.equal(track?.folderArtworkPath, '/Up/Png/Folder.png');
    }),
  );

  it(
    'returns 400 for a body that is neither JPEG nor PNG, writing nothing',
    withLogs(['Uploaded artwork must be a JPEG or PNG image.'], async () => {
      await mkdir(join(server.mountDir, 'Up', 'Bad'), { recursive: true });
      await writeFile(
        join(server.mountDir, 'Up', 'Bad', '01.mp3'),
        buildMp3WithTags({ title: 'One' }),
      );

      const res = await postFolderArtwork(server, {
        path: '/Up/Bad/01.mp3',
        body: Buffer.from('GIF89a not really though'),
        contentType: 'image/png',
      });
      assert.equal(res.status, 400);
      assert.deepEqual(await readdir(join(server.mountDir, 'Up', 'Bad')), [
        '01.mp3',
      ]);
    }),
  );

  it(
    'removes other recognized cover files so the upload is unambiguous',
    withLogs([], async () => {
      const dir = join(server.mountDir, 'Up', 'Variants');
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, '01.mp3'), buildMp3WithTags({ title: 'One' }));
      await writeFile(join(dir, 'cover.jpg'), Buffer.from('OLD cover.jpg'));
      await writeFile(join(dir, 'front.png'), Buffer.from('OLD front.png'));
      await writeFile(join(dir, 'liner-notes.txt'), Buffer.from('keep me'));

      const res = await postFolderArtwork(server, {
        path: '/Up/Variants/01.mp3',
        body: MINIMAL_JPEG,
      });
      assert.equal(res.status, 200);
      const json = (await res.json()) as T.WriteFolderArtworkResponse;
      assert.deepEqual([...(json.removedFolderArtwork ?? [])].sort(), [
        '/Up/Variants/cover.jpg',
        '/Up/Variants/front.png',
      ]);

      assert.deepEqual((await readdir(dir)).sort(), [
        '01.mp3',
        'Folder.jpg',
        'liner-notes.txt',
      ]);
    }),
  );
});

describe('HEAD /music/artwork — report size without a body', () => {
  let server: TestServer;
  before(async () => {
    server = await createTestServer((app, mountPath) => {
      app.use('/music', musicRoute(mountPath));
    });
  });
  after(() => server.close());

  it(
    'returns Content-Length and Content-Type with an empty body',
    withLogs([], async () => {
      const dir = join(server.mountDir, 'Head', 'Album');
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'Folder.jpg'), LARGE_JPEG);

      const res = await fetch(
        `${server.baseUrl}/music/artwork?path=${encodeURIComponent(
          '/Head/Album/Folder.jpg',
        )}`,
        { method: 'HEAD' },
      );
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'image/jpeg');
      assert.equal(
        res.headers.get('content-length'),
        String(LARGE_JPEG.length),
      );
      assert.equal(await res.text(), '');
    }),
  );

  it(
    'returns 404 when the artwork file does not exist',
    withLogs([], async () => {
      const res = await fetch(
        `${server.baseUrl}/music/artwork?path=${encodeURIComponent(
          '/Head/Missing/Folder.jpg',
        )}`,
        { method: 'HEAD' },
      );
      assert.equal(res.status, 404);
    }),
  );
});

describe('POST /music/artwork — embed into tracks', () => {
  let server: TestServer;
  before(async () => {
    server = await createTestServer((app, mountPath) => {
      app.use('/music', musicRoute(mountPath));
    });
  });
  after(() => server.close());

  it(
    'embeds the uploaded image into every listed track, preserving tags and audio',
    withLogs([], async () => {
      const dir = join(server.mountDir, 'Embed', 'Album');
      await mkdir(dir, { recursive: true });
      const seeded = buildMp3WithTags({
        title: 'Song',
        artist: 'Band',
        album: 'Album',
      });
      await writeFile(join(dir, '01.mp3'), seeded);
      await writeFile(join(dir, '02.mp3'), seeded);
      const audioBefore = getBytesAfterId3(seeded);

      const res = await postFolderArtwork(server, {
        path: '/Embed/Album/01.mp3',
        embedInTracks: ['/Embed/Album/01.mp3', '/Embed/Album/02.mp3'],
        body: LARGE_JPEG,
      });
      assert.equal(res.status, 200);
      const json = (await res.json()) as T.WriteFolderArtworkResponse;
      assert.deepEqual(json.tracksEmbedded, {
        updatedTracks: ['/Embed/Album/01.mp3', '/Embed/Album/02.mp3'],
        errors: [],
      });

      for (const name of ['01.mp3', '02.mp3']) {
        const bytes = await readFile(join(dir, name));
        const meta = await parseFile(join(dir, name));
        assert.equal(meta.common.picture?.length, 1, `${name} has one picture`);
        assert.equal(
          Buffer.compare(
            Buffer.from(meta.common.picture?.[0].data ?? []),
            LARGE_JPEG,
          ),
          0,
          `${name} embedded bytes match the upload`,
        );
        assert.equal(meta.common.title, 'Song', `${name} kept its title`);
        assert.equal(meta.common.artist, 'Band', `${name} kept its artist`);
        assert.equal(meta.common.album, 'Album', `${name} kept its album`);
        assert.equal(
          Buffer.compare(getBytesAfterId3(bytes), audioBefore),
          0,
          `${name} audio payload is untouched`,
        );
      }
    }),
  );

  it(
    'reports per-track failures without skipping the good tracks',
    withLogs([], async () => {
      const dir = join(server.mountDir, 'Embed', 'Partial');
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'ok.mp3'), buildMp3WithTags({ title: 'OK' }));
      await writeFile(join(dir, 'note.txt'), Buffer.from('not an mp3'));

      const res = await postFolderArtwork(server, {
        path: '/Embed/Partial/ok.mp3',
        embedInTracks: [
          '/Embed/Partial/ok.mp3',
          '/Embed/Partial/note.txt',
          '/Embed/Partial/missing.mp3',
        ],
        body: MINIMAL_JPEG,
      });
      assert.equal(res.status, 200);
      const json = (await res.json()) as T.WriteFolderArtworkResponse;
      assert.deepEqual(json.tracksEmbedded?.updatedTracks, [
        '/Embed/Partial/ok.mp3',
      ]);
      assert.equal(json.tracksEmbedded?.errors.length, 2);
      const byPath = Object.fromEntries(
        (json.tracksEmbedded?.errors ?? []).map((e) => [e.path, e.message]),
      );
      assert.match(byPath['/Embed/Partial/note.txt'], /Only MP3 files/);
      assert.match(byPath['/Embed/Partial/missing.mp3'], /File not found/);

      const meta = await parseFile(join(dir, 'ok.mp3'));
      assert.equal(meta.common.picture?.length, 1);
    }),
  );

  it(
    'ignores an embed list when no image body is supplied',
    withLogs([], async () => {
      const dir = join(server.mountDir, 'Embed', 'NoBody');
      await mkdir(dir, { recursive: true });
      await writeFile(
        join(dir, '01.mp3'),
        buildMp3WithTags({ title: 'One', apic: MINIMAL_JPEG }),
      );

      const res = await postFolderArtwork(server, {
        path: '/Embed/NoBody/01.mp3',
        embedInTracks: ['/Embed/NoBody/01.mp3'],
      });
      assert.equal(res.status, 200);
      const json = (await res.json()) as T.WriteFolderArtworkResponse;
      assert.equal(json.folderArtworkPath, '/Embed/NoBody/Folder.jpg');
      assert.equal(json.tracksEmbedded, undefined);
    }),
  );
});

describe('POST /music/artwork — end to end with a library scan', () => {
  let server: TestServer;
  before(async () => {
    server = await createTestServer((app, mountPath) => {
      app.use('/music', musicRoute(mountPath));
    });
  });
  after(() => server.close());

  it(
    'a fresh scan resolves folderArtworkPath to the upload and serves its exact bytes',
    withLogs([], async () => {
      const dir = join(server.mountDir, 'Scan', 'Album');
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, '01.mp3'), buildMp3WithTags({ title: 'One' }));
      await writeFile(join(dir, '02.mp3'), buildMp3WithTags({ title: 'Two' }));
      // Stale art the scanner would otherwise prefer over Folder.jpg.
      await writeFile(join(dir, 'cover.jpg'), Buffer.from('STALE ART'));

      const post = await postFolderArtwork(server, {
        path: '/Scan/Album/01.mp3',
        embedInTracks: ['/Scan/Album/01.mp3', '/Scan/Album/02.mp3'],
        body: LARGE_JPEG,
      });
      assert.equal(post.status, 200);

      const index = await scan(server);
      const albumTracks = index.tracks.filter((t) =>
        t.path.startsWith('/Scan/Album/'),
      );
      assert.equal(albumTracks.length, 2);
      for (const track of albumTracks) {
        assert.equal(track.folderArtworkPath, '/Scan/Album/Folder.jpg');
      }

      const artRes = await fetch(
        `${server.baseUrl}/music/artwork?path=${encodeURIComponent(
          '/Scan/Album/Folder.jpg',
        )}`,
      );
      assert.equal(artRes.status, 200);
      const servedBytes = Buffer.from(await artRes.arrayBuffer());
      assert.equal(Buffer.compare(servedBytes, LARGE_JPEG), 0);
    }),
  );
});
