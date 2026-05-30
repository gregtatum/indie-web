import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MountPath, ClientError } from '../utils.ts';

const mountPath = new MountPath('/fake/mount');

const ESCAPE_PATHS = [
  {
    path: '..',
    label: 'bare double-dot',
  },
  {
    path: '../foo',
    label: 'sibling escape',
  },
  {
    path: '../../etc/passwd',
    label: 'deep escape',
  },
  {
    path: '/../etc/passwd',
    label: 'absolute path with immediate traversal',
  },
  {
    path: '/../..',
    label: 'absolute path with double leading traversal',
  },
  {
    path: '/foo/../../../etc/passwd',
    label: 'embedded traversal past mount root',
  },
  {
    path: '/foo/bar/../../../..',
    label: 'deep embedded traversal',
  },
] as const;

describe('MountPath.resolve', () => {
  describe('escape attempts', () => {
    for (const { path, label } of ESCAPE_PATHS) {
      it(`returns null for ${label}: ${JSON.stringify(path)}`, () => {
        assert.equal(mountPath.resolve(path), null);
      });
    }
  });

  describe('valid paths', () => {
    it('resolves a simple absolute path', () => {
      assert.equal(mountPath.resolve('/foo'), '/fake/mount/foo');
    });

    it('prepends leading slash when missing', () => {
      assert.equal(mountPath.resolve('foo'), '/fake/mount/foo');
    });

    it('resolves a dotted relative path ./foo/bar', () => {
      assert.equal(mountPath.resolve('./foo/bar'), '/fake/mount/foo/bar');
    });

    it('normalizes trailing slash on ./foo/bar/', () => {
      assert.equal(mountPath.resolve('./foo/bar/'), '/fake/mount/foo/bar');
    });

    it('resolves a nested path /foo/bar', () => {
      assert.equal(mountPath.resolve('/foo/bar'), '/fake/mount/foo/bar');
    });

    it('normalizes /foo/../bar to /fake/mount/bar', () => {
      assert.equal(mountPath.resolve('/foo/../bar'), '/fake/mount/bar');
    });

    it('allows /foo/.. which resolves to the mount root', () => {
      assert.equal(mountPath.resolve('/foo/..'), '/fake/mount');
    });

    it('resolves root / to the mount itself', () => {
      assert.equal(mountPath.resolve('/'), '/fake/mount');
    });

    it('resolves empty string to the mount itself', () => {
      assert.equal(mountPath.resolve(''), '/fake/mount');
    });

    it('adds trailing slash when expectedFolder is true', () => {
      assert.equal(mountPath.resolve('/foo', true), '/fake/mount/foo/');
    });

    it('adds trailing slash on mount root when expectedFolder is true', () => {
      assert.equal(mountPath.resolve('/', true), '/fake/mount/');
    });
  });
});

describe('MountPath.joinOnMount', () => {
  describe('escape attempts', () => {
    for (const { path, label } of ESCAPE_PATHS) {
      it(`returns null for ${label}: ${JSON.stringify(path)}`, () => {
        assert.equal(mountPath.joinOnMount(path), null);
      });
    }
  });

  describe('valid paths', () => {
    it('joins a simple segment', () => {
      assert.equal(mountPath.joinOnMount('foo'), '/fake/mount/foo');
    });

    it('joins a nested segment', () => {
      assert.equal(mountPath.joinOnMount('foo/bar'), '/fake/mount/foo/bar');
    });

    it('joins a dotted relative segment ./foo', () => {
      assert.equal(mountPath.joinOnMount('./foo'), '/fake/mount/foo');
    });

    it('normalizes foo/bar/.. to /fake/mount/foo (stays inside)', () => {
      assert.equal(mountPath.joinOnMount('foo/bar/..'), '/fake/mount/foo');
    });

    it('returns mount itself for empty string', () => {
      assert.equal(mountPath.joinOnMount(''), '/fake/mount');
    });

    it('returns mount itself for single dot', () => {
      assert.equal(mountPath.joinOnMount('.'), '/fake/mount');
    });
  });
});

describe('MountPath.joinWithinMount', () => {
  describe('escape attempts', () => {
    it('returns null when traversal escapes the mount: foo + ../../bar', () => {
      assert.equal(
        mountPath.joinWithinMount('/fake/mount/foo', '../../bar'),
        null,
      );
    });

    it('returns null when traversal escapes the mount: foo + ../..', () => {
      assert.equal(mountPath.joinWithinMount('/fake/mount/foo', '../..'), null);
    });

    it('returns null for a path entirely outside the mount', () => {
      assert.equal(mountPath.joinWithinMount('/other/path', 'foo'), null);
    });
  });

  describe('valid paths', () => {
    it('joins two paths within the mount', () => {
      assert.equal(
        mountPath.joinWithinMount('/fake/mount/foo', 'bar'),
        '/fake/mount/foo/bar',
      );
    });

    it('joins mount root with a child segment', () => {
      assert.equal(
        mountPath.joinWithinMount('/fake/mount', 'foo'),
        '/fake/mount/foo',
      );
    });

    it('returns the mount itself when given only the mount path', () => {
      assert.equal(mountPath.joinWithinMount('/fake/mount'), '/fake/mount');
    });

    it('normalizes trailing slash on the first segment', () => {
      assert.equal(
        mountPath.joinWithinMount('/fake/mount/', 'foo'),
        '/fake/mount/foo',
      );
    });
  });
});

describe('MountPath.toClientPath', () => {
  describe('outside mount', () => {
    it('returns null for a completely different path', () => {
      assert.equal(mountPath.toClientPath('/other/path'), null);
    });

    it('returns null for a path that is an ancestor of the mount', () => {
      assert.equal(mountPath.toClientPath('/fake'), null);
    });

    it('returns null for a path sharing the mount prefix but not a child', () => {
      assert.equal(mountPath.toClientPath('/fake/mountother'), null);
    });
  });

  describe('within mount', () => {
    it('strips the mount prefix from a direct child', () => {
      assert.equal(mountPath.toClientPath('/fake/mount/foo'), '/foo');
    });

    it('strips the mount prefix from a nested child', () => {
      assert.equal(mountPath.toClientPath('/fake/mount/foo/bar'), '/foo/bar');
    });

    it('returns an empty string for the mount root itself', () => {
      assert.equal(mountPath.toClientPath('/fake/mount'), '');
    });
  });
});

describe('MountPath.isEqualToMountPath', () => {
  it('returns true for the exact mount path', () => {
    assert.equal(mountPath.isEqualToMountPath('/fake/mount'), true);
  });

  it('returns true for the mount path with a trailing slash (resolve normalizes it)', () => {
    assert.equal(mountPath.isEqualToMountPath('/fake/mount/'), true);
  });

  it('returns true for a path that resolves to the mount: /fake/mount/foo/..', () => {
    assert.equal(mountPath.isEqualToMountPath('/fake/mount/foo/..'), true);
  });

  it('returns false for a child of the mount', () => {
    assert.equal(mountPath.isEqualToMountPath('/fake/mount/foo'), false);
  });

  it('returns false for a parent of the mount', () => {
    assert.equal(mountPath.isEqualToMountPath('/fake'), false);
  });

  it('returns false for /fake/mount/.. which resolves to /fake', () => {
    assert.equal(mountPath.isEqualToMountPath('/fake/mount/..'), false);
  });
});

describe('MountPath.makeError', () => {
  it('substitutes %s with the path in the message', () => {
    const err = mountPath.makeError(Error, 'Path not found: %s', '/foo');
    assert.equal(err.message, 'Path not found: /foo');
  });

  it('returns an instance of the given error class', () => {
    const err = mountPath.makeError(ClientError, 'Bad path: %s', '/bar');
    assert.ok(err instanceof ClientError);
    assert.equal(err.message, 'Bad path: /bar');
  });

  it('leaves message unchanged when there is no %s placeholder', () => {
    const err = mountPath.makeError(Error, 'Something went wrong', '/baz');
    assert.equal(err.message, 'Something went wrong');
  });
});

describe('MountPath.readdir and mountReaddir', () => {
  let tmpDir: string;
  let fsMp: MountPath;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'indie-web-mount-test-'));
    fsMp = new MountPath(tmpDir);
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('mountReaddir returns empty array for an empty mount', async () => {
    const entries = await fsMp.mountReaddir();
    assert.deepEqual(entries, []);
  });

  it('mountReaddir returns entries after a file is written', async () => {
    await writeFile(join(tmpDir, 'song.mp3'), 'data');
    const entries = await fsMp.mountReaddir();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].name, 'song.mp3');
  });

  it('readdir on the mount path itself returns the same result as mountReaddir', async () => {
    const via_readdir = await fsMp.readdir(tmpDir);
    const via_mountReaddir = await fsMp.mountReaddir();
    assert.deepEqual(
      via_readdir.map((e) => e.name),
      via_mountReaddir.map((e) => e.name),
    );
  });

  it('readdir returns entries from a valid subdirectory', async () => {
    const subDir = join(tmpDir, 'album');
    await mkdir(subDir);
    await writeFile(join(subDir, 'track.mp3'), 'data');
    const entries = await fsMp.readdir(subDir);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].name, 'track.mp3');
  });

  it('readdir returns empty array for a path outside the mount (security guard)', async () => {
    const entries = await fsMp.readdir(tmpdir());
    assert.deepEqual(entries, []);
  });

  it('readdir returns empty array for a non-existent path inside the mount', async () => {
    const entries = await fsMp.readdir(join(tmpDir, 'does-not-exist'));
    assert.deepEqual(entries, []);
  });
});

describe('MountPath.validate', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'indie-web-validate-test-'));
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('does not throw for a valid directory', () => {
    const validMp = new MountPath(tmpDir);
    assert.doesNotThrow(() => validMp.validate());
  });

  it('throws for a path pointing to a regular file', async () => {
    const filePath = join(tmpDir, 'not-a-dir.txt');
    await writeFile(filePath, 'hello');
    const fileMp = new MountPath(filePath);
    assert.throws(() => fileMp.validate());
  });

  it('throws for a non-existent path', () => {
    const missingMp = new MountPath(join(tmpDir, 'no-such-dir'));
    assert.throws(() => missingMp.validate());
  });
});
