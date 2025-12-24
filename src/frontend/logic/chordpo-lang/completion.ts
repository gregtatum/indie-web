import { EditorState } from "@codemirror/state"
import { syntaxTree } from "@codemirror/language"
import { CompletionContext, completeFromList } from "@codemirror/autocomplete"
import snippets from "./snippets"

// Get a list of all the chords used in the document
export function chordsUsed(state: EditorState) {
  const chords: Record<string, number> = {}

  syntaxTree(state).iterate({
    enter(node) {
      if (node.type.name === "Chord") {
        const name = state.doc.sliceString(node.from, node.to)
        chords[name] = (chords[name] || 0) + 1
      }
    }
  })

  return chords
}

export function completeChords(context: CompletionContext) {
  const word = context.matchBefore(/[^\[]*/)!
  const chords = chordsUsed(context.state)

  return {
    from: word.from,
    options: Object.keys(chords).map(chord => {
      return { label: chord, type: "chord", boost: chords[chord] }
    })
  }
}

const completeSnippets = completeFromList(snippets)

export function chordproCompletionSource(context: CompletionContext) {
  let node = syntaxTree(context.state).resolveInner(context.pos, -1)

  if (node.name === "[" || node.name === "Chord") {
    return completeChords(context)
  } else {
    return completeSnippets(context)
  }
}
