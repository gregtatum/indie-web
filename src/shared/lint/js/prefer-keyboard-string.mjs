const MODIFIER_PROPS = new Set(['metaKey', 'ctrlKey', 'altKey', 'shiftKey']);

export const preferKeyboardString = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow reading event.metaKey/ctrlKey/altKey/shiftKey directly on a KeyboardEvent',
    },
    messages: {
      preferKeyboardString:
        'Avoid reading "{{ prop }}" directly off a KeyboardEvent to detect a shortcut — an ' +
        'unguarded extra modifier (Caps Lock, a stray Shift/Alt) can slip through and fire the ' +
        'wrong shortcut. Use getKeyboardString(event) from frontend/utils and switch on the ' +
        "normalized string instead (e.g. case 'Meta+E': case 'Control+E':).",
    },
  },

  /**
   * @param {any} context
   */
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    /**
     * @param {any} param
     */
    function isKeyboardEventParam(param) {
      return (
        param.type === 'Identifier' &&
        param.typeAnnotation?.type === 'TSTypeAnnotation' &&
        param.typeAnnotation.typeAnnotation?.type === 'TSTypeReference' &&
        param.typeAnnotation.typeAnnotation.typeName?.type === 'Identifier' &&
        param.typeAnnotation.typeAnnotation.typeName.name === 'KeyboardEvent'
      );
    }

    /**
     * Runs on function exit, once every descendant (including nested closures)
     * has been fully traversed and has its `.parent` link set.
     * @param {any} node
     */
    function checkFunction(node) {
      for (const param of node.params) {
        if (!isKeyboardEventParam(param)) {
          continue;
        }
        const variable = sourceCode
          .getDeclaredVariables(node)
          .find((v) => v.name === param.name);
        if (!variable) {
          continue;
        }
        for (const reference of variable.references) {
          const identifier = reference.identifier;
          const parent = identifier.parent;
          if (
            parent?.type === 'MemberExpression' &&
            parent.object === identifier &&
            !parent.computed &&
            parent.property.type === 'Identifier' &&
            MODIFIER_PROPS.has(parent.property.name)
          ) {
            context.report({
              node: parent,
              messageId: 'preferKeyboardString',
              data: { prop: parent.property.name },
            });
          }
        }
      }
    }

    return {
      'FunctionDeclaration:exit': checkFunction,
      'FunctionExpression:exit': checkFunction,
      'ArrowFunctionExpression:exit': checkFunction,
    };
  },
};
