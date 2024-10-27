import { SyntaxNodeRef } from '@lezer/common';
import dedent from 'dedent';
import { VexTab } from 'src/logic/vextab-grammar';

function parseAndGetText(string: string) {
  const tree = VexTab().language.parser.parse(string);
  const cursor = tree.cursor();
  let text = '';
  let indent = 0;
  let prevEnteredNode = cursor.node;
  const applyIndent = () => {
    for (let i = 0; i < indent; i++) {
      text += '  ';
    }
  };

  cursor.iterate(
    // Enter
    (nodeRef) => {
      // The grammer isn't 100% correct, and this is useful while running tests:

      // function textValue(nodeRef: SyntaxNodeRef) {
      //   return string.slice(nodeRef.from, nodeRef.to);
      // }

      // if (nodeRef.type.name === '⚠') {
      // console.error('⚠', JSON.stringify(textValue(nodeRef)));
      // }
      prevEnteredNode = nodeRef.node;
      applyIndent();
      text += `${nodeRef.type.name}(\n`;
      indent += 1;
    },
    // Leave
    (nodeRef) => {
      if (prevEnteredNode === nodeRef.node) {
        // Take off the previous newline.
        text = text.slice(0, text.length - 1);
        if (nodeRef.type.name === 'identifier') {
          text += '\n';
        } else {
          text += ')\n';
        }
        indent -= 1;
      } else {
        indent -= 1;
        applyIndent();
        text += ')\n';
      }
    },
  );
  return text.replaceAll('()', '');
}

describe('vextab', () => {
  it('can handle tabstave', () => {
    expect(parseAndGetText('tabstave notation=true tablature=false'))
      .toMatchInlineSnapshot(`
      "Program(
        TabStave(
          tabstave
          StaveAttributes(
            StaveAttributeName(
              notation
            )
            StaveAttributeValue(
              Boolean(
                true
              )
            )
          )
          StaveAttributes(
            StaveAttributeName(
              tablature
            )
            StaveAttributeValue(
              Boolean(
                false
              )
            )
          )
        )
      )
      "
    `);
  });

  it('can handle tabstave', () => {
    expect(parseAndGetText('notes C-D-E/4 F#/5')).toMatchInlineSnapshot(`
      "Program(
        NotesSection(
          notes
          Bar(
            OctaveGroup(
              Note(
                NoteLetter(
                  C
                )
              )
              Note(
                NoteLetter(
                  D
                )
              )
              Note(
                NoteLetter(
                  E
                )
              )
              Octave(
                Number
              )
            )
            OctaveGroup(
              Note(
                NoteLetter(
                  F
                )
                NoteSuffix(
                  Sharp
                )
              )
              Octave(
                Number
              )
            )
          )
        )
      )
      "
    `);
  });

  it('can handle bars', () => {
    expect(parseAndGetText('notes 5-4-2/3 2/2 =:|')).toMatchInlineSnapshot(`
      "Program(
        NotesSection(
          notes
          Bar(
            OctaveGroup(
              FretNumber
              FretNumber
              FretNumber
              Octave(
                Number
              )
            )
            OctaveGroup(
              FretNumber
              Octave(
                Number
              )
            )
          )
          BarLine(
            RepeatEnd
          )
        )
      )
      "
    `);
  });

  it('can handle bends', () => {
    const text = dedent`
      tabstave
      notes 4-5-6b7/3 10/4 | 5-4-2/3 2/2

      tabstave
      notes 6-7b9b7/3 7/4 | 9-8-7-6/2
    `;
    expect(parseAndGetText(text)).toMatchInlineSnapshot(`
      "Program(
        TabStave(
          tabstave
        )
        NotesSection(
          notes
          Bar(
            OctaveGroup(
              FretNumber
              FretNumber
              FretNumber(
                Bend(
                  b
                  Number
                )
              )
              Octave(
                Number
              )
            )
            OctaveGroup(
              FretNumber
              Octave(
                Number
              )
            )
          )
          BarLine(
            SingleBar
          )
          Bar(
            OctaveGroup(
              FretNumber
              FretNumber
              FretNumber
              Octave(
                Number
              )
            )
            OctaveGroup(
              FretNumber
              Octave(
                Number
              )
            )
          )
        )
        TabStave(
          tabstave
        )
        NotesSection(
          notes
          Bar(
            OctaveGroup(
              FretNumber
              FretNumber(
                Bend(
                  b
                  Number
                )
                Bend(
                  b
                  Number
                )
              )
              Octave(
                Number
              )
            )
            OctaveGroup(
              FretNumber
              Octave(
                Number
              )
            )
          )
          BarLine(
            SingleBar
          )
          Bar(
            OctaveGroup(
              FretNumber
              FretNumber
              FretNumber
              FretNumber
              Octave(
                Number
              )
            )
          )
        )
      )
      "
    `);
  });

  it('can parse chords', () => {
    expect(parseAndGetText(`notes (C/4.E/4.G/4) C-E-G/4`))
      .toMatchInlineSnapshot(`
      "Program(
        NotesSection(
          notes
          Bar(
            Chord(
              Note(
                NoteLetter(
                  C
                )
              )
              Octave(
                Number
              )
              Note(
                NoteLetter(
                  E
                )
              )
              Octave(
                Number
              )
              Note(
                NoteLetter(
                  G
                )
              )
              Octave(
                Number
              )
            )
            OctaveGroup(
              Note(
                NoteLetter(
                  C
                )
              )
              Note(
                NoteLetter(
                  E
                )
              )
              Note(
                NoteLetter(
                  G
                )
              )
              Octave(
                Number
              )
            )
          )
        )
      )
      "
    `);
  });

  it('can render chords2', () => {
    const text = dedent`
      notes (8/2.7b9b7/3) (5b6/2.5b6/3) 7/4 |
      notes (5/2.6/3.7/4)
    `;
    expect(parseAndGetText(text)).toMatchInlineSnapshot(`
      "Program(
        NotesSection(
          notes
          Bar(
            Chord(
              FretNumber
              Octave(
                Number
              )
              FretNumber(
                Bend(
                  b
                  Number
                )
                Bend(
                  b
                  Number
                )
              )
              Octave(
                Number
              )
            )
            Chord(
              FretNumber(
                Bend(
                  b
                  Number
                )
              )
              Octave(
                Number
              )
              FretNumber(
                Bend(
                  b
                  Number
                )
              )
              Octave(
                Number
              )
            )
            OctaveGroup(
              FretNumber
              Octave(
                Number
              )
            )
          )
          BarLine(
            SingleBar
          )
        )
        NotesSection(
          notes
          Bar(
            Chord(
              FretNumber
              Octave(
                Number
              )
              FretNumber
              Octave(
                Number
              )
              FretNumber
              Octave(
                Number
              )
            )
          )
        )
      )
      "
    `);
  });
  it('can render hammer ons and pulls offs', () => {
    // notes t(12/5.12/4)s(5/5.5/4) 3b4/5 5V/6
    const text = dedent`
      notes t(12/5.12/4)s(5/5.5/4) 3b4/5 5/6
    `;
    expect(parseAndGetText(text)).toMatchInlineSnapshot(`
      "Program(
        NotesSection(
          notes
          Bar(
            GuitarTechnique(
              Tap(
                t
              )
            )
            Chord(
              FretNumber
              Octave(
                Number
              )
              FretNumber
              Octave(
                Number
              )
            )
            GuitarTechnique(
              Slide(
                s
              )
            )
            Chord(
              FretNumber
              Octave(
                Number
              )
              FretNumber
              Octave(
                Number
              )
            )
            OctaveGroup(
              FretNumber(
                Bend(
                  b
                  Number
                )
              )
              Octave(
                Number
              )
            )
            OctaveGroup(
              FretNumber
              Octave(
                Number
              )
            )
          )
        )
      )
      "
    `);
  });

  it('can do note durations', () => {
    const text = 'notes :8 5s7s8/5 ^3^ :q (5/2.6/3)h(7/3) :8d 5/4 :16 5/5';
    expect(parseAndGetText(text)).toMatchInlineSnapshot(`
      "Program(
        NotesSection(
          notes
          Bar(
            NoteDuration
            OctaveGroup(
              FretNumber
              GuitarTechnique(
                Slide(
                  s
                )
              )
              FretNumber
              GuitarTechnique(
                Slide(
                  s
                )
              )
              FretNumber
              Octave(
                Number
              )
            )
            Triplet(
              Number
            )
            NoteDuration(
              Quarter(
                q
              )
            )
            Chord(
              FretNumber
              Octave(
                Number
              )
              FretNumber
              Octave(
                Number
              )
            )
            GuitarTechnique(
              HammerOn(
                h
              )
            )
            Chord(
              FretNumber
              Octave(
                Number
              )
            )
            NoteDuration(
              d
            )
            OctaveGroup(
              FretNumber
              Octave(
                Number
              )
            )
            NoteDuration
            OctaveGroup(
              FretNumber
              Octave(
                Number
              )
            )
          )
        )
      )
      "
    `);
  });
  it('can handle annotatinos', () => {
    const text = 'notes :q 5/5  5/4 5/3 ^3^ $Fi,Ga,Ro!$ :h 4/4 $.top.$ $Blah!$';
    expect(parseAndGetText(text)).toMatchInlineSnapshot(`
      "Program(
        NotesSection(
          notes
          Bar(
            NoteDuration(
              Quarter(
                q
              )
            )
            OctaveGroup(
              FretNumber
              Octave(
                Number
              )
            )
            OctaveGroup(
              FretNumber
              Octave(
                Number
              )
            )
            OctaveGroup(
              FretNumber
              Octave(
                Number
              )
            )
            Triplet(
              Number
            )
            OctaveGroup(
              FretNumber(
                ⚠
              )
              Annotation
              ⚠
            )
            NoteDuration(
              Half(
                h
              )
            )
            OctaveGroup(
              FretNumber
              Octave(
                Number
              )
            )
            OctaveGroup(
              FretNumber(
                ⚠
              )
              Annotation
              ⚠
            )
          )
        )
      )
      "
    `);
  });
});
