import { RuleTester } from 'eslint';
import { noFocusedTests } from './no-focused-tests.mjs';

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
});

const ERROR = { messageId: 'noFocusedTests' };

ruleTester.run('no-focused-tests', /** @type {any} */ (noFocusedTests), {
  valid: [
    { code: 'test("does a thing", () => {});' },
    { code: 'it("does a thing", () => {});' },
    { code: 'describe("a group", () => {});' },
    // Explicitly skipping a test is fine.
    { code: 'test.skip("does a thing", () => {});' },
    { code: 'it.skip("does a thing", () => {});' },
    { code: 'describe.skip("a group", () => {});' },
    { code: 'xit("does a thing", () => {});' },
    { code: 'xdescribe("a group", () => {});' },
    { code: 'xtest("does a thing", () => {});' },
    // A user-defined "only" on an unrelated object is fine.
    { code: 'menu.only(() => {});' },
    { code: 'const only = getOnly(); only();' },
  ],
  invalid: [
    { code: 'fit("does a thing", () => {});', errors: [ERROR] },
    { code: 'fdescribe("a group", () => {});', errors: [ERROR] },
    { code: 'test.only("does a thing", () => {});', errors: [ERROR] },
    { code: 'it.only("does a thing", () => {});', errors: [ERROR] },
    { code: 'describe.only("a group", () => {});', errors: [ERROR] },
    // Chained forms.
    {
      code: 'test.concurrent.only("does a thing", () => {});',
      errors: [ERROR],
    },
    {
      code: 'it.each([1, 2]).only("does a thing %i", (n) => {});',
      errors: [ERROR],
    },
  ],
});

console.log('no-focused-tests: all tests passed');
