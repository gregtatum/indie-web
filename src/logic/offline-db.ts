import * as idb from 'idb';
import { A, T } from 'src';
import type { files } from 'dropbox';
import { getPathFolder, updatePathRoot } from '../utils';

function log(key: string, ...args: any[]) {
  const style = 'color: #FF006D; font-weight: bold';
  if (process.env.NODE_ENV !== 'test') {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    console.log(`[offline-db] %c"${key}"`, style, ...args);
  }
}

export function openDB(): T.Thunk<Promise<OfflineDB>> {
  return async (dispatch) => {
    const db = await idb.openDB<T.OfflineDBSchema>('browser-chords', 1, {
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
        dispatch(A.disconnectOfflineDB());
        dispatch(
          A.addMessage({
            message:
              'Offline files are not available since another tab is using an ' +
              'old version. Try closing other tabs and refresh the browser.' +
              'refreshing the page.',
          }),
        );
      },

      /**
       * Called if this connection is blocking a future version of the database from opening.
       */
      blocking() {
        dispatch(
          A.addMessage({
            message:
              'Your offline files need updating. Close this tab, or refresh ' +
              'the page to update.',
          }),
        );
      },

      /**
       * Called if the browser abnormally terminates the connection.
       * This is not called when `db.close()` is called.
       */
      terminated() {
        dispatch(A.disconnectOfflineDB());
        dispatch(
          A.addMessage({
            message:
              'Offline files stopped unexpectedly and are no longer working. Try ' +
              'refreshing the page.',
          }),
        );
        console.error('The indexeddb connection terminated.');
      },
    });

    const wrappedDB = new OfflineDB(db);
    dispatch(A.connectOfflineDB(wrappedDB));
    return wrappedDB;
  };
}

export class OfflineDB {
  #db: idb.IDBPDatabase<T.OfflineDBSchema>;
  constructor(db: idb.IDBPDatabase<T.OfflineDBSchema>) {
    this.#db = db;
  }

  async getFolderListing(path: string) {
    const listing = await this.#db.get('folderListings', path);
    log('getFolderListing', path, { listing });
    return listing;
  }

  async addFolderListing(
    path: string,
    files: Array<T.FolderMetadata | T.FileMetadata>,
  ) {
    const row: T.FolderListingRow = {
      storedAt: new Date(),
      path,
      files,
    };
    log('addFolderListing', path, files);
    await this.#db.put('folderListings', row);
  }

  async getFile(path: string) {
    const file = await this.#db.get('files', path);
    log('getFile', path, { metadata: file?.metadata });
    return file;
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

  async addTextFile(metadata: T.FileMetadata, text: string) {
    const store = await this.#getFileStoreIfNeedsUpdating(metadata);
    if (store) {
      await store.put({ metadata, storedAt: new Date(), type: 'text', text });
      log('addTextFile', metadata.path, { metadata, text: { text } });
    } else {
      log('addTextFile', 'hash match');
    }
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
  }

  /**
   * Updates a single file's metadata in a fileListing.
   */
  async #updateFileInFolderListings(oldPath: string, metadata: T.FileMetadata) {
    const tx = this.#db.transaction('folderListings', 'readwrite');
    const store = tx.objectStore('folderListings');
    const oldFolderPath = getPathFolder(oldPath);
    const folder = await store.get(oldFolderPath);
    if (!folder) {
      log('#updateFileInFolderListings - no folder found', {
        oldFolder: folder,
        oldPath,
        oldFolderPath,
        metadata,
      });
      return;
    }

    for (let i = 0; i < folder.files.length; i++) {
      const file = folder.files[i];
      if (file.path === oldPath) {
        folder.files[i] = metadata;
      }
    }

    await store.put(folder);

    // Delete the folder entry.
    log('#updateFileInFolderListings', {
      folder,
      oldFolderPath,
      oldPath,
      metadata,
    });
    // await store.delete(oldFolderPath);
  }

  /**
   * Deletes a folder listing and any other listings referencing it.
   */
  async #deleteFolderListing(path: string) {
    const tx = this.#db.transaction('folderListings', 'readwrite');
    const folderListings = tx.objectStore('folderListings');
    const folderPath = getPathFolder(path);
    const folder = await folderListings.get(folderPath);
    if (!folder) {
      log('#deleteFolderListing - no folder found', path);
      return;
    }

    // Remove the folder from the listing.
    folder.files = folder.files.filter((file) => file.path !== path);
    await folderListings.put(folder);

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
  }

  /**
   * Update the metadata for any file that has it's containing folder moved.
   */
  async #updateFolderFiles(oldPath: string, metadata: T.FolderMetadata) {
    const tx = this.#db.transaction('files', 'readwrite');
    const files = tx.objectStore('files');

    let cursor = await files.openCursor();
    if (cursor === null) {
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

  async addBlobFile(metadata: T.FileMetadata, blob: Blob) {
    const store = await this.#getFileStoreIfNeedsUpdating(metadata);
    if (store) {
      await store.put({ metadata, storedAt: new Date(), type: 'blob', blob });
      log('addBlobFile', metadata.path, metadata, blob);
    } else {
      log('addBlobFile', 'hash match');
    }
  }

  close(): void {
    return this.#db.close();
  }
}

export function fixupMetadata(
  rawMetadata: files.FileMetadataReference | files.FolderMetadataReference,
): T.FileMetadata | T.FolderMetadata {
  if (rawMetadata['.tag'] === 'file') {
    return fixupFileMetadata(rawMetadata);
  } else {
    return fixupFolderMetadata(rawMetadata);
  }
}

export function fixupFileMetadata(
  rawMetadata: files.FileMetadata | files.FileMetadataReference,
): T.FileMetadata {
  return {
    type: 'file',
    name: rawMetadata.name,
    path: rawMetadata.path_display ?? '',
    id: rawMetadata.id,
    clientModified: rawMetadata.client_modified,
    serverModified: rawMetadata.server_modified,
    rev: rawMetadata.rev,
    size: rawMetadata.size,
    isDownloadable: rawMetadata.is_downloadable ?? false,
    hash: rawMetadata.content_hash ?? '',
  };
}

export function fixupFolderMetadata(
  rawMetadata: files.FolderMetadataReference,
): T.FolderMetadata {
  return {
    type: 'folder',
    name: rawMetadata.name,
    path: rawMetadata.path_display ?? '',
    id: rawMetadata.id,
  };
}
