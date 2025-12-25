import globals from 'globals';
import { baseConfigs } from './eslint.base.mjs';

export default [
  {
    ignores: [
      'src/frontend/logic/chordpo-lang/syntax.grammar.ts',
      'src/frontend/logic/chordpo-lang/syntax.grammar.terms.ts',
    ],
  },
  ...baseConfigs,

  // Frontend
  {
    files: ['src/frontend/**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      parserOptions: {
        project: ['./src/frontend/tsconfig.json'],
        ecmaVersion: 2020,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {},
  },
  {
    files: ['src/frontend/test/**/*.js'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, ...globals.jest },
    },
  },

  // Shared
  {
    files: ['src/shared/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./src/shared/tsconfig.json'],
        ecmaVersion: 2020,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
  },

  // Server
  {
    files: ['src/server/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./src/server/tsconfig.json'],
        ecmaVersion: 2020,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
  },

  // Config and build files
  {
    files: ['*.js', '*.mjs'],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        sourceType: 'module',
      },
    },
    rules: {
      'import/no-default-export': 'off',
    },
  },
];
