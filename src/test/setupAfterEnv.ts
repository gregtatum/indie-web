// @ts-expect-error - Not sure why this is breaking.
import fetchMock from 'fetch-mock-jest';
import { Headers, Request, Response } from 'node-fetch';
import { join } from 'path';
import { resetTestGeneration } from './fixtures';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';

require('dotenv').config({ path: join(__dirname, '../../.env.test') });

const originalEnv = process.env;

beforeEach(function () {
  jest.resetModules();
  global.indexedDB = new IDBFactory();
  global.fetch = fetchMock.sandbox();
  (global as any).Headers = Headers;
  (global as any).Request = Request;
  (global as any).Response = Response;
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
