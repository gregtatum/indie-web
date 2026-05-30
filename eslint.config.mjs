import globals from 'globals';
import { baseConfigs } from './eslint.base.mjs';
import { noPathInServer } from './src/shared/lint/js/no-path-in-server.mjs';
import { noMountPathConcat } from './src/shared/lint/js/no-mount-path-concat.mjs';

const indieWebPlugin = {
  rules: {
    'no-path-in-server': noPathInServer,
    'no-mount-path-concat': noMountPathConcat,
  },
};

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
    plugins: { 'indie-web': indieWebPlugin },
    languageOptions: {
      parserOptions: {
        project: ['./src/server/tsconfig.json'],
        ecmaVersion: 2020,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      'indie-web/no-path-in-server': 'error',
      'indie-web/no-mount-path-concat': 'error',
    },
  },
  {
    files: ['src/server/utils.ts', 'src/server/test/**/*.ts'],
    rules: {
      'indie-web/no-path-in-server': 'off',
      'indie-web/no-mount-path-concat': 'off',
    },
  },

  // Config and build files
  {
    files: ['*.js', '*.mjs', 'src/shared/lint/**/*.mjs'],
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
