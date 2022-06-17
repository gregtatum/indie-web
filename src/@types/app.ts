import type * as idb from 'idb';
import { OfflineDB } from 'src/logic/offline-db';

// prettier-ignore
export type Note =
  | 'A' | 'Ab' | 'A#'
  | 'B' | 'Bb' | 'B#'
  | 'C' | 'Cb' | 'C#'
  | 'D' | 'Db' | 'D#'
  | 'E' | 'Eb' | 'E#'
  | 'F' | 'Fb' | 'F#'
  | 'G' | 'Gb' | 'G#';

export type ChordType =
  | 'major'
  | 'minor'
  | 'power'
  | 'augmented'
  | 'sus2'
  | 'sus4';

export interface Chord {
  text: string;
  baseNote?: Note;
  type?: ChordType;
  embellishment?: string;
  slash?: Note;
  add?: string;
  // The text of the chord, e.g. [C (strum)] would be "C".
  chordText?: string;
  // Extra text, e.g. [C (strum)] would be " (strum)".
  extras?: string;
}

export type LineContent = 'mixed' | 'chords' | 'text';

export type TextOrChord =
  | { type: 'text'; text: string }
  | { type: 'chord'; chord: Chord };

export type LineType =
  | { type: 'section'; text: string }
  | { type: 'image'; src: string }
  | { type: 'space' }
  | { type: 'link'; href: string }
  | { type: 'line'; spans: TextOrChord[]; content: LineContent };

export interface ParsedChordPro {
  directives: { [directive: string]: string };
  lines: LineType[];
}

export type View =
  | 'view-file'
  | 'view-pdf'
  | 'view-image'
  | 'list-files'
  | 'settings'
  | 'privacy';

export type DownloadedTextFile = {
  text?: string;
  error?: unknown;
  metadata?: FileMetadata;
};

export type DownloadedBlob = {
  metadata?: FileMetadata;
  blob?: Blob;
  error?: unknown;
};

/**
 * Dropbox types with nothing optional.
 */
export interface FileMetadata {
  type: 'file';
  name: string; // '500 Miles _ Surrender.chopro';
  path: string; // '/500 Miles _ Surrender.chopro';
  id: string; // 'id:ywUpYqVN8XAAAAAAAAAACw';
  clientModified: string; // '2022-04-22T16:39:21Z';
  serverModified: string; // '2022-04-24T17:54:38Z';
  rev: string; // '015dd6a2747a0250000000266f484e0';
  size: number; //3296;
  isDownloadable: boolean; // true;
  hash: string; // 'bb6d43dfb6aff9dca4ff4d51f0146b64bdf325c73cd63193189b26ca052a2c51';
}

/**
 * Dropbox types with nothing optional.
 */
export interface FolderMetadata {
  type: 'folder';
  name: string; // 'Bent and Bruised';
  path: string; // '/Bent and Bruised';
  id: string; // 'id:ywUpYqVN8XAAAAAAAAAAPA';
}

export type Message = {
  message: React.ReactNode;
  generation: number;
};

export interface DropboxOauth {
  accessToken: string;
  refreshToken: string;
  // Timestamp in milliseconds
  expires: number;
}

export interface FolderListingRow {
  storedAt: Date;
  path: string;
  files: Array<FolderMetadata | FileMetadata>;
}

export type FileRow = StoredTextFile | StoredBlobFile;

export type StoredTextFile = {
  metadata: FileMetadata;
  storedAt: Date;
  type: 'text';
  text: string;
};

export type StoredBlobFile = {
  metadata: FileMetadata;
  storedAt: Date;
  type: 'blob';
  blob: Blob;
};

export interface OfflineDBSchema extends idb.DBSchema {
  files: {
    value: FileRow;
    key: string;
    indexes: {
      'by-hash': string;
      'by-id': string;
    };
  };
  folderListings: {
    value: FolderListingRow;
    key: string;
  };
}

export type OfflineDBState =
  | { phase: 'connecting'; db: null }
  | { phase: 'connected'; db: OfflineDB }
  | { phase: 'disconnected'; db: null };
