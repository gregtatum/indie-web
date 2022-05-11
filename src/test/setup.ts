// @ts-expect-error - Not sure why this is breaking.
import fetchMock from 'fetch-mock-jest';
import { Headers, Request, Response } from 'node-fetch';
import { join } from 'path';

require('dotenv').config({ path: join(__dirname, '../../.env.test') });

beforeEach(function () {
  global.fetch = fetchMock.sandbox();
  (global as any).Headers = Headers;
  (global as any).Request = Request;
  (global as any).Response = Response;
});

afterEach(() => {
  jest.resetAllMocks();
  jest.restoreAllMocks();
  jest.clearAllTimers();
  jest.useRealTimers();
  fetchMock.mockReset();
});
