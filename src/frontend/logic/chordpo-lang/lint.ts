import {syntaxTree} from "@codemirror/language"
import {linter, Diagnostic} from "@codemirror/lint"

export const exampleStringLinter = linter(view => {
  let diagnostics: Diagnostic[] = []
  syntaxTree(view.state).cursor().iterate(node => {
    if (node.name == "String") diagnostics.push({
      from: node.from,
      to: node.to,
      severity: "warning",
      message: "Stings are forbidden",
      actions: [{
        name: "Remove",
        apply(view, from, to) { view.dispatch({changes: {from, to}}) }
      }]
    })
  })
  return diagnostics
})