import type { FileHandle } from 'node:fs/promises';

const COPY_CHUNK_BYTES = 1024 * 1024;

/**
 * Streams bytes [start, end) from one file to the current position of
 * another, at most one megabyte at a time.
 */
export async function copyRange(
  source: FileHandle,
  dest: FileHandle,
  start: number,
  end: number,
): Promise<void> {
  const chunk = Buffer.alloc(
    Math.min(COPY_CHUNK_BYTES, Math.max(end - start, 1)),
  );
  let pos = start;
  while (pos < end) {
    const length = Math.min(chunk.length, end - pos);
    const { bytesRead } = await source.read(chunk, 0, length, pos);
    if (bytesRead === 0) {
      throw new Error('Corrupt file: unexpected end of file.');
    }
    await dest.write(chunk, 0, bytesRead);
    pos += bytesRead;
  }
}
