import { spawn } from 'node:child_process';

const QUICK_TIMEOUT_MS = 60_000;
const TRANSCODE_TIMEOUT_MS = 10 * 60_000;
const STDERR_TAIL_BYTES = 2000;

export type FfmpegJobKind = 'quick' | 'transcode';

function getTimeoutMs(jobKind: FfmpegJobKind): number {
  if (jobKind === 'quick') {
    return QUICK_TIMEOUT_MS;
  }
  return TRANSCODE_TIMEOUT_MS;
}

export function runFfmpeg(
  args: string[],
  jobKind: FfmpegJobKind,
): Promise<void> {
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
    const timer = setTimeout(
      () => child.kill('SIGKILL'),
      getTimeoutMs(jobKind),
    );
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
