import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import type { M4A_WRITABLE_FRAME_IDS } from '../../shared/music.ts';
import type { T } from '../index.ts';

const FFMPEG_TIMEOUT_MS = 60_000;
const STDERR_TAIL_BYTES = 2000;

const M4A_METADATA_KEYS: Record<
  (typeof M4A_WRITABLE_FRAME_IDS)[number],
  string
> = {
  TIT2: 'title',
  TPE1: 'artist',
  TPE2: 'album_artist',
  TALB: 'album',
  TCOM: 'composer',
  TRCK: 'track',
  TPOS: 'disc',
  TYER: 'date',
  TCON: 'genre',
  COMM: 'comment',
};

export function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'ffmpeg',
      ['-nostdin', '-hide_banner', '-loglevel', 'error', ...args],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-STDERR_TAIL_BYTES);
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), FFMPEG_TIMEOUT_MS);
    child.on('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(
        error.code === 'ENOENT'
          ? new Error('ffmpeg is not installed on the server.')
          : error,
      );
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
      } else if (signal) {
        reject(new Error(`ffmpeg was killed by ${signal}.`));
      } else {
        reject(new Error(`ffmpeg failed: ${stderr.trim() || `exit ${code}`}`));
      }
    });
  });
}

export async function writeM4aTags(
  resolvedPath: string,
  changes: T.TrackTagUpdate[],
): Promise<void> {
  const metadataArgs = changes.flatMap(({ frameId, value }) => {
    const key = M4A_METADATA_KEYS[frameId as keyof typeof M4A_METADATA_KEYS];
    if (!key) {
      throw new Error(`Unexpected: no m4a tag key for ${frameId}.`);
    }
    return ['-metadata', `${key}=${value}`];
  });
  const tmpPath = `${resolvedPath}.${randomUUID()}.tmp`;
  try {
    const { mode } = await fs.stat(resolvedPath);
    await runFfmpeg([
      '-i',
      resolvedPath,
      '-map',
      '0',
      '-c',
      'copy',
      '-map_metadata',
      '0',
      ...metadataArgs,
      '-f',
      'ipod',
      tmpPath,
    ]);
    await fs.chmod(tmpPath, mode);
    await fs.rename(tmpPath, resolvedPath);
  } catch (error) {
    await fs.rm(tmpPath, { force: true });
    throw error;
  }
}
