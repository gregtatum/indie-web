// @ts-expect-error - Not sure why this is breaking.
import fetchMock from 'fetch-mock-jest';
import { Headers, Request, Response } from 'node-fetch';
import { resetTestGeneration } from './fixtures';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { Blob } from 'node:buffer';

globalThis.structuredClone = structuredClone;

const originalEnv = process.env;

beforeEach(function () {
  jest.resetModules();
  global.indexedDB = new IDBFactory();
  global.fetch = fetchMock.sandbox();
  (global as any).Headers = Headers;
  (global as any).Request = Request;
  (global as any).Response = Response;
  (global as any).Blob = Blob;

  document.body.querySelector('#overlayContainer')?.remove();
  const overlayContainer = document.createElement('div');
  overlayContainer.id = 'overlayContainer';
  document.body.appendChild(overlayContainer);

  document.createRange = () => {
    const range = new Range();

    range.getBoundingClientRect = jest.fn();

    range.getClientRects = jest.fn(() => ({
      item: () => null,
      length: 0,
      [Symbol.iterator]: jest.fn(),
    }));

    return range;
  };

  global.ResizeObserver = jest.fn().mockImplementation(() => ({
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
  fetchMock.mockReset();
  resetTestGeneration();

  process.env = originalEnv;
});
