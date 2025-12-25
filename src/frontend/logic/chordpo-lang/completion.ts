import { EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import {
  CompletionContext,
  completeFromList,
  snippetCompletion,
} from '@codemirror/autocomplete';

// Get a list of all the chords used in the document
export function chordsUsed(state: EditorState) {
  const chords: Record<string, number> = {};

  syntaxTree(state).iterate({
    enter(node) {
      if (node.type.name === 'Chord') {
        const name = state.doc.sliceString(node.from, node.to);
        chords[name] = (chords[name] || 0) + 1;
      }
    },
  });

  return chords;
}

export function completeChords(context: CompletionContext) {
  const word = context.matchBefore(/[^[]*/)!;
  const chords = chordsUsed(context.state);

  return {
    from: word.from,
    options: Object.keys(chords).map((chord) => {
      return { label: chord, type: 'chord', boost: chords[chord] };
    }),
  };
}

const valueDirectives = ['title', 'subtitle', 'artist', 'album', 'comment'];

/**
 * Complete the directives while inside of a { brace.
 */
const completeDirectivesInner = completeFromList(
  valueDirectives.map((label) =>
    snippetCompletion('' + label + ': ${}}', {
      label,
      type: 'directive',
    }),
  ),
);

/**
 * Complete the directives whenever the first { is provided.
 */
const completeDirectivesOuter = completeFromList(
  valueDirectives.map((label) =>
    snippetCompletion('{' + label + ': ${}}', {
      label: '{' + label,
      displayLabel: label,
      type: 'directive',
    }),
  ),
);

export function chordproCompletionSource(context: CompletionContext) {
  const node = syntaxTree(context.state).resolveInner(context.pos, -1);

  if (node.type.name === '{') {
    return completeDirectivesOuter(context);
  }

  if (node.type.name === 'DirectiveName') {
    return completeDirectivesInner(context);
  }

  if (node.name === '[' || node.name === 'Chord') {
    return completeChords(context);
  }

  return undefined;
}

// function completeJSDoc(context: CompletionContext) {
//   let nodeBefore = syntaxTree(context.state).resolveInner(context.pos, -1)
//   if (nodeBefore.name != "BlockComment" ||
//       context.state.sliceDoc(nodeBefore.from, nodeBefore.from + 3) != "/**")
//     return null
//   let textBefore = context.state.sliceDoc(nodeBefore.from, context.pos)
//   let tagBefore = /@\w*$/.exec(textBefore)
//   if (!tagBefore && !context.explicit) return null
//   return {
//     from: tagBefore ? nodeBefore.from + tagBefore.index : context.pos,
//     options: tagOptions,
//     validFor: /^(@\w*)?$/
//   }
// }
