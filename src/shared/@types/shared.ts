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
  album: string | null;
  genre: string | null;
  /** Track number within its album. */
  track: number | null;
  /** Duration in seconds. */
  duration: number | null;
  size: number;
  /** ISO timestamp — used for incremental re-scan. */
  mtime: string;
  /** Client path to a cover image file in the album directory, or null if none found. */
  coverArt: string | null;
  /** True if the audio file contains at least one embedded APIC picture frame. */
  hasEmbeddedArt: boolean;
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
  version: 5;
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

export interface WriteFolderArtResponse {
  /** Client path of the written cover art file (e.g. /Artist/Album/Folder.jpg). */
  coverArtPath: string;
}

export interface TrackTagsResponse {
  native: Array<{
    format: string;
    tags: RawTagEntry[];
  }>;
}

export interface TrackTagUpdate {
  frameId: string;
  value: string;
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
