import { RuleTester } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { preferKeyboardString } from './prefer-keyboard-string.mjs';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    ecmaVersion: 2022,
    sourceType: 'module',
  },
});

const ERROR = { messageId: 'preferKeyboardString' };

ruleTester.run(
  'prefer-keyboard-string',
  /** @type {any} */ (preferKeyboardString),
  {
    valid: [
      // Not a KeyboardEvent, so checking a modifier directly is fine (e.g. a
      // click handler distinguishing a cmd/shift-click for multi-select).
      {
        code: 'function onClick(event: MouseEvent) { if (event.shiftKey) {} }',
      },
      // Reading an unrelated property off a KeyboardEvent is fine.
      {
        code: 'function onKeyDown(event: KeyboardEvent) { if (event.key === "Enter") {} }',
      },
      // The intended pattern: normalize with getKeyboardString and switch.
      {
        code: [
          'function onKeyDown(event: KeyboardEvent) {',
          '  switch (getKeyboardString(event)) {',
          '    case "Meta+E":',
          '    case "Control+E":',
          '      break;',
          '  }',
          '}',
        ].join('\n'),
      },
    ],
    invalid: [
      {
        code: 'function onKeyDown(event: KeyboardEvent) { if (event.shiftKey) {} }',
        errors: [ERROR],
      },
      {
        code: 'const onKeyDown = (event: KeyboardEvent) => { if (event.metaKey) {} };',
        errors: [ERROR],
      },
      // One report per modifier property read.
      {
        code: 'function onKeyDown(event: KeyboardEvent) { if (event.metaKey && event.shiftKey) {} }',
        errors: [ERROR, ERROR],
      },
      // A nested closure that captures the KeyboardEvent param is still caught.
      {
        code: [
          'function onKeyDown(event: KeyboardEvent) {',
          '  const isPrimary = () => event.ctrlKey || event.altKey;',
          '}',
        ].join('\n'),
        errors: [ERROR, ERROR],
      },
    ],
  },
);

console.log('prefer-keyboard-string: all tests passed');
