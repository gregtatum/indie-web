import { RuleTester } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { multilineJsdocDeclarationComments } from './multiline-jsdoc-declaration-comments.mjs';

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
});

const tsRuleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    ecmaVersion: 2022,
    sourceType: 'module',
  },
});

const ERROR = { messageId: 'multilineJsdoc' };

ruleTester.run(
  'multiline-jsdoc-declaration-comments',
  /** @type {any} */ (multilineJsdocDeclarationComments),
  {
    valid: [
      // Multiline JSDoc on a function declaration.
      {
        code: [
          '/**',
          ' * Returns the bytes after the ID3v2 chunk.',
          ' */',
          'function getBytesAfterId3(buf) {}',
        ].join('\n'),
      },
      // Plain block comment (not JSDoc) — single line is fine.
      { code: '/* one-line block */\nfunction foo() {}' },
      // Single-line JSDoc that is NOT attached to a declaration.
      { code: '/** floating doc */\n\nfunction foo() {}' },
      // Multiline JSDoc on an exported function.
      {
        code: ['/**', ' * Exported.', ' */', 'export function foo() {}'].join(
          '\n',
        ),
      },
      // Single-line JSDoc on a non-function variable declaration is ignored.
      { code: '/** A constant. */\nconst x = 5;' },
      // Multiline JSDoc on a class method.
      {
        code: [
          'class C {',
          '  /**',
          '   * Method.',
          '   */',
          '  m() {}',
          '}',
        ].join('\n'),
      },
      // Inline non-JSDoc comment before a class field.
      {
        code: ['class C {', '  /* inline */', '  x = 1;', '}'].join('\n'),
      },
      // Object-literal property whose value is not a function — ignored.
      { code: 'const o = {\n  /** A. */\n  x: 1,\n};' },
    ],
    invalid: [
      // Function declaration.
      {
        code: '/** Description. */\nfunction foo() {}',
        errors: [ERROR],
        output: '/**\n * Description.\n */\nfunction foo() {}',
      },
      // Extra spacing inside the JSDoc.
      {
        code: '/**   Description.   */\nfunction foo() {}',
        errors: [ERROR],
        output: '/**\n * Description.\n */\nfunction foo() {}',
      },
      // No spaces around the description.
      {
        code: '/**Description.*/\nfunction foo() {}',
        errors: [ERROR],
        output: '/**\n * Description.\n */\nfunction foo() {}',
      },
      // Class declaration.
      {
        code: '/** A class. */\nclass C {}',
        errors: [ERROR],
        output: '/**\n * A class.\n */\nclass C {}',
      },
      // Method definition with indentation preserved.
      {
        code: ['class C {', '  /** A method. */', '  m() {}', '}'].join('\n'),
        errors: [ERROR],
        output: [
          'class C {',
          '  /**',
          '   * A method.',
          '   */',
          '  m() {}',
          '}',
        ].join('\n'),
      },
      // Property definition (class field).
      {
        code: ['class C {', '  /** A field. */', '  x = 1;', '}'].join('\n'),
        errors: [ERROR],
        output: [
          'class C {',
          '  /**',
          '   * A field.',
          '   */',
          '  x = 1;',
          '}',
        ].join('\n'),
      },
      // `export function`.
      {
        code: '/** Exported. */\nexport function foo() {}',
        errors: [ERROR],
        output: '/**\n * Exported.\n */\nexport function foo() {}',
      },
      // `export class`.
      {
        code: '/** Exported class. */\nexport class C {}',
        errors: [ERROR],
        output: '/**\n * Exported class.\n */\nexport class C {}',
      },
      // `export default function`.
      {
        code: '/** Default. */\nexport default function foo() {}',
        errors: [ERROR],
        output: '/**\n * Default.\n */\nexport default function foo() {}',
      },
      // Variable initialized with an arrow function.
      {
        code: '/** An arrow. */\nconst foo = () => {};',
        errors: [ERROR],
        output: '/**\n * An arrow.\n */\nconst foo = () => {};',
      },
      // Variable initialized with a function expression.
      {
        code: '/** A fn expr. */\nconst foo = function () {};',
        errors: [ERROR],
        output: '/**\n * A fn expr.\n */\nconst foo = function () {};',
      },
      // Exported variable that holds an arrow function.
      {
        code: '/** Exported arrow. */\nexport const foo = () => {};',
        errors: [ERROR],
        output: '/**\n * Exported arrow.\n */\nexport const foo = () => {};',
      },
      // Object-literal method shorthand.
      {
        code: [
          'const o = {',
          '  /** Creates. */',
          '  create(context) {},',
          '};',
        ].join('\n'),
        errors: [ERROR],
        output: [
          'const o = {',
          '  /**',
          '   * Creates.',
          '   */',
          '  create(context) {},',
          '};',
        ].join('\n'),
      },
      // Object-literal property whose value is an arrow function.
      {
        code: ['const o = {', '  /** Arrow. */', '  fn: () => {},', '};'].join(
          '\n',
        ),
        errors: [ERROR],
        output: [
          'const o = {',
          '  /**',
          '   * Arrow.',
          '   */',
          '  fn: () => {},',
          '};',
        ].join('\n'),
      },
    ],
  },
);

tsRuleTester.run(
  'multiline-jsdoc-declaration-comments (TypeScript)',
  /** @type {any} */ (multilineJsdocDeclarationComments),
  {
    valid: [
      // Multiline JSDoc on a type alias.
      {
        code: ['/**', ' * Shape.', ' */', 'type X = { a: number };'].join('\n'),
      },
      // Multiline JSDoc on an interface.
      {
        code: ['/**', ' * Shape.', ' */', 'interface X { a: number }'].join(
          '\n',
        ),
      },
    ],
    invalid: [
      // Type alias.
      {
        code: '/** Shape. */\ntype X = { a: number };',
        errors: [ERROR],
        output: '/**\n * Shape.\n */\ntype X = { a: number };',
      },
      // Generic type alias (the case from music-index-upgraders.ts).
      {
        code: '/** Loosely-typed shape. */\ntype IndexVersion<N extends number> = { version: N };',
        errors: [ERROR],
        output:
          '/**\n * Loosely-typed shape.\n */\ntype IndexVersion<N extends number> = { version: N };',
      },
      // Interface.
      {
        code: '/** Shape. */\ninterface X { a: number }',
        errors: [ERROR],
        output: '/**\n * Shape.\n */\ninterface X { a: number }',
      },
      // Enum.
      {
        code: '/** Values. */\nenum E { A, B }',
        errors: [ERROR],
        output: '/**\n * Values.\n */\nenum E { A, B }',
      },
      // Exported type alias.
      {
        code: '/** Shape. */\nexport type X = number;',
        errors: [ERROR],
        output: '/**\n * Shape.\n */\nexport type X = number;',
      },
    ],
  },
);

console.log('multiline-jsdoc-declaration-comments: all tests passed');
