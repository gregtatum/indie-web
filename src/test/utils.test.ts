import {
  canonicalizePath,
  getPathFileName,
  getPathFileNameNoExt,
  getPathFolder,
  pathJoin,
} from 'src/utils';

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
    expect(getPathFolder('/Songs/Hey Jude.chopro')).toEqual('/Songs');
    expect(getPathFolder('/Hey Jude.chopro')).toEqual('/');
  });

  it('gets path file names with no extension', () => {
    expect(getPathFileNameNoExt('/Songs/Hey Jude.chopro')).toEqual('Hey Jude');
    expect(getPathFileNameNoExt('/Hey Jude.chopro')).toEqual('Hey Jude');
    expect(getPathFileNameNoExt('/Hey Jude.zip')).toEqual('Hey Jude');
  });
});
