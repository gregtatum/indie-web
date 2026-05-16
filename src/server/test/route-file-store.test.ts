import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileStoreRoute } from '../route-file-store.ts';
import { createTestServer, withLogs } from './helpers.ts';
import type { TestServer } from './helpers.ts';

// Helpers for the File-Store-Request header pattern.
function fileStoreHeader(data: Record<string, string>): string {
  return JSON.stringify(data);
}

async function listFiles(baseUrl: string, path: string) {
  return fetch(`${baseUrl}/file-store/list-files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
}

async function saveBlob(
  baseUrl: string,
  path: string,
  body: string | Buffer,
  mode = 'overwrite',
) {
  return fetch(`${baseUrl}/file-store/save-blob`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'File-Store-Request': fileStoreHeader({ path, mode }),
    },
    body: body as BodyInit,
  });
}

async function loadBlob(baseUrl: string, path: string) {
  return fetch(`${baseUrl}/file-store/load-blob`, {
    method: 'POST',
    headers: {
      'File-Store-Request': fileStoreHeader({ path }),
    },
  });
}

describe('POST /file-store/list-files', () => {
  let server: TestServer;

  before(async () => {
    server = await createTestServer((app, mountDir) => {
      app.use('/file-store', fileStoreRoute(mountDir));
    });
  });

  after(() => server.close());

  it(
    'returns an empty array for an empty directory',
    withLogs([], async () => {
      const res = await listFiles(server.baseUrl, '/');
      assert.equal(res.status, 200);
      const listing = await res.json();
      assert.deepEqual(listing, []);
    }),
  );

  it(
    'lists files and folders in a directory',
    withLogs([], async () => {
      await writeFile(join(server.mountDir, 'hello.txt'), 'hello');
      await mkdir(join(server.mountDir, 'subdir'), { recursive: true });

      const res = await listFiles(server.baseUrl, '/');
      const listing = await res.json();
      const names = listing.map((e: { name: string }) => e.name).sort();
      assert.ok(names.includes('hello.txt'));
      assert.ok(names.includes('subdir'));
    }),
  );

  it(
    'distinguishes files from folders in the response',
    withLogs([], async () => {
      const res = await listFiles(server.baseUrl, '/');
      const listing = await res.json();
      const file = listing.find(
        (e: { name: string }) => e.name === 'hello.txt',
      );
      const folder = listing.find((e: { name: string }) => e.name === 'subdir');
      assert.equal(file.type, 'file');
      assert.equal(folder.type, 'folder');
    }),
  );

  it(
    'returns 409 for a path that does not exist',
    withLogs(['[400err ]'], async () => {
      const res = await listFiles(server.baseUrl, '/nonexistent');
      assert.equal(res.status, 409);
    }),
  );

  it(
    'returns 400 when path is missing from the request body',
    withLogs(['[400err ]'], async () => {
      const res = await fetch(`${server.baseUrl}/file-store/list-files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(res.status, 400);
    }),
  );

  it(
    'rejects path traversal attempts',
    withLogs(['Resolved path:', '[400err ]'], async () => {
      const res = await listFiles(server.baseUrl, '/../../etc');
      assert.equal(res.status, 400);
    }),
  );

  it(
    'does not list .DS_Store files',
    withLogs([], async () => {
      await writeFile(join(server.mountDir, '.DS_Store'), '');

      const res = await listFiles(server.baseUrl, '/');
      const listing = await res.json();
      const names = listing.map((e: { name: string }) => e.name);
      assert.ok(!names.includes('.DS_Store'));
    }),
  );
});

describe('POST /file-store/save-blob', () => {
  let server: TestServer;

  before(async () => {
    server = await createTestServer((app, mountDir) => {
      app.use('/file-store', fileStoreRoute(mountDir));
    });
  });

  after(() => server.close());

  it(
    'saves a file and returns its metadata',
    withLogs([], async () => {
      const res = await saveBlob(server.baseUrl, '/hello.txt', 'hello world');
      assert.equal(res.status, 200);
      const meta = await res.json();
      assert.equal(meta.type, 'file');
      assert.equal(meta.name, 'hello.txt');
      assert.equal(meta.path, '/hello.txt');
      assert.ok(typeof meta.size === 'number');
    }),
  );

  it(
    'actually writes the file to the mount directory',
    withLogs([], async () => {
      await saveBlob(server.baseUrl, '/written.txt', 'disk content');
      const contents = await readFile(
        join(server.mountDir, 'written.txt'),
        'utf-8',
      );
      assert.equal(contents, 'disk content');
    }),
  );

  it(
    'creates parent directories automatically',
    withLogs([], async () => {
      const res = await saveBlob(
        server.baseUrl,
        '/deep/nested/file.txt',
        'nested',
      );
      assert.equal(res.status, 200);
      const contents = await readFile(
        join(server.mountDir, 'deep', 'nested', 'file.txt'),
        'utf-8',
      );
      assert.equal(contents, 'nested');
    }),
  );

  it(
    'returns 400 when File-Store-Request header is missing',
    withLogs(['[400err ]'], async () => {
      const res = await fetch(`${server.baseUrl}/file-store/save-blob`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: 'data',
      });
      assert.equal(res.status, 400);
    }),
  );

  it(
    'rejects path traversal attempts',
    withLogs(['Resolved path:', '[400err ]'], async () => {
      const res = await saveBlob(server.baseUrl, '/../../etc/passwd', 'evil');
      assert.equal(res.status, 400);
    }),
  );
});

describe('POST /file-store/load-blob', () => {
  let server: TestServer;

  before(async () => {
    server = await createTestServer((app, mountDir) => {
      app.use('/file-store', fileStoreRoute(mountDir));
    });
  });

  after(() => server.close());

  it(
    'returns the file contents and metadata header',
    withLogs([], async () => {
      await writeFile(join(server.mountDir, 'data.txt'), 'file contents');

      const res = await loadBlob(server.baseUrl, '/data.txt');
      assert.equal(res.status, 200);

      const metaHeader = res.headers.get('File-Store-Response');
      assert.ok(metaHeader, 'File-Store-Response header should be present');
      const meta = JSON.parse(metaHeader);
      assert.equal(meta.type, 'file');
      assert.equal(meta.name, 'data.txt');

      const text = await res.text();
      assert.equal(text, 'file contents');
    }),
  );

  it(
    'returns a 500 for a file that does not exist',
    withLogs(['[500err ]', 'ENOENT'], async () => {
      const res = await loadBlob(server.baseUrl, '/nonexistent.txt');
      // The route throws an unhandled ENOENT, which the ApiRoute catches as a 500.
      assert.equal(res.status, 500);
    }),
  );

  it(
    'returns 400 when File-Store-Request header is missing',
    withLogs(['[400err ]'], async () => {
      const res = await fetch(`${server.baseUrl}/file-store/load-blob`, {
        method: 'POST',
      });
      assert.equal(res.status, 400);
    }),
  );

  it(
    'rejects path traversal attempts',
    withLogs(['Resolved path:', '[400err ]'], async () => {
      const res = await loadBlob(server.baseUrl, '/../../etc/passwd');
      assert.equal(res.status, 400);
    }),
  );
});

describe('POST /file-store/create-folder', () => {
  let server: TestServer;

  before(async () => {
    server = await createTestServer((app, mountDir) => {
      app.use('/file-store', fileStoreRoute(mountDir));
    });
  });

  after(() => server.close());

  it(
    'creates a folder and returns its metadata',
    withLogs([], async () => {
      const res = await fetch(`${server.baseUrl}/file-store/create-folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: '/new-folder' }),
      });
      assert.equal(res.status, 200);
      const meta = await res.json();
      assert.equal(meta.type, 'folder');
      assert.equal(meta.name, 'new-folder');
      assert.equal(meta.path, '/new-folder');
    }),
  );

  it(
    'is idempotent — creating an existing folder succeeds',
    withLogs([], async () => {
      await mkdir(join(server.mountDir, 'existing'), { recursive: true });
      const res = await fetch(`${server.baseUrl}/file-store/create-folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: '/existing' }),
      });
      assert.equal(res.status, 200);
    }),
  );

  it(
    'returns 400 when folderPath is missing',
    withLogs(['[400err ]'], async () => {
      const res = await fetch(`${server.baseUrl}/file-store/create-folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(res.status, 400);
    }),
  );

  it(
    'rejects path traversal attempts',
    withLogs(['Resolved path:', '[400err ]'], async () => {
      const res = await fetch(`${server.baseUrl}/file-store/create-folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: '/../../evil' }),
      });
      assert.equal(res.status, 400);
    }),
  );
});

describe('POST /file-store/move', () => {
  let server: TestServer;

  before(async () => {
    server = await createTestServer((app, mountDir) => {
      app.use('/file-store', fileStoreRoute(mountDir));
    });
  });

  after(() => server.close());

  it(
    'moves a file to a new path',
    withLogs([], async () => {
      await writeFile(join(server.mountDir, 'original.txt'), 'move me');

      const res = await fetch(`${server.baseUrl}/file-store/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromPath: '/original.txt',
          toPath: '/moved.txt',
        }),
      });
      assert.equal(res.status, 200);

      // Verify on disk
      const contents = await readFile(
        join(server.mountDir, 'moved.txt'),
        'utf-8',
      );
      assert.equal(contents, 'move me');
    }),
  );

  it(
    'returns 400 when fromPath or toPath is missing',
    withLogs(['[400err ]'], async () => {
      const res = await fetch(`${server.baseUrl}/file-store/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromPath: '/something.txt' }),
      });
      assert.equal(res.status, 400);
    }),
  );

  it(
    'rejects path traversal in fromPath',
    withLogs(['Resolved path:', '[400err ]'], async () => {
      const res = await fetch(`${server.baseUrl}/file-store/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromPath: '/../../etc/passwd',
          toPath: '/stolen.txt',
        }),
      });
      assert.equal(res.status, 400);
    }),
  );

  it(
    'rejects path traversal in toPath',
    withLogs(['Resolved path:', '[400err ]'], async () => {
      await writeFile(join(server.mountDir, 'source.txt'), 'data');
      const res = await fetch(`${server.baseUrl}/file-store/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromPath: '/source.txt',
          toPath: '/../../tmp/escaped.txt',
        }),
      });
      assert.equal(res.status, 400);
    }),
  );
});

describe('POST /file-store/compress-folder', () => {
  let server: TestServer;

  before(async () => {
    server = await createTestServer((app, mountDir) => {
      app.use('/file-store', fileStoreRoute(mountDir));
    });
  });

  after(() => server.close());

  it(
    'returns a zip file for a valid folder',
    withLogs([], async () => {
      await mkdir(join(server.mountDir, 'archive-me'), { recursive: true });
      await writeFile(
        join(server.mountDir, 'archive-me', 'file.txt'),
        'zipped',
      );

      const res = await fetch(`${server.baseUrl}/file-store/compress-folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '/archive-me' }),
      });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('Content-Type'), 'application/zip');

      // Zip files start with the local file header signature PK\x03\x04
      const buf = Buffer.from(await res.arrayBuffer());
      assert.equal(buf[0], 0x50); // P
      assert.equal(buf[1], 0x4b); // K
    }),
  );

  it(
    'returns 409 for a path that is not a folder',
    withLogs(['[400err ]'], async () => {
      const res = await fetch(`${server.baseUrl}/file-store/compress-folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '/nonexistent-folder' }),
      });
      assert.equal(res.status, 409);
    }),
  );

  it(
    'rejects path traversal attempts',
    withLogs(['Resolved path:', '[400err ]'], async () => {
      const res = await fetch(`${server.baseUrl}/file-store/compress-folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '/../../etc' }),
      });
      assert.equal(res.status, 400);
    }),
  );
});
