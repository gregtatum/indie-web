/* eslint-disable @typescript-eslint/no-require-imports */

import fetchMockJest = require('fetch-mock-jest');
import { Headers, Request, Response } from 'node-fetch';
import { resetTestGeneration } from './fixtures';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { Blob } from 'node:buffer';

globalThis.structuredClone = structuredClone;

const originalEnv = process.env;
const originalConsoleWarn = console.warn;
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
  jest.resetModules();
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
  global.indexedDB = new IDBFactory();
  (global as any).fetch = fetchMockJest.sandbox();
  (global as any).Headers = Headers;
  (global as any).Request = Request;
  (global as any).Response = Response;
  (global as any).Blob = Blob;
  (crypto as any).subtle = { digest: simpleDigest256 };

  document.body.querySelector('#overlayContainer')?.remove();
  const overlayContainer = document.createElement('div');
  overlayContainer.id = 'overlayContainer';
  document.body.appendChild(overlayContainer);

  document.createRange = () => {
    const range = new Range();

    (range as any).getBoundingClientRect = jest.fn();

    (range as any).getClientRects = jest.fn(() => ({
      item: () => null,
      length: 0,
      [Symbol.iterator]: jest.fn(),
    }));

    return range;
  };

  (global as any).ResizeObserver = jest.fn().mockImplementation(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
  }));
});

afterEach(() => {
  const FDBFactory = require('fake-indexeddb/lib/FDBFactory');
  indexedDB = new FDBFactory();

  jest.resetAllMocks();
  jest.restoreAllMocks();
  jest.clearAllTimers();
  jest.useRealTimers();
  fetchMockJest.mockReset();
  resetTestGeneration();

  process.env = originalEnv;
});
