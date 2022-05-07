import { type files } from 'dropbox';

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
  baseNote: Note;
  type?: ChordType;
  embellishment?: string;
  slash?: Note;
  add?: string;
}

export type LineContent = 'mixed' | 'chords' | 'text';

export type TextOrChord =
  | { type: 'text'; text: string }
  | { type: 'chord'; chord: Chord };

export type LineType =
  | { type: 'section'; text: string }
  | { type: 'line'; spans: TextOrChord[]; content: LineContent };

export interface ParsedChordPro {
  directives: { [directive: string]: string };
  lines: LineType[];
}

export type View = 'view-file' | 'list-files' | 'link-dropbox';

export type DownloadedTextFile = {
  text?: string;
  error?: unknown;
  metadata?: files.FileMetadata;
};
export type DownloadedBlob = { fileBlob?: Blob; error?: unknown };

/**
 * This response didn't match what I actually got.
 */
export interface DownloadFileResponse {
  name: string; // '500 Miles _ Surrender.chopro';
  path_lower: string; // '/500 miles _ surrender.chopro';
  path_display: string; // '/500 Miles _ Surrender.chopro';
  id: string; // 'id:ywUpYqVN8XAAAAAAAAAACw';
  client_modified: string; // '2022-04-22T16:39:21Z';
  server_modified: string; // '2022-04-24T17:54:38Z';
  rev: string; // '015dd6a2747a0250000000266f484e0';
  size: number; //3296;
  is_downloadable: boolean; // true;
  content_hash: string; // 'bb6d43dfb6aff9dca4ff4d51f0146b64bdf325c73cd63193189b26ca052a2c51';
  fileBlob: Blob;
}

export type DropboxFile =
  | files.FileMetadataReference
  | files.FolderMetadataReference;

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
