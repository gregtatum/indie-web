import stylelint from 'stylelint';
import valueParser from 'postcss-value-parser';

/**
 * This projects expects the CSS variables to be well-formed and loaded in the project.
 * If there is a backup value, this indicates that the system is not tuned correctly
 * and should be fixed.
 */

const { report, ruleMessages, validateOptions } = stylelint.utils;
const ruleName = 'plugin/no-var-fallback';

const messages = ruleMessages(ruleName, {
  rejected: (prop) =>
    `Unexpected fallback in var() for "${prop}". Define the CSS custom property instead.`,
});

const meta = { url: 'https://github.com/gregtatum/indie-web', fixable: false };

function rule(primary) {
  return (root, result) => {
    if (!validateOptions(result, ruleName, { actual: primary })) return;
    root.walkDecls((decl) => {
      const parsed = valueParser(decl.value);
      parsed.walk((node) => {
        if (node.type !== 'function' || node.value.toLowerCase() !== 'var')
          return;
        const hasFallback = node.nodes.some(
          (n) => n.type === 'div' && n.value === ',',
        );
        if (hasFallback) {
          report({
            message: messages.rejected(decl.prop),
            node: decl,
            result,
            ruleName,
            word: valueParser.stringify(node),
          });
        }
      });
    });
  };
}

rule.ruleName = ruleName;
rule.messages = messages;
rule.meta = meta;

export default { ruleName, rule };
