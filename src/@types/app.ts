import type * as idb from 'idb';
import * as Dropbox from 'dropbox';
import { SongKey } from 'src/logic/parse-chords';

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
  | { type: 'section'; lineIndex: number; text: string }
  | { type: 'comment'; lineIndex: number; text: string; italic: boolean }
  | { type: 'image'; lineIndex: number; src: string }
  | { type: 'audio'; lineIndex: number; src: string; mimetype: string }
  | { type: 'video'; lineIndex: number; src: string; mimetype: string }
  | { type: 'space'; lineIndex: number }
  | { type: 'link'; lineIndex: number; href: string }
  | {
      type: 'line';
      lineIndex: number;
      spans: TextOrChord[];
      content: LineContent;
    };

export interface ParsedChordPro {
  directives: Directives;
  lines: LineType[];
}

export type View =
  | 'view-file'
  | 'view-pdf'
  | 'view-image'
  | 'view-markdown'
  | 'list-files'
  | 'settings'
  | 'privacy'
  | 'language-coach';

export type DownloadedTextFile = {
  metadata: FileMetadata;
  text: string;
};

export type DownloadedBlob = {
  metadata: FileMetadata;
  blob: Blob;
};

/**
 * Dropbox types with nothing optional.
 */
export interface FileMetadata {
  type: 'file';
  name: string; // '500 Miles _ Surrender.chopro';
  path: string; // '/500 Miles _ Surrender.chopro';
  // DropboxFS: 'id:ywUpYqVN8XAAAAAAAAAACw'
  // IDBFS: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'
  id: string;
  clientModified: string; // '2022-04-22T16:39:21Z';
  serverModified: string; // '2022-04-24T17:54:38Z';
  // DropboxFS: '015dd6a2747a0250000000266f484e0'
  // IDBFS: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'
  rev: string;
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

export type FolderListing = Array<FileMetadata | FolderMetadata>;

export interface BlobFile {
  metadata: FileMetadata;
  blob: Blob;
}

export interface TextFile {
  metadata: FileMetadata;
  text: string;
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
  blob: Blob;
};

export interface IDBFSSchema extends idb.DBSchema {
  files: {
    value: StoredBlobFile;
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

export type ListFilesCache = Map<string, Array<FileMetadata | FolderMetadata>>;
export type DownloadFileCache = Map<string, DownloadedTextFile>;
export type DownloadBlobCache = Map<string, DownloadedBlob>;

export interface ClickedFileMenu {
  file: FileMetadata | FolderMetadata;
  element: HTMLElement;
  openedByKeyboard: boolean;
}

export interface ClickedSongKeyMenu {
  element: HTMLElement;
  openedByKeyboard: boolean;
}

export interface ClickedFileSystemMenu {
  element: HTMLElement;
  openedByKeyboard: boolean;
}

export type RenameFileState =
  | { phase: 'none'; path: null }
  | { phase: 'editing'; path: string }
  | { phase: 'sending'; path: string };

export interface KnownDirectives {
  key: string;
  artist: string;
}

/**
 * The directives in chordpro files are stored in the file index.
 */
export type Directives = Partial<KnownDirectives> & {
  [key: string]: string;
};

export interface IndexedFile {
  metadata: FileMetadata;
  lastRevRead: string | null;
  directives: Directives;
}

export interface IndexJSON {
  version: 1;
  // The files should be sorted by FileMetadata["id"].
  files: IndexedFile[];
}

/**
 * dropbox.filesDownload does not know about fileBlob on the type. Use this to coerce
 * the type.
 */
export type FilesDownloadResponse = Dropbox.DropboxResponse<BlobFileMetadata>;

/**
 * The built-in types don't realize that FileMetadata can contain blobs. This type
 * exists to coerce the types and avoid an `any` transformation.
 */
export type BlobFileMetadata = {
  fileBlob: Blob;
} & Dropbox.files.FileMetadata;

/**
 * The built-in types don't realize that FileMetadata can contain blobs. This type
 * exists to coerce the types and avoid an `any` transformation.
 */
export type BlobZipFileMetadata = {
  fileBlob: Blob;
} & Dropbox.files.DownloadZipResult;

export type SongKeyLetters =
  | 'A'
  | 'A#'
  | 'Bb'
  | 'B'
  | 'C'
  | 'C#'
  | 'Db'
  | 'D'
  | 'D#'
  | 'Eb'
  | 'E'
  | 'F'
  | 'F#'
  | 'Gb'
  | 'G'
  | 'G#'
  | 'Ab'
  | 'Cb';

export type SongKeySettings =
  | { type: 'capo'; capo: number }
  | { type: 'transpose'; songKey: SongKey };

export type FileSystemName = 'dropbox' | 'browser';

export interface LanguageDataV1 {
  description: string;
  lastSaved: number;
  language: Language;
  version: 1;
  learnedStems: string[];
  ignoredStems: string[];
}

export interface Stem {
  stem: string;
  frequency: number;
  tokens: string[];
  sentences: string[];
}

export type Language = {
  code: string;
  long: string;
  short: string;
};

export type LanguageCoachSection =
  | 'home'
  | 'study-list'
  | 'learned'
  | 'reading';

export type SaveMode = 'overwrite' | 'add' | 'update';
