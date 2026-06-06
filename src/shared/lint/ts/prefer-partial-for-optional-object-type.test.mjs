import { RuleTester } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { preferPartialForOptionalObjectType } from './prefer-partial-for-optional-object-type.mjs';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    ecmaVersion: 2022,
    sourceType: 'module',
  },
});

const ERROR = { messageId: 'preferPartial' };

ruleTester.run(
  'prefer-partial-for-optional-object-type',
  /** @type {any} */ (preferPartialForOptionalObjectType),
  {
    valid: [
      // Two optional properties is still readable enough without Partial.
      {
        code: 'type Small = { one?: string; two?: string };',
      },
      // Required properties are not equivalent to Partial.
      {
        code: 'type Mixed = { one?: string; two: string; three?: string };',
      },
      // Methods are ignored because Partial only applies to object properties.
      {
        code: 'type WithMethod = { one?: string; two?: string; three?(): string };',
      },
      // Already written as Partial.
      {
        code: 'type Already = Partial<{ one: string; two: string; three: string }>',
      },
    ],
    invalid: [
      {
        code: 'type Tags = { language?: string; description?: string; text?: string };',
        errors: [ERROR],
        output:
          'type Tags = Partial<{ language: string; description: string; text: string }>;',
      },
      {
        code: [
          'const comm = findFrameValue(meta, "COMM") as',
          '  | { language?: string; description?: string; text?: string }',
          '  | undefined;',
        ].join('\n'),
        errors: [ERROR],
        output: [
          'const comm = findFrameValue(meta, "COMM") as',
          '  | Partial<{ language: string; description: string; text: string }>',
          '  | undefined;',
        ].join('\n'),
      },
      {
        code: [
          'type MultiLine = {',
          '  readonly one?: string;',
          '  two?: number;',
          '  three?: boolean;',
          '};',
        ].join('\n'),
        errors: [ERROR],
        output: [
          'type MultiLine = Partial<{',
          '  readonly one: string;',
          '  two: number;',
          '  three: boolean;',
          '}>;',
        ].join('\n'),
      },
    ],
  },
);

console.log('prefer-partial-for-optional-object-type: all tests passed');
