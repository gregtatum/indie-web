export default {
  overrides: [
    // Frontend
    {
      files: ['src/frontend/**/*.{ts,tsx,js,jsx}'],
      extends: ['./.eslintrc.base.js'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        project: ['./src/frontend/tsconfig.json'],
        ecmaVersion: 2020,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      rules: {},
    },
    {
      files: ['src/frontend/test/**/*.js'],
      env: {
        jest: true,
      },
    },

    // Shared
    {
      files: ['src/shared/**/*.ts'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        project: ['./src/shared/tsconfig.json'],
        ecmaVersion: 2020,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },

    // Server
    {
      files: ['src/server/**/*.ts'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        project: ['./src/server/tsconfig.json'],
        ecmaVersion: 2020,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },

    // Config and build files
    {
      files: ['*.js'],
      env: {
        node: true,
        es2022: true,
      },
      parserOptions: {
        sourceType: 'module',
      },
    },
  ],
};
