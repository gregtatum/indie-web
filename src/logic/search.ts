export interface ParsedSearch {
  query: string[];
  inFolder?: string;
  path?: string;
  directives?: Record<string, string>;
}

/**
 * Transform the raw search string into a parsed structure. This search can be used
 * on file listings and the FilesIndex.
 */
export function parseSearchString(search: string): ParsedSearch | null {
  if (!search) {
    return null;
  }
  const parsedSearch: ParsedSearch = { query: [] };

  function handleDirective(prefix: string, postfix: string) {
    switch (prefix) {
      case 'in': {
        // Canonicalize the folder path form to always start with '/' and end in '/'
        if (postfix[0] !== '/') {
          postfix = '/' + postfix;
        }
        if (postfix[postfix.length - 1] !== '/' && postfix !== '/') {
          postfix = postfix + '/';
        }
        parsedSearch.inFolder = postfix;
        break;
      }
      case 'path':
        parsedSearch.path = postfix;
        break;
      default: {
        let { directives } = parsedSearch;
        if (!directives) {
          directives = {};
          parsedSearch.directives = directives;
        }
        directives[prefix] = postfix;
      }
    }
  }

  const quoteSegments = search.toLowerCase().split(`"`);
  let prevPrefix = null;
  for (let i = 0; i < quoteSegments.length; i++) {
    const segment = quoteSegments[i];
    if (segment === '' && !prevPrefix) {
      continue;
    }

    // Every other segment is a quoted segment, e.g.
    // `Rydia "Final Fantasy" VII`
    //         ^^^^^^^^^^^^^
    if (i % 2 === 1) {
      if (prevPrefix) {
        // This is a quoted directive.
        // `in:"Band Songs" Stairway to Heaven`
        //     ^^^^^^^^^^^^
        handleDirective(prevPrefix, segment);
      } else {
        parsedSearch.query.push(segment);
      }
      continue;
    }

    prevPrefix = null;

    // Split on whitespace for non-quoted segments
    for (const word of segment.split(/\s+/)) {
      // Determine if there is a "in:Gaming" style directive.
      const index = word.indexOf(':');
      if (index === -1) {
        // This is just a word.
        if (word !== '') {
          parsedSearch.query.push(word);
        }
        continue;
      }
      const prefix = word.slice(0, index);
      const postfix = word.slice(index + 1, word.length + 1);
      if (postfix) {
        handleDirective(prefix, postfix);
      } else {
        prevPrefix = prefix;
      }
    }
  }

  return parsedSearch;
}
