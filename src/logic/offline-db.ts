import * as idb from 'idb';
import { A, T } from 'src';

const name = 'browser-chords';
const version = 1;

export async function getDB(): Promise<T.Thunk> {
  return async (dispatch) => {
    const db = await idb.openDB(name, version, {
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
      upgrade(
        _database: T.OfflineDB,
        _oldVersion: number,
        _newVersion: number | null,
        _transaction: idb.IDBPTransaction<
          unknown,
          idb.StoreNames<unknown>[],
          'versionchange'
        >,
      ): void {
        // …
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
