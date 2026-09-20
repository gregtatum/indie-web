import type { MUSIC_INDEX_VERSION } from '../music.ts';

/**
 * Provide error messages for fallible functions.
 */
export type Result<T> =
  | ({ type: 'success' } & T)
  | {
      type: 'error';
      message: string;
    };

/**
 * Provide error messages for fallible async functions. Useful for async workflows like
 * file edits.
 */
export type AsyncResult<T> = Promise<Result<T>>;

/**
 * Extract the T from the Results, or the functions that use Results.
 *
 * type A = ResultValue<Result<{ foo: string }>>;
 * // { foo: string }
 *
 * type B = ResultValue<AsyncResult<{ foo: string }>>;
 * // { foo: string }
 *
 * type C = ResultValue<() => Result<{ foo: string }>>;
 * // { foo: string }
 *
 * type D = ResultValue<() => AsyncResult<{ foo: string }>>;
 * // { foo: string }
 */
export type ResultValue<T> = T extends (...args: any[]) => infer R
  ? ResultValue<R>
  : Awaited<T> extends Result<infer U>
    ? U
    : never;

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

export type SaveMode = 'overwrite' | 'add' | 'update';

export interface TrackMetadata {
  path: string;
  title: string | null;
  artist: string | null;
  /** Album-level artist used for library grouping; falls back to artist when missing. */
  albumArtist: string | null;
  composer: string | null;
  album: string | null;
  genre: string | null;
  year: string | null;
  /** Explicit private-tag override for composer grouping; null means use defaults. */
  preferComposerGrouping: boolean | null;
  /** Track number within its album. */
  track: number | null;
  /** Duration in seconds. */
  duration: number | null;
  size: number;
  /** ISO timestamp — used for incremental re-scan. */
  mtime: string;
  /** Client path to an artwork image file in the album directory, or null if none found. */
  folderArtworkPath: string | null;
  /** True if the audio file contains at least one embedded APIC artwork frame. */
  hasEmbeddedArtwork: boolean;
}

/**
 * The serialized music library index written to disk by the server and read by
 * the client. This type always reflects the *current* format only.
 *
 * ## Versioning
 * When this type changes, bump `version` and add an in-memory upgrader:
 *   1. Add an upgrader function in `src/frontend/logic/music/music-index-upgraders.ts`
 *      that converts the old format to the new one. Use loose `unknown` typing —
 *      do not import old type definitions.
 *   2. Check in a JSON fixture of the old format at
 *      `src/frontend/test/fixtures/music-index-v{N}.json`. This is the durable
 *      record of what the old format looked like.
 *   3. Add tests in `src/frontend/test/music-index-upgraders.test.ts` that pass
 *      the fixture through the upgrader and snapshot the result. Once written,
 *      these tests and upgraders are never modified.
 *   4. Wire the new upgrader into `upgradeMusicIndex`.
 *
 * The client runs the upgrader at ingestion time, so older server responses are
 * transparently normalized before reaching Redux. The UI surfaces a
 * "Scan Library (updates detected)" prompt when an upgrade was applied, since
 * backfilled fields (e.g. genre: null) are incomplete vs. a fresh scan.
 */
export interface MusicIndex {
  version: typeof MUSIC_INDEX_VERSION;
  scannedAt: string;
  tracks: TrackMetadata[];
}

export interface RawTagEntry {
  id: string;
  /** Human-readable string representation. Describes binary entries without raw bytes. */
  value: string;
  /** Base64-encoded binary payload. Present when the tag value contains binary data (e.g. APIC embedded pictures). */
  binary?: string;
}

export interface WriteFolderArtworkResponse {
  /** Client path of the written folder artwork file (e.g. /Artist/Album/Folder.jpg). */
  folderArtworkPath: string;
  /**
   * Result of embedding the same image into individual track files. Present
   * only when the request supplied an image body and an `embedInTracks` list.
   * Every requested track is attempted; per-file failures land in `errors`
   * without stopping the rest.
   */
  tracksEmbedded?: {
    updatedTracks: string[];
    errors: Array<{ path: string; message: string }>;
  };
}

export interface EmbedFolderArtworkRequest {
  /** Client path of the folder artwork image to embed (e.g. /Artist/Album/Folder.jpg). */
  folderArtworkPath: string;
  /** Track files to write the folder image into. */
  trackPaths: string[];
}

export interface EmbedFolderArtworkResponse {
  /** Track paths whose embedded artwork was rewritten. */
  updated: string[];
  /**
   * Per-track failures. Every requested track is attempted; a failure here does
   * not stop the rest.
   */
  errors: Array<{ path: string; message: string }>;
}

export interface TrackTagsResponse {
  blocks: Array<{
    format: string;
    tags: RawTagEntry[];
  }>;
  /**
   * Field values resolved across embedded tag blocks by format priority (see
   * TAG_FORMAT_PRIORITY in shared/music.ts), keyed by frame ID. This is the
   * single source of truth for "what is this file's title/genre/etc" — the
   * scanner uses the same resolution to build the music index, so this view
   * and the index never disagree.
   */
  resolved: Record<string, string>;
}

export interface TrackTagUpdate {
  frameId: string;
  value: string;
  description?: string;
}

export interface WriteTrackTagsRequest {
  paths: string[];
  changes: TrackTagUpdate[];
}

/**
 * Result of applying one shared set of tag changes to one or more tracks.
 *
 * A valid request attempts every path. Individual file failures are reported in
 * `errors` and do not prevent later paths from being attempted. Request-level
 * validation failures, such as unsupported frame IDs, fail before any file is
 * written and do not produce this response.
 */
export interface WriteTrackTagsResponse {
  /**
   * Track paths whose audio files were successfully written.
   */
  updated: string[];
  /**
   * Per-path write failures for files that were skipped or could not be updated.
   */
  errors: Array<{ path: string; message: string }>;
  /**
   * Status of the best-effort durable music index patch after file writes.
   * Tag writes are authoritative; an index error means files may be updated
   * while `.music-index.json` remains stale until a later scan or update.
   */
  index: {
    /**
     * Whether the index was patched, intentionally skipped, or failed.
     */
    status: 'updated' | 'skipped' | 'error';
    /**
     * Human-readable reason for skipped/error statuses; null when updated.
     */
    message: string | null;
  };
}

export interface ScanTrackPathsRequest {
  paths: string[];
}

export interface ScanTrackPathsResponse {
  tracks: TrackMetadata[];
  errors: Array<{ path: string; message: string }>;
}

export type StagedBatchStep = 'editing' | 'organizing';

/**
 * Written to `.music-staging/.batches/<batchId>.json`.
 */
export interface StagedBatchManifest {
  batchId: string;
  createdAt: string;
  step: StagedBatchStep;
  trackPaths: string[];
  template: string | null;
}

export interface StagedBatchSummary {
  batchId: string;
  createdAt: string;
  step: StagedBatchStep;
  trackCount: number;
}

export interface CreateStagedBatchResponse {
  manifest: StagedBatchManifest;
  addedTrackPaths: string[];
  duplicateCount: number;
}

export interface MusicImportBatch {
  batchId: string;
  tracks: TrackMetadata[];
  step: StagedBatchStep;
  template: string;
}
