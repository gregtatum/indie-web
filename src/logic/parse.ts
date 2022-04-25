import * as T from 'src/@types';

const normalizeDirectives = new Map([
  ['t', 'title'],
  ['st', 'subtitle'],
]);

export function validateChord(chord: string): boolean {
  if (chord === '') {
    return false;
  }
  return true;
  // if (chord.
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

    const result: { type: 'line'; text: T.TextOrChord[]; hasChords: boolean } =
      {
        type: 'line',
        text: [],
        hasChords: false,
      };
    let text = '';
    let chord = '';
    let inChord = false;
    for (let i = 0; i < line.length; i++) {
      const letter = line[i];
      if (letter === '[') {
        if (inChord) {
          // Already in a chord, abandon in.
          text += '[' + chord;
          chord = '';
        }
        inChord = true;
        continue;
      }
      if (letter === ']' && inChord) {
        if (validateChord(chord)) {
          result.text.push({ type: 'text', text });
          result.text.push({ type: 'chord', text: chord });
          result.hasChords = true;
          text = '';
        } else {
          text = `${text}[${chord}]`;
        }
        chord = '';
        inChord = false;
        continue;
      }
      if (inChord) {
        chord += letter;
      } else {
        text += letter;
      }
    }
    if (chord) {
      text += '[' + chord;
    }
    if (text) {
      result.text.push({ type: 'text', text });
    }
    lines.push(result);
  }
  return { directives, lines };
}
