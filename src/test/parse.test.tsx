import dedent from 'dedent';
import {
  parseChord,
  parseChordPro,
  parseAttributes,
  Parser,
  ultimateGuitarToChordPro,
  getChordLineRatio,
} from '../logic/parse-chords';
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
      {
        "content": "mixed",
        "lineIndex": 0,
        "spans": [
          {
            "text": "This is",
            "type": "text",
          },
          {
            "chord": {
              "baseNote": "A",
              "chordText": "A",
              "text": "A",
              "type": "major",
            },
            "type": "chord",
          },
          {
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
      {
        "content": "text",
        "lineIndex": 0,
        "spans": [
          {
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
      {
        "content": "mixed",
        "lineIndex": 0,
        "spans": [
          {
            "text": "This is",
            "type": "text",
          },
          {
            "chord": {
              "extras": "",
              "text": "",
            },
            "type": "chord",
          },
          {
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
      {
        "directives": {
          "key": "Dm",
          "subtitle": "Greg Tatum",
          "title": "My Song",
        },
        "lines": [
          {
            "lineIndex": 4,
            "text": "Verse 1:",
            "type": "section",
          },
          {
            "content": "text",
            "lineIndex": 5,
            "spans": [
              {
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
      {
        "directives": {},
        "lines": [
          {
            "italic": false,
            "lineIndex": 0,
            "text": "This is a comment",
            "type": "comment",
          },
          {
            "content": "text",
            "lineIndex": 1,
            "spans": [
              {
                "text": "Bare line",
                "type": "text",
              },
            ],
            "type": "line",
          },
          {
            "italic": false,
            "lineIndex": 2,
            "text": "Another comment",
            "type": "comment",
          },
          {
            "italic": true,
            "lineIndex": 3,
            "text": "Another one",
            "type": "comment",
          },
          {
            "italic": true,
            "lineIndex": 4,
            "text": "Italic one",
            "type": "comment",
          },
          {
            "italic": false,
            "lineIndex": 5,
            "text": "Directives are case insensitive",
            "type": "comment",
          },
        ],
      }
    `);
  });

  it('can parse media', () => {
    expect(
      parseChordPro(stripIndent`
        {img: src="/path/to/file.jpg"}
        {image: src="/path/to/file.png"}
        {audio: src="/path/to/audio.mp3"}
        {audio: src="/path/to/audio.wav" mimetype="audio/wav"}
        {video: src="/path/to/video.mp4" mimetype="video/mov"}
        {video: src="/path/to/video.mp4"}
        {image: unknown}
        {video: unknown}
        {audio: unknown}
      `),
    ).toMatchInlineSnapshot(`
      {
        "directives": {},
        "lines": [
          {
            "lineIndex": 0,
            "src": "/path/to/file.jpg",
            "type": "image",
          },
          {
            "lineIndex": 1,
            "src": "/path/to/file.png",
            "type": "image",
          },
          {
            "lineIndex": 2,
            "mimetype": "audio/mp3",
            "src": "/path/to/audio.mp3",
            "type": "audio",
          },
          {
            "lineIndex": 3,
            "mimetype": "audio/wav",
            "src": "/path/to/audio.wav",
            "type": "audio",
          },
          {
            "lineIndex": 4,
            "mimetype": "video/mov",
            "src": "/path/to/video.mp4",
            "type": "video",
          },
          {
            "lineIndex": 5,
            "mimetype": "",
            "src": "/path/to/video.mp4",
            "type": "video",
          },
        ],
      }
    `);
  });
});

const file = `Song: I Put a Spell on You

Band: Creedence Clearwater Revival



[Intro]

Em     Em



[Verse 1]

        Em              Am

I put a spell on you

               Em      Em

Because you're mine

`;

describe('ultimateGuitarToChordPro', () => {
  it('can parse ultimate guitar', () => {
    expect(ultimateGuitarToChordPro(file)).toMatchInlineSnapshot(`
      "Song: I Put a Spell on You
      Band: Creedence Clearwater Revival

      Intro:
      [Em]     [Em]

      Verse 1:
      I put a [Em]spell on you  [Am]
      Because you're [Em]mine  [Em]
      "
    `);
  });

  it('can compute a chord line ratio', () => {
    expect(Math.round(getChordLineRatio(file) * 100)).toEqual(13);
  });

  it('can handle pipe characters', () => {
    const characters = dedent`
      [Intro]
      | C G/B | Am7 G/B |
      | C G/B | Am7 G/B |
    `;
    expect(ultimateGuitarToChordPro(characters)).toMatchInlineSnapshot(`
      "Intro:
      | [C] [G/B] | [Am7] [G/B] |
      | [C] [G/B] | [Am7] [G/B] |"
    `);
  });

  it('can handle pipe characters followed by verse', () => {
    const characters = dedent`
      | C G/B | Am7 D/F# |
      Mmm...
    `;

    expect(ultimateGuitarToChordPro(characters)).toMatchInlineSnapshot(`
      "| [C] [G/B] | [Am7] [D/F#] |
      Mmm..."
    `);
  });
});
