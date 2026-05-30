const MOUNT_PATH_METHODS = new Set([
  'resolve',
  'joinOnMount',
  'joinWithinMount',
]);

export const noMountPathConcat = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow "+" concatenation on MountPath results to prevent path escapes',
    },
    messages: {
      noPathConcat:
        'Do not interpolate a MountPath result into a string. ' +
        'Use mountPath.makeError() for error messages, or pass the full path to the MountPath method ' +
        '(e.g. mountPath.joinOnMount(base + suffix) instead of mountPath.joinOnMount(base) + suffix).',
    },
  },
  /** @param {any} context */
  create(context) {
    const sourceCode = context.getSourceCode();

    // Track which variables in each scope hold MountPath results.
    /** @type {WeakMap<object, Set<string>>} */
    const mountVarsByScope = new WeakMap();

    /** @param {any} node */
    function isMountPathCall(node) {
      return (
        node.type === 'CallExpression' &&
        node.callee.type === 'MemberExpression' &&
        MOUNT_PATH_METHODS.has(node.callee.property.name)
      );
    }

    /**
     * Walk the scope chain to see if `name` was assigned from a MountPath call.
     * @param {string} name
     * @param {any} scope
     */
    function isMountVar(name, scope) {
      let s = scope;
      while (s) {
        if (mountVarsByScope.get(s)?.has(name)) {
          return true;
        }
        s = s.upper;
      }
      return false;
    }

    /** @param {any} node */
    function isMountValue(node) {
      if (isMountPathCall(node)) {
        return true;
      }
      if (node.type === 'Identifier') {
        return isMountVar(node.name, sourceCode.getScope(node));
      }
      return false;
    }

    return {
      /** @param {any} node */
      VariableDeclarator(node) {
        if (
          node.init &&
          isMountPathCall(node.init) &&
          node.id.type === 'Identifier'
        ) {
          const scope = sourceCode.getScope(node);
          let vars = mountVarsByScope.get(scope);
          if (!vars) {
            vars = new Set();
            mountVarsByScope.set(scope, vars);
          }
          vars.add(node.id.name);
        }
      },
      /** @param {any} node */
      BinaryExpression(node) {
        if (node.operator !== '+') {
          return;
        }
        if (isMountValue(node.left) || isMountValue(node.right)) {
          context.report({ node, messageId: 'noPathConcat' });
        }
      },
      /** @param {any} node */
      TemplateLiteral(node) {
        for (const expr of node.expressions) {
          if (isMountValue(expr)) {
            context.report({ node, messageId: 'noPathConcat' });
            return;
          }
        }
      },
    };
  },
};
