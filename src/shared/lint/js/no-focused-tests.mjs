const FOCUS_IDENTIFIERS = new Set(['fit', 'fdescribe']);
const TEST_FUNCTION_NAMES = new Set(['test', 'it', 'describe']);

/**
 * Walks down a MemberExpression/CallExpression chain (e.g. `test.concurrent.only`
 * or `it.each([...]).only`) to find the root identifier name.
 * @param {any} node
 */
function getRootIdentifierName(node) {
  let current = node;
  while (
    current.type === 'MemberExpression' ||
    current.type === 'CallExpression'
  ) {
    current =
      current.type === 'MemberExpression' ? current.object : current.callee;
  }
  return current.type === 'Identifier' ? current.name : null;
}

export const noFocusedTests = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow focused Jest tests (fit/fdescribe/.only) that silently skip every other test in the run',
    },
    messages: {
      noFocusedTests:
        '"{{ name }}" focuses this test and silently skips every other test in the run. ' +
        'Remove it before committing. Explicitly skipping a test with .skip/xit/xdescribe is fine.',
    },
  },

  /**
   * @param {any} context
   */
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      /**
       * @param {any} node
       */
      CallExpression(node) {
        const { callee } = node;

        if (
          callee.type === 'Identifier' &&
          FOCUS_IDENTIFIERS.has(callee.name)
        ) {
          context.report({
            node: callee,
            messageId: 'noFocusedTests',
            data: { name: callee.name },
          });
        }
      },

      /**
       * @param {any} node
       */
      MemberExpression(node) {
        if (
          node.computed ||
          node.property.type !== 'Identifier' ||
          node.property.name !== 'only'
        ) {
          return;
        }
        const rootName = getRootIdentifierName(node.object);
        if (rootName && TEST_FUNCTION_NAMES.has(rootName)) {
          context.report({
            node,
            messageId: 'noFocusedTests',
            data: { name: sourceCode.getText(node) },
          });
        }
      },
    };
  },
};
