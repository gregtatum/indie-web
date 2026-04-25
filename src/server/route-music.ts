import { ApiRoute, NotFoundError, RequestConflict } from './utils.ts';
import { Dirent, promises as fs } from 'node:fs';
import { join, extname } from 'node:path';
import { parseFile } from 'music-metadata';

export interface TrackMetadata {
  path: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  // Duration in seconds.
  duration: number | null;
  size: number;
  // ISO timestamp — used for incremental re-scan.
  mtime: string;
}

export interface MusicIndex {
  version: 1;
  scannedAt: string;
  tracks: TrackMetadata[];
}

export const MUSIC_INDEX_FILENAME = '.music-index.json';

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
  route.get('/music-index', async (): Promise<MusicIndex> => {
    const indexPath = join(mountPath, MUSIC_INDEX_FILENAME);
    try {
      const contents = await fs.readFile(indexPath, 'utf-8');
      return JSON.parse(contents) as MusicIndex;
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
  route.post('/music-index/scan', async (): Promise<MusicIndex> => {
    if (scanInProgress) {
      throw new RequestConflict('A scan is already in progress.');
    }
    scanInProgress = true;
    try {
      const indexPath = join(mountPath, MUSIC_INDEX_FILENAME);
      const tmpPath = indexPath + '.tmp';

      // Load the existing index for incremental scanning.
      const existingTracks = new Map<string, TrackMetadata>();
      try {
        const contents = await fs.readFile(indexPath, 'utf-8');
        const existing = JSON.parse(contents) as MusicIndex;
        for (const track of existing.tracks) {
          existingTracks.set(track.path, track);
        }
      } catch {
        // No existing index — start fresh.
      }

      const audioFiles = await findAudioFiles(mountPath, mountPath);

      const tracks: TrackMetadata[] = [];
      for (const { clientPath, fullPath } of audioFiles) {
        const stats = await fs.stat(fullPath);
        const mtime = stats.mtime.toISOString();
        const size = stats.size;

        const cached = existingTracks.get(clientPath);
        if (cached && cached.mtime === mtime && cached.size === size) {
          tracks.push(cached);
          continue;
        }

        let title: string | null = null;
        let artist: string | null = null;
        let album: string | null = null;
        let duration: number | null = null;
        try {
          const meta = await parseFile(fullPath, { duration: true });
          title = meta.common.title ?? null;
          artist = meta.common.artist ?? null;
          album = meta.common.album ?? null;
          duration = meta.format.duration ?? null;
        } catch {
          // If tag reading fails, store what we have.
        }

        tracks.push({
          path: clientPath,
          title,
          artist,
          album,
          duration,
          size,
          mtime,
        });
      }

      const index: MusicIndex = {
        version: 1,
        scannedAt: new Date().toISOString(),
        tracks,
      };

      // Atomic write: write to a temp file then rename to avoid partial reads.
      await fs.writeFile(tmpPath, JSON.stringify(index, null, '\t'));
      await fs.rename(tmpPath, indexPath);

      return index;
    } finally {
      scanInProgress = false;
    }
  });

  return route.router;
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
