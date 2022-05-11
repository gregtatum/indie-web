import { parseChord, parseChordPro } from '../logic/parse';
import { stripIndent } from 'common-tags';

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

describe('parseChord', () => {
  it('parses basic chords', () => {
    expect(parseChord('A')).toEqual({
      baseNote: 'A',
      text: 'A',
      type: 'major',
    });

    expect(parseChord('G')).toEqual({
      baseNote: 'G',
      text: 'G',
      type: 'major',
    });

    expect(parseChord('Fm')).toEqual({
      baseNote: 'F',
      text: 'Fm',
      type: 'minor',
    });

    expect(parseChord('H')).toEqual(null);
  });

  it('parses slash chords', () => {
    expect(parseChord('G/F#')).toEqual({
      baseNote: 'G',
      text: 'G/F#',
      slash: 'F#',
      type: 'major',
    });
    expect(parseChord('Bb/Ab')).toEqual({
      baseNote: 'Bb',
      text: 'Bb/Ab',
      slash: 'Ab',
      type: 'major',
    });
  });

  it('parses 7th 9th etc chords', () => {
    expect(parseChord('A6')).toEqual({
      baseNote: 'A',
      text: 'A6',
      type: 'major',
      embellishment: '6',
    });
    expect(parseChord('A7')).toEqual({
      baseNote: 'A',
      text: 'A7',
      type: 'major',
      embellishment: '7',
    });
    expect(parseChord('A13')).toEqual({
      baseNote: 'A',
      text: 'A13',
      type: 'major',
      embellishment: '13',
    });
    expect(parseChord('Amaj7')).toEqual({
      baseNote: 'A',
      text: 'Amaj7',
      type: 'major',
      embellishment: 'maj7',
    });
    expect(parseChord('Am6')).toEqual({
      baseNote: 'A',
      text: 'Am6',
      type: 'minor',
      embellishment: '6',
    });
    expect(parseChord('A#m6')).toEqual({
      baseNote: 'A#',
      text: 'A#m6',
      type: 'minor',
      embellishment: '6',
    });
    expect(parseChord('Bm7b9')).toEqual({
      baseNote: 'B',
      text: 'Bm7b9',
      type: 'minor',
      embellishment: '7b9',
    });
  });

  it('parses add chords', () => {
    expect(parseChord('Aadd12')).toEqual({
      baseNote: 'A',
      text: 'Aadd12',
      type: 'major',
      add: 'add12',
    });
    expect(parseChord('Cmadd9')).toEqual({
      baseNote: 'C',
      text: 'Cmadd9',
      type: 'minor',
      add: 'add9',
    });
  });

  it('parses augmented chords', () => {
    expect(parseChord('C+')).toEqual({
      baseNote: 'C',
      text: 'C+',
      type: 'augmented',
    });
    expect(parseChord('C+7')).toEqual({
      baseNote: 'C',
      text: 'C+7',
      type: 'augmented',
      embellishment: '7',
    });
    expect(parseChord('C7+')).toEqual({
      baseNote: 'C',
      text: 'C7+',
      type: 'augmented',
      embellishment: '7',
    });
  });

  it('parses sus chords', () => {
    expect(parseChord('C#sus')).toEqual({
      baseNote: 'C#',
      text: 'C#sus',
      type: 'sus4',
    });
    expect(parseChord('C#sus2')).toEqual({
      baseNote: 'C#',
      text: 'C#sus2',
      type: 'sus2',
    });
    expect(parseChord('C#sus4')).toEqual({
      baseNote: 'C#',
      text: 'C#sus4',
      type: 'sus4',
    });
  });
});

describe('parseChordPro', () => {
  it('can parse directives', () => {
    expect(parseChordPro('{t:My Song}').directives.title).toEqual('My Song');
    expect(parseChordPro('{title:My Song}').directives.title).toEqual(
      'My Song',
    );
    expect(parseChordPro('{key:E}').directives.key).toEqual('E');
    expect(parseChordPro('{key:This is nothing}').directives.key).toEqual(
      'This is nothing',
    );
  });

  it('can do basic parsing', () => {
    const result = parseChordPro(stripIndent`
      This is[A] a simple song
    `);
    expect(result.lines[0]).toMatchInlineSnapshot(`
      Object {
        "content": "mixed",
        "spans": Array [
          Object {
            "text": "This is",
            "type": "text",
          },
          Object {
            "chord": Object {
              "baseNote": "A",
              "text": "A",
              "type": "major",
            },
            "type": "chord",
          },
          Object {
            "text": " a simple song",
            "type": "text",
          },
        ],
        "type": "line",
      }
    `);
  });

  it('will not parse broken chords', () => {
    const result = parseChordPro(stripIndent`
      This] is[A a simple song
    `);
    expect(result.lines[0]).toMatchInlineSnapshot(`
      Object {
        "content": "text",
        "spans": Array [
          Object {
            "text": "This] is[A a simple song",
            "type": "text",
          },
        ],
        "type": "line",
      }
    `);
  });

  it('will not parse empty chords', () => {
    const result = parseChordPro(stripIndent`
      This is[] a simple song
    `);
    expect(result.lines[0]).toMatchInlineSnapshot(`
      Object {
        "content": "text",
        "spans": Array [
          Object {
            "text": "This is[] a simple song",
            "type": "text",
          },
        ],
        "type": "line",
      }
    `);
  });

  it('can do basic parsing', () => {
    expect(
      parseChordPro(stripIndent`
        {t:My Song}
        {st:Greg Tatum}
        {key: Dm}

        Verse 1:
        This is a simple song
      `),
    ).toMatchInlineSnapshot(`
      Object {
        "directives": Object {
          "key": "Dm",
          "subtitle": "Greg Tatum",
          "title": "My Song",
        },
        "lines": Array [
          Object {
            "text": "Verse 1:",
            "type": "section",
          },
          Object {
            "content": "text",
            "spans": Array [
              Object {
                "text": "This is a simple song",
                "type": "text",
              },
            ],
            "type": "line",
          },
        ],
      }
    `);
  });
});
