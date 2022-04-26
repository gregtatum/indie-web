import * as T from 'src/@types';
import { ensureExists } from 'src/utils';

const normalizeDirectives = new Map([
  ['t', 'title'],
  ['st', 'subtitle'],
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

  if (rest === 'm' || rest === 'M' || rest.match(/^([mM])\d/)) {
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

  if (rest === 'sus' || rest === 'sus4') {
    if (chord.type !== 'major') {
      return null;
    }
    chord.type = 'sus4';
    rest = '';
  }

  if (rest === 'sus2') {
    chord.type = 'sus2';
    rest = '';
  }

  if (rest === 'maj7') {
    chord.embellishment = 'maj7';
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
      lines.push({ type: 'section', text: line });
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
