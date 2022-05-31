import * as T from 'src/@types';
import { ensureExists } from 'src/utils';

const normalizeDirectives = new Map([
  ['t', 'title'],
  ['st', 'subtitle'],
]);

// Taken from: https://www.chordpro.org/chordpro/chordpro-chords/
const extensions = [
  '+',
  '2',
  '3',
  '4',
  '5',
  '6',
  '69',
  '7',
  '7-5',
  '7#5',
  '7#9',
  '7#9#5',
  '7#9b5',
  '7#9#11',
  '7b5',
  '7b9',
  '7b9#5',
  '7b9#9',
  '7b9#11',
  '7b9b13',
  '7b9b5',
  '7b9sus',
  '7b13',
  '7b13sus',
  '7-9',
  '7-9#11',
  '7-9#5',
  '7-9#9',
  '7-9-13',
  '7-9-5',
  '7-9sus',
  '711',
  '7#11',
  '7-13',
  '7-13sus',
  '7sus',
  '7susadd3',
  '7+',
  '+7',
  '7alt',
  '9',
  '9+',
  '+9',
  '9#5',
  '9b5',
  '9-5',
  '9sus',
  '9add6',
  'maj7',
  'maj711',
  'maj7#11',
  'maj13',
  'maj7#5',
  'maj7sus2',
  'maj7sus4',
  '^7',
  '^711',
  '^7#11',
  '^7#5',
  '^7sus2',
  '^7sus4',
  'maj9',
  'maj911',
  '^9',
  '^911',
  '^13',
  '^9#11',
  '11',
  '911',
  '9#11',
  '13',
  '13#11',
  '13#9',
  '13b9',
  'alt',
  'add2',
  'add4',
  'add9',
  'sus2',
  'sus4',
  'sus9',
  '6sus2',
  '6sus4',
  '7sus2',
  '7sus4',
  '13sus2',
  '13sus4',
];

function noteOrNull(v: string): T.Note | null {
  // prettier-ignore
  switch (v) {
    case 'A': case 'Ab': case 'A#':
    case 'B': case 'Bb': case 'B#':
    case 'C': case 'Cb': case 'C#':
    case 'D': case 'Db': case 'D#':
    case 'E': case 'Eb': case 'E#':
    case 'F': case 'Fb': case 'F#':
    case 'G': case 'Gb': case 'G#':
      return v;
    default:
      return null;
  }
}

function ensureNote(v: string): T.Note {
  return ensureExists(noteOrNull(v), 'expected note');
}

export function parseChord(text: string): T.Chord {
  const chord = parseChordImpl(text);
  if (chord.baseNote?.length) {
    if (chord.extras?.length) {
      chord.chordText = text.slice(0, -chord.extras.length);
    } else {
      chord.chordText = text.trim();
    }
  }
  return chord;
}
function parseChordImpl(text: string): T.Chord {
  text = text.trim();
  if (text === '') {
    return { text, extras: text };
  }
  const baseNoteResult = text.match(/^([A-G][b#]?)/);
  //                                 ^                 match the beginning
  //                                  (          )     capture
  //                                   [A-G]           capital A-G
  //                                        [b#]?      flat or sharp
  if (!baseNoteResult) {
    return {
      text,
      extras: text,
    };
  }
  const [, baseNote] = baseNoteResult;
  // eslint-disable-next-line prefer-const
  let [rest, slash] = text.slice(baseNote.length).split('/');
  const chord: T.Chord = {
    text: text,
    type: 'major',
    baseNote: ensureNote(baseNote),
  };
  if (slash) {
    const result = slash.match(/^([A-G][b#]?)\s*$/);
    //                          ^                 match the beginning
    //                           (          )     capture
    //                            [A-G]           capital A-G
    //                                 [b#]?      flat or sharp
    if (result) {
      // Invalid slash chord.
      chord.slash = ensureNote(result[1]);
    }
  }
  const addResult = rest.match(/(add\d+)$/);
  if (addResult) {
    chord.add = addResult[1];
    rest = rest.slice(0, rest.length - chord.add.length);
  }

  if (
    (rest.startsWith('m') || rest.startsWith('M') || rest.startsWith('-')) &&
    !rest.toLowerCase().startsWith('maj') &&
    !rest.toLowerCase().startsWith('mj')
  ) {
    chord.type = 'minor';
    rest = rest.slice(1);
  }

  if (rest === 'sus2') {
    chord.type = 'sus2';
    rest = '';
  }

  if (rest === 'sus' || rest === 'sus4') {
    if (chord.type !== 'major') {
      chord.extras = rest;
      return chord;
    }
    chord.type = 'sus4';
    rest = '';
  }

  let longestMatch = '';
  for (const extension of extensions) {
    if (rest.startsWith(extension)) {
      if (extension.length > longestMatch.length) {
        longestMatch = extension;
      }
    }
  }
  if (longestMatch.length > 0) {
    if (longestMatch.includes('+')) {
      chord.type = 'augmented';
    }
    chord.embellishment = longestMatch;
    rest = rest.slice(longestMatch.length);
  }

  if (rest.trim()) {
    chord.extras = rest;
  }

  return chord;
}

export class Parser {
  text: string;
  index = 0;
  constructor(text: string) {
    this.text = text;
  }

  next(): string | undefined {
    return this.text[this.index++];
  }

  peek(): string | undefined {
    return this.text[this.index];
  }

  skipWhitespace() {
    while (this.peek() === ' ' || this.peek() === '\t') {
      this.next();
    }
  }

  alphaNumeric(): string | null {
    let string = '';
    let ch = this.peek();
    while (ch !== undefined && isAsciiAlphaNumeric(ch)) {
      string += ch;
      this.next();
      ch = this.peek();
    }
    if (string.length === 0) {
      return null;
    }
    return string;
  }

  escaped(surrounding: string, escaped: string): string | null {
    let text = '';
    let isEscaped = false;
    const n = this.next();
    if (n !== surrounding) {
      return null;
    }
    let ch = this.next();
    while (ch !== undefined) {
      if (ch === escaped) {
        if (!isEscaped) {
          // {image: alt="My \\/alentine"}
          //                 ^
          isEscaped = true;
          ch = this.next();
          continue;
        }
        // {image: alt="My \\/alentine"}
        //                  ^
        isEscaped = false;
      }
      if (ch === surrounding) {
        if (!isEscaped) {
          return text;
        }
        isEscaped = false;
      }
      text += ch;
      ch = this.next();
    }
    return null;
  }
}

/**
 * Parse a directive's attributes.
 *
 * {image: src="path/to/file.png"}
 *        ^ starts here
 */
export function parseAttributes(text: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const parser = new Parser(text);
  while (parser.peek() !== undefined) {
    // {image: src="path/to/file.png"}
    //        ^
    parser.skipWhitespace();

    // {image: src="path/to/file.png"}
    //                               ^
    if (parser.peek() === '}') {
      break;
    }

    // {image: src="path/to/file.png"}
    //         ^^^
    const key = parser.alphaNumeric();
    if (!key) {
      break;
    }

    // {image: src = "path/to/file.png"}
    //            ^
    parser.skipWhitespace();
    // {image: src = "path/to/file.png"}
    //             ^
    if (parser.next() !== '=') {
      break;
    }
    // {image: src = "path/to/file.png"}
    //              ^
    parser.skipWhitespace();
    // {image: src = "path/to/file.png"}
    //               ^
    const value = parser.escaped('"', '\\');
    if (value === null) {
      break;
    }
    attributes[key] = value;
  }
  return attributes;
}

export function parseChordPro(text: string): T.ParsedChordPro {
  // {t:I Am a Man of Constant Sorrow}
  const matchMeta = /^\s*\{\s*(.*)\s*:\s*(.*)\s*\}\s*$/;
  //                 ^                               $    start and end
  //                  \s*                         \s*     whitespace
  //                     \{                     \}        match the {} attribute
  //                       \s*    \s* \s*    \s*          whitespace
  //                          (.*)       (.*)             get the key and value
  //                                 :                    between the colon
  const matchSection = /^\s*(.*):\s*$/;
  //                    ^           $                     start and end
  //                     \s*     \s*                      whitespace
  //                        (.*)                          contents
  //                            :                         end colon
  const matchLink = /^https?:\/\//;
  //                 ^                                    just start
  //                  http                                http
  //                      s?                              maybe s
  //                        :\/\/                         ://
  const directives: { [directive: string]: string } = {};
  const lines: T.LineType[] = [];

  for (const line of text.split('\n')) {
    const metaResult = matchMeta.exec(line);
    if (metaResult) {
      const [, key, value] = metaResult;
      const directive = normalizeDirectives.get(key) || key;
      switch (directive) {
        case 'img':
        case 'image': {
          const { src } = parseAttributes(value);
          if (src) {
            lines.push({ type: 'image', src });
          }
          break;
        }
        default:
          directives[directive] = value;
      }
      continue;
    }
    const linkResult = matchLink.exec(line);
    if (linkResult) {
      lines.push({ type: 'link', href: line.trim() });
      continue;
    }

    const sectionResult = matchSection.exec(line);
    if (sectionResult) {
      const lastLine = lines[lines.length - 1];
      if (lastLine?.type === 'space') {
        lines.pop();
      }
      lines.push({ type: 'section', text: line });
      continue;
    }

    if (!line.trim()) {
      const lastLine = lines[lines.length - 1];
      if (lastLine?.type !== 'section') {
        lines.push({ type: 'space' });
      }
      continue;
    }

    const spans: T.TextOrChord[] = [];
    let text = '';
    let chordText = '';
    let inChord = false;
    for (let i = 0; i < line.length; i++) {
      const letter = line[i];
      if (letter === '[') {
        if (inChord) {
          // Already in a chord, abandon in.
          text += '[' + chordText;
          chordText = '';
        }
        inChord = true;
        continue;
      }
      if (letter === ']' && inChord) {
        const chord = parseChord(chordText);
        if (chord) {
          spans.push({ type: 'text', text });
          spans.push({ type: 'chord', chord });
          text = '';
        } else {
          text = `${text}[${chordText}]`;
        }
        chordText = '';
        inChord = false;
        continue;
      }
      if (inChord) {
        chordText += letter;
      } else {
        text += letter;
      }
    }
    if (chordText) {
      text += '[' + chordText;
    }
    spans.push({ type: 'text', text });
    if (spans.length > 0) {
      let hasChords = false;
      let hasText = false;
      for (const span of spans) {
        if (span.type === 'text' && span.text.trim()) {
          hasText = true;
        }
        if (span.type === 'chord') {
          hasChords = true;
        }
      }
      let content: T.LineContent = 'text';
      if (hasChords && hasText) {
        content = 'mixed';
      } else if (hasChords) {
        content = 'chords';
      }
      if (hasChords || hasText) {
        // Exclude whitespace
        lines.push({
          type: 'line',
          spans,
          content,
        });
      }
    }
  }
  return { directives, lines };
}

function isAsciiAlphaNumeric(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return (
    // numeric (0-9)
    (code > 47 && code < 58) ||
    // upper alpha (A-Z)
    (code > 64 && code < 91) ||
    // lower alpha (a-z)
    (code > 96 && code < 123)
  );
}
