import { pathJoin } from 'src/utils';

describe('pathJoin', () => {
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
});
