import { ClientError, colors, type MountPath } from '../route-utils.ts';
import NodeID3 from 'node-id3';
import type { T } from '../index.ts';
import { Dirent, createReadStream, promises as fs } from 'node:fs';
import { extname, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { parseFile } from 'music-metadata';
import {
  APP_FRAME_IDS,
  ID3V1_TAG_SIZE,
  MUSIC_INDEX_VERSION,
  PREFER_COMPOSER_GROUPING_TAG_DESCRIPTION,
  buildId3v1TagBuffer,
  compareTracksDefault,
  nativePrivateTextTagValue,
  parseBooleanTagValue,
  parsePreferComposerGroupingTag,
  resolveTagValue,
} from '../../shared/music.ts';
import type { Id3v1TagFields } from '../../shared/music.ts';

export const MUSIC_INDEX_FILENAME = '.music-index.json';

const FOLDER_ARTWORK_FILENAMES = [
  'cover.jpg',
  'cover.png',
  'folder.jpg',
  'Folder.jpg',
  'folder.png',
  'Folder.png',
  'front.jpg',
  'front.png',
];

const AUDIO_EXTENSIONS = new Set([
  '.mp3',
  '.flac',
  '.m4a',
  '.ogg',
  '.wav',
  '.aac',
]);

const FRAME_ID_TO_NODE_ID3: Record<string, string> = {
  TIT2: 'title',
  TPE1: 'artist',
  TPE2: 'performerInfo',
  TALB: 'album',
  TRCK: 'trackNumber',
  TPOS: 'partOfSet',
  TYER: 'year',
  TCON: 'genre',
  TBPM: 'bpm',
  TCOM: 'composer',
  TEXT: 'textWriter',
};

/** Recognized folder-artwork basenames, lower-cased, matched case-insensitively. */
const FOLDER_ARTWORK_BASENAMES_LOWER = new Set(
  FOLDER_ARTWORK_FILENAMES.map((name) => name.toLowerCase()),
);

/**
 * When writing new folder artwork, remove any older folder artwork with all
 * variants from FOLDER_ARTWORK_FILENAMES.
 */
export async function removeOutdatedFolderArtwork(
  mountPath: MountPath,
  dirFullPath: string,
  dirClientPath: string,
  keepFilename: string,
): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dirFullPath, { withFileTypes: true });
  } catch {
    return [];
  }
  const keepLower = keepFilename.toLowerCase();
  const removed: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const lower = entry.name.toLowerCase();
    if (lower === keepLower || !FOLDER_ARTWORK_BASENAMES_LOWER.has(lower)) {
      continue;
    }
    const fullPath = mountPath.joinWithinMount(dirFullPath, entry.name);
    if (!fullPath) {
      continue;
    }
    try {
      await fs.unlink(fullPath);
      removed.push(dirClientPath + '/' + entry.name);
    } catch {
      // Leave the file in place; the new folder image is still written.
    }
  }
  return removed;
}

interface ScanCallbacks {
  onTotalTracksCounted: (count: number) => void;
  onTrackScanned: (scanCount: number, path: string) => void;
}

/**
 * Corrupt or malformed audio files can trigger bugs in music-metadata's
 * underlying parsers (e.g. strtok3) that throw from a detached background
 * read rather than the awaited parseFile() call, escaping the per-file
 * try/catch below entirely and crashing the whole process. Install a
 * temporary safety net only for the duration of a scan so a bad file can't
 * take down the server, while leaving crashes elsewhere in the app
 * untouched — those should still fail loudly.
 * Returns a function that uninstalls the guard; always call it when the
 * scan finishes (success, error, or otherwise).
 */
export function installScanCrashGuard(): () => void {
  function onCrash(error: unknown) {
    console.error(
      `${colors.FgRed}[scan-guard]${colors.Reset} Suppressed a crash during a music scan (likely a corrupt/malformed audio file):`,
      error,
    );
  }
  process.on('uncaughtException', onCrash);
  process.on('unhandledRejection', onCrash);
  return () => {
    process.off('uncaughtException', onCrash);
    process.off('unhandledRejection', onCrash);
  };
}

/**
 * Core scan implementation shared by the POST and SSE routes.
 * Walks the mount directory, reads metadata (incrementally), writes the index
 * atomically, and fires optional progress callbacks.
 */
export async function performScan(
  mountPath: MountPath,
  callbacks?: ScanCallbacks,
  force = false,
): Promise<T.MusicIndex> {
  const indexPath = mountPath.joinOnMount(MUSIC_INDEX_FILENAME);
  const tmpPath = mountPath.joinOnMount(MUSIC_INDEX_FILENAME + '.tmp');
  if (!indexPath || !tmpPath) {
    throw new Error('Unexpected: index path escaped the mount.');
  }

  // Read the existing index to enable incremental scanning: individual track
  // entries whose mtime and size are unchanged can skip tag re-parsing.
  // Only track entries are reused — version, scannedAt, and all other root
  // fields are always written fresh from the current scan.
  //
  // If the format version has changed, skip the existing index entirely and
  // rescan all files from scratch. Reusing track entries from an older format
  // would produce an incomplete index (e.g. v1 entries have no genre field).
  // A full rescan is the simplest correct strategy.
  const existingTracks = new Map<string, T.TrackMetadata>();
  if (!force) {
    try {
      const contents = await fs.readFile(indexPath, 'utf-8');
      const raw = JSON.parse(contents) as { version?: unknown };
      if (raw.version === MUSIC_INDEX_VERSION) {
        const existing = raw as T.MusicIndex;
        for (const track of existing.tracks) {
          existingTracks.set(track.path, track);
        }
      }
    } catch {
      // No existing index — scan all files.
    }
  }

  const audioFiles = await findAudioFiles(mountPath);
  callbacks?.onTotalTracksCounted(audioFiles.length);

  // Cache folder artwork lookups per album directory — probed once per unique dir.
  const folderArtworkDirCache = new Map<string, string | null>();

  const tracks: T.TrackMetadata[] = [];
  for (let i = 0; i < audioFiles.length; i++) {
    const { clientPath, fullPath } = audioFiles[i];
    const stats = await fs.stat(fullPath);
    const mtime = stats.mtime.toISOString();
    const size = stats.size;

    const folderArtworkPath = await probeFolderArtworkForDir(
      mountPath,
      dirname(clientPath),
      dirname(fullPath),
      folderArtworkDirCache,
    );

    const existingTrack = existingTracks.get(clientPath);
    if (
      existingTrack &&
      existingTrack.mtime === mtime &&
      existingTrack.size === size
    ) {
      // Re-apply freshly probed folder artwork so changes to image files are
      // picked up on rescan even when the audio file itself is unchanged.
      tracks.push({ ...existingTrack, folderArtworkPath });
    } else {
      const parsedTrack = await scanSingleAudioFile(
        mountPath,
        clientPath,
        fullPath,
        stats,
        folderArtworkPath,
        folderArtworkDirCache,
      );
      tracks.push(parsedTrack);
    }

    callbacks?.onTrackScanned(i + 1, clientPath);
  }

  tracks.sort(compareTracksDefault);

  const index: T.MusicIndex = {
    version: MUSIC_INDEX_VERSION,
    scannedAt: new Date().toISOString(),
    tracks,
  };

  // Atomic write: write to a temp file then rename to avoid partial reads.
  await fs.writeFile(tmpPath, JSON.stringify(index, null, '\t'));
  await fs.rename(tmpPath, indexPath);

  return index;
}

async function probeFolderArtworkForDir(
  mountPath: MountPath,
  dirClientPath: string,
  dirFullPath: string,
  folderArtworkDirCache: Map<string, string | null>,
): Promise<string | null> {
  if (folderArtworkDirCache.has(dirClientPath)) {
    return folderArtworkDirCache.get(dirClientPath)!;
  }
  let folderArtworkPath: string | null = null;
  try {
    const entries = await fs.readdir(dirFullPath);
    const entryMap = new Map(entries.map((e) => [e.toLowerCase(), e]));
    for (const name of FOLDER_ARTWORK_FILENAMES) {
      const actual = entryMap.get(name.toLowerCase());
      if (actual) {
        folderArtworkPath = dirClientPath + '/' + actual;
        break;
      }
    }
  } catch {
    // directory unreadable, no folder artwork
  }
  folderArtworkDirCache.set(dirClientPath, folderArtworkPath);
  return folderArtworkPath;
}

async function scanSingleAudioFile(
  mountPath: MountPath,
  clientPath: string,
  fullPath: string,
  stats: { mtime: Date; size: number },
  folderArtworkPathIn: string | null,
  folderArtworkDirCache: Map<string, string | null>,
): Promise<T.TrackMetadata> {
  const mtime = stats.mtime.toISOString();
  const size = stats.size;
  const dirClientPath = dirname(clientPath);
  const dirFullPath = dirname(fullPath);
  let folderArtworkPath = folderArtworkPathIn;

  let title: string | null = null;
  let artist: string | null = null;
  let albumArtist: string | null = null;
  let composer: string | null = null;
  let album: string | null = null;
  let genre: string | null = null;
  let preferComposerGrouping: boolean | null = null;
  let track: number | null = null;
  let duration: number | null = null;
  let hasEmbeddedArtwork = false;
  let year: string | null = null;
  try {
    const meta = await parseFile(fullPath, { duration: true });
    const blocks = serializeTagBlocks(meta.native ?? {});
    title = resolveTagValue(blocks, 'TIT2') ?? null;
    artist = resolveTagValue(blocks, 'TPE1') ?? null;
    albumArtist = resolveTagValue(blocks, 'TPE2') ?? null;
    composer = resolveTagValue(blocks, 'TCOM') ?? null;
    album = resolveTagValue(blocks, 'TALB') ?? null;
    genre = resolveTagValue(blocks, 'TCON') ?? null;
    preferComposerGrouping = parsePreferComposerGroupingTag(
      getNativePrivateTextTags(meta.native),
    );
    track = parseLeadingInt(resolveTagValue(blocks, 'TRCK'));
    duration = meta.format.duration ?? null;
    hasEmbeddedArtwork = (meta.common.picture?.length ?? 0) > 0;
    year = resolveTagValue(blocks, 'TYER') ?? null;

    // If no folder artwork exists but this file has an embedded artwork
    // frame, write it to disk so the /music/artwork endpoint can serve it.
    if (!folderArtworkPath && hasEmbeddedArtwork) {
      const picture = meta.common.picture![0];
      const filename =
        picture.format === 'image/png' ? 'Folder.png' : 'Folder.jpg';
      const artworkFullPath = mountPath.joinWithinMount(dirFullPath, filename);
      if (!artworkFullPath) {
        throw new Error('Unexpected: folder artwork path escaped the mount.');
      }
      await fs.writeFile(artworkFullPath, picture.data);
      folderArtworkPath = dirClientPath + '/' + filename;
      folderArtworkDirCache.set(dirClientPath, folderArtworkPath);
    }
  } catch {
    // If tag reading fails, store what we have.
  }
  return {
    path: clientPath,
    title,
    artist,
    albumArtist,
    composer,
    album,
    genre,
    year,
    preferComposerGrouping,
    track,
    duration,
    size,
    mtime,
    folderArtworkPath,
    hasEmbeddedArtwork,
  };
}

/**
 * Unlike `performScan`, never reads or writes `.music-index.json`.
 */
export async function scanTrackFiles(
  mountPath: MountPath,
  clientPaths: string[],
): Promise<Array<{ clientPath: string; track: T.TrackMetadata | null }>> {
  const folderArtworkDirCache = new Map<string, string | null>();
  const results: Array<{ clientPath: string; track: T.TrackMetadata | null }> =
    [];
  for (const clientPath of clientPaths) {
    const fullPath = mountPath.resolve(clientPath);
    if (!fullPath) {
      results.push({ clientPath, track: null });
      continue;
    }
    let stats: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stats = await fs.stat(fullPath);
    } catch {
      results.push({ clientPath, track: null });
      continue;
    }
    const folderArtworkPath = await probeFolderArtworkForDir(
      mountPath,
      dirname(clientPath),
      dirname(fullPath),
      folderArtworkDirCache,
    );
    const track = await scanSingleAudioFile(
      mountPath,
      clientPath,
      fullPath,
      stats,
      folderArtworkPath,
      folderArtworkDirCache,
    );
    results.push({ clientPath, track });
  }
  return results;
}

export const MUSIC_STAGING_DIRNAME = '.music-staging';

const STAGING_INDEX_FILENAME = '.staging-index.json';
const STAGING_INDEX_VERSION = 1;

interface StagingIndexEntry {
  hash: string;
  size: number;
  mtime: string;
}

interface StagingIndex {
  version: number;
  entries: Record<string, StagingIndexEntry>;
}

export interface StagingPoolEntry {
  path: string;
  hash: string;
  size: number;
  mtime: string;
}

async function hashFile(fullPath: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(fullPath), hash);
  return hash.digest('hex');
}

function stagingIndexPaths(
  mountPath: MountPath,
): { indexPath: string; tmpPath: string } | null {
  const indexPath = mountPath.joinOnMount(
    `${MUSIC_STAGING_DIRNAME}/${STAGING_INDEX_FILENAME}`,
  );
  const tmpPath = mountPath.joinOnMount(
    `${MUSIC_STAGING_DIRNAME}/${STAGING_INDEX_FILENAME}.tmp`,
  );
  return indexPath && tmpPath ? { indexPath, tmpPath } : null;
}

async function readStagingIndex(mountPath: MountPath): Promise<StagingIndex> {
  const paths = stagingIndexPaths(mountPath);
  if (paths) {
    try {
      const raw = JSON.parse(await fs.readFile(paths.indexPath, 'utf-8'));
      if (raw?.version === STAGING_INDEX_VERSION) {
        return raw as StagingIndex;
      }
    } catch {
      // No existing index — start fresh.
    }
  }
  return { version: STAGING_INDEX_VERSION, entries: {} };
}

async function writeStagingIndex(
  mountPath: MountPath,
  index: StagingIndex,
): Promise<void> {
  const paths = stagingIndexPaths(mountPath);
  if (!paths) {
    return;
  }
  await fs.writeFile(paths.tmpPath, JSON.stringify(index, null, '\t'));
  await fs.rename(paths.tmpPath, paths.indexPath);
}

export async function scanStagingPool(
  mountPath: MountPath,
): Promise<StagingPoolEntry[]> {
  const stagingRoot = mountPath.joinOnMount(MUSIC_STAGING_DIRNAME);
  if (!stagingRoot) {
    return [];
  }
  let entries: Dirent[];
  try {
    entries = await fs.readdir(stagingRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  const index = await readStagingIndex(mountPath);
  const nextEntries: StagingIndex['entries'] = {};
  const results: StagingPoolEntry[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith('.')) {
      continue;
    }
    const fullPath = mountPath.joinWithinMount(stagingRoot, entry.name);
    if (!fullPath) {
      continue;
    }
    const clientPath = `/${MUSIC_STAGING_DIRNAME}/${entry.name}`;
    const stats = await fs.stat(fullPath);
    const mtime = stats.mtime.toISOString();
    const cached = index.entries[clientPath];
    const hash =
      cached && cached.mtime === mtime && cached.size === stats.size
        ? cached.hash
        : await hashFile(fullPath);

    nextEntries[clientPath] = { hash, size: stats.size, mtime };
    results.push({ path: clientPath, hash, size: stats.size, mtime });
  }

  await writeStagingIndex(mountPath, {
    version: STAGING_INDEX_VERSION,
    entries: nextEntries,
  });
  return results;
}

export async function dedupeStagedTracks(
  mountPath: MountPath,
  candidatePaths: string[],
): Promise<{ paths: string[]; duplicateCount: number }> {
  const candidateSet = new Set(candidatePaths);
  const pool = await scanStagingPool(mountPath);
  const poolHashByPath = new Map(pool.map((entry) => [entry.path, entry.hash]));

  const seenHashes = new Set<string>();
  for (const entry of pool) {
    if (!candidateSet.has(entry.path)) {
      seenHashes.add(entry.hash);
    }
  }

  const paths: string[] = [];
  let duplicateCount = 0;
  for (const path of candidatePaths) {
    const hash = poolHashByPath.get(path);
    if (hash && seenHashes.has(hash)) {
      const fullPath = mountPath.resolve(path);
      if (fullPath) {
        await fs.rm(fullPath, { force: true });
      }
      duplicateCount += 1;
      continue;
    }
    if (hash) {
      seenHashes.add(hash);
    }
    paths.push(path);
  }

  if (duplicateCount > 0) {
    await scanStagingPool(mountPath);
  }

  return { paths, duplicateCount };
}

export async function listStagingPoolTracks(
  mountPath: MountPath,
): Promise<T.TrackMetadata[]> {
  const pool = await scanStagingPool(mountPath);
  const results = await scanTrackFiles(
    mountPath,
    pool.map((entry) => entry.path),
  );
  return results.flatMap((result) => (result.track ? [result.track] : []));
}

/**
 * Parses a TRCK-style frame value ("4", "4/16") into its leading track number.
 */
function parseLeadingInt(value: string | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? null : n;
}

function getNativePrivateTextTags(
  native: Record<string, Array<{ id: string; value: unknown }>>,
) {
  return Object.values(native).flatMap((frames) =>
    frames.flatMap((frame) => {
      if (frame.id.startsWith('TXXX:') && typeof frame.value === 'string') {
        return [
          {
            description: frame.id.slice('TXXX:'.length),
            value: frame.value,
          },
        ];
      }
      if (frame.id !== 'TXXX') {
        return [];
      }
      const tag = nativePrivateTextTagValue(frame.value);
      return tag ? [tag] : [];
    }),
  );
}

/**
 * True if every character is an ASCII digit and the string is non-empty.
 */
function isDigitsOnly(value: string): boolean {
  if (value.length === 0) {
    return false;
  }
  for (const char of value) {
    if (char < '0' || char > '9') {
      return false;
    }
  }
  return true;
}

/**
 * TRCK/TPOS values are a plain integer, or "N/total" (e.g. "4/16").
 */
function isValidSplitNumericValue(value: string): boolean {
  const parts = value.split('/');
  return parts.length <= 2 && parts.every(isDigitsOnly);
}

/**
 * Frames whose ID3 spec defines a numeric-string format, and the validator
 * for the shape that's valid for each.
 */
const NUMERIC_FRAME_VALIDATORS: Record<string, (value: string) => boolean> = {
  TRCK: isValidSplitNumericValue,
  TPOS: isValidSplitNumericValue,
  TYER: isDigitsOnly,
  TBPM: isDigitsOnly,
};

export function buildNodeId3Tags(
  changes: T.WriteTrackTagsRequest['changes'],
): Record<string, unknown> {
  const tags: Record<string, unknown> = {};
  for (const change of changes) {
    if (typeof change !== 'object' || change === null) {
      throw new ClientError('Invalid tag change.');
    }
    const { frameId, value, description } = change;
    if (typeof frameId !== 'string' || !frameId) {
      throw new ClientError('Invalid frame ID.');
    }
    if (typeof value !== 'string') {
      throw new ClientError('Invalid tag value.');
    }
    const numericValidator = NUMERIC_FRAME_VALIDATORS[frameId];
    if (numericValidator && value !== '' && !numericValidator(value)) {
      throw new ClientError(`${frameId} must be numeric, got: "${value}"`);
    }
    if (frameId === 'COMM') {
      tags.comment = { language: 'eng', shortText: '', text: value };
    } else if (frameId === 'TXXX') {
      if (description !== PREFER_COMPOSER_GROUPING_TAG_DESCRIPTION) {
        throw new ClientError(`Unsupported TXXX description: ${description}`);
      }
      tags.userDefinedText = [{ description, value }];
    } else {
      const prop = FRAME_ID_TO_NODE_ID3[frameId];
      if (!prop) {
        throw new ClientError(`Unsupported frame ID: ${frameId}`);
      }
      tags[prop] = value;
    }
  }
  return tags;
}

/**
 * serializeTag JSON-stringifies a COMM frame's value into an object with
 * language, descriptor, and text fields. This function extracts just the
 * text. The frontend's detailFieldValues() duplicates this same parsing.
 * Keep the two in sync.
 */
function extractCommentText(rawValue: string): string {
  try {
    const parsed = JSON.parse(rawValue) as { text?: string };
    return parsed.text ?? '';
  } catch {
    return rawValue;
  }
}

/**
 * Computes fields to backfill into ID3v2.3 during a write. Each
 * APP_FRAME_IDS field missing from the ID3v2.3 block gets its value from
 * another embedded tag block, chosen by TAG_FORMAT_PRIORITY. Fields the
 * caller is already writing are skipped, since an explicit change always
 * wins.
 *
 * This function assumes the ID3v2.3 tag, when present, is the file's
 * leading tag. That holds for every tag this app writes and for the common
 * re-tagger case of prepending a fresh tag over an old one. NodeID3.update()
 * only edits the leading tag, so a non-leading legacy ID3v2.3 tag will not
 * migrate. This is an accepted, atypical edge case.
 */
async function computeId3v23Backfills(
  resolvedPath: string,
  changes: T.TrackTagUpdate[],
): Promise<T.TrackTagUpdate[]> {
  const requestedFrameIds = new Set(changes.map((change) => change.frameId));
  let blocks: T.TrackTagsResponse['blocks'];
  try {
    const meta = await parseFile(resolvedPath);
    blocks = serializeTagBlocks(meta.native ?? {});
  } catch {
    // This function can't read the file's tag blocks for gap-fill. The
    // write below will still be attempted and will surface any real error
    // on its own.
    return [];
  }

  const v23Tags = blocks.find((block) => block.format === 'ID3v2.3');
  const v23FrameIds = new Set(v23Tags?.tags.map((tag) => tag.id) ?? []);

  const gapFill: T.TrackTagUpdate[] = [];
  for (const frameId of APP_FRAME_IDS) {
    if (v23FrameIds.has(frameId) || requestedFrameIds.has(frameId)) {
      continue;
    }
    const rawValue = resolveTagValue(blocks, frameId);
    if (rawValue === undefined) {
      continue;
    }
    gapFill.push({
      frameId,
      value: frameId === 'COMM' ? extractCommentText(rawValue) : rawValue,
    });
  }
  return gapFill;
}

/**
 * Maps the file's just-written ID3v2.3 fields into what ID3v1 can hold.
 */
function extractId3v1Fields(
  blocks: T.TrackTagsResponse['blocks'],
): Id3v1TagFields {
  const v23 = blocks.find((block) => block.format === 'ID3v2.3');
  const get = (frameId: string): string | undefined =>
    v23?.tags.find((tag) => tag.id === frameId && tag.binary === undefined)
      ?.value;
  return {
    title: get('TIT2') ?? null,
    artist: get('TPE1') ?? null,
    album: get('TALB') ?? null,
    year: get('TYER') ?? null,
    genre: get('TCON') ?? null,
    track: parseLeadingInt(get('TRCK')),
  };
}

/**
 * Regenerates the trailing ID3v1 tag from the current ID3v2.3 fields, replacing or
 * appending it. This is a best-effort, a failure here shouldn't fail a write whose
 * ID3v2 portion already succeeded.
 */
async function backfillId3v1Tag(resolvedPath: string): Promise<void> {
  try {
    const meta = await parseFile(resolvedPath);
    const blocks = serializeTagBlocks(meta.native ?? {});
    const block = buildId3v1TagBuffer(extractId3v1Fields(blocks));

    const stats = await fs.stat(resolvedPath);
    const handle = await fs.open(resolvedPath, 'r+');
    try {
      let offset = stats.size;
      if (stats.size >= ID3V1_TAG_SIZE) {
        const marker = Buffer.alloc(3);
        await handle.read(marker, 0, 3, stats.size - ID3V1_TAG_SIZE);
        if (marker.toString('latin1') === 'TAG') {
          offset = stats.size - ID3V1_TAG_SIZE;
        }
      }
      await handle.write(block, 0, block.length, offset);
    } finally {
      await handle.close();
    }
  } catch {
    // Unable to read the file's tags or write the trailing block — leave
    // the file as-is.
  }
}

export async function writeTrackTagsForPath(
  mountPath: MountPath,
  clientPath: string,
  changes: T.TrackTagUpdate[],
): T.AsyncResult<{
  clientPath: string;
  resolvedPath: string;
  id3v23Backfills: T.TrackTagUpdate[];
}> {
  try {
    const resolvedPath = mountPath.resolve(clientPath);
    if (!resolvedPath) {
      return { type: 'error', message: 'Invalid path.' };
    }
    if (extname(resolvedPath).toLowerCase() !== '.mp3') {
      return {
        type: 'error',
        message: 'Only MP3 files are supported for tag writing.',
      };
    }
    try {
      await fs.stat(resolvedPath);
    } catch (err: any) {
      if (err?.code === 'ENOENT') {
        return { type: 'error', message: 'File not found.' };
      }
      return {
        type: 'error',
        message: err instanceof Error ? err.message : 'Unable to read file.',
      };
    }

    const id3v23Backfills = await computeId3v23Backfills(resolvedPath, changes);
    const tags = buildNodeId3Tags([...id3v23Backfills, ...changes]);

    const result = NodeID3.update(tags, resolvedPath);
    if (result instanceof Error) {
      return { type: 'error', message: result.message };
    }
    await backfillId3v1Tag(resolvedPath);
    return {
      type: 'success',
      clientPath,
      resolvedPath,
      id3v23Backfills,
    };
  } catch (error) {
    return {
      type: 'error',
      message: error instanceof Error ? error.message : 'Unable to write tags.',
    };
  }
}

/**
 * Keeps the durable music index aligned with a successful tag write, so the
 * next library load does not show stale metadata or force an incremental rescan.
 */
export async function updateIndexAfterTrackTagWrites(
  mountPath: MountPath,
  updatedTracks: T.ResultValue<typeof writeTrackTagsForPath>[],
  changes: T.WriteTrackTagsRequest['changes'],
): Promise<T.WriteTrackTagsResponse['index']> {
  if (updatedTracks.length === 0) {
    return { status: 'skipped', message: 'No tracks were updated.' };
  }
  const indexPath = mountPath.joinOnMount(MUSIC_INDEX_FILENAME);
  const tmpPath = mountPath.joinOnMount(MUSIC_INDEX_FILENAME + '.write.tmp');
  if (!indexPath || !tmpPath) {
    return {
      status: 'error',
      message: 'Unexpected: music index path escaped the mount.',
    };
  }

  let index: T.MusicIndex;
  try {
    index = JSON.parse(await fs.readFile(indexPath, 'utf-8')) as T.MusicIndex;
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return { status: 'skipped', message: 'Music index not found.' };
    }
    return {
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to read music index after writing track tags.',
    };
  }
  if (index.version !== MUSIC_INDEX_VERSION) {
    return {
      status: 'skipped',
      message: 'Music index version does not match the server version.',
    };
  }

  const pathToUpdatedTrack = new Map(
    updatedTracks.map((track) => [track.clientPath, track]),
  );
  let didUpdateIndex = false;
  const statErrors: Array<{ path: string; message: string }> = [];

  const tracks = await Promise.all(
    index.tracks.map(async (track) => {
      const updated = pathToUpdatedTrack.get(track.path);
      if (!updated) {
        // This track was not updated.
        return track;
      }
      let stats: Awaited<ReturnType<typeof fs.stat>>;
      try {
        stats = await fs.stat(updated.resolvedPath);
      } catch (error) {
        statErrors.push({
          path: updated.clientPath,
          message:
            error instanceof Error
              ? error.message
              : 'Failed to stat updated track.',
        });
        return track;
      }
      didUpdateIndex = true;
      const updatedTrack = { ...track };
      updatedTrack.size = stats.size;
      updatedTrack.mtime = stats.mtime.toISOString();

      for (const { frameId, value, description } of [
        ...updated.id3v23Backfills,
        ...changes,
      ]) {
        switch (frameId) {
          case 'TIT2':
            updatedTrack.title = value || null;
            break;
          case 'TPE1':
            updatedTrack.artist = value || null;
            break;
          case 'TPE2':
            updatedTrack.albumArtist = value || null;
            break;
          case 'TALB':
            updatedTrack.album = value || null;
            break;
          case 'TCON':
            updatedTrack.genre = value || null;
            break;
          case 'TCOM':
            updatedTrack.composer = value || null;
            break;
          case 'TXXX':
            if (description === PREFER_COMPOSER_GROUPING_TAG_DESCRIPTION) {
              updatedTrack.preferComposerGrouping = parseBooleanTagValue(value);
            }
            break;
          case 'TRCK': {
            const num = parseInt(value.split('/')[0], 10);
            updatedTrack.track = isNaN(num) ? null : num;
            break;
          }
          default:
            break;
        }
      }
      return updatedTrack;
    }),
  );
  if (!didUpdateIndex) {
    if (statErrors.length > 0) {
      return {
        status: 'error',
        message: `Failed to stat updated tracks: ${statErrors
          .map((error) => error.path)
          .join(', ')}`,
      };
    }
    return {
      status: 'skipped',
      message: 'No updated tracks were present in the music index.',
    };
  }

  const updatedIndex: T.MusicIndex = {
    ...index,
    scannedAt: new Date().toISOString(),
    tracks,
  };
  let renamed = false;
  try {
    await fs.writeFile(tmpPath, JSON.stringify(updatedIndex, null, '\t'));
    await fs.rename(tmpPath, indexPath);
    renamed = true;
    if (statErrors.length > 0) {
      return {
        status: 'error',
        message: `Some updated tracks could not be patched in the index: ${statErrors
          .map((error) => error.path)
          .join(', ')}`,
      };
    }
    return { status: 'updated', message: null };
  } catch (error) {
    return {
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to write music index after writing track tags.',
    };
  } finally {
    if (!renamed) {
      await fs.unlink(tmpPath).catch((error: any) => {
        if (error?.code !== 'ENOENT') {
          console.error('Failed to clean up temporary music index.', error);
        }
      });
    }
  }
}

/**
 * Best-effort patch of the durable music index after a folder artwork image is
 * written, so the change survives without a rescan. Points every track in the
 * artwork's directory at the new file, and marks any freshly embedded tracks as
 * having embedded artwork.
 */
export async function updateIndexAfterFolderArtworkWrite(
  mountPath: MountPath,
  folderArtworkClientPath: string,
  embeddedTrackClientPaths: string[] = [],
): Promise<{
  status: 'updated' | 'skipped' | 'error';
  message: string | null;
}> {
  const indexPath = mountPath.joinOnMount(MUSIC_INDEX_FILENAME);
  const tmpPath = mountPath.joinOnMount(MUSIC_INDEX_FILENAME + '.artwork.tmp');
  if (!indexPath || !tmpPath) {
    return {
      status: 'error',
      message: 'Unexpected: music index path escaped the mount.',
    };
  }

  let index: T.MusicIndex;
  try {
    index = JSON.parse(await fs.readFile(indexPath, 'utf-8')) as T.MusicIndex;
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return { status: 'skipped', message: 'Music index not found.' };
    }
    return {
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to read music index after writing folder artwork.',
    };
  }
  if (index.version !== MUSIC_INDEX_VERSION) {
    return {
      status: 'skipped',
      message: 'Music index version does not match the server version.',
    };
  }

  const folderDir = dirname(folderArtworkClientPath);
  const embedded = new Set(embeddedTrackClientPaths);
  let changed = false;
  const tracks = index.tracks.map((track) => {
    let next = track;
    if (
      dirname(track.path) === folderDir &&
      track.folderArtworkPath !== folderArtworkClientPath
    ) {
      next = { ...next, folderArtworkPath: folderArtworkClientPath };
      changed = true;
    }
    if (embedded.has(track.path) && !next.hasEmbeddedArtwork) {
      next = { ...next, hasEmbeddedArtwork: true };
      changed = true;
    }
    return next;
  });

  if (!changed) {
    return { status: 'skipped', message: 'Index already matched the artwork.' };
  }

  const updatedIndex: T.MusicIndex = {
    ...index,
    scannedAt: new Date().toISOString(),
    tracks,
  };
  let renamed = false;
  try {
    await fs.writeFile(tmpPath, JSON.stringify(updatedIndex, null, '\t'));
    await fs.rename(tmpPath, indexPath);
    renamed = true;
    return { status: 'updated', message: null };
  } catch (error) {
    return {
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to write music index after writing folder artwork.',
    };
  } finally {
    if (!renamed) {
      await fs.unlink(tmpPath).catch((error: any) => {
        if (error?.code !== 'ENOENT') {
          console.error('Failed to clean up temporary music index.', error);
        }
      });
    }
  }
}

export async function updateIndexAfterFolderArtworkRemoval(
  mountPath: MountPath,
  folderDirClientPath: string,
): Promise<{
  status: 'updated' | 'skipped' | 'error';
  message: string | null;
}> {
  const indexPath = mountPath.joinOnMount(MUSIC_INDEX_FILENAME);
  const tmpPath = mountPath.joinOnMount(
    MUSIC_INDEX_FILENAME + '.artwork-remove.tmp',
  );
  if (!indexPath || !tmpPath) {
    return {
      status: 'error',
      message: 'Unexpected: music index path escaped the mount.',
    };
  }

  let index: T.MusicIndex;
  try {
    index = JSON.parse(await fs.readFile(indexPath, 'utf-8')) as T.MusicIndex;
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return { status: 'skipped', message: 'Music index not found.' };
    }
    return {
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to read music index after removing folder artwork.',
    };
  }
  if (index.version !== MUSIC_INDEX_VERSION) {
    return {
      status: 'skipped',
      message: 'Music index version does not match the server version.',
    };
  }

  const folderDir = folderDirClientPath.startsWith('/')
    ? folderDirClientPath
    : '/' + folderDirClientPath;
  let changed = false;
  const tracks = index.tracks.map((track) => {
    if (dirname(track.path) === folderDir && track.folderArtworkPath !== null) {
      changed = true;
      return { ...track, folderArtworkPath: null };
    }
    return track;
  });

  if (!changed) {
    return {
      status: 'skipped',
      message: 'Index had no folder artwork for this directory.',
    };
  }

  const updatedIndex: T.MusicIndex = {
    ...index,
    scannedAt: new Date().toISOString(),
    tracks,
  };

  let renamed = false;
  try {
    await fs.writeFile(tmpPath, JSON.stringify(updatedIndex, null, '\t'));
    await fs.rename(tmpPath, indexPath);
    renamed = true;
    return { status: 'updated', message: null };
  } catch (error) {
    return {
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to write music index after removing folder artwork.',
    };
  } finally {
    if (!renamed) {
      await fs.unlink(tmpPath).catch((error: any) => {
        if (error?.code !== 'ENOENT') {
          console.error('Failed to clean up temporary music index.', error);
        }
      });
    }
  }
}

function isBinary(value: unknown): value is Buffer | Uint8Array {
  return Buffer.isBuffer(value) || ArrayBuffer.isView(value);
}

function toBinaryBase64(value: Buffer | Uint8Array): string {
  return Buffer.isBuffer(value)
    ? value.toString('base64')
    : Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString(
        'base64',
      );
}

function serializeTag(value: unknown): { value: string; binary?: string } {
  if (value === null || value === undefined) {
    return { value: '' };
  }
  if (typeof value === 'string') {
    return { value };
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return { value: String(value) };
  }
  if (isBinary(value)) {
    return { value: '[binary]', binary: toBinaryBase64(value) };
  }
  if (Array.isArray(value)) {
    return { value: value.map((v) => serializeTag(v).value).join(', ') };
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if ('data' in obj && isBinary(obj.data)) {
      // Build a human-readable label from non-binary fields (e.g. APIC: "image/jpeg — Cover (front)")
      const { data: _data, ...rest } = obj;
      const parts = Object.entries(rest)
        .filter(([, v]) => v !== '' && v !== null && v !== undefined)
        .map(([, v]) => String(v));
      return {
        value: parts.length > 0 ? parts.join(' — ') : '[binary]',
        binary: toBinaryBase64(obj.data as Buffer | Uint8Array),
      };
    }
    try {
      return { value: JSON.stringify(value) };
    } catch {
      return { value: '[object]' };
    }
  }
  return { value: String(value) };
}

/**
 * Converts music-metadata's per-format tag data into the serialized, grouped
 * tag blocks used both by the raw tag browser (/track-tags) and by field
 * resolution (scanner + /track-tags `resolved`), so both read the exact same
 * values.
 */
export function serializeTagBlocks(
  rawTags: Record<string, Array<{ id: string; value: unknown }>>,
): T.TrackTagsResponse['blocks'] {
  return Object.entries(rawTags).map(([format, frames]) => ({
    format,
    tags: frames.map((frame) => {
      const { value, binary } = serializeTag(frame.value);
      return binary !== undefined
        ? { id: frame.id, value, binary }
        : { id: frame.id, value };
    }),
  }));
}

async function findAudioFiles(
  mountPath: MountPath,
): Promise<Array<{ clientPath: string; fullPath: string }>> {
  const results: Array<{ clientPath: string; fullPath: string }> = [];
  const nextDirs: Array<Promise<Dirent[]>> = [mountPath.mountReaddir()];

  let nextDir: Promise<Dirent[]> | undefined;
  while ((nextDir = nextDirs.pop())) {
    for (const entry of await nextDir) {
      // Skip hidden files and directories (including .music-index.json itself).
      if (entry.name.startsWith('.')) {
        continue;
      }

      const fullPath = mountPath.joinWithinMount(entry.parentPath, entry.name);
      if (!fullPath) {
        continue;
      }

      if (entry.isDirectory()) {
        nextDirs.push(mountPath.readdir(fullPath));
      } else if (entry.isFile()) {
        if (AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
          const clientPath = mountPath.toClientPath(fullPath);
          if (clientPath !== null) {
            results.push({ clientPath, fullPath });
          }
        }
      }
    }
  }

  return results;
}

export function sniffImageMimeType(data: Buffer) {
  if (
    data.length >= 3 &&
    data[0] === 0xff &&
    data[1] === 0xd8 &&
    data[2] === 0xff
  ) {
    return 'image/jpeg' as const;
  }
  if (
    data.length >= 8 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47 &&
    data[4] === 0x0d &&
    data[5] === 0x0a &&
    data[6] === 0x1a &&
    data[7] === 0x0a
  ) {
    return 'image/png' as const;
  }
  return null;
}

export interface EmbedArtworkSuccess {
  clientPath: string;
  resolvedPath: string;
  mimeType: 'image/jpeg' | 'image/png';
}

export interface EmbedArtworkFailure {
  path: string;
  message: string;
}

export interface RemoveEmbeddedArtworkSuccess {
  clientPath: string;
  resolvedPath: string;
  /** Count of APIC picture frames stripped from the leading tag. */
  removed: number;
}

export async function embedArtworkIntoTrack(
  mountPath: MountPath,
  clientPath: string,
  imageBuffer: Buffer,
): Promise<EmbedArtworkSuccess | EmbedArtworkFailure> {
  const pathForError = clientPath;
  let errorPath = pathForError;
  try {
    const resolvedPath = mountPath.resolve(clientPath);
    if (!resolvedPath) {
      return { path: clientPath, message: 'Invalid path.' };
    }
    const normalizedClientPath = mountPath.toClientPath(resolvedPath);
    if (normalizedClientPath === null) {
      return { path: clientPath, message: 'Invalid path.' };
    }
    errorPath = normalizedClientPath;

    if (extname(resolvedPath).toLowerCase() !== '.mp3') {
      return {
        path: normalizedClientPath,
        message: 'Only MP3 files are supported for artwork embedding.',
      };
    }

    if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
      return {
        path: normalizedClientPath,
        message: 'Artwork image data is empty.',
      };
    }
    const mimeType = sniffImageMimeType(imageBuffer);
    if (!mimeType) {
      return {
        path: normalizedClientPath,
        message: 'Artwork must be a JPEG or PNG image.',
      };
    }

    try {
      await fs.stat(resolvedPath);
    } catch (err: any) {
      if (err?.code === 'ENOENT') {
        return { path: normalizedClientPath, message: 'File not found.' };
      }
      return {
        path: normalizedClientPath,
        message: err instanceof Error ? err.message : 'Unable to read file.',
      };
    }

    const result = NodeID3.update(
      {
        image: {
          mime: mimeType,
          type: { id: 3 }, // ID3v2 APIC picture type for "Cover (front)".
          description: '',
          imageBuffer,
        },
      },
      resolvedPath,
    );
    if (result instanceof Error) {
      return { path: normalizedClientPath, message: result.message };
    }

    return { clientPath: normalizedClientPath, resolvedPath, mimeType };
  } catch (error) {
    return {
      path: errorPath,
      message:
        error instanceof Error ? error.message : 'Unable to embed artwork.',
    };
  }
}

/**
 * Strips every APIC frame from an MP3's leading ID3 tag.
 */
export async function removeEmbeddedArtworkFromTrack(
  mountPath: MountPath,
  clientPath: string,
): Promise<RemoveEmbeddedArtworkSuccess | EmbedArtworkFailure> {
  let errorPath = clientPath;
  try {
    const resolvedPath = mountPath.resolve(clientPath);
    if (!resolvedPath) {
      return { path: clientPath, message: 'Invalid path.' };
    }
    const normalizedClientPath = mountPath.toClientPath(resolvedPath);
    if (normalizedClientPath === null) {
      return { path: clientPath, message: 'Invalid path.' };
    }
    errorPath = normalizedClientPath;

    if (extname(resolvedPath).toLowerCase() !== '.mp3') {
      return {
        path: normalizedClientPath,
        message: 'Only MP3 files are supported for artwork removal.',
      };
    }

    try {
      await fs.stat(resolvedPath);
    } catch (err: any) {
      if (err?.code === 'ENOENT') {
        return { path: normalizedClientPath, message: 'File not found.' };
      }
      return {
        path: normalizedClientPath,
        message: err instanceof Error ? err.message : 'Unable to read file.',
      };
    }

    const current = NodeID3.read(resolvedPath) as {
      raw?: Record<string, unknown>;
    };
    const raw = current.raw ?? {};
    const apic = raw.APIC;
    let removed = 0;
    if (Array.isArray(apic)) {
      removed = apic.length;
    } else if (apic) {
      removed = 1;
    }
    if (removed === 0) {
      return { clientPath: normalizedClientPath, resolvedPath, removed: 0 };
    }

    delete raw.APIC;
    const result = NodeID3.write(raw, resolvedPath);
    if (result instanceof Error) {
      return { path: normalizedClientPath, message: result.message };
    }

    return { clientPath: normalizedClientPath, resolvedPath, removed };
  } catch (error) {
    return {
      path: errorPath,
      message:
        error instanceof Error ? error.message : 'Unable to remove artwork.',
    };
  }
}

export async function updateMusicIndexAfterEmbeddedArtworkRemoval(
  mountPath: MountPath,
  track: { clientPath: string; resolvedPath: string },
): Promise<{
  status: 'updated' | 'skipped' | 'error';
  message: string | null;
}> {
  const indexPath = mountPath.joinOnMount(MUSIC_INDEX_FILENAME);
  const tmpPath = mountPath.joinOnMount(
    MUSIC_INDEX_FILENAME + '.artwork-remove.tmp',
  );
  if (!indexPath || !tmpPath) {
    return {
      status: 'error',
      message: 'Unexpected: music index path escaped the mount.',
    };
  }

  let index: T.MusicIndex;
  try {
    index = JSON.parse(await fs.readFile(indexPath, 'utf-8')) as T.MusicIndex;
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return { status: 'skipped', message: 'Music index not found.' };
    }
    return {
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to read music index after removing embedded artwork.',
    };
  }
  if (index.version !== MUSIC_INDEX_VERSION) {
    return {
      status: 'skipped',
      message: 'Music index version does not match the server version.',
    };
  }

  let stats: Awaited<ReturnType<typeof fs.stat>> | null = null;
  try {
    stats = await fs.stat(track.resolvedPath);
  } catch {
    // Fall through: the flag is still worth clearing even without fresh stats.
  }

  let changed = false;
  const tracks = index.tracks.map((entry) => {
    if (entry.path !== track.clientPath) {
      return entry;
    }
    let next = entry;
    if (next.hasEmbeddedArtwork) {
      next = { ...next, hasEmbeddedArtwork: false };
      changed = true;
    }
    if (stats) {
      const mtime = stats.mtime.toISOString();
      if (next.size !== stats.size || next.mtime !== mtime) {
        next = { ...next, size: stats.size, mtime };
        changed = true;
      }
    }
    return next;
  });

  if (!changed) {
    return { status: 'skipped', message: 'Index already matched the file.' };
  }

  const updatedIndex: T.MusicIndex = {
    ...index,
    scannedAt: new Date().toISOString(),
    tracks,
  };
  let renamed = false;
  try {
    await fs.writeFile(tmpPath, JSON.stringify(updatedIndex, null, '\t'));
    await fs.rename(tmpPath, indexPath);
    renamed = true;
    return { status: 'updated', message: null };
  } catch (error) {
    return {
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to write music index after removing embedded artwork.',
    };
  } finally {
    if (!renamed) {
      await fs.unlink(tmpPath).catch((error: any) => {
        if (error?.code !== 'ENOENT') {
          console.error('Failed to clean up temporary music index.', error);
        }
      });
    }
  }
}
