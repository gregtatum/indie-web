import * as idb from 'idb';
import * as uuid from 'uuid';
import { FileStoreCache, FileStoreError } from 'frontend/logic/file-store';
import { type T } from 'frontend';
import type { WorkerClient } from 'frontend/worker/client';
import { getPathFileName, getDirName, updatePathRoot } from 'frontend/utils';
import * as AppLogic from 'frontend/logic/app-logic';

export const BROWSER_FILES_DB_NAME = 'browser-files';

/**
 * This files implements a browser-based file system abstraction layer called IDBFS,
 * implementing the FileStoreCache API. It can be used either as a cache for network-based
 * file system, or it can be used for storage in its own right.
 */

/**
 * Implement the FileStoreError for consistent error types.
 */
export class IDBError extends FileStoreError {
  #missing = false;

  toString() {
    return this.error.toString();
  }

  status() {
    return this.error.toString();
  }

  isNotFound() {
    return this.#missing;
  }

  static wrap(error: any) {
    return Promise.reject(new IDBError(error));
  }

  static notFound(message = 'Not found') {
    const error = new IDBError(message);
    error.#missing = true;
    return error;
  }

  cacheLog() {
    if (this.#missing) {
      log('Cache miss:', this.error);
    } else {
      console.error('[idbfs]', this.error);
    }
  }
}

function log(key: string, ...args: any[]) {
  const style = 'color: #FF006D; font-weight: bold';
  if (process.env.NODE_ENV !== 'test') {
    console.log(`[idbfs] %c"${key}"`, style, ...args);
  }
}

/**
 * Manage the life cycle of the IndexedDB instance.
 */
export async function openIDBFS(name: string): Promise<IDBFS>;
export async function openIDBFS(
  name: string,
  workerClient: WorkerClient | null,
): Promise<FileStoreCache>;
export async function openIDBFS(
  name: string,
  workerClient: WorkerClient | null = null,
): Promise<FileStoreCache> {
  if (workerClient) {
    return new WorkerIDBFS(name, workerClient);
  }
  let idbfs: IDBFS | null = null;

  const db = await idb.openDB<T.IDBFSSchema>(name, 1, {
    /**
     * Called if this version of the database has never been opened before. Use it to
     * specify the schema for the database.
     *
     * @param database A database instance that you can use to add/remove stores and indexes.
     * @param oldVersion Last version of the database opened by the user.
     * @param newVersion Whatever new version you provided.
     * @param transaction The transaction for this upgrade. This is useful if you need to get data
     * from other stores as part of a migration.
     */
    upgrade(db, _oldVersion, _newVersion, _transaction): void {
      const files = db.createObjectStore('files', {
        keyPath: 'metadata.path',
      });
      files.createIndex('by-hash', 'metadata.hash');
      files.createIndex('by-id', 'metadata.id');

      db.createObjectStore('folderListings', {
        keyPath: 'path',
      });
    },

    /**
     * Called if there are older versions of the database open on the origin, so this
     * version cannot open.
     */
    blocked() {
      log('The database is currently blocked');
    },

    /**
     * Called if this connection is blocking a future version of the database from opening.
     */
    blocking() {
      log('The database is currently blocking');
    },

    /**
     * Called if the browser abnormally terminates the connection.
     * This is not called when `db.close()` is called.
     */
    terminated() {
      log('The database was terminated.');
      if (idbfs) {
        idbfs.open = false;
      }
    },
  });

  idbfs = new IDBFS(db, workerClient);

  return idbfs;
}

class WorkerIDBFS extends FileStoreCache {
  #name: string;
  #workerClient: WorkerClient;

  constructor(name: string, workerClient: WorkerClient) {
    super(workerClient);
    this.#name = name;
    this.#workerClient = workerClient;
  }

  async listFiles(path: string): Promise<T.FolderListing> {
    return this.#request('listFiles', path);
  }

  async isCached(path: string): Promise<boolean> {
    return this.#request('isCached', path);
  }

  async getApproximateSize(): Promise<number> {
    return this.#request('getApproximateSize');
  }

  async clear(): Promise<void> {
    await this.#request('clear');
  }

  async getCachedFolderListing(listing: T.FolderListing): Promise<Set<string>> {
    const cached = await this.#request<string[]>(
      'getCachedFolderListing',
      listing,
    );
    return new Set(cached);
  }

  async createFolder(path: string): Promise<T.FolderMetadata> {
    return this.#request('createFolder', path);
  }

  async addFolderListing(
    path: string,
    files: T.FolderListing,
  ): Promise<T.FolderListingRow> {
    return this.#request('addFolderListing', path, files);
  }

  async fileExists(path: string): Promise<boolean> {
    return this.#request('fileExists', path);
  }

  async loadBlob(path: string): Promise<T.BlobFile> {
    return this.#request('loadBlob', path);
  }

  async compressFolder(path: string): Promise<Blob> {
    return this.#request('compressFolder', path);
  }

  async getFileCount(): Promise<number> {
    return this.#request('getFileCount');
  }

  async saveBlob(
    pathOrMetadata: string | T.FileMetadata,
    mode: T.SaveMode,
    blob: Blob,
  ): Promise<T.FileMetadata> {
    return this.#request('saveBlob', pathOrMetadata, mode, blob);
  }

  async delete(path: string): Promise<void> {
    await this.#request('delete', path);
  }

  async move(
    fromPath: string,
    toPath: string,
  ): Promise<T.FileMetadata | T.FolderMetadata> {
    return this.#request('move', fromPath, toPath);
  }

  async updateMetadata(
    path: string,
    metadata: Partial<T.FileMetadata>,
  ): Promise<void> {
    await this.#request('updateMetadata', path, metadata);
  }

  async #request<T = unknown>(method: string, ...args: unknown[]): Promise<T> {
    try {
      return await this.#workerClient.requestIDBFS<T>(this.#name, method, args);
    } catch (error) {
      const payload = error as {
        kind?: 'idb-error';
        message?: string;
        isNotFound?: boolean;
      };
      if (payload?.kind === 'idb-error') {
        if (payload.isNotFound) {
          throw IDBError.notFound(payload.message);
        }
        throw new IDBError(payload.message);
      }
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(String(payload?.message ?? error));
    }
  }
}

/**
 * An IndexedDB backed FileStoreCache.
 */
export class IDBFS extends FileStoreCache {
  #db: idb.IDBPDatabase<T.IDBFSSchema>;
  open = true;
  constructor(
    db: idb.IDBPDatabase<T.IDBFSSchema>,
    workerClient: WorkerClient | null,
  ) {
    super(workerClient);
    this.#db = db;
  }

  async listFiles(path: string): Promise<T.FolderListing> {
    path = normalizePath(path);
    const row = await this.#db.get('folderListings', path);
    log('listFiles', path, { row });
    if (row) {
      return row.files;
    }
    if (path === '/') {
      // Trying to list the root but it was empty. Create an empty root folder.
      await this.addFolderListing('/', []);
      return [];
    }
    return Promise.reject(IDBError.notFound('No files found at ' + path));
  }

  async isCached(path: string): Promise<boolean> {
    path = normalizePath(path);
    const row = await this.#db.get('files', path);
    return Boolean(row);
  }

  async getApproximateSize(): Promise<number> {
    const tx = this.#db.transaction('files', 'readonly');
    const store = tx.objectStore('files');
    let total = 0;
    let cursor = await store.openCursor();
    while (cursor) {
      const row = cursor.value as T.StoredBlobFile | T.StoredTextFile;
      if (typeof row.metadata?.size === 'number') {
        total += row.metadata.size;
      } else if ('blob' in row && row.blob instanceof Blob) {
        total += row.blob.size;
      } else if ('text' in row && typeof row.text === 'string') {
        total += row.text.length;
      }
      cursor = await cursor.continue();
    }
    await tx.done;
    return total;
  }

  async clear(): Promise<void> {
    const tx = this.#db.transaction(['files', 'folderListings'], 'readwrite');
    await Promise.all([
      tx.objectStore('files').clear(),
      tx.objectStore('folderListings').clear(),
    ]);
    await tx.done;
  }

  /**
   * Determines which items in a folder listing are cached or not.
   */
  async getCachedFolderListing(listing: T.FolderListing): Promise<Set<string>> {
    const tx = this.#getReadWriteTX();
    const folderListings = tx.objectStore('folderListings');
    const files = tx.objectStore('files');
    const cached = new Set<string>();
    for (const file of listing) {
      if (file.type === 'folder') {
        if (await folderListings.getKey(file.path)) {
          cached.add(file.path);
        }
      } else {
        if (await files.getKey(file.path)) {
          cached.add(file.path);
        }
      }
    }
    await tx.done;
    return cached;
  }

  async createFolder(path: string): Promise<T.FolderMetadata> {
    const listingRow = await this.addFolderListing(path, []);
    return createFolderMetadata(listingRow.path);
  }

  /**
   * It's better to get a transaction over both the files and folder listing as
   * they are related. Not every operation will use both, but it's simpler and
   * safer this way..
   */
  #getReadWriteTX() {
    const transaction = this.#db.transaction(
      ['files', 'folderListings'],
      'readwrite',
    );
    transaction.done.catch((error) => {
      if (error?.name === 'AbortError') {
        // Ignore abort events, as this can be done intentionally.
        return undefined;
      }
      /* istanbul ignore next */
      return Promise.reject(error);
    });
    return transaction;
  }

  async addFolderListing(
    pathOrMetadata: string | T.FolderMetadata,
    files: T.FolderListing,
    // We may be recursively adding folder listings.
    tx = this.#getReadWriteTX(),
  ): Promise<T.FolderListingRow> {
    try {
      const metadata = getFolderMetadata(pathOrMetadata);
      const { path } = metadata;
      log('addFolderListing', path, files);

      const folderListingsStore = tx.objectStore('folderListings');
      const filesStore = tx.objectStore('files');

      // Insert the folder listing.
      const row: T.FolderListingRow = {
        storedAt: new Date(),
        path,
        files,
      };
      await folderListingsStore.put(row);

      if (path !== '/') {
        // Recursively construct the folder listings.
        const parentPath = getDirName(path);
        if (await filesStore.get(parentPath)) {
          throw new Error('A parent folder was actually a file: ' + parentPath);
        }
        const parent = await folderListingsStore.get(parentPath);
        if (parent) {
          // The parent exists, add the folder to it.
          const fileInParent = parent.files.find((file) => file.path === path);
          if (fileInParent) {
            /* istanbul ignore next */
            if (fileInParent.type !== 'folder') {
              throw new Error(
                'The file in the parent was not of type folder: ' +
                  fileInParent.path,
              );
            }
          } else {
            // Adding the folder.
            parent.files.push(createFolderMetadata(path));
            await folderListingsStore.put(parent);
          }
        } else {
          // The parent folder does not exist, create it with this folder.
          await this.addFolderListing(parentPath, [metadata], tx);
        }
      }
      await tx.done;
      return row;
    } catch (error) {
      tx.abort();
      throw error;
    }
  }

  /**
   * Check if a file exists.
   */
  async fileExists(path: string): Promise<boolean> {
    if (!path) {
      path = '/';
    }
    return Boolean(await this.#db.get('files', path));
  }

  async loadBlob(path: string): Promise<T.BlobFile> {
    if (!path) {
      path = '/';
    }
    const row = await this.#db.get('files', path);
    log('getFile', path, { metadata: row?.metadata });
    if (row) {
      if (process.env.NODE_ENV === 'test') {
        // @ts-expect-error - Blob text doesn't work correctly in Node and Jest. Fake it.
        const { text, metadata } = row;
        const blob = new Blob([text], { type: 'text/plain' });
        return { blob, metadata };
      }
      /* istanbul ignore next  */
      return { blob: row.blob, metadata: row.metadata };
    }
    return Promise.reject(IDBError.notFound('No file found at ' + path));
  }

  compressFolder() {
    /* istanbul ignore next */
    return Promise.reject(
      new Error('This is not current supported by the IndexedDB file system.'),
    );
  }

  async getFileCount(): Promise<number> {
    const tx = this.#getReadWriteTX();
    const store = tx.objectStore('files');
    const count = await store.count();
    await tx.done;
    return count;
  }

  async #getFileStoreIfNeedsUpdating(metadata: T.FileMetadata) {
    const tx = this.#getReadWriteTX();
    const store = tx.objectStore('files');
    const offline = await store.get(metadata.path);
    if (offline && offline.metadata.hash === metadata.hash) {
      // No need to update the offline file.
      return null;
    }
    return store;
  }

  async saveBlob(
    pathOrMetadata: string | T.FileMetadata,
    _mode: T.SaveMode,
    blob: Blob,
  ): Promise<T.FileMetadata> {
    const oldPath =
      typeof pathOrMetadata === 'string' ? null : pathOrMetadata.path;
    const metadata = await getFileMetadata(pathOrMetadata, blob);
    const store = await this.#getFileStoreIfNeedsUpdating(metadata);
    if (store) {
      /* istanbul ignore else */
      if (process.env.NODE_ENV === 'test') {
        // Blob text doesn't work correctly in Node and Jest. Fake it by saving text.
        const text: string = await blob.text();
        await store.put({ metadata, storedAt: new Date(), text } as any);
      } else {
        await store.put({ metadata, storedAt: new Date(), blob });
      }
      log('saveBlob', metadata.path, { metadata });
      await this.#updateFileInFolderListings(oldPath, metadata);
    } else {
      log('saveBlob', 'hash match');
    }

    return metadata;
  }

  /**
   * Updates the metadata in the `files` table.
   */
  async #updateFileMetadata(oldPath: string, metadata: T.FileMetadata) {
    const tx = this.#getReadWriteTX();
    const store = tx.objectStore('files');
    const oldFile = await store.get(oldPath);
    if (oldFile) {
      log('#updateFileMetadata', { oldFile, oldPath, metadata });
      if (metadata.path !== oldPath) {
        await store.delete(oldPath);
      }
      await store.put({
        ...oldFile,
        metadata,
        storedAt: new Date(),
      });
    } else {
      log('#updateFileMetadata - no metadata found to update for file', {
        oldFile: oldFile,
        oldPath,
        metadata,
      });
    }
    await tx.done;
  }

  /**
   * Updates a single file's metadata in a fileListing.
   */
  async #updateFileInFolderListings(
    oldPath: string | null,
    metadata: T.FileMetadata,
  ) {
    const tx = this.#getReadWriteTX();
    const folderListingsStore = tx.objectStore('folderListings');
    const oldFolderPath = oldPath ? getDirName(oldPath) : null;
    const newFolderPath = getDirName(metadata.path);
    let newFolder = await folderListingsStore.get(newFolderPath);

    log('#updateFileInFolderListings', {
      folder: newFolder,
      oldFolderPath,
      oldPath,
      newFolderPath,
      metadata,
    });

    // If the file is moved, the old folder needs to be updated.
    if (oldFolderPath !== null && oldFolderPath !== newFolderPath) {
      const oldFolder = await folderListingsStore.get(oldFolderPath);
      if (oldFolder) {
        // Remove the file from the old folder.
        oldFolder.files = oldFolder.files.filter(
          (file) => file.path !== oldPath,
        );
        await folderListingsStore.put(oldFolder);
      } else {
        log('#updateFileInFolderListings - no folder found', {
          oldFolder,
          oldPath,
          oldFolderPath,
          metadata,
        });
      }
    }

    if (newFolder) {
      newFolder.files = newFolder.files.filter((file) => {
        return file.path !== oldPath && file.path !== metadata.path;
      });
      newFolder.files.push(metadata);
      newFolder.files = AppLogic.sortFiles(newFolder.files);
      await folderListingsStore.put(newFolder);
    } else {
      // Create the folder path if it does not exist.
      newFolder = await this.addFolderListing(newFolderPath, [metadata], tx);
    }

    await tx.done;
  }

  /**
   * Deletes a single file.
   */
  async #deleteFileFromFiles(path: string) {
    const tx = this.#getReadWriteTX();
    const files = tx.objectStore('files');
    await files.delete(path);
    await tx.done;
  }

  /**
   * Updates the folder listing to remove a file.
   */
  async #deleteFileFromFolderListing(
    path: string,
    tx = this.#getReadWriteTX(),
  ) {
    const folderListings = tx.objectStore('folderListings');
    const folderPath = getDirName(path);
    const folder = await folderListings.get(folderPath);
    if (!folder) {
      log('#deleteFileFromFolderListing - no folder found', path);
      return;
    }

    // Remove the file from the listing.
    folder.files = folder.files.filter((file) => file.path !== path);
    await folderListings.put(folder);

    await tx.done;
  }

  /**
   * Delete a folder and all of its subfolders and files.
   */
  async #deleteFolder(path: string) {
    const tx = this.#getReadWriteTX();
    const folderListings = tx.objectStore('folderListings');
    const files = tx.objectStore('files');
    const folderListing = await folderListings.get(path);
    if (!folderListing) {
      throw new Error('Unable to find the folder for deletion: ' + path);
    }

    // Surface the folders and files that need deleting.
    const foldersToDelete: string[] = [path];
    const filesToDelete: string[] = [];
    const listingsToCheck: T.FolderListingRow[] = [folderListing];

    let listing;
    while ((listing = listingsToCheck.pop())) {
      for (const fileOrFolder of listing.files) {
        if (fileOrFolder.type === 'folder') {
          const folder = fileOrFolder;
          const nextListing = await folderListings.get(folder.path);
          if (nextListing) {
            foldersToDelete.push(folder.path);
            listingsToCheck.push(nextListing);
          } else {
            console.error('Could not find the folder listing', folder.path);
          }
        } else {
          filesToDelete.push(fileOrFolder.path);
        }
      }
    }

    for (const folderPath of foldersToDelete) {
      await folderListings.delete(folderPath);
    }
    for (const filePath of filesToDelete) {
      await files.delete(filePath);
    }

    await this.#deleteFileFromFolderListing(path, tx);
    await tx.done;
  }

  async delete(path: string) {
    try {
      // See if this is a file.
      await this.loadBlob(path);
      await this.#deleteFileFromFiles(path);
      await this.#deleteFileFromFolderListing(path);
    } catch {
      // Try the folder next.
      await this.#deleteFolder(path);
    }
  }

  /**
   * Updates a single folders's metadata in a fileListing.
   */
  async #updateFolderListing(oldPath: string, metadata: T.FolderMetadata) {
    const tx = this.#getReadWriteTX();
    const folderListings = tx.objectStore('folderListings');

    function updatePathRoot(path: string, oldRoot: string, newRoot: string) {
      return newRoot + path.slice(oldRoot.length);
    }

    // Update the containing folder listing.
    const containingFolder = await folderListings.get(getDirName(oldPath));
    if (containingFolder) {
      for (const file of containingFolder.files) {
        if (file.path === oldPath) {
          file.name = metadata.name;
          file.path = metadata.path;
        }
      }
      await folderListings.put(containingFolder);
    }

    let cursor = await folderListings.openCursor();
    if (cursor === null) {
      log('#moveFolderListing - Failed to get folder listing cursor');
      await tx.done;
      return;
    }

    // Go through every folder.
    do {
      const { key, value } = cursor;
      if (key.startsWith(oldPath + '/') || key === oldPath) {
        // This is either the folder, or a subfolder. Update it.
        value.path = updatePathRoot(key, oldPath, metadata.path);
        for (const file of value.files) {
          // Update any files in the listing.
          file.path = updatePathRoot(file.path, oldPath, metadata.path);
        }

        // This requires a delete since the key changes.
        await cursor.delete();
        await folderListings.put(value);
      }
    } while ((cursor = await cursor.continue()));
    await tx.done;
  }

  /**
   * Update the metadata for any file that has it's containing folder moved.
   */
  async #updateFolderFiles(oldPath: string, metadata: T.FolderMetadata) {
    const tx = this.#getReadWriteTX();
    const files = tx.objectStore('files');

    let cursor = await files.openCursor();
    if (cursor === null) {
      await tx.done;
      return;
    }

    // Go through every file.
    do {
      const { key, value } = cursor;
      if (key.startsWith(oldPath + '/') || key === oldPath) {
        value.metadata.path = updatePathRoot(key, oldPath, metadata.path);
        // This requires a delete since the key changes.
        await cursor.delete();
        await files.put(value);
      }
    } while ((cursor = await cursor.continue()));
    await tx.done;
  }

  async move(
    fromPath: string,
    toPath: string,
  ): Promise<T.FileMetadata | T.FolderMetadata> {
    const { metadata } = await this.loadBlob(fromPath);
    await this.updateMetadata(fromPath, {
      ...metadata,
      name: getPathFileName(toPath),
      path: toPath,
    });
    return metadata;
  }

  async updateMetadata(
    oldPath: string,
    metadata: T.FileMetadata | T.FolderMetadata,
  ) {
    if (metadata.type === 'file') {
      await this.#updateFileMetadata(oldPath, metadata);
      await this.#updateFileInFolderListings(oldPath, metadata);
    } else {
      await this.#updateFolderFiles(oldPath, metadata);
      await this.#updateFolderListing(oldPath, metadata);
    }
  }

  close(): void {
    return this.#db.close();
  }
}

function getFileMetadata(
  pathOrMetadata: string | T.FileMetadata,
  blob: Blob,
): Promise<T.FileMetadata> {
  if (typeof pathOrMetadata === 'string') {
    return createFileMetadata(pathOrMetadata, blob);
  }
  return Promise.resolve(pathOrMetadata || '/');
}

async function createFileMetadata(
  path: string,
  blob: Blob,
): Promise<T.FileMetadata> {
  const now = new Date().toISOString();

  const data = new Uint8Array(await blob.arrayBuffer());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  return {
    type: 'file',
    name: getPathFileName(path),
    path: path,
    id: uuid.v4(),
    clientModified: now,
    serverModified: now,
    rev: uuid.v4(),
    size: blob.size,
    isDownloadable: true,
    hash,
  };
}

function getFolderMetadata(
  pathOrMetadata: string | T.FolderMetadata,
): T.FolderMetadata {
  if (typeof pathOrMetadata === 'string') {
    const path = pathOrMetadata;
    return createFolderMetadata(normalizePath(path));
  }
  const metadata = pathOrMetadata;
  const path = normalizePath(metadata.path);
  if (metadata.path !== path) {
    console.error({ metadata, path });
    throw new Error("The folder's path was given in a non-normalized form");
  }
  return metadata;
}

function createFolderMetadata(path: string): T.FolderMetadata {
  return {
    type: 'folder',
    name: getPathFileName(path),
    path: path,
    id: uuid.v4(),
  };
}

/**
 * Normalize the path.
 */
function normalizePath(pathOrMetadata: string | T.FolderMetadata): string {
  const path =
    typeof pathOrMetadata === 'string' ? pathOrMetadata : pathOrMetadata.path;

  const pathParts = path.split('/').filter((part) => part);
  const finalParts = [];
  for (let i = 0; i < pathParts.length; i++) {
    const part = pathParts[i];
    if (!part || part === '.') {
      continue;
    }
    if (part === '..') {
      finalParts.pop();
      continue;
    }
    finalParts.push(part);
  }

  return '/' + finalParts.join('/');
}
