import {
  ApiRoute,
  ClientError,
  MountPath,
  NotFoundError,
  RequestConflict,
} from './utils.ts';
import type { T } from './index.ts';
import { createReadStream, Dirent, promises as fs } from 'node:fs';
import { extname, dirname } from 'node:path';
import { finished } from 'stream/promises';
import { parseFile } from 'music-metadata';

export const MUSIC_INDEX_FILENAME = '.music-index.json';
const MUSIC_INDEX_VERSION = 5 as const;

const COVER_ART_FILENAMES = [
  'cover.jpg',
  'cover.png',
  'folder.jpg',
  'Folder.jpg',
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

export function musicRoute(mountPath: MountPath) {
  const route = new ApiRoute();
  let scanInProgress = false;

  /**
   * Returns the current music index, or 404 if no scan has been run yet.
   */
  route.get('/music-index', async (): Promise<T.MusicIndex> => {
    const indexPath = mountPath.joinOnMount(MUSIC_INDEX_FILENAME);
    if (!indexPath) {
      throw new Error('Unexpected: MUSIC_INDEX_FILENAME escaped the mount.');
    }
    try {
      const contents = await fs.readFile(indexPath, 'utf-8');
      return JSON.parse(contents) as T.MusicIndex;
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        throw new NotFoundError('Music index not found. Run a scan first.');
      }
      throw error;
    }
  });

  /**
   * Scans the mount directory for audio files, reads their ID3 tags, and
   * writes the result atomically to .music-index.json. Subsequent scans are
   * incremental: files whose mtime and size are unchanged reuse cached metadata.
   *
   * Returns 409 if a scan is already in progress.
   */
  route.post('/music-index/scan', async (): Promise<T.MusicIndex> => {
    if (scanInProgress) {
      throw new RequestConflict('A scan is already in progress.');
    }
    scanInProgress = true;
    try {
      return await performScan(mountPath);
    } finally {
      scanInProgress = false;
    }
  });

  /**
   * SSE endpoint that streams scan progress in real time.
   * Events: total → progress × N → done (or error).
   */
  route.addBlobRoute('GET', '/music-index/scan', async (_request, response) => {
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();

    function sendData(event: Record<string, unknown>) {
      response.write('data: ' + JSON.stringify(event) + '\n\n');
    }

    if (scanInProgress) {
      sendData({ type: 'error', message: 'A scan is already in progress.' });
      response.end();
      return;
    }

    scanInProgress = true;
    try {
      const index = await performScan(mountPath, {
        onTotalTracksCounted(count) {
          sendData({ type: 'total', count });
        },
        onTrackScanned(scanCount, path) {
          // TODO - This should use a 500ms throttling.
          sendData({ type: 'progress', scanCount, path });
        },
      });
      sendData({ type: 'done', tracks: index.tracks });
      response.end();
    } catch (err: any) {
      sendData({ type: 'error', message: err?.message ?? 'Scan failed.' });
      response.end();
    } finally {
      scanInProgress = false;
    }
  });

  /**
   * Streams an audio file with HTTP range request support so the browser
   * <audio> element can seek. Accepts a `path` query parameter.
   */
  route.addBlobRoute('GET', '/stream-audio', async (req, res) => {
    const clientPath = req.query.path;
    if (typeof clientPath !== 'string' || !clientPath) {
      res.status(400).send('Missing path query parameter.');
      return;
    }

    const resolvedPath = mountPath.resolve(clientPath);
    if (!resolvedPath) {
      throw new ClientError('Invalid path.');
    }

    let stats: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stats = await fs.stat(resolvedPath);
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        res.status(404).send('File not found.');
        return;
      }
      throw error;
    }

    const fileSize = stats.size;
    res.setHeader('Accept-Ranges', 'bytes');

    const rangeHeader = req.headers.range;
    if (!rangeHeader) {
      res.status(200);
      res.setHeader('Content-Length', fileSize);
      const stream = createReadStream(resolvedPath);
      stream.pipe(res);
      await finished(stream);
      return;
    }

    // Parse RFC 7233 byte ranges. Two distinct forms:
    //   bytes=<start>-[<end>]  (start required, end optional)
    //   bytes=-<suffix-length> (last N bytes; suffix-length required)
    const byteRangeMatch = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader);
    const suffixMatch = /^bytes=-(\d+)$/.exec(rangeHeader);

    if (!byteRangeMatch && !suffixMatch) {
      res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).send();
      return;
    }

    let start: number;
    let end: number;

    if (suffixMatch) {
      const suffixLength = parseInt(suffixMatch[1], 10);
      start = Math.max(0, fileSize - suffixLength);
      end = fileSize - 1;
    } else {
      start = parseInt(byteRangeMatch![1], 10);
      end = byteRangeMatch![2]
        ? parseInt(byteRangeMatch![2], 10)
        : fileSize - 1;
    }

    if (start > end || end >= fileSize || start < 0) {
      res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).send();
      return;
    }

    const chunkSize = end - start + 1;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    res.setHeader('Content-Length', chunkSize);
    const stream = createReadStream(resolvedPath, { start, end });
    stream.pipe(res);
    await finished(stream);
  });

  /**
   * Returns all raw native tag frames for a single audio file, serialized to
   * human-readable strings. Binary values (e.g. embedded pictures) are
   * represented as '[binary]'. Grouped by tag format (e.g. 'ID3v2.4', 'vorbis').
   */
  route.get('/track-tags', async (req): Promise<T.TrackTagsResponse> => {
    const clientPath = req.query.path;
    if (typeof clientPath !== 'string' || !clientPath) {
      throw new ClientError('Missing path query parameter.');
    }
    const resolvedPath = mountPath.resolve(clientPath);
    if (!resolvedPath) {
      throw new ClientError('Invalid path.');
    }
    const meta = await parseFile(resolvedPath);
    const native = Object.entries(meta.native ?? {}).map(
      ([format, frames]) => ({
        format,
        tags: frames.map((frame) => {
          const { value, binary } = serializeTag(frame.value);
          return binary !== undefined
            ? { id: frame.id, value, binary }
            : { id: frame.id, value };
        }),
      }),
    );
    return { native };
  });

  /**
   * Serves a cover art image stored in an album directory.
   * Accepts a ?path= query parameter using the same client-path convention as
   * stream-audio (e.g. /Artist/Album/Folder.jpg).
   */
  route.addBlobRoute('GET', '/cover-art', async (req, res) => {
    const clientPath = req.query.path;
    if (typeof clientPath !== 'string' || !clientPath) {
      throw new ClientError('Missing path query parameter.');
    }

    const resolvedPath = mountPath.resolve(clientPath);
    if (!resolvedPath) {
      throw new ClientError('Invalid path.');
    }

    let stats: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stats = await fs.stat(resolvedPath);
    } catch {
      res.status(404).send('Not found.');
      return;
    }

    const etag = `"${stats.size}-${stats.mtimeMs}"`;
    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }

    const ext = extname(resolvedPath).toLowerCase();
    const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'no-cache');
    const stream = createReadStream(resolvedPath);
    stream.pipe(res);
    await finished(stream);
  });

  /**
   * Extracts the first embedded APIC picture from an audio file and writes it
   * as Folder.jpg (or Folder.png) in the same directory.
   * Accepts a ?path= query parameter pointing to the audio file.
   */
  route.post(
    '/write-folder-art',
    async (req): Promise<T.WriteFolderArtResponse> => {
      const clientPath = req.query.path;
      if (typeof clientPath !== 'string' || !clientPath) {
        throw new ClientError('Missing path query parameter.');
      }
      const resolvedPath = mountPath.resolve(clientPath);
      if (!resolvedPath) {
        throw new ClientError('Invalid path.');
      }
      const meta = await parseFile(resolvedPath);
      const picture = meta.common.picture?.[0];
      if (!picture) {
        throw new ClientError('No embedded picture found in this file.');
      }
      const filename =
        picture.format === 'image/png' ? 'Folder.png' : 'Folder.jpg';
      const dirFullPath = dirname(resolvedPath);
      const dirClientPath = dirname(
        clientPath.startsWith('/') ? clientPath : '/' + clientPath,
      );
      const artPath = mountPath.joinWithinMount(dirFullPath, filename);
      if (!artPath) {
        throw new Error('Unexpected: art path escaped the mount.');
      }
      await fs.writeFile(artPath, picture.data);
      return { coverArtPath: dirClientPath + '/' + filename };
    },
  );

  return route.router;
}

interface ScanCallbacks {
  onTotalTracksCounted: (count: number) => void;
  onTrackScanned: (scanCount: number, path: string) => void;
}

/**
 * Core scan implementation shared by the POST and SSE routes.
 * Walks the mount directory, reads metadata (incrementally), writes the index
 * atomically, and fires optional progress callbacks.
 */
async function performScan(
  mountPath: MountPath,
  callbacks?: ScanCallbacks,
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

  const audioFiles = await findAudioFiles(mountPath);
  callbacks?.onTotalTracksCounted(audioFiles.length);

  // Cache cover art lookups per album directory — probed once per unique dir.
  const coverArtDirCache = new Map<string, string | null>();

  const tracks: T.TrackMetadata[] = [];
  for (let i = 0; i < audioFiles.length; i++) {
    const { clientPath, fullPath } = audioFiles[i];
    const stats = await fs.stat(fullPath);
    const mtime = stats.mtime.toISOString();
    const size = stats.size;

    // Probe the album directory for cover art (cached per directory).
    const dirClientPath = dirname(clientPath);
    const dirFullPath = dirname(fullPath);
    let coverArt: string | null;
    if (coverArtDirCache.has(dirClientPath)) {
      coverArt = coverArtDirCache.get(dirClientPath)!;
    } else {
      coverArt = null;
      try {
        const entries = await fs.readdir(dirFullPath);
        const entryMap = new Map(entries.map((e) => [e.toLowerCase(), e]));
        for (const name of COVER_ART_FILENAMES) {
          const actual = entryMap.get(name.toLowerCase());
          if (actual) {
            coverArt = dirClientPath + '/' + actual;
            break;
          }
        }
      } catch {
        // directory unreadable, no cover art
      }
      coverArtDirCache.set(dirClientPath, coverArt);
    }

    const existingTrack = existingTracks.get(clientPath);
    if (
      existingTrack &&
      existingTrack.mtime === mtime &&
      existingTrack.size === size
    ) {
      // Re-apply freshly probed coverArt so changes to image files are picked
      // up on rescan even when the audio file itself is unchanged.
      tracks.push({ ...existingTrack, coverArt });
    } else {
      let title: string | null = null;
      let artist: string | null = null;
      let album: string | null = null;
      let genre: string | null = null;
      let track: number | null = null;
      let duration: number | null = null;
      let hasEmbeddedArt = false;
      try {
        const meta = await parseFile(fullPath, { duration: true });
        title = meta.common.title ?? null;
        artist = meta.common.artist ?? null;
        album = meta.common.album ?? null;
        genre = meta.common.genre?.[0] ?? null;
        track = meta.common.track.no ?? null;
        duration = meta.format.duration ?? null;
        hasEmbeddedArt = (meta.common.picture?.length ?? 0) > 0;

        // If no folder art exists but this file has an embedded picture,
        // write it to disk so the standard cover-art endpoint can serve it.
        if (!coverArt && hasEmbeddedArt) {
          const picture = meta.common.picture![0];
          const filename =
            picture.format === 'image/png' ? 'Folder.png' : 'Folder.jpg';
          const artPath = mountPath.joinWithinMount(dirFullPath, filename);
          if (!artPath) {
            throw new Error('Unexpected: cover art path escaped the mount.');
          }
          await fs.writeFile(artPath, picture.data);
          coverArt = dirClientPath + '/' + filename;
          coverArtDirCache.set(dirClientPath, coverArt);
        }
      } catch {
        // If tag reading fails, store what we have.
      }
      tracks.push({
        path: clientPath,
        title,
        artist,
        album,
        genre,
        track,
        duration,
        size,
        mtime,
        coverArt,
        hasEmbeddedArt,
      });
    }

    callbacks?.onTrackScanned(i + 1, clientPath);
  }

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
