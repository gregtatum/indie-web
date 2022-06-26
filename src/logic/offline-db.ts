import * as idb from 'idb';
import { A, T } from 'src';
import type { files } from 'dropbox';

function log(key: string, ...args: any[]) {
  const style = 'color: #FF006D; font-weight: bold';
  if (process.env.NODE_ENV !== 'test') {
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

  async addBlobFile(metadata: T.FileMetadata, blob: Blob) {
    const store = await this.#getFileStoreIfNeedsUpdating(metadata);
    if (store) {
      await store.put({ metadata, storedAt: new Date(), type: 'blob', blob });
      log('addBlobFile', metadata.path, metadata, blob);
    } else {
      log('addBlobFile', 'hash match');
    }
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
