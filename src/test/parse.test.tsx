import {
  parseChord,
  parseChordPro,
  parseAttributes,
  Parser,
} from '../logic/parse';
import { stripIndent } from 'common-tags';

describe('parser', () => {
  it('can parse alphanumeric', () => {
    expect(new Parser('alphaNumeric text').alphaNumeric()).toEqual(
      'alphaNumeric',
    );
    expect(new Parser('{alphaNumeric text').alphaNumeric()).toEqual(null);
    expect(new Parser('1234!').alphaNumeric()).toEqual('1234');
    expect(new Parser('goés!').alphaNumeric()).toEqual('go');
  });

  it('can parse escaped', () => {
    expect(new Parser('"some text!"').escaped('"', '\\')).toEqual('some text!');
    expect(new Parser('"some \\"text\\"!"').escaped('"', '\\')).toEqual(
      'some "text"!',
    );
    expect(new Parser('"some text!"').escaped('"', '\\')).toEqual('some text!');
    expect(new Parser('"\\\\/alentine"  ').escaped('"', '\\')).toEqual(
      '\\/alentine',
    );
  });
});

describe('parseChord', () => {
  it('parses basic chords', () => {
    expect(parseChord('A')).toEqual({
      baseNote: 'A',
      chordText: 'A',
      text: 'A',
      type: 'major',
    });

    expect(parseChord('G')).toEqual({
      baseNote: 'G',
      chordText: 'G',
      text: 'G',
      type: 'major',
    });

    expect(parseChord('Fm')).toEqual({
      baseNote: 'F',
      chordText: 'Fm',
      text: 'Fm',
      type: 'minor',
    });

    expect(parseChord('H')).toEqual({ text: 'H', extras: 'H' });
  });

  it('parses slash chords', () => {
    expect(parseChord('G/F#')).toEqual({
      baseNote: 'G',
      text: 'G/F#',
      chordText: 'G/F#',
      slash: 'F#',
      type: 'major',
    });
    expect(parseChord('Bb/Ab')).toEqual({
      baseNote: 'Bb',
      text: 'Bb/Ab',
      chordText: 'Bb/Ab',
      slash: 'Ab',
      type: 'major',
    });
  });

  it('parses 7th 9th etc chords', () => {
    expect(parseChord('A6')).toEqual({
      baseNote: 'A',
      text: 'A6',
      chordText: 'A6',
      type: 'major',
      embellishment: '6',
    });
    expect(parseChord('A7')).toEqual({
      baseNote: 'A',
      text: 'A7',
      chordText: 'A7',
      type: 'major',
      embellishment: '7',
    });
    expect(parseChord('A13')).toEqual({
      baseNote: 'A',
      text: 'A13',
      chordText: 'A13',
      type: 'major',
      embellishment: '13',
    });
    expect(parseChord('Amaj7')).toEqual({
      baseNote: 'A',
      text: 'Amaj7',
      chordText: 'Amaj7',
      type: 'major',
      embellishment: 'maj7',
    });
    expect(parseChord('Am6')).toEqual({
      baseNote: 'A',
      text: 'Am6',
      chordText: 'Am6',
      type: 'minor',
      embellishment: '6',
    });
    expect(parseChord('A#m6')).toEqual({
      baseNote: 'A#',
      text: 'A#m6',
      chordText: 'A#m6',
      type: 'minor',
      embellishment: '6',
    });
    expect(parseChord('Bm7b9')).toEqual({
      baseNote: 'B',
      text: 'Bm7b9',
      chordText: 'Bm7b9',
      type: 'minor',
      embellishment: '7b9',
    });
  });

  it('parses add chords', () => {
    expect(parseChord('Aadd12')).toEqual({
      baseNote: 'A',
      text: 'Aadd12',
      chordText: 'Aadd12',
      type: 'major',
      add: 'add12',
    });
    expect(parseChord('Cmadd9')).toEqual({
      baseNote: 'C',
      text: 'Cmadd9',
      chordText: 'Cmadd9',
      type: 'minor',
      add: 'add9',
    });
  });

  it('parses augmented chords', () => {
    expect(parseChord('C+')).toEqual({
      baseNote: 'C',
      text: 'C+',
      chordText: 'C+',
      type: 'augmented',
      embellishment: '+',
    });
    expect(parseChord('C+7')).toEqual({
      baseNote: 'C',
      text: 'C+7',
      chordText: 'C+7',
      type: 'augmented',
      embellishment: '+7',
    });
    expect(parseChord('C7+')).toEqual({
      baseNote: 'C',
      text: 'C7+',
      chordText: 'C7+',
      type: 'augmented',
      embellishment: '7+',
    });
  });

  it('parses sus chords', () => {
    expect(parseChord('C#sus')).toEqual({
      baseNote: 'C#',
      text: 'C#sus',
      chordText: 'C#sus',
      type: 'sus4',
    });
    expect(parseChord('C#sus2')).toEqual({
      baseNote: 'C#',
      text: 'C#sus2',
      chordText: 'C#sus2',
      type: 'sus2',
    });
    expect(parseChord('C#sus4')).toEqual({
      baseNote: 'C#',
      text: 'C#sus4',
      chordText: 'C#sus4',
      type: 'sus4',
    });
  });

  it('parses extras', () => {
    expect(parseChord('C#m (strumming)')).toEqual({
      baseNote: 'C#',
      chordText: 'C#m',
      extras: ' (strumming)',
      text: 'C#m (strumming)',
      type: 'minor',
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
              "chordText": "A",
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

  it('will parse an empty chord', () => {
    const result = parseChordPro(stripIndent`
      This is[] a simple song
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
              "extras": "",
              "text": "",
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

  it('can parse attributes', () => {
    expect(
      parseAttributes(
        [
          ' src="path/to/file.png"',
          'width="100"',
          `title="\\\\/alentine's \\"Day\\""`,
        ].join(' '),
      ),
    ).toEqual({
      src: 'path/to/file.png',
      width: '100',
      title: `\\/alentine's "Day"`,
    });
  });

  it('can parse comments', () => {
    expect(
      parseChordPro(stripIndent`
        {comment: This is a comment}
        Bare line
        {c: Another comment}
        {ci: Another one}
        {comment_italic: Italic one}
        {COMMENT: Directives are case insensitive}
      `),
    ).toMatchInlineSnapshot(`
      Object {
        "directives": Object {},
        "lines": Array [
          Object {
            "italic": false,
            "text": "This is a comment",
            "type": "comment",
          },
          Object {
            "content": "text",
            "spans": Array [
              Object {
                "text": "Bare line",
                "type": "text",
              },
            ],
            "type": "line",
          },
          Object {
            "italic": false,
            "text": "Another comment",
            "type": "comment",
          },
          Object {
            "italic": true,
            "text": "Another one",
            "type": "comment",
          },
          Object {
            "italic": true,
            "text": "Italic one",
            "type": "comment",
          },
          Object {
            "italic": false,
            "text": "Directives are case insensitive",
            "type": "comment",
          },
        ],
      }
    `);
  });
});
