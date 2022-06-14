import * as idb from 'idb';
import { A, T } from 'src';

const name = 'browser-chords';
const version = 1;

export async function getDB(): Promise<T.Thunk> {
  return async (dispatch) => {
    const db: T.OfflineDB = await idb.openDB<T.OfflineDBSchema>(name, version, {
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
          keyPath: 'path_display',
        });
        files.createIndex('by-content_hash', 'content_hash');
        files.createIndex('by-id', 'id');

        db.createObjectStore('folderListings', {
          keyPath: 'folder.path_display',
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

    dispatch(A.connectOfflineDB(db));
  };
}

export function getFolderListing(db: T.OfflineDB, pathDisplay: string) {
  return db.get('folderListings', pathDisplay);
}

export async function addFolderListing(
  db: T.OfflineDB,
  folder: T.FolderMetadataReference,
  files: Array<T.FolderMetadataReference | T.FileMetadataReference>,
) {
  const { path_display } = folder;
  if (!path_display) {
    console.error(
      'A folder did not have a display path, it could not be saved.',
    );
    return;
  }
  const row: T.OfflineDBFolderListingRow = {
    dateStored: new Date(),
    folder,
    files,
  };

  await db.put('folderListings', row, path_display);
}

export function getFile(db: T.OfflineDB, pathDisplay: string) {
  return db.get('files', pathDisplay);
}

export async function addFile(db: T.OfflineDB, file: T.DownloadFileResponse) {
  const tx = db.transaction('files', 'readwrite');
  const store = tx.objectStore('files');
  const offlineFile = await store.get(file.path_display);
  if (offlineFile && offlineFile.content_hash === file.content_hash) {
    // No need to update the offline file.
    return;
  }
  await store.put(file, file.path_display);
}
