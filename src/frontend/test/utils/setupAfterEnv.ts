import fetchMock from '@fetch-mock/jest';
import { cleanup } from '@testing-library/react';
import { act } from 'react';
import { resetTestGeneration } from './fixtures';
import { persistedState } from 'frontend/logic/persisted-state';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { Blob } from 'node:buffer';
import { MUSIC_INDEX_VERSION } from 'shared/music';

globalThis.structuredClone = structuredClone;

const originalEnv = process.env;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;
let consoleErrorCalls: unknown[][] = [];
interface ConsoleErrorExpectation {
  filter: (args: unknown[]) => boolean;
  matched: boolean;
}
let consoleErrorExpectations: ConsoleErrorExpectation[] = [];

export function expectConsoleError(filter: (args: unknown[]) => boolean) {
  consoleErrorExpectations.push({ filter, matched: false });
}
/**
 * The secure digest is not available for some reason in Jest. Work around it
 * by providing a simple insecure implementation.
 */
function simpleDigest256(_scheme: string, buffer: Uint8Array): ArrayBuffer {
  const outputSize = 256;
  const resultBuffer = new ArrayBuffer(outputSize);
  const resultView = new Uint8Array(resultBuffer);

  let hash = 0;
  for (let i = 0; i < buffer.length; i++) {
    const value = buffer[i];
    hash = (hash * 31 + value) % 0xffffffff;
    const index = i % outputSize;
    resultView[index] = (resultView[index] + (hash & 0xff)) % 256;
  }

  return resultBuffer;
}

beforeEach(function () {
  consoleErrorCalls = [];
  consoleErrorExpectations = [];
  persistedState.musicPlaybackResume.remove();
  jest.resetModules();
  jest.spyOn(window, 'scrollBy').mockImplementation();
  jest.spyOn(console, 'warn').mockImplementation((...args) => {
    const [message, ...rest] = args;

    // Suppress this warn statement. I don't care and will deal with migrations when/if
    // I upgrade the component.
    if (
      typeof message === 'string' &&
      message.includes('⚠️ React Router Future Flag Warning')
    ) {
      return;
    }

    originalConsoleWarn.call(console, message, ...rest);
  });
  jest.spyOn(console, 'error').mockImplementation((...args) => {
    originalConsoleError.call(console, ...args);
    const expectation = consoleErrorExpectations.find((e) => e.filter(args));
    if (expectation) {
      expectation.matched = true;
      return;
    }
    consoleErrorCalls.push(args);
  });
  HTMLMediaElement.prototype.load = jest.fn();
  HTMLMediaElement.prototype.pause = jest.fn();
  HTMLMediaElement.prototype.play = jest.fn(() => Promise.resolve());
  global.indexedDB = new IDBFactory();
  fetchMock.mockGlobal();
  // Default response for a music server's root route, so tests using a mocked
  // FAKE_SERVER report as fully up to date rather than spuriously showing the
  // "server outdated" notice added in Music/index.tsx.
  fetchMock.get(/\/music$/, {
    body: JSON.stringify({
      routes: [],
      maxMusicIndexVersion: MUSIC_INDEX_VERSION,
    }),
    status: 200,
  });
  // MusicLibraryView fetches this on mount regardless of the test's focus.
  fetchMock.get(/\/music\/staged-batches$/, { body: '[]', status: 200 });
  (global as any).Blob = Blob;
  (crypto as any).subtle = { digest: simpleDigest256 };

  document.body.querySelector('#overlayContainer')?.remove();
  const overlayContainer = document.createElement('div');
  overlayContainer.id = 'overlayContainer';
  document.body.appendChild(overlayContainer);

  document.body.querySelector('#modalsContainer')?.remove();
  const modalsContainer = document.createElement('div');
  modalsContainer.id = 'modalsContainer';
  document.body.appendChild(modalsContainer);

  function getBoundingClientRect(): DOMRect {
    const rec = {
      x: 0,
      y: 0,
      bottom: 0,
      height: 0,
      left: 0,
      right: 0,
      top: 0,
      width: 0,
    };
    return { ...rec, toJSON: () => rec };
  }

  class FakeDOMRectList extends Array<DOMRect> implements DOMRectList {
    item(index: number): DOMRect | null {
      return this[index];
    }
  }

  document.createRange = () => {
    const range = new Range();

    (range as any).getBoundingClientRect = getBoundingClientRect;
    (range as any).getClientRects = (): DOMRectList => new FakeDOMRectList();

    return range;
  };

  document.elementFromPoint = (): null => null;
  HTMLElement.prototype.scrollIntoView = jest.fn();
  (navigator as any).mediaSession = {
    metadata: null,
    playbackState: 'none',
    setActionHandler: jest.fn(),
  };
  (global as any).MediaMetadata = class MediaMetadata {
    constructor(init?: MediaMetadataInit) {
      Object.assign(this, init);
    }
  };
  HTMLElement.prototype.getBoundingClientRect = getBoundingClientRect;
  HTMLElement.prototype.getClientRects = (): DOMRectList =>
    new FakeDOMRectList();
  Range.prototype.getBoundingClientRect = getBoundingClientRect;
  Range.prototype.getClientRects = (): DOMRectList => new FakeDOMRectList();

  // Use a class so the constructor survives jest.resetAllMocks(): a jest.fn()
  // constructor returns {} after reset (implementation cleared, `new` falls back
  // to returning `this`), which has no disconnect/observe methods and breaks
  // any code that calls them during cleanup after mock teardown.
  class MockResizeObserver {
    observe = jest.fn();
    unobserve = jest.fn();
    disconnect = jest.fn();
  }
  (global as any).ResizeObserver = MockResizeObserver;

  class MockMediaQueryList {
    matches: boolean;
    media: string;
    onchange: null = null;
    constructor(query: string) {
      this.media = query;
      // Lightly stub out min/max width mechanics.
      const minWidth = query.match(/^\(min-width:\s*(\d+)px\)$/);
      const maxWidth = query.match(/^\(max-width:\s*(\d+)px\)$/);
      if (minWidth) {
        this.matches = window.innerWidth >= Number(minWidth[1]);
      } else if (maxWidth) {
        this.matches = window.innerWidth <= Number(maxWidth[1]);
      } else if (
        // Other known queries.
        query === '(prefers-reduced-motion: reduce)' ||
        query === '(pointer: coarse)' ||
        query === 'print'
      ) {
        this.matches = false;
      } else {
        throw new Error(
          `MockMediaQueryList does not know how to evaluate the media ` +
            `query "${query}". Add a case for it in setupAfterEnv.ts.`,
        );
      }
    }
    addEventListener = jest.fn();
    removeEventListener = jest.fn();
    addListener = jest.fn();
    removeListener = jest.fn();
    dispatchEvent = jest.fn();
  }
  window.matchMedia = (query: string) =>
    new MockMediaQueryList(query) as unknown as MediaQueryList;
});

afterEach(async () => {
  // Wrap the final component settling into 3 microtask waits. This allows external
  // libraries to resolve their internal mechanics.
  jest.useRealTimers();
  await act(async () => {
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });

  // Unmount here so a console.error from it is attributed to this test.
  cleanup();

  indexedDB = new IDBFactory();

  jest.resetAllMocks();
  jest.restoreAllMocks();
  jest.clearAllTimers();
  jest.useRealTimers();
  fetchMock.mockReset();
  resetTestGeneration();

  process.env = originalEnv;

  if (consoleErrorCalls.length > 0) {
    const count = consoleErrorCalls.length;
    consoleErrorCalls = [];
    throw new Error(
      `console.error was called ${count} time(s) during this test, which is disallowed. See the message(s) logged above for details.`,
    );
  }

  const unmatched = consoleErrorExpectations.filter((e) => !e.matched);
  if (unmatched.length > 0) {
    consoleErrorExpectations = [];
    throw new Error(
      `expectConsoleError was called ${unmatched.length} time(s) during this test, but the expected console.error never happened.`,
    );
  }
});
