export default {
  // Sets the path to the prettier node module used to update inline snapshots.
  // Prettier 3 will be supported in Jest v30.0.0.
  prettierPath: './node_modules/prettier-2/index.js',

  // An array of glob patterns indicating a set of files for which coverage information should be collected
  collectCoverageFrom: [
    'src/frontend/**/*.{js,jsx,ts,tsx}',
    // The "!" is a negated pattern
    '!**/node_modules/**',
  ],

  // The test environment that will be used for testing.
  // This file contains a fix for structured cloning, and re-exports the jsdom environment
  // provided by the jest-environment-jsdom module.
  testEnvironment: './src/frontend/test/utils/fix-jsdom.ts',

  // An array of regexp pattern strings that are matched against all source file paths
  // before transformation. If the file path matches any of the patterns, it will not
  // be transformed.
  // Default: ["/node_modules/", "\\.pnp\\.[^\\\/]+$"]
  transformIgnorePatterns: ['/node_modules/(?!${esModules})'],

  // A map from regular expressions to module names or to arrays of module names that
  // allow to stub out resources, like images or styles with a single module. Modules
  // that are mapped to an alias are unmocked by default, regardless of whether
  // automocking is enabled or not.
  //
  // Use <rootDir> string token to refer to rootDir value if you want to use file paths.
  //Additionally, you can substitute captured regex groups using numbered backreferences
  moduleNameMapper: {
    '\\.(css|less)$': '<rootDir>/src/frontend/test/__mocks__/style.ts',

    // This import fails from a nanoid dependency.
    // import { Hunspell, loadModule } from 'hunspell-asm';
    '^nanoid(/(.*)|$)': 'nanoid$1',

    // Babel handles the aliasing in .babelrc
  },

  // A list of paths to directories that Jest should use to search for files in.
  roots: ['src/frontend/test'],

  // A list of paths to modules that run some code to configure or set up the testing
  // environment. Each setupFile will be run once per test file. Since every test runs
  // in its own environment, these scripts will be executed in the testing environment
  // before executing setupFilesAfterEnv and before the test code itself.
  //
  // Here I use this to set up the process.env values.
  setupFiles: ['./src/frontend/test/utils/setupFiles.ts'],

  // A list of paths to modules that run some code to configure or set up the testing
  // framework before each test file in the suite is executed. Since setupFiles executes
  // before the test framework is installed in the environment, this script file presents
  // you the opportunity of running some code immediately after the test framework has
  // been installed in the environment but before the test code itself.
  //
  // Here is where I setup all the mocks.
  setupFilesAfterEnv: ['./src/frontend/test/utils/setupAfterEnv.ts'],

  // Indicates whether each individual test should be reported during the run.
  verbose: true,
};
