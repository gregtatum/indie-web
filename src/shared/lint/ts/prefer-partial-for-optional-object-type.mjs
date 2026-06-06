/**
 * Prefer `Partial<{ ... }>` for larger object type literals where every
 * property is optional.
 */
export const preferPartialForOptionalObjectType = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer Partial<{ ... }> for object type literals with three or more optional properties',
    },
    fixable: 'code',
    schema: [],
    messages: {
      preferPartial:
        'Use Partial<{ ... }> when all properties in a larger object type are optional.',
    },
  },
  /**
   * @param {any} context
   */
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    /**
     * @param {any} node
     */
    function isPartialTypeArgument(node) {
      const parent = node.parent;
      const typeReference = parent?.parent;
      return (
        parent?.type === 'TSTypeParameterInstantiation' &&
        typeReference?.type === 'TSTypeReference' &&
        typeReference.typeName?.type === 'Identifier' &&
        typeReference.typeName.name === 'Partial'
      );
    }

    /**
     * @param {any} member
     */
    function isOptionalProperty(member) {
      return (
        member.type === 'TSPropertySignature' &&
        member.optional === true &&
        questionTokenFor(member)
      );
    }

    /**
     * @param {any} member
     */
    function questionTokenFor(member) {
      return sourceCode.getTokenAfter(
        member.key,
        /**
         * @param {any} token
         */
        (token) => token.value === '?',
      );
    }

    /**
     * @param {any} node
     */
    function shouldUsePartial(node) {
      return (
        node.members.length >= 3 &&
        node.members.every(isOptionalProperty) &&
        !isPartialTypeArgument(node)
      );
    }

    return {
      /**
       * @param {any} node
       */
      TSTypeLiteral(node) {
        if (!shouldUsePartial(node)) {
          return;
        }

        context.report({
          node,
          messageId: 'preferPartial',
          /**
           * @param {any} fixer
           */
          fix(fixer) {
            return [
              fixer.insertTextBefore(node, 'Partial<'),
              ...node.members.map(
                /**
                 * @param {any} member
                 */
                (member) => fixer.remove(questionTokenFor(member)),
              ),
              fixer.insertTextAfter(node, '>'),
            ];
          },
        });
      },
    };
  },
};
