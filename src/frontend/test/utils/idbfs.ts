import { act } from '@testing-library/react';
import { setImmediate as realSetImmediate } from 'timers';
import { A } from 'frontend';
import { IDBFS, openIDBFS } from 'frontend/logic/file-store/indexeddb-fs';
import type { createStore } from 'frontend/store/create-store';
import { ensureExists } from 'frontend/utils';
import { buildTestFiles } from './fixtures';

/**
 * Prefer this helper over mocking FileStoreCache in component tests. It
 * exercises browser-file storage through a real IDBFS instance.
 */
export function useTestIDBFS(dbName = 'test-only-db') {
  let idbfs: IDBFS | null = null;

  beforeEach(async () => {
    idbfs = await openIDBFS(dbName);
  });

  afterEach(async () => {
    idbfs?.close();
    idbfs = null;
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(dbName);
      request.onsuccess = () => resolve();
      request.onblocked = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });

  return {
    getIDBFS() {
      return ensureExists(idbfs);
    },
  };
}

/**
 * Connects browser storage using real test files instead of a FileStoreCache
 * mock. This keeps component setup close to how the app uses browser files.
 */
export async function connectBrowserFiles(
  store: ReturnType<typeof createStore>,
  idbfs: IDBFS,
  paths = ['/Welcome.md'],
) {
  store.dispatch(A.connectIDBFS(idbfs));
  await buildTestFiles(idbfs, paths);
}

/**
 * IDBFS finishes its work on the real setImmediate, which jest's fake timers
 * don't control. Alternate between both so that in-flight saves settle inside
 * act before the test or the database goes away.
 */
export async function flushStorage() {
  await act(async () => {
    for (let i = 0; i < 3; i++) {
      await jest.runAllTimersAsync();
      await new Promise((resolve) => realSetImmediate(resolve));
    }
  });
}
