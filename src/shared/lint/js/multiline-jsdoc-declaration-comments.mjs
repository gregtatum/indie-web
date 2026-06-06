/**
 * Enforce that JSDoc block comments (`/** ... *\/`) attached to declarations span
 * multiple lines, e.g. `/** A *\/` becomes:
 *
 *     /**
 *      * A
 *      *\/
 */
export const multilineJsdocDeclarationComments = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require JSDoc block comments attached to declarations to span multiple lines',
    },
    fixable: 'whitespace',
    schema: [],
    messages: {
      multilineJsdoc:
        'JSDoc block comments on declarations must span multiple lines.',
    },
  },
  /**
   * @param {any} context
   */
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    /**
     * @param {any} comment
     */
    function indentFor(comment) {
      const lineText = sourceCode.lines[comment.loc.start.line - 1] ?? '';
      const before = lineText.slice(0, comment.loc.start.column);
      return /^\s*$/.test(before) ? before : '';
    }

    /**
     * @param {any} comment
     */
    function reportComment(comment) {
      const indent = indentFor(comment);
      const inner = comment.value.slice(1).trim();
      const fixedText = inner
        ? `/**\n${indent} * ${inner}\n${indent} */`
        : `/**\n${indent} *\n${indent} */`;

      context.report({
        loc: comment.loc,
        messageId: 'multilineJsdoc',
        /**
         * @param {any} fixer
         */
        fix(fixer) {
          return fixer.replaceTextRange(comment.range, fixedText);
        },
      });
    }

    /**
     * @param {any} node
     */
    function checkAttachedComments(node) {
      const comments = sourceCode.getCommentsBefore(node);
      for (const comment of comments) {
        // A comment is considered attached only when it ends on the line
        // immediately before the declaration; blank-line-separated comments
        // are treated as floating docs and ignored.
        const attached = node.loc.start.line - comment.loc.end.line === 1;
        if (
          attached &&
          comment.type === 'Block' &&
          comment.value.startsWith('*') &&
          comment.loc.start.line === comment.loc.end.line
        ) {
          reportComment(comment);
        }
      }
    }

    /**
     * @param {any} node
     */
    function isFunctionLike(node) {
      return (
        node &&
        (node.type === 'FunctionExpression' ||
          node.type === 'ArrowFunctionExpression')
      );
    }

    /**
     * @param {any} node
     */
    function variableDeclaresFunction(node) {
      return node.declarations.some(
        /** @param {any} d */
        (d) => isFunctionLike(d.init),
      );
    }

    return {
      FunctionDeclaration: checkAttachedComments,
      ClassDeclaration: checkAttachedComments,
      MethodDefinition: checkAttachedComments,
      PropertyDefinition: checkAttachedComments,
      ExportNamedDeclaration: checkAttachedComments,
      ExportDefaultDeclaration: checkAttachedComments,
      // TypeScript-specific declarations.
      TSTypeAliasDeclaration: checkAttachedComments,
      TSInterfaceDeclaration: checkAttachedComments,
      TSEnumDeclaration: checkAttachedComments,
      TSModuleDeclaration: checkAttachedComments,
      TSDeclareFunction: checkAttachedComments,
      /**
       * @param {any} node
       */
      VariableDeclaration(node) {
        if (variableDeclaresFunction(node)) {
          checkAttachedComments(node);
        }
      },
      /**
       * @param {any} node
       */
      Property(node) {
        // Object-literal method shorthand (`{ foo() {} }`) or a property whose
        // value is a function/arrow function (`{ foo: () => {} }`).
        if (node.method || isFunctionLike(node.value)) {
          checkAttachedComments(node);
        }
      },
    };
  },
};
