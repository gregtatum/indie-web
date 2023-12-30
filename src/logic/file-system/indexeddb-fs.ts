import * as idb from 'idb';
import { v4 as uuidv4 } from 'uuid';
import {
  FileSystemCache,
  FileSystemError,
  SaveMode,
} from 'src/logic/file-system';
import { T } from 'src';
import {
  ensureExists,
  getPathFileName,
  getPathFolder,
  updatePathRoot,
} from 'src/utils';

export class IDBError extends FileSystemError {
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

export async function openIDBFS(
  name: string = 'dropbox-fs-cache',
): Promise<IDBFS> {
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

  idbfs = new IDBFS(db);

  return idbfs;
}

export class IDBFS extends FileSystemCache {
  #db: idb.IDBPDatabase<T.IDBFSSchema>;
  open = true;
  constructor(db: idb.IDBPDatabase<T.IDBFSSchema>) {
    super();
    this.#db = db;
  }

  async listFiles(path: string): Promise<T.FolderListing> {
    if (!path) {
      path = '/';
    }
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

  async addFolderListing(path: string, files: T.FolderListing): Promise<void> {
    if (!path) {
      path = '/';
    }
    const row: T.FolderListingRow = {
      storedAt: new Date(),
      path,
      files,
    };
    log('addFolderListing', path, files);
    await this.#db.put('folderListings', row);
  }

  async loadBlob(path: string): Promise<T.BlobFile> {
    if (!path) {
      path = '/';
    }
    const row = await this.#db.get('files', path);
    log('getFile', path, { metadata: row?.metadata });
    if (row) {
      if (process.env.NODE_ENV === 'test') {
        // Blob text doesn't work correctly in Node and Jest. Fake it.
        const { text, metadata } = row as any;
        const blob = new Blob([text], { type: 'text/plain' });
        return { blob, metadata };
      }

      const { blob, metadata } = row;
      return { blob, metadata };
    }
    return Promise.reject(IDBError.notFound('No file found at ' + path));
  }

  compressFolder() {
    return Promise.reject(
      new Error('This is not current supported by the IndexedDB file system.'),
    );
  }

  async #getFileStoreIfNeedsUpdating(metadata: T.FileMetadata) {
    const tx = this.#db.transaction('files', 'readwrite');
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
    _mode: SaveMode,
    blob: Blob,
  ): Promise<T.FileMetadata> {
    const oldPath =
      typeof pathOrMetadata === 'string' ? null : pathOrMetadata.path;
    const metadata = await getFileMetadata(pathOrMetadata, blob);
    const store = await this.#getFileStoreIfNeedsUpdating(metadata);
    if (store) {
      if (process.env.NODE_ENV === 'test') {
        // Blob text doesn't work correctly in Node and Jest. Fake it by saving text.
        const text: string = await blob.text();
        await store.put({ metadata, storedAt: new Date(), text } as any);
      } else {
        await store.put({ metadata, storedAt: new Date(), blob });
      }
      log('saveBlob', metadata.path, { metadata });
    } else {
      log('saveBlob', 'hash match');
    }

    await this.#updateFileInFolderListings(oldPath, metadata);

    return metadata;
  }

  /**
   * Updates the metadata in the `files` table.
   */
  async #updateFileMetadata(oldPath: string, metadata: T.FileMetadata) {
    const tx = this.#db.transaction('files', 'readwrite');
    const store = tx.objectStore('files');
    const oldFile = await store.get(oldPath);
    if (oldFile) {
      log('#updateFileMetadata', { oldFile, oldPath, metadata });
      await store.delete(oldPath);
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
    const tx = this.#db.transaction('folderListings', 'readwrite');
    const folderListingsStore = tx.objectStore('folderListings');
    const oldFolderPath = oldPath ? getPathFolder(oldPath) : null;
    const newFolderPath = getPathFolder(metadata.path);
    let folder = await folderListingsStore.get(newFolderPath);

    log('#updateFileInFolderListings', {
      folder,
      oldFolderPath,
      oldPath,
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

    // Create the folder path if it does not exist.
    if (!folder) {
      let path = '';
      for (const part of newFolderPath.split('/')) {
        path += '/' + part;
        const folder = await folderListingsStore.get(path);
        if (!folder) {
          await folderListingsStore.put({
            storedAt: new Date(),
            path,
            files: [],
          });
        }
      }
      folder = ensureExists(
        await folderListingsStore.get(path),
        'Expected the folder path to exist.',
      );
    }

    // Either add the file or update it.
    const index = folder.files.findIndex((file) => file.path === oldPath);
    if (index === -1) {
      folder.files.push(metadata);
    } else {
      for (let i = 0; i < folder.files.length; i++) {
        const file = folder.files[i];
        if (file.path === oldPath) {
          folder.files[i] = metadata;
        }
      }
    }

    await folderListingsStore.put(folder);
    await tx.done;
  }

  /**
   * Deletes a single file.
   */
  async #deleteFileFromFiles(path: string) {
    const tx = this.#db.transaction('files', 'readwrite');
    const files = tx.objectStore('files');
    await files.delete(path);
    await tx.done;
  }

  /**
   * Updates the folder listing to remove a file.
   */
  async #deleteFileFromFolderListing(path: string) {
    const tx = this.#db.transaction('folderListings', 'readwrite');
    const folderListings = tx.objectStore('folderListings');
    const folderPath = getPathFolder(path);
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
   * Deletes a folder listing and any other listings referencing it.
   */
  async #deleteFolderListing(path: string) {
    const tx = this.#db.transaction('folderListings', 'readwrite');
    const folderListings = tx.objectStore('folderListings');
    const containingFolder = await folderListings.get(getPathFolder(path));
    if (!containingFolder) {
      log('#deleteFolderListing - no folder found', path);
      return;
    }

    // Remove the folder from the listing.
    containingFolder.files = containingFolder.files.filter(
      (file) => file.path !== path,
    );
    await folderListings.put(containingFolder);

    // Actually delete this listing.
    await folderListings.delete(path);

    let cursor = await folderListings.openKeyCursor();
    if (cursor === null) {
      log('#deleteFolderListing - Failed to get folder listing cursor');
      return;
    }

    // Delete any subfolders.
    do {
      if (cursor.key.startsWith(path + '/')) {
        log('#deleteFolderListing - delete ', cursor.key);
        await cursor.delete();
      }
    } while ((cursor = await cursor.continue()));
    await tx.done;
  }

  async #deleteFilesInFolder(folderPath: string) {
    const tx = this.#db.transaction('files', 'readwrite');
    const files = tx.objectStore('files');

    let cursor = await files.openCursor();
    if (cursor === null) {
      await tx.done;
      return;
    }

    // Go through every file.
    do {
      const { key } = cursor;
      if (key === folderPath || key.startsWith(folderPath + '/')) {
        await cursor.delete();
      }
    } while ((cursor = await cursor.continue()));
    await tx.done;
  }

  async delete(path: string) {
    const { metadata } = await this.loadBlob(path);
    if (metadata.type === 'file') {
      await this.#deleteFileFromFiles(path);
      await this.#deleteFileFromFolderListing(path);
    } else {
      await this.#deleteFolderListing(path);
      await this.#deleteFilesInFolder(path);
    }
  }

  /**
   * Updates a single folders's metadata in a fileListing.
   */
  async #updateFolderListing(oldPath: string, metadata: T.FolderMetadata) {
    const tx = this.#db.transaction('folderListings', 'readwrite');
    const folderListings = tx.objectStore('folderListings');

    function updatePathRoot(path: string, oldRoot: string, newRoot: string) {
      return newRoot + path.slice(oldRoot.length);
    }

    // Update the containing folder listing.
    const containingFolder = await folderListings.get(getPathFolder(oldPath));
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
    const tx = this.#db.transaction('files', 'readwrite');
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
    id: uuidv4(),
    clientModified: now,
    serverModified: now,
    rev: uuidv4(),
    size: blob.size,
    isDownloadable: true,
    hash,
  };
}
