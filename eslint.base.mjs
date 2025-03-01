import importPlugin from 'eslint-plugin-import';
import prettierPlugin from 'eslint-plugin-prettier';
import reactPlugin from 'eslint-plugin-react';
import eslintJS from '@eslint/js';
import eslintTypeScript from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export const baseConfigs = [
  eslintJS.configs.recommended,
  reactPlugin.configs.flat.recommended,
  ...eslintTypeScript.configs.recommended,
  importPlugin.flatConfigs.recommended,
  prettierConfig,

  {
    languageOptions: {
      parserOptions: {
        ecmaVersion: 'latest',
      },
    },
    settings: {
      react: { version: 'detect' },
      'import/resolver': {
        // node: {
        //   paths: ['./src'],
        // },
        typescript: {
          alwaysTryTypes: true,
          project: [
            'src/server/tsconfig.json',
            'src/shared/tsconfig.json',
            'src/frontend/tsconfig.json',
          ],
        },
      },
    },
    plugins: {
      prettier: prettierPlugin,
    },
    ignores: ['.git/', 'data/', 'dist/', '**/node_modules/*'],
    rules: {
      'prettier/prettier': 'error',

      // Plugin rules:
      'import/no-duplicates': 'error',
      'import/no-unresolved': 'error',
      'import/named': 'error',
      'import/export': 'error',
      'import/no-default-export': 'error',

      'react/no-access-state-in-setstate': 'error',
      'react/no-danger': 'error',
      'react/no-did-mount-set-state': 'error',
      'react/no-did-update-set-state': 'error',
      'react/no-will-update-set-state': 'error',
      'react/no-redundant-should-component-update': 'error',
      'react/no-typos': 'error',
      // `no-unused-prop-types` is buggy when we use destructuring parameters in
      // functions as it misunderstands them as functional components.
      // See https://github.com/yannickcr/eslint-plugin-react/issues/1561
      // 'react/no-unused-prop-types': 'error',
      'react/no-unused-state': 'error',
      // False positives.
      'react/jsx-key': 'off',

      // overriding recommended rules
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-console': ['error', { allow: ['log', 'warn', 'error'] }],
      'no-void': 'off', // Useful for promise checks.
      'no-inner-declarations': 'off', // Whyyy.

      // possible errors
      'array-callback-return': 'error',
      'consistent-return': 'error',
      'default-case': 'error',
      'dot-notation': 'error',
      eqeqeq: 'error',
      'for-direction': 'error',
      'no-caller': 'error',
      'no-eval': 'error',
      'no-extend-native': 'error',
      'no-extra-bind': 'error',
      'no-extra-label': 'error',
      'no-implied-eval': 'error',
      'no-return-await': 'error',
      'no-self-compare': 'error',
      'no-throw-literal': 'error',
      'no-unmodified-loop-condition': 'error',
      'no-useless-call': 'error',
      'no-useless-computed-key': 'error',
      'no-useless-concat': 'error',
      'no-useless-constructor': 'error',
      'no-useless-rename': 'error',
      'no-useless-return': 'error',
      'no-var': 'error',
      'no-with': 'error',
      'prefer-const': 'error',
      'prefer-promise-reject-errors': 'error',
      'prefer-rest-params': 'error',
      'prefer-spread': 'error',

      // Typescript
      '@typescript-eslint/no-inferrable-types': 'off',
      // Inferring trivial types is fine.
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      // This can be helpful.
      '@typescript-eslint/no-explicit-any': 'off',
      // There are lots of legitimate uses of require.
      '@typescript-eslint/no-var-requires': 'off',
      // This breaks destructuring.
      '@typescript-eslint/unbound-method': 'off',
      // This has false positives where Router.NavigationType === "POP" wasn't
      // being allowed.
      '@typescript-eslint/no-unsafe-enum-comparison': 'off',
      // Providing empty functions is useful for noops.
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-namespace': 'off',
      // Too many false positives with no-unsafe-*.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      // There were false positives.
      '@typescript-eslint/restrict-template-expressions': 'off',

      // Only use the TypeScript variant.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
];
