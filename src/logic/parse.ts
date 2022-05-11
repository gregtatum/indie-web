import * as T from 'src/@types';
import { ensureExists } from 'src/utils';

const normalizeDirectives = new Map([
  ['t', 'title'],
  ['st', 'subtitle'],
]);

const extensions = new Set([
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
  '7alt',
  '9',
  '9+',
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
]);

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

export function parseChord(text: string): T.Chord | null {
  if (text === '') {
    return null;
  }
  text = text.trim();
  const baseNoteResult = text.match(/^([A-G][b#]?)/);
  //                                 ^                 match the beginning
  //                                  (          )     capture
  //                                   [A-G]           capital A-G
  //                                        [b#]?      flat or sharp
  if (!baseNoteResult) {
    return null;
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
    //           ^                 match the beginning
    //            (          )     capture
    //             [A-G]           capital A-G
    //                  [b#]?      flat or sharp
    if (!result) {
      // Invalid slash chord.
      return null;
    }
    chord.slash = ensureNote(result[1]);
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

  if (rest.includes('+')) {
    if (chord.type === 'minor') {
      return null;
    }
    chord.type = 'augmented';
    rest = rest.replace('+', '');
  }

  if (rest === 'sus2') {
    chord.type = 'sus2';
    rest = '';
  }

  if (rest === 'sus' || rest === 'sus4') {
    if (chord.type !== 'major') {
      return null;
    }
    chord.type = 'sus4';
    rest = '';
  }

  if (extensions.has(rest)) {
    chord.embellishment = rest;
    rest = '';
  }

  if (rest.match(/^\d+$/)) {
    chord.embellishment = rest;
    rest = '';
  }

  if (rest.trim()) {
    return null;
  }

  return chord;
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
  const directives: { [directive: string]: string } = {};
  const lines: T.LineType[] = [];

  for (const line of text.split('\n')) {
    const metaResult = matchMeta.exec(line);
    if (metaResult) {
      const [, key, value] = metaResult;
      const directive = normalizeDirectives.get(key) || key;
      directives[directive] = value;
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
