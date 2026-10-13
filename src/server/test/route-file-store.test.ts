import { describe as nodeDescribe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileStoreRoute } from '../file-store/route.ts';
import { corsMiddleware } from '../route-utils.ts';
import { zipFolder } from '../file-store/zip.ts';
import { musicRoute } from '../music/route.ts';
import {
  buildMp3WithTags,
  createTestServer,
  MINIMAL_JPEG,
  withLogs,
} from './helpers.ts';
import type { TestServer } from './helpers.ts';
import { assertUnzipAccepts, extractZip, snapshotTree } from './zip-oracle.ts';

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
  const query = new URLSearchParams({ path, mode }).toString();
  return fetch(`${baseUrl}/file-store/save-blob?${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: body as BodyInit,
  });
}

async function loadBlob(baseUrl: string, path: string) {
  return fetch(`${baseUrl}/file-store/load-blob`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
}

let describe: (name: string, fn: () => void) => void = nodeDescribe;
if (process.env.INDIE_WEB_SKIP_LOCALHOST_TESTS === '1') {
  // The check runner enables this in sandboxes that cannot bind localhost.
  describe = (name) => {
    console.error(`LOCALHOST_BIND_SKIPPED_TEST ${name}`);
  };
}

describe('CORS', () => {
  let server: TestServer;

  before(async () => {
    server = await createTestServer((app, mountPath) => {
      app.use(corsMiddleware);
      app.use('/file-store', fileStoreRoute(mountPath));
    });
  });

  after(() => server.close());

  it(
    'lets any page call the API and read the File-Store-Response header',
    withLogs([], async () => {
      const res = await fetch(`${server.baseUrl}/file-store/list-files`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://example.com',
        },
        body: JSON.stringify({ path: '/' }),
      });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
      assert.equal(
        res.headers.get('Access-Control-Expose-Headers'),
        'File-Store-Response',
      );
    }),
  );

  it(
    'answers a preflight request without reaching the route',
    withLogs([], async () => {
      const res = await fetch(`${server.baseUrl}/file-store/save-blob`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://example.com',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type,x-custom',
        },
      });
      assert.equal(res.status, 204);
      assert.equal(res.headers.get('Content-Length'), '0');
      assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
      assert.equal(
        res.headers.get('Access-Control-Allow-Methods'),
        'GET,HEAD,PUT,PATCH,POST,DELETE',
      );
      assert.equal(
        res.headers.get('Access-Control-Allow-Headers'),
        'content-type,x-custom',
      );
      assert.equal(res.headers.get('Vary'), 'Access-Control-Request-Headers');
      assert.equal(await res.text(), '');
    }),
  );
});

describe('POST /file-store/list-files', () => {
  let server: TestServer;

  before(async () => {
    server = await createTestServer((app, mountPath) => {
      app.use('/file-store', fileStoreRoute(mountPath));
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
    server = await createTestServer((app, mountPath) => {
      app.use('/file-store', fileStoreRoute(mountPath));
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
    'returns 400 when the path query param is missing',
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

  it(
    'saves a file whose path has characters outside Latin1',
    withLogs([], async () => {
      const path = '/AKIRA アキラ Soundtrack/track ’1.mp3';
      const res = await saveBlob(server.baseUrl, path, 'audio bytes');
      assert.equal(res.status, 200);
      const meta = await res.json();
      assert.equal(meta.path, path);
    }),
  );
});

describe('POST /file-store/load-blob', () => {
  let server: TestServer;

  before(async () => {
    server = await createTestServer((app, mountPath) => {
      app.use('/file-store', fileStoreRoute(mountPath));
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
      const meta = JSON.parse(decodeURIComponent(metaHeader));
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
    'returns 400 when the path is missing from the request body',
    withLogs(['[400err ]'], async () => {
      const res = await fetch(`${server.baseUrl}/file-store/load-blob`, {
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
      const res = await loadBlob(server.baseUrl, '/../../etc/passwd');
      assert.equal(res.status, 400);
    }),
  );

  it(
    'loads a file whose path has characters outside Latin1',
    withLogs([], async () => {
      const path = '/AKIRA アキラ Soundtrack/track ’1.mp3';
      await mkdir(join(server.mountDir, 'AKIRA アキラ Soundtrack'), {
        recursive: true,
      });
      await writeFile(
        join(server.mountDir, 'AKIRA アキラ Soundtrack', 'track ’1.mp3'),
        'audio bytes',
      );

      const res = await loadBlob(server.baseUrl, path);
      assert.equal(res.status, 200);

      const metaHeader = res.headers.get('File-Store-Response');
      assert.ok(metaHeader, 'File-Store-Response header should be present');
      const meta = JSON.parse(decodeURIComponent(metaHeader));
      assert.equal(meta.path, path);
    }),
  );
});

describe('POST /file-store/create-folder', () => {
  let server: TestServer;

  before(async () => {
    server = await createTestServer((app, mountPath) => {
      app.use('/file-store', fileStoreRoute(mountPath));
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
    server = await createTestServer((app, mountPath) => {
      app.use('/file-store', fileStoreRoute(mountPath));
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

describe('POST /file-store/delete', () => {
  let server: TestServer;

  before(async () => {
    server = await createTestServer((app, mountPath) => {
      app.use('/file-store', fileStoreRoute(mountPath));
    });
  });

  after(() => server.close());

  async function deleteFile(baseUrl: string, targetPath: string) {
    return fetch(`${baseUrl}/file-store/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetPath }),
    });
  }

  it(
    'deletes a file',
    withLogs([], async () => {
      await writeFile(join(server.mountDir, 'delete-me.txt'), 'bye');

      const res = await deleteFile(server.baseUrl, '/delete-me.txt');
      assert.equal(res.status, 200);

      await assert.rejects(
        readFile(join(server.mountDir, 'delete-me.txt'), 'utf-8'),
      );
    }),
  );

  it(
    'deletes a folder and its contents recursively',
    withLogs([], async () => {
      await mkdir(join(server.mountDir, 'delete-folder', 'nested'), {
        recursive: true,
      });
      await writeFile(
        join(server.mountDir, 'delete-folder', 'nested', 'file.txt'),
        'contents',
      );

      const res = await deleteFile(server.baseUrl, '/delete-folder');
      assert.equal(res.status, 200);

      const res2 = await listFiles(server.baseUrl, '/');
      const listing = await res2.json();
      const names = listing.map((e: { name: string }) => e.name);
      assert.ok(!names.includes('delete-folder'));
    }),
  );

  it(
    'returns 400 when targetPath is missing',
    withLogs(['[400err ]'], async () => {
      const res = await fetch(`${server.baseUrl}/file-store/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(res.status, 400);
    }),
  );

  it(
    'returns 409 for a path that does not exist',
    withLogs(['[400err ]'], async () => {
      const res = await deleteFile(server.baseUrl, '/nonexistent.txt');
      assert.equal(res.status, 409);
    }),
  );

  it(
    'rejects path traversal attempts',
    withLogs(['Resolved path:', '[400err ]'], async () => {
      const res = await deleteFile(server.baseUrl, '/../../outside/mount');
      assert.equal(res.status, 400);
    }),
  );

  it(
    'rejects deleting the mount root',
    withLogs(['Resolved path:', '[400err ]'], async () => {
      const res = await deleteFile(server.baseUrl, '/');
      assert.equal(res.status, 400);
    }),
  );
});

describe('POST /file-store/reveal', () => {
  let server: TestServer;

  before(async () => {
    server = await createTestServer((app, mountPath) => {
      app.use('/file-store', fileStoreRoute(mountPath));
    });
  });

  after(() => server.close());

  it(
    'returns 400 when the platform has no file manager launcher',
    withLogs(['[400err ]'], async () => {
      const originalPlatform = process.platform;
      // Linux intentionally has no launcher — see file-manager-launcher.ts.
      Object.defineProperty(process, 'platform', { value: 'linux' });
      try {
        const res = await fetch(`${server.baseUrl}/file-store/reveal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: '/hello.txt' }),
        });
        assert.equal(res.status, 400);
      } finally {
        Object.defineProperty(process, 'platform', {
          value: originalPlatform,
        });
      }
    }),
  );

  it(
    'returns 400 when path is missing from the request body',
    withLogs(['[400err ]'], async () => {
      const res = await fetch(`${server.baseUrl}/file-store/reveal`, {
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
      const res = await fetch(`${server.baseUrl}/file-store/reveal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '/../../etc/passwd' }),
      });
      assert.equal(res.status, 400);
    }),
  );

  it(
    'returns 409 for a path that does not exist',
    withLogs(['[400err ]'], async () => {
      const res = await fetch(`${server.baseUrl}/file-store/reveal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '/nonexistent.txt' }),
      });
      assert.equal(res.status, 409);
    }),
  );
});

describe('GET /file-store/', () => {
  let server: TestServer;

  before(async () => {
    server = await createTestServer((app, mountPath) => {
      app.use('/file-store', fileStoreRoute(mountPath));
    });
  });

  after(() => server.close());

  it(
    'reports revealLabel as null when the platform has no file manager launcher',
    withLogs([], async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });
      try {
        const res = await fetch(`${server.baseUrl}/file-store/`);
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.revealLabel, null);
      } finally {
        Object.defineProperty(process, 'platform', {
          value: originalPlatform,
        });
      }
    }),
  );

  it(
    'reports the darwin revealLabel',
    withLogs([], async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      try {
        const res = await fetch(`${server.baseUrl}/file-store/`);
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.revealLabel, 'Show in Finder');
      } finally {
        Object.defineProperty(process, 'platform', {
          value: originalPlatform,
        });
      }
    }),
  );
});

describe('POST /file-store/compress-folder', () => {
  let server: TestServer;

  before(async () => {
    server = await createTestServer((app, mountPath) => {
      app.use('/file-store', fileStoreRoute(mountPath));
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

  async function makeTree(root: string) {
    const files: Record<string, string | Buffer> = {
      'Björk ♫/01 Hyperballad.txt': 'Unicode name\n'.repeat(100),
      'empty.txt': '',
      '.hidden': 'dotfile',
      'deep/a/b/c/leaf.bin': randomBytes(2_500_000),
      'zeros.bin': Buffer.alloc(5_000_000),
      'run.sh': '#!/bin/sh\necho hi\n',
    };
    for (const [name, contents] of Object.entries(files)) {
      const path = join(root, name);
      await mkdir(join(path, '..'), { recursive: true });
      await writeFile(path, contents);
      await utimes(
        path,
        new Date(2021, 2, 4, 5, 6, 8),
        new Date(2021, 2, 4, 5, 6, 8),
      );
    }
    await mkdir(join(root, 'empty-dir'));
    await chmod(join(root, 'run.sh'), 0o755);
  }

  async function expectZipMatchesFolder(zipPath: string, folder: string) {
    await assertUnzipAccepts(zipPath);
    const extracted = await mkdtemp(join(tmpdir(), 'indie-web-unzip-'));
    try {
      await extractZip(zipPath, extracted);
      const tree = await snapshotTree(extracted);
      assert.deepEqual([...tree], [...(await snapshotTree(folder))]);
      return [...tree.keys()];
    } finally {
      await rm(extracted, { recursive: true, force: true });
    }
  }

  it(
    'streams a zip that unzip accepts and extracts to the same folder',
    withLogs([], async () => {
      const folder = join(server.mountDir, 'zip-roundtrip');
      await makeTree(folder);
      await symlink('/etc/hosts', join(folder, 'link-to-file'));
      await symlink('.', join(folder, 'link-to-self'));
      const work = await mkdtemp(join(tmpdir(), 'indie-web-zip-'));
      try {
        const res = await fetch(
          `${server.baseUrl}/file-store/compress-folder`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: '/zip-roundtrip' }),
          },
        );
        assert.equal(res.status, 200);
        const zipPath = join(work, 'out.zip');
        await writeFile(zipPath, Buffer.from(await res.arrayBuffer()));

        assert.deepEqual(await expectZipMatchesFolder(zipPath, folder), [
          '.hidden',
          'Björk ♫/',
          'Björk ♫/01 Hyperballad.txt',
          'deep/',
          'deep/a/',
          'deep/a/b/',
          'deep/a/b/c/',
          'deep/a/b/c/leaf.bin',
          'empty-dir/',
          'empty.txt',
          'run.sh',
          'zeros.bin',
        ]);
      } finally {
        await rm(work, { recursive: true, force: true });
      }
    }),
  );

  it(
    'writes an empty folder as a valid empty zip',
    withLogs([], async () => {
      await mkdir(join(server.mountDir, 'zip-empty'));
      const res = await fetch(`${server.baseUrl}/file-store/compress-folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '/zip-empty' }),
      });
      assert.equal(res.status, 200);
      assert.equal(
        res.headers.get('Content-Disposition'),
        'attachment; filename="zip-empty.zip"',
      );
      const bytes = Buffer.from(await res.arrayBuffer());
      assert.equal(bytes.length, 22);
      assert.equal(bytes.readUInt32LE(0), 0x06054b50);
    }),
  );

  it(
    'writes ZIP64 records that unzip accepts',
    withLogs([], async () => {
      const folder = join(server.mountDir, 'zip-zip64');
      await makeTree(folder);
      const work = await mkdtemp(join(tmpdir(), 'indie-web-zip-'));
      try {
        const zipPath = join(work, 'zip64.zip');
        const chunks: Buffer[] = [];
        for await (const chunk of zipFolder(folder, { forceZip64: true })) {
          chunks.push(chunk);
        }
        await writeFile(zipPath, Buffer.concat(chunks));
        await expectZipMatchesFolder(zipPath, folder);
      } finally {
        await rm(work, { recursive: true, force: true });
      }
    }),
  );

  it(
    'the oracle detects a corrupted archive',
    withLogs([], async () => {
      const folder = join(server.mountDir, 'zip-corrupt');
      await makeTree(folder);
      const work = await mkdtemp(join(tmpdir(), 'indie-web-zip-'));
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of zipFolder(folder)) {
          chunks.push(chunk);
        }
        const bytes = Buffer.concat(chunks);
        bytes[bytes.indexOf('Unicode name') + 3] ^= 0xff;
        const zipPath = join(work, 'corrupt.zip');
        await writeFile(zipPath, bytes);
        await assert.rejects(assertUnzipAccepts(zipPath));
      } finally {
        await rm(work, { recursive: true, force: true });
      }
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

describe('file-store changes keep the music index in sync', () => {
  let server: TestServer;

  before(async () => {
    server = await createTestServer((app, mountPath) => {
      app.use('/file-store', fileStoreRoute(mountPath));
      app.use('/music', musicRoute(mountPath));
    });
  });

  after(() => server.close());

  async function post(url: string, body: unknown) {
    const res = await fetch(`${server.baseUrl}${url}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal(res.status, 200);
  }

  async function scan() {
    await post('/music/music-index/scan?force=true', {});
  }

  async function indexedTracks(): Promise<
    Array<{
      path: string;
      title: string | null;
      folderArtworkPath: string | null;
    }>
  > {
    const res = await fetch(`${server.baseUrl}/music/music-index`);
    const { tracks } = await res.json();
    return tracks.sort((a: { path: string }, b: { path: string }) =>
      a.path.localeCompare(b.path),
    );
  }

  async function indexedPaths() {
    return (await indexedTracks()).map((track) => track.path);
  }

  async function writeTrack(path: string, title: string) {
    await mkdir(join(server.mountDir, path, '..'), { recursive: true });
    await writeFile(join(server.mountDir, path), buildMp3WithTags({ title }));
  }

  it(
    'removes a deleted track and everything under a deleted folder',
    withLogs([], async () => {
      await writeTrack('delete/keep.mp3', 'Keep');
      await writeTrack('delete/single.mp3', 'Single');
      await writeTrack('delete/album/one.mp3', 'One');
      await writeTrack('delete/album/two.mp3', 'Two');
      await scan();

      await post('/file-store/delete', { targetPath: '/delete/single.mp3' });
      assert.deepEqual(await indexedPaths(), [
        '/delete/album/one.mp3',
        '/delete/album/two.mp3',
        '/delete/keep.mp3',
      ]);

      await post('/file-store/delete', { targetPath: '/delete/album' });
      assert.deepEqual(await indexedPaths(), ['/delete/keep.mp3']);
    }),
  );

  it(
    'keeps metadata when a track or folder is renamed',
    withLogs([], async () => {
      await writeTrack('rename/old-name.mp3', 'Old Name');
      await writeTrack('rename/Album/one.mp3', 'One');
      await scan();

      await post('/file-store/move', {
        fromPath: '/rename/old-name.mp3',
        toPath: '/rename/new-name.mp3',
      });
      await post('/file-store/move', {
        fromPath: '/rename/Album',
        toPath: '/rename/Renamed',
      });

      const tracks = (await indexedTracks()).filter((track) =>
        track.path.startsWith('/rename/'),
      );
      assert.deepEqual(
        tracks.map((track) => [track.path, track.title]),
        [
          ['/rename/new-name.mp3', 'Old Name'],
          ['/rename/Renamed/one.mp3', 'One'],
        ],
      );
    }),
  );

  it(
    'drops a track renamed to a non-audio file and adds one renamed to audio',
    withLogs([], async () => {
      await writeTrack('ext/song.mp3', 'Song');
      await writeFile(join(server.mountDir, 'ext/hidden.txt'), '');
      await writeFile(
        join(server.mountDir, 'ext/later.txt'),
        buildMp3WithTags({ title: 'Later' }),
      );
      await scan();

      await post('/file-store/move', {
        fromPath: '/ext/song.mp3',
        toPath: '/ext/song.txt',
      });
      await post('/file-store/move', {
        fromPath: '/ext/later.txt',
        toPath: '/ext/later.mp3',
      });

      const tracks = (await indexedTracks()).filter((track) =>
        track.path.startsWith('/ext/'),
      );
      assert.deepEqual(
        tracks.map((track) => [track.path, track.title]),
        [['/ext/later.mp3', 'Later']],
      );
    }),
  );

  it(
    'follows folder artwork when a track moves to another folder',
    withLogs([], async () => {
      await writeTrack('art/a/song.mp3', 'Song');
      await mkdir(join(server.mountDir, 'art/b'), { recursive: true });
      await writeFile(join(server.mountDir, 'art/b/cover.jpg'), MINIMAL_JPEG);
      await scan();

      await post('/file-store/move', {
        fromPath: '/art/a/song.mp3',
        toPath: '/art/b/song.mp3',
      });

      const [track] = (await indexedTracks()).filter((t) =>
        t.path.startsWith('/art/'),
      );
      assert.equal(track.path, '/art/b/song.mp3');
      assert.equal(track.folderArtworkPath, '/art/b/cover.jpg');
    }),
  );

  it(
    'indexes uploaded audio and replaces the entry when it is overwritten',
    withLogs([], async () => {
      await writeTrack('upload/existing.mp3', 'Existing');
      await scan();

      await saveBlob(
        server.baseUrl,
        '/upload/new.mp3',
        buildMp3WithTags({ title: 'New' }),
        'add',
      );
      await saveBlob(
        server.baseUrl,
        '/upload/existing.mp3',
        buildMp3WithTags({ title: 'Replaced' }),
      );

      const tracks = (await indexedTracks()).filter((track) =>
        track.path.startsWith('/upload/'),
      );
      assert.deepEqual(
        tracks.map((track) => [track.path, track.title]),
        [
          ['/upload/existing.mp3', 'Replaced'],
          ['/upload/new.mp3', 'New'],
        ],
      );
    }),
  );

  it(
    'ignores hidden folders such as the staging pool',
    withLogs([], async () => {
      await scan();
      const before = await indexedPaths();

      await saveBlob(
        server.baseUrl,
        '/.music-staging/staged.mp3',
        buildMp3WithTags({ title: 'Staged' }),
        'add',
      );

      assert.deepEqual(await indexedPaths(), before);
    }),
  );

  it(
    'updates folder artwork when it is uploaded or deleted',
    withLogs([], async () => {
      await writeTrack('cover/song.mp3', 'Song');
      await scan();

      await saveBlob(server.baseUrl, '/cover/cover.jpg', MINIMAL_JPEG, 'add');
      let [track] = (await indexedTracks()).filter((t) =>
        t.path.startsWith('/cover/'),
      );
      assert.equal(track.folderArtworkPath, '/cover/cover.jpg');

      await post('/file-store/delete', { targetPath: '/cover/cover.jpg' });
      [track] = (await indexedTracks()).filter((t) =>
        t.path.startsWith('/cover/'),
      );
      assert.equal(track.folderArtworkPath, null);
    }),
  );

  it(
    'does not lose entries when many uploads run at once',
    withLogs([], async () => {
      await scan();
      const names = Array.from({ length: 8 }, (_, i) => `/burst/${i}.mp3`);
      await Promise.all(
        names.map((name, i) =>
          saveBlob(
            server.baseUrl,
            name,
            buildMp3WithTags({ title: `Burst ${i}` }),
            'add',
          ),
        ),
      );
      const paths = await indexedPaths();
      assert.deepEqual(
        paths.filter((path) => path.startsWith('/burst/')),
        names,
      );
    }),
  );
});
