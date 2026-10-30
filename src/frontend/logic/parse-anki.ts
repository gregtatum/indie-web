import * as T from 'frontend/@types';
import { marked } from 'marked';

const namedSeparators: Record<string, string> = {
  comma: ',',
  semicolon: ';',
  tab: '\t',
  space: ' ',
  pipe: '|',
  colon: ':',
};

// Anki tries to guess the separator from the file (see the Anki manual's
// "Text Files" import docs). We don't replicate that guessing here, and
// default to Semicolon instead, since Colon would collide with the "::"
// delimiter used by cloze deletions.
const defaultSeparator = ';';

/**
 * Parses Anki's plain text import format:
 * https://docs.ankiweb.net/importing/text-files.html
 *
 * Rows of fields are separated by a configurable separator, with optional
 * `#key:value` header lines at the top (Anki 2.1.54+) and bare `#` comment
 * lines ignored. Header lines must be consecutive at the very top of the
 * file; the first non-`#`-prefixed line starts the data rows.
 */
export function parseAnkiText(text: string): T.ParsedAnkiFile {
  const lines = text.split(/\r\n|\r|\n/);

  let dataStartLine = 0;
  const headerLines: string[] = [];
  while (
    dataStartLine < lines.length &&
    lines[dataStartLine].startsWith('#')
  ) {
    headerLines.push(lines[dataStartLine]);
    dataStartLine++;
  }

  const headers = parseHeaders(headerLines);
  const dataText = lines.slice(dataStartLine).join('\n');
  const rows = parseRows(dataText, headers.separator);
  const notes = buildNotes(rows, headers);

  return { headers, notes };
}

function parseHeaders(headerLines: string[]): T.AnkiHeaders {
  const rawHeaders = new Map<string, string>();
  for (const line of headerLines) {
    // #notetype: Cloze
    //  ^^^^^^^^  ^^^^^^   key and value, split on the first colon
    const result = /^#\s*([\w ]+?)\s*:\s*(.*)$/.exec(line);
    if (!result) {
      // A bare "# comment" line with no "key:value" shape is just ignored.
      continue;
    }
    const [, key, value] = result;
    rawHeaders.set(key.toLowerCase(), value);
  }

  const separator = resolveSeparator(rawHeaders.get('separator') ?? null);

  return {
    separator,
    html: rawHeaders.get('html')?.trim().toLowerCase() === 'true',
    tags: splitTags(rawHeaders.get('tags')),
    columns: rawHeaders.has('columns')
      ? (rawHeaders.get('columns') ?? '').split(separator)
      : null,
    notetype: rawHeaders.get('notetype')?.trim() ?? null,
    deck: rawHeaders.get('deck')?.trim() ?? null,
    notetypeColumn: parseColumnNumber(rawHeaders.get('notetype column')),
    deckColumn: parseColumnNumber(rawHeaders.get('deck column')),
    tagsColumn: parseColumnNumber(rawHeaders.get('tags column')),
    guidColumn: parseColumnNumber(rawHeaders.get('guid column')),
  };
}

function resolveSeparator(name: string | null): string {
  if (!name) {
    return defaultSeparator;
  }
  const trimmed = name.trim();
  return namedSeparators[trimmed.toLowerCase()] ?? trimmed;
}

function splitTags(value: string | undefined): string[] {
  return value?.trim().split(/\s+/).filter(Boolean) ?? [];
}

function parseColumnNumber(value: string | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  const num = Number(value.trim());
  return Number.isInteger(num) && num > 0 ? num : null;
}

/**
 * Parses CSV-like rows, honoring quoted fields that may contain the
 * separator, newlines, or escaped ("") double quotes. A quote is only
 * treated as opening a quoted field if it's the field's first character,
 * matching Anki's documented examples.
 */
function parseRows(text: string, separator: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  function endField() {
    row.push(field);
    field = '';
  }

  function endRow() {
    endField();
    rows.push(row);
    row = [];
  }

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          // "" is an escaped quote inside a quoted field.
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"' && field === '') {
      inQuotes = true;
      i++;
      continue;
    }

    if (ch === separator) {
      endField();
      i++;
      continue;
    }

    if (ch === '\n') {
      endRow();
      i++;
      continue;
    }

    field += ch;
    i++;
  }

  if (field !== '' || row.length > 0) {
    endRow();
  }

  return rows;
}

function buildNotes(rows: string[][], headers: T.AnkiHeaders): T.AnkiNote[] {
  const notes: T.AnkiNote[] = [];

  for (const row of rows) {
    if (row.length === 1 && row[0] === '') {
      // Skip blank lines in the data section.
      continue;
    }

    const fields: string[] = [];
    let tags = headers.tags;
    let notetype = headers.notetype;
    let deck = headers.deck;
    let guid: string | null = null;

    for (let i = 0; i < row.length; i++) {
      const columnNumber = i + 1;
      const value = row[i];
      if (columnNumber === headers.tagsColumn) {
        tags = splitTags(value);
      } else if (columnNumber === headers.notetypeColumn) {
        notetype = value.trim() || notetype;
      } else if (columnNumber === headers.deckColumn) {
        deck = value.trim() || deck;
      } else if (columnNumber === headers.guidColumn) {
        guid = value.trim() || null;
      } else {
        fields.push(value);
      }
    }

    const clozeSpans =
      notetype?.toLowerCase() === 'cloze' && fields[0] !== undefined
        ? parseCloze(fields[0])
        : null;

    notes.push({ fields, clozeSpans, tags, notetype, deck, guid });
  }

  return notes;
}

// {{c1::Canberra}}
//   ^^^              captures the cloze number
const matchClozeStart = /^\{\{c(\d+)::/;

/**
 * Parses Anki-style cloze deletion syntax out of a block of text (e.g. a
 * Cloze note's Text field).
 *
 *   The {{c1::mitochondria}} is the {{c2::powerhouse::hint}} of the cell.
 *
 * Nested cloze deletions (Anki 2.1.56+) are not supported. A nested
 * {{c1::outer {{c2::inner}}}} only recognizes the inner cloze, leaving the
 * outer `{{c1::` and trailing `}}` as literal text.
 */
export function parseCloze(text: string): T.TextOrCloze[] {
  const spans: T.TextOrCloze[] = [];
  let plainText = '';
  let i = 0;
  while (i < text.length) {
    if (text.startsWith('{{c', i)) {
      const cloze = matchClozeAt(text, i);
      if (cloze) {
        if (plainText) {
          spans.push({ type: 'text', text: plainText });
          plainText = '';
        }
        spans.push(cloze.span);
        i = cloze.end;
        continue;
      }
    }
    plainText += text[i];
    i++;
  }
  if (plainText || spans.length === 0) {
    spans.push({ type: 'text', text: plainText });
  }
  return spans;
}

/**
 * Attempts to match a single {{cN::answer}} or {{cN::answer::hint}} span
 * starting at `start`. Returns null if this isn't a well-formed, closed,
 * non-nested cloze deletion, so the caller can fall back to literal text.
 */
function matchClozeAt(
  text: string,
  start: number,
): { span: T.TextOrCloze; end: number } | null {
  const headerResult = matchClozeStart.exec(text.slice(start));
  if (!headerResult) {
    return null;
  }
  const [header, numText] = headerResult;
  const contentStart = start + header.length;

  // {{c1::Canberra}}
  //               ^^   find the end of the cloze
  const end = text.indexOf('}}', contentStart);
  if (end === -1) {
    return null;
  }

  const content = text.slice(contentStart, end);
  if (content.includes('{{c')) {
    // Nested cloze deletions are not supported.
    return null;
  }

  // {{c1::Canberra::capital city}}
  //              ^^                 split the answer from the hint
  const hintIndex = content.indexOf('::');
  const answer = hintIndex === -1 ? content : content.slice(0, hintIndex);
  const hint = hintIndex === -1 ? null : content.slice(hintIndex + 2);

  return {
    span: { type: 'cloze', num: Number(numText), answer, hint },
    end: end + 2,
  };
}

/**
 * Parses a markdown document to HTML. A ```anki fenced code block is
 * replaced with a placeholder div (keyed by `data-anki-id`) so the caller
 * can mount a real renderer for it; the parsed block data for each one is
 * returned alongside the HTML.
 */
export function parseMarkdown(text: string): T.ParsedMarkdown {
  const ankiBlocks: T.ParsedAnkiFile[] = [];
  const renderer = new marked.Renderer();
  const defaultCode = renderer.code.bind(renderer);
  renderer.code = (code, infostring, escaped) => {
    if (infostring !== 'anki') {
      return defaultCode(code, infostring, escaped);
    }
    const id = ankiBlocks.length;
    ankiBlocks.push(parseAnkiText(code));
    return `<div class="anki-mount" data-anki-id="${id}"></div>`;
  };

  const htmlText = marked.parse(text, {
    async: false,
    pedantic: false,
    // Github Flavored Markdown
    gfm: true,
    renderer,
  });
  if (typeof htmlText !== 'string') {
    throw new Error('Expected a string.');
  }
  return { htmlText, ankiBlocks };
}
