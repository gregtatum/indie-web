import type * as idb from 'idb';
import { T } from 'src';

export interface OfflineDBFolderListingRow {
  dateStored: Date;
  folder: T.FolderMetadataReference;
  files: Array<T.FolderMetadataReference | T.FileMetadataReference>;
}

export interface OfflineDBSchema extends idb.DBSchema {
  files: {
    value: T.DownloadFileResponse;
    key: string;
    indexes: {
      'by-content_hash': string;
      'by-id': string;
    };
  };
  folderListings: {
    value: OfflineDBFolderListingRow;
    key: string;
  };
}

export type OfflineDB = idb.IDBPDatabase<OfflineDBSchema>;

export type OfflineDBState =
  | { phase: 'connecting'; db: null }
  | { phase: 'connected'; db: OfflineDB }
  | { phase: 'disconnected'; db: null };
