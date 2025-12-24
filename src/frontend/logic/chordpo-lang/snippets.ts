import { Completion, snippetCompletion } from "@codemirror/autocomplete"

const ValueDirectives = [
  "title",
  "subtitle",
  "artist",
  "album",
  "comment"
]

const Directives = [
  "start_of_verse",
  "end_of_verse",
  "start_of_chorus",
  "end_of_chorus",
  "start_of_tab",
  "end_of_tab"
]

const snippets: readonly Completion[] = [
  ...ValueDirectives.map(name => snippetCompletion(`{${name}: #{}}`, { label: name, type: "directive" })),
  ...Directives.map(name => snippetCompletion(`{${name}}`, { label: name, type: "directive" })),

  snippetCompletion("\[${}\]", { label: "chord", type: "chord" }),

  snippetCompletion("{define: ${1:name} frets ${2:E} ${3:A} ${4:D} ${5:G} ${6:B} ${7:E} fingers ${8:E} ${9:A} ${10:D} ${11:G} ${12:B} ${13:E}}",
    { label: "define", type: "directive" }
  ),

  snippetCompletion(`
      {start_of_tab}
      E | -#{1:-}--------------------------------|
      B | ----------------------------------|
      G | ----------------------------------|
      D | ----------------------------------|
      A | ----------------------------------|
      E | ----------------------------------|
      {end_of_tab}
    `.replaceAll(/^\s*/gm, ''), { label: "tab", type: "directive" }
  )
]

export default snippets
