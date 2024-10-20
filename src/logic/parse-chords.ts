import * as T from 'src/@types';
import { ensureExists } from 'src/utils';

const normalizeDirectives = new Map([
  ['t', 'title'],
  ['st', 'subtitle'],
  ['img', 'image'],
  // https://www.chordpro.org/chordpro/directives-comment/
  ['c', 'comment'],
  ['comment_box', 'comment'],
  ['comment_italic', 'comment'],
  ['ci', 'comment'],
  ['highlight', 'comment'],
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

  const lineTexts = text.split('\n');
  for (let lineIndex = 0; lineIndex < lineTexts.length; lineIndex++) {
    const lineText = lineTexts[lineIndex];
    const metaResult = matchMeta.exec(lineText);
    if (metaResult) {
      const [, keyCased, value] = metaResult;
      const key = keyCased.toLowerCase();
      const directive = normalizeDirectives.get(key) || key;
      switch (directive) {
        case 'image': {
          const { src } = parseAttributes(value);
          if (src) {
            lines.push({ type: directive, src: src ?? '', lineIndex });
          }
          break;
        }
        case 'audio': {
          const { src, mimetype } = parseAttributes(value);
          if (src) {
            lines.push({
              type: directive,
              src: src ?? '',
              lineIndex,
              mimetype: mimetype ?? 'audio/mp3',
            });
          }
          break;
        }
        case 'video': {
          const { src, mimetype } = parseAttributes(value);
          if (src) {
            lines.push({
              type: directive,
              src: src ?? '',
              lineIndex,
              mimetype: mimetype ?? '',
            });
          }
          break;
        }
        case 'comment':
          lines.push({
            type: 'comment',
            text: value,
            italic: key === 'comment_italic' || key === 'ci',
            lineIndex,
          });
          break;
        default:
          directives[directive] = value;
      }
      continue;
    }
    const linkResult = matchLink.exec(lineText);
    if (linkResult) {
      lines.push({ type: 'link', href: lineText.trim(), lineIndex });
      continue;
    }

    const sectionResult = matchSection.exec(lineText);
    if (sectionResult) {
      const lastLine = lines[lines.length - 1];
      if (lastLine?.type === 'space') {
        lines.pop();
      }
      lines.push({ type: 'section', text: lineText, lineIndex });
      continue;
    }

    if (!lineText.trim()) {
      const lastLine = lines[lines.length - 1];
      if (lastLine?.type !== 'section') {
        lines.push({ type: 'space', lineIndex });
      }
      continue;
    }

    const spans: T.TextOrChord[] = [];
    let text = '';
    let chordText = '';
    let inChord = false;
    for (let i = 0; i < lineText.length; i++) {
      const letter = lineText[i];
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
          lineIndex,
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

export class SongKey {
  display: string;
  key: T.SongKeyLetters;
  minor: boolean;

  /**
   * Do not construct this directly, use "fromRaw".
   */
  constructor(display: string, key: T.SongKeyLetters, minor: boolean) {
    this.display = display;
    this.key = key;
    this.minor = minor;
  }

  static fromRaw(text: string | null | undefined): SongKey | null {
    if (!text) {
      return null;
    }
    text = text.trim();

    let key = text;
    let minor = false;
    if (text[text.length - 1] === 'm') {
      minor = true;
      key = text.slice(0, text.length - 1);
    }
    switch (key) {
      case 'A':
      case 'A#':
      case 'Bb':
      case 'B':
      case 'C':
      case 'C#':
      case 'Db':
      case 'D':
      case 'D#':
      case 'Eb':
      case 'E':
      case 'F':
      case 'F#':
      case 'Gb':
      case 'G':
      case 'G#':
      case 'Ab':
        return new SongKey(text, key, minor);
      default:
        return null;
    }
  }
}

export function transposeParsedSong(
  song: T.ParsedChordPro,
  songKey: SongKey,
): T.ParsedChordPro {
  const originalKey = SongKey.fromRaw(song.directives.key);
  if (!originalKey) {
    return song;
  }

  const halfSteps = getHalfSteps(originalKey.key, songKey.key);
  if (halfSteps === 0) {
    return song;
  }

  const scaleToChord = sharpKeys.has(songKey.key)
    ? scaleToChordSharp
    : scaleToChordFlat;

  const lines = song.lines.map((line): T.LineType => {
    if (line.type !== 'line') {
      return line;
    }
    const spans = line.spans.map((span): T.TextOrChord => {
      if (span.type === 'text') {
        return span;
      }

      const { baseNote, chordText } = span.chord;
      if (!baseNote || !chordText) {
        return span;
      }

      const newChordText =
        transpose(
          scaleToChord,
          // TODO - Sort out the type issues here.
          baseNote as any,
          halfSteps,
        ) + chordText.slice(baseNote.length);

      const chord = { ...span.chord, chordText: newChordText };
      return {
        ...span,
        chord,
      };
    });
    return {
      ...line,
      spans,
    };
  });
  return { ...song, lines };
}

const halfStepScale: Record<T.SongKeyLetters, number> = {
  A: 0,
  'A#': 1,
  Bb: 1,
  B: 2,
  Cb: 2,
  C: 3,
  'C#': 4,
  Db: 4,
  D: 5,
  'D#': 6,
  Eb: 6,
  E: 7,
  F: 8,
  'F#': 9,
  Gb: 9,
  G: 10,
  'G#': 11,
  Ab: 11,
};

const sharpKeys = new Set<T.SongKeyLetters>(['G', 'D', 'A', 'E', 'B', 'F#']);
const _flatKeys = new Set<T.SongKeyLetters>([
  'C',
  'F',
  'Bb',
  'Eb',
  'Ab',
  'Db',
  'Gb',
]);

const scaleToChordSharp: Record<number, T.SongKeyLetters> = {
  0: 'A',
  1: 'A#',
  2: 'B',
  3: 'C',
  4: 'C#',
  5: 'D',
  6: 'D#',
  7: 'E',
  8: 'F',
  9: 'F#',
  10: 'G',
  11: 'G#',
};

const scaleToChordFlat: Record<number, T.SongKeyLetters> = {
  0: 'A',
  1: 'Bb',
  2: 'B',
  3: 'C',
  4: 'Db',
  5: 'D',
  6: 'Eb',
  7: 'E',
  8: 'F',
  9: 'Gb',
  10: 'G',
  11: 'Ab',
};

function getHalfSteps(
  base: T.SongKeyLetters,
  target: T.SongKeyLetters,
): number {
  return (12 + halfStepScale[target] - halfStepScale[base]) % 12;
}

function transpose(
  scaleToChord: Record<number, T.SongKeyLetters>,
  note: T.SongKeyLetters,
  halfSteps: number,
) {
  return scaleToChord[(halfStepScale[note] + halfSteps) % 12];
}
