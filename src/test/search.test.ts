import { type ParsedSearch, parseSearchString } from 'src/logic/search';

describe('search', () => {
  function assertParsedSearch(search: string, result: ParsedSearch) {
    expect(parseSearchString(search)).toEqual(result);
  }

  it('can search for all files', () => {
    assertParsedSearch('Final Fantasy VII', {
      query: ['final', 'fantasy', 'vii'],
    });
    assertParsedSearch('    Final      Fantasy     VII   ', {
      query: ['final', 'fantasy', 'vii'],
    });
  });

  it('can handle double quotes', () => {
    assertParsedSearch('Rydia "Final Fantasy" VII', {
      query: ['rydia', 'final fantasy', 'vii'],
    });
    assertParsedSearch('Preserve "trailing whitespace " Ok?', {
      query: ['preserve', 'trailing whitespace ', 'ok?'],
    });
  });

  it('can search in a directory and folder', () => {
    assertParsedSearch('in:Gaming Final Fantasy VII', {
      inFolder: '/gaming/',
      query: ['final', 'fantasy', 'vii'],
    });
    assertParsedSearch('in:/Gaming Final Fantasy VII', {
      inFolder: '/gaming/',
      query: ['final', 'fantasy', 'vii'],
    });
    assertParsedSearch('in:Gaming/ Final Fantasy VII', {
      inFolder: '/gaming/',
      query: ['final', 'fantasy', 'vii'],
    });
    assertParsedSearch('Final in:/ Fantasy VII', {
      inFolder: '/',
      query: ['final', 'fantasy', 'vii'],
    });
    assertParsedSearch('Final in: Fantasy VII', {
      query: ['final', 'fantasy', 'vii'],
    });
    assertParsedSearch('path:Gaming Final Fantasy VII', {
      path: 'gaming',
      query: ['final', 'fantasy', 'vii'],
    });
  });

  it('can handle directive searches', () => {
    assertParsedSearch('in:Gaming key:Ebmaj artist:"Nobuo Uematsu"', {
      query: [],
      inFolder: '/gaming/',
      directives: {
        key: 'ebmaj',
        artist: 'nobuo uematsu',
      },
    });
  });

  it('can handle blank directive searches', () => {
    assertParsedSearch('key:""', {
      query: [],
      directives: {
        key: '',
      },
    });
  });
});
