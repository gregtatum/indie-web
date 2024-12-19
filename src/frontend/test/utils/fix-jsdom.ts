// This works around an error where structured clone is not defined.
// https://github.com/jsdom/jsdom/issues/3363
import JSDOMEnvironment from 'jest-environment-jsdom';

// eslint-disable-next-line import/no-default-export
export default class FixJSDOMEnvironment extends JSDOMEnvironment {
  constructor(...args: ConstructorParameters<typeof JSDOMEnvironment>) {
    super(...args);

    if (this.global.structuredClone as any) {
      // In package.json change:
      // - "testEnvironment": "./src/test/utils/fix-jsdom.ts",
      // + "testEnvironment": "jsdom",

      throw new Error(
        'structuredClone is available, now. Remove this workaround.',
      );
    }
    this.global.structuredClone = structuredClone;
  }
}
