export const noPathInServer = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow join/resolve from node:path to prevent unintentional mount escape',
    },
    messages: {
      noPathImport:
        'Risky use of "{{ name }}" from node:path. Prefer MountPath from server/utils.ts ' +
        'to avoid security issues from file mount escapes.',
    },
  },
  /**
   * @param {any} context
   */
  create(context) {
    return {
      /**
       * @param {any} node
       */
      ImportDeclaration(node) {
        if (node.source.value !== 'node:path' && node.source.value !== 'path') {
          return;
        }
        for (const specifier of node.specifiers) {
          if (
            specifier.type === 'ImportSpecifier' &&
            (specifier.imported.name === 'join' ||
              specifier.imported.name === 'resolve')
          ) {
            context.report({
              node: specifier,
              messageId: 'noPathImport',
              data: { name: specifier.imported.name },
            });
          }
        }
      },
    };
  },
};
