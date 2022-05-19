import type * as idb from 'idb';

export type OfflineDB = idb.IDBPDatabase<unknown>;

export type OfflineDBState =
  | { phase: 'connecting'; db: null }
  | { phase: 'connected'; db: OfflineDB }
  | { phase: 'disconnected'; db: null };
