import { T } from 'frontend';
import type { WorkerClient } from 'frontend/worker/client';
import { persistedState } from 'frontend/logic/persisted-state';

export abstract class FileStore {
  // Await on this during initialization.
  cachePromise?: Promise<void>;
  workerClient: WorkerClient | null;

  constructor(workerClient: WorkerClient | null = null) {
    this.workerClient = workerClient;
  }

  abstract saveBlob(
    pathOrMetadata: string | T.FileMetadata,
    mode: T.SaveMode,
    contents: Blob,
    onProgress?: (uploadedBytes: number) => void,
  ): Promise<T.FileMetadata>;

  saveText(
    pathOrMetadata: string | T.FileMetadata,
    mode: T.SaveMode,
    text: string,
  ): Promise<T.FileMetadata> {
    return this.saveBlob(
      pathOrMetadata,
      mode,
      new Blob([text], { type: 'text/plain' }),
    );
  }

  abstract loadBlob(path: string): Promise<T.BlobFile>;

  loadText(path: string): Promise<T.TextFile> {
    return this.loadBlob(path).then(async ({ metadata, blob }) => {
      return {
        metadata,
        text: await blob.text(),
      };
    });
  }

  abstract listFiles(path: string): Promise<T.FolderListing>;

  abstract move(
    fromPath: string,
    toPath: string,
  ): Promise<T.FileMetadata | T.FolderMetadata>;

  abstract createFolder(path: string): Promise<T.FolderMetadata>;

  abstract compressFolder(path: string): Promise<Blob>;

  abstract delete(path: string): Promise<void>;

  cache?: FileStoreCache;

  protected cacheBlob(
    metadata: T.FileMetadata,
    mode: T.SaveMode,
    blob: Blob,
  ): void {
    const cache = this.cache;
    if (!cache) {
      return;
    }
    cache
      .saveBlob(metadata, mode, blob)
      .then(async () => cache.evictLargeFiles(await getCacheBudget()))
      .catch((error) => console.error('Failed to cache blob', error));
  }
}

export const DEFAULT_CACHE_BUDGET = 500_000_000;

export async function getMaxCacheBudget(): Promise<number> {
  const quota = (await navigator.storage?.estimate?.())?.quota;
  return quota ?? DEFAULT_CACHE_BUDGET;
}

export function resolveCacheBudget(
  setting: number | null,
  maxBudget: number,
): number {
  return Math.min(setting ?? DEFAULT_CACHE_BUDGET, maxBudget);
}

export async function getCacheBudget(): Promise<number> {
  return resolveCacheBudget(
    persistedState.fileStoreCacheBudget.read(),
    await getMaxCacheBudget(),
  );
}

export const DROPBOX_CACHE_KEY = 'dropbox';

export function getServerCacheKey(serverId: string) {
  return `server:${serverId}`;
}

export function isCacheEnabled(
  settings: Record<string, boolean>,
  cacheKey: string,
): boolean {
  return settings[cacheKey] ?? process.env.NODE_ENV !== 'test';
}

export abstract class FileStoreCache extends FileStore {
  abstract addFolderListing(
    path: string,
    files: T.FolderListing,
  ): Promise<T.FolderListingRow>;

  abstract isCached(path: string): Promise<boolean>;

  /**
   * Returns the approximate byte size and file count of cached files, grouped by
   * the kind of file.
   */
  abstract getUsageByCategory(): Promise<T.CacheCategoryUsage>;

  /**
   * Determines which items in a folder listing are cached or not.
   */
  abstract getCachedFolderListing(files: T.FolderListing): Promise<Set<string>>;

  /**
   * Adds a listing fetched from the origin, and drops cached entries that the
   * origin no longer has.
   */
  abstract syncFolderListing(
    path: string,
    files: T.FolderListing,
  ): Promise<T.FolderListingRow>;

  /**
   * Evicts the least recently used large files until the large files fit in the
   * budget. Small files, like text, are always kept.
   */
  abstract evictLargeFiles(budgetBytes: number): Promise<void>;

  /**
   * Clears the cache.
   */
  abstract clear(): Promise<void>;

  /**
   * Returns the total number of files stored in the cache.
   */
  abstract getFileCount(): Promise<number>;
}

/**
 * A shared error type that all FileStore implementors can throw with to provide
 * a consistent interface.
 */
export abstract class FileStoreError<T = any> {
  error: T;
  constructor(error: T) {
    this.error = error;
  }

  /**
   * The human friendly string version of this error.
   */
  abstract toString(): string;

  /**
   * The HTTP status code.
   */
  abstract status(): number;

  /**
   * Was this error because the path was not found?
   */
  abstract isNotFound(): boolean;
}
