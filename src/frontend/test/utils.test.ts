import {
  canonicalizePath,
  getPathFileName,
  getPathFileNameNoExt,
  getDirName,
  pathJoin,
  randomUuid,
} from 'frontend/utils';
import { layoutColumns } from 'frontend/components/Music/column-resize';

describe('paths', () => {
  it('joins paths', () => {
    expect(pathJoin('foo', 'bar')).toEqual('foo/bar');
    expect(pathJoin('foo/bar', 'baz', 'bee')).toEqual('foo/bar/baz/bee');
    expect(pathJoin('foo/bar', '../baz', 'bee')).toEqual('foo/baz/bee');
    expect(pathJoin('foo/bar', '/baz', 'bee')).toEqual('foo/bar/baz/bee');
    expect(pathJoin('foo/bar', './baz', 'bee')).toEqual('foo/bar/baz/bee');
    expect(pathJoin('/foo/bar', '/baz/..')).toEqual('/foo/bar');
    expect(pathJoin('/foo/bar/')).toEqual('/foo/bar/');
    expect(pathJoin('/foo', 'bar/')).toEqual('/foo/bar/');
    expect(pathJoin('/foo', 'bar/.')).toEqual('/foo/bar');
  });

  it('canonicalizes paths', () => {
    const song = '/Songs/Hey Jude.chopro';
    expect(canonicalizePath('/Songs/Hey Jude.chopro')).toEqual(song);
    expect(canonicalizePath('Songs/Hey Jude.chopro')).toEqual(song);
    expect(canonicalizePath('/Songs/Subfolder/../Hey Jude.chopro')).toEqual(
      song,
    );
    expect(canonicalizePath('./Songs/./Hey Jude.chopro')).toEqual(song);
    expect(canonicalizePath('/../../Hey Jude.chopro')).toEqual(
      '/Hey Jude.chopro',
    );
  });

  it('gets path file names', () => {
    expect(getPathFileName('/Songs/Hey Jude.chopro')).toEqual(
      'Hey Jude.chopro',
    );
    expect(getPathFileName('/Hey Jude.chopro')).toEqual('Hey Jude.chopro');
  });

  it('gets path file names', () => {
    expect(getDirName('/Songs/Hey Jude.chopro')).toEqual('/Songs');
    expect(getDirName('/Hey Jude.chopro')).toEqual('/');
  });

  it('gets path file names with no extension', () => {
    expect(getPathFileNameNoExt('/Songs/Hey Jude.chopro')).toEqual('Hey Jude');
    expect(getPathFileNameNoExt('/Hey Jude.chopro')).toEqual('Hey Jude');
    expect(getPathFileNameNoExt('/Hey Jude.zip')).toEqual('Hey Jude');
  });
});

const order = ['artist', 'album'] as const;
type Key = (typeof order)[number];

function layout(
  stored: Record<Key, number>,
  referenceWidth: number,
  availableWidth: number,
) {
  return layoutColumns(
    [...order],
    stored,
    referenceWidth,
    availableWidth,
    60,
    100,
  );
}

describe('layoutColumns', () => {
  const stored = { artist: 200, album: 100 };

  it('returns the stored widths when the width matches the reference', () => {
    expect(layout(stored, 800, 800)).toEqual(stored);
  });

  it('scales proportionally with the available width', () => {
    expect(layout(stored, 800, 1600)).toEqual({ artist: 400, album: 200 });
    expect(layout(stored, 800, 600)).toEqual({ artist: 150, album: 75 });
  });

  it('restores the original sizing after narrowing and widening again', () => {
    const narrow = layout(stored, 800, 300);
    expect(narrow).not.toEqual(stored);
    expect(layout(stored, 800, 800)).toEqual(stored);
  });

  it('keeps the title at its minimum by shrinking columns by their slack', () => {
    const result = layout({ artist: 300, album: 100 }, 400, 400);
    expect(result.artist + result.album).toBeCloseTo(300);
    expect(result.album).toBeGreaterThanOrEqual(60);
    expect(result.artist).toBeGreaterThan(result.album);
  });

  it('floors every column at the minimum width', () => {
    expect(layout(stored, 800, 100)).toEqual({ artist: 60, album: 60 });
  });
});

describe('randomUuid', () => {
  const V4_UUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  it('makes version 4 UUIDs', () => {
    expect(randomUuid()).toMatch(V4_UUID);
  });

  it('still makes version 4 UUIDs when the page is not a secure context', () => {
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, 'randomUUID', {
      value: undefined,
      configurable: true,
    });
    try {
      expect(crypto.randomUUID).toBeUndefined();
      const ids = new Set(Array.from({ length: 100 }, randomUuid));
      expect(ids.size).toBe(100);
      for (const id of ids) {
        expect(id).toMatch(V4_UUID);
      }
    } finally {
      Object.defineProperty(crypto, 'randomUUID', {
        value: original,
        configurable: true,
      });
    }
  });
});
