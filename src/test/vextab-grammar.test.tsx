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

  function textValue(nodeRef: SyntaxNodeRef) {
    return string.slice(nodeRef.from, nodeRef.to);
  }

  cursor.iterate(
    // Enter
    (nodeRef) => {
      if (nodeRef.type.name === '⚠') {
        console.error('⚠', JSON.stringify(textValue(nodeRef)));
      }
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
    expect(parseAndGetText('notes 4-5-6/3 ## =|: 5-4-2/3 2/2 =:|'))
      .toMatchInlineSnapshot(`
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
            Rest
          )
          BarSign(
            RepeatBegin
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
          BarSign(
            RepeatEnd
          )
          ⚠
        )
      )
      "
    `);
  });
});
