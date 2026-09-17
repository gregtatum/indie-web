// This works around an error where structured clone is not defined.
// https://github.com/jsdom/jsdom/issues/3363
import JSDOMEnvironment from 'jest-environment-jsdom';
import { randomUUID } from 'node:crypto';

// eslint-disable-next-line import/no-default-export
export default class FixJSDOMEnvironment extends JSDOMEnvironment {
  constructor(...args: ConstructorParameters<typeof JSDOMEnvironment>) {
    super(...args);

    if (this.global.structuredClone as any) {
      // In package.json change:
      // - "testEnvironment": "./src/frontend/test/utils/fix-jsdom.ts",
      // + "testEnvironment": "jsdom",

      throw new Error(
        'structuredClone is available, now. Remove this workaround.',
      );
    }
    this.global.structuredClone = structuredClone;
  }

  async setup() {
    await super.setup();

    // jsdom has no native fetch/Request/Response/ReadableStream. @fetch-mock/jest
    // requires the real Node implementations of these (not a polyfill like
    // node-fetch) since it does `instanceof` checks against them internally.
    this.global.fetch = fetch;
    this.global.Headers = Headers;
    this.global.Request = Request;
    this.global.Response = Response;
    this.global.ReadableStream = ReadableStream;

    // jsdom's File/Blob aren't recognized as Blob-like by real fetch
    // implementations (node-fetch, undici) — a jsdom File passed as a fetch
    // body silently serializes to the string "[object File]" instead of its
    // bytes.
    this.global.Blob = Blob;
    this.global.File = File;

    // jsdom has no TextEncoder/TextDecoder, but react-router references them
    // at import time.
    this.global.TextEncoder = TextEncoder;
    this.global.TextDecoder = TextDecoder as any;

    // jsdom's crypto object has no randomUUID.
    if (!this.global.crypto.randomUUID) {
      this.global.crypto.randomUUID = randomUUID as any;
    }
  }
}
