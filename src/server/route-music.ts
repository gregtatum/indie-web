import {
  ApiRoute,
  ClientError,
  NotFoundError,
  RequestConflict,
} from './utils.ts';
import type { T } from './index.ts';
import { createReadStream, Dirent, promises as fs } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { finished } from 'stream/promises';
import { parseFile } from 'music-metadata';

export const MUSIC_INDEX_FILENAME = '.music-index.json';
const MUSIC_INDEX_VERSION = 2 as const;

const AUDIO_EXTENSIONS = new Set([
  '.mp3',
  '.flac',
  '.m4a',
  '.ogg',
  '.wav',
  '.aac',
]);

export function musicRoute(mountPath: string) {
  const route = new ApiRoute();
  let scanInProgress = false;

  /**
   * Returns the current music index, or 404 if no scan has been run yet.
   */
  route.get('/music-index', async (): Promise<T.MusicIndex> => {
    const indexPath = join(mountPath, MUSIC_INDEX_FILENAME);
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
  route.addBlobRoute('GET', '/music-index/scan', async (_req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    function send(event: Record<string, unknown>) {
      res.write('data: ' + JSON.stringify(event) + '\n\n');
    }

    if (scanInProgress) {
      send({ type: 'error', message: 'A scan is already in progress.' });
      res.end();
      return;
    }

    scanInProgress = true;
    try {
      const index = await performScan(mountPath, {
        onTotal: (count) => send({ type: 'total', count }),
        onProgress: (scanned, path) =>
          send({ type: 'progress', scanned, path }),
      });
      send({ type: 'done', tracks: index.tracks });
      res.end();
    } catch (err: any) {
      send({ type: 'error', message: err?.message ?? 'Scan failed.' });
      res.end();
    } finally {
      scanInProgress = false;
    }
  });

  /**
   * Streams an audio file with HTTP range request support so the browser
   * <audio> element can seek. Accepts a ?path= query parameter.
   */
  route.addBlobRoute('GET', '/stream-audio', async (req, res) => {
    const clientPath = req.query.path;
    if (typeof clientPath !== 'string' || !clientPath) {
      res.status(400).send('Missing path query parameter.');
      return;
    }

    const resolvedPath = resolveMountedPath(clientPath, mountPath);

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

  return route.router;
}

interface ScanCallbacks {
  onTotal?: (count: number) => void;
  onProgress?: (scanned: number, path: string) => void;
}

/**
 * Core scan implementation shared by the POST and SSE routes.
 * Walks the mount directory, reads metadata (incrementally), writes the index
 * atomically, and fires optional progress callbacks.
 */
async function performScan(
  mountPath: string,
  callbacks: ScanCallbacks = {},
): Promise<T.MusicIndex> {
  const indexPath = join(mountPath, MUSIC_INDEX_FILENAME);
  const tmpPath = indexPath + '.tmp';

  // Read the existing index to enable incremental scanning: files whose mtime
  // and size are unchanged can skip tag re-parsing and reuse stored metadata.
  //
  // When the index format version has changed, discard the existing index
  // entirely and rescan all files from scratch. Partial reuse would produce an
  // incomplete index (e.g. v1 entries have no genre). A full rescan is the
  // simplest correct strategy — the index is just rebuilt and written anew.
  const existingTracks = new Map<string, T.TrackMetadata>();
  try {
    const contents = await fs.readFile(indexPath, 'utf-8');
    const existing = JSON.parse(contents) as T.MusicIndex;
    if (existing.version === MUSIC_INDEX_VERSION) {
      for (const track of existing.tracks) {
        existingTracks.set(track.path, track);
      }
    }
  } catch {
    // No existing index — scan all files.
  }

  const audioFiles = await findAudioFiles(mountPath, mountPath);
  callbacks.onTotal?.(audioFiles.length);

  const tracks: T.TrackMetadata[] = [];
  for (let i = 0; i < audioFiles.length; i++) {
    const { clientPath, fullPath } = audioFiles[i];
    const stats = await fs.stat(fullPath);
    const mtime = stats.mtime.toISOString();
    const size = stats.size;

    const existingTrack = existingTracks.get(clientPath);
    if (
      existingTrack &&
      existingTrack.mtime === mtime &&
      existingTrack.size === size
    ) {
      tracks.push(existingTrack);
    } else {
      let title: string | null = null;
      let artist: string | null = null;
      let album: string | null = null;
      let genre: string | null = null;
      let duration: number | null = null;
      try {
        const meta = await parseFile(fullPath, { duration: true });
        title = meta.common.title ?? null;
        artist = meta.common.artist ?? null;
        album = meta.common.album ?? null;
        genre = meta.common.genre?.[0] ?? null;
        duration = meta.format.duration ?? null;
      } catch {
        // If tag reading fails, store what we have.
      }
      tracks.push({
        path: clientPath,
        title,
        artist,
        album,
        genre,
        duration,
        size,
        mtime,
      });
    }

    callbacks.onProgress?.(i + 1, clientPath);
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

function resolveMountedPath(clientPath: string, mountPath: string): string {
  if (!clientPath.startsWith('/')) {
    clientPath = '/' + clientPath;
  }
  const resolvedPath = resolve(mountPath, '.' + clientPath);
  if (!resolvedPath.startsWith(mountPath + '/') && resolvedPath !== mountPath) {
    throw new ClientError(
      'Invalid path: Access outside of the mount is not allowed.',
    );
  }
  return resolvedPath;
}

async function findAudioFiles(
  dirPath: string,
  mountPath: string,
): Promise<Array<{ clientPath: string; fullPath: string }>> {
  const results: Array<{ clientPath: string; fullPath: string }> = [];

  let entries: Dirent[];
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    // Skip hidden files and directories (including .music-index.json itself).
    if (entry.name.startsWith('.')) {
      continue;
    }

    const fullPath = join(dirPath, entry.name);

    if (entry.isDirectory()) {
      const nested = await findAudioFiles(fullPath, mountPath);
      results.push(...nested);
    } else if (entry.isFile()) {
      if (AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        const clientPath = fullPath.slice(mountPath.length);
        results.push({ clientPath, fullPath });
      }
    }
  }

  return results;
}
