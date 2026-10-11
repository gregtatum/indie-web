import { spawn } from 'node:child_process';

const FFMPEG_TIMEOUT_MS = 60_000;
const STDERR_TAIL_BYTES = 2000;

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
