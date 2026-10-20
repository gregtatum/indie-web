import { createHash } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import { extname } from 'node:path';
import { pipeline } from 'node:stream/promises';

const ID3V2_HEADER_BYTES = 10;
const ID3V2_FOOTER_FLAG = 0x10;
const ID3V1_BYTES = 128;
const FLAC_MARKER_BYTES = 4;
const FLAC_BLOCK_HEADER_BYTES = 4;
const FLAC_LAST_BLOCK_FLAG = 0x80;
const ATOM_HEADER_BYTES = 8;
const LARGE_ATOM_HEADER_BYTES = 16;

interface ByteRange {
  start: number;
  end: number;
}

async function readAt(
  handle: FileHandle,
  position: number,
  length: number,
): Promise<Buffer> {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, position);
  return buffer.subarray(0, bytesRead);
}

async function id3v2Size(handle: FileHandle, fileSize: number) {
  const header = await readAt(handle, 0, ID3V2_HEADER_BYTES);
  if (
    header.length < ID3V2_HEADER_BYTES ||
    header.toString('latin1', 0, 3) !== 'ID3'
  ) {
    return 0;
  }
  const size =
    ((header[6] & 0x7f) << 21) |
    ((header[7] & 0x7f) << 14) |
    ((header[8] & 0x7f) << 7) |
    (header[9] & 0x7f);
  const footer = header[5] & ID3V2_FOOTER_FLAG ? ID3V2_HEADER_BYTES : 0;
  return Math.min(fileSize, ID3V2_HEADER_BYTES + size + footer);
}

async function mp3Range(handle: FileHandle, fileSize: number) {
  const start = await id3v2Size(handle, fileSize);
  let end = fileSize;
  if (end - start >= ID3V1_BYTES) {
    const trailer = await readAt(handle, end - ID3V1_BYTES, 3);
    if (trailer.toString('latin1') === 'TAG') {
      end -= ID3V1_BYTES;
    }
  }
  return { start, end };
}

async function flacRange(handle: FileHandle, fileSize: number) {
  let position = await id3v2Size(handle, fileSize);
  const marker = await readAt(handle, position, FLAC_MARKER_BYTES);
  if (marker.toString('latin1') !== 'fLaC') {
    return null;
  }
  position += FLAC_MARKER_BYTES;
  for (let last = false; !last;) {
    const header = await readAt(handle, position, FLAC_BLOCK_HEADER_BYTES);
    if (header.length < FLAC_BLOCK_HEADER_BYTES) {
      return null;
    }
    last = (header[0] & FLAC_LAST_BLOCK_FLAG) !== 0;
    position += FLAC_BLOCK_HEADER_BYTES + header.readUIntBE(1, 3);
  }
  return position <= fileSize ? { start: position, end: fileSize } : null;
}

async function m4aRanges(handle: FileHandle, fileSize: number) {
  const ranges: ByteRange[] = [];
  let position = 0;
  while (position < fileSize) {
    const header = await readAt(handle, position, LARGE_ATOM_HEADER_BYTES);
    if (header.length < ATOM_HEADER_BYTES) {
      return null;
    }
    let size = header.readUInt32BE(0);
    let headerSize = ATOM_HEADER_BYTES;
    if (size === 1 && header.length === LARGE_ATOM_HEADER_BYTES) {
      size = Number(header.readBigUInt64BE(8));
      headerSize = LARGE_ATOM_HEADER_BYTES;
    } else if (size === 0) {
      size = fileSize - position;
    }
    if (size < headerSize || position + size > fileSize) {
      return null;
    }
    if (header.toString('latin1', 4, 8) === 'mdat') {
      ranges.push({ start: position + headerSize, end: position + size });
    }
    position += size;
  }
  return ranges.length > 0 ? ranges : null;
}

async function audioRanges(
  fullPath: string,
  fileSize: number,
): Promise<ByteRange[] | null> {
  const extension = extname(fullPath).toLowerCase();
  const handle = await fs.open(fullPath, 'r');
  try {
    if (extension === '.mp3') {
      return [await mp3Range(handle, fileSize)];
    }
    if (extension === '.flac') {
      const range = await flacRange(handle, fileSize);
      return range && [range];
    }
    if (extension === '.m4a') {
      return await m4aRanges(handle, fileSize);
    }
    return null;
  } finally {
    await handle.close();
  }
}

/**
 * Hashes only the encoded audio, so two copies of a track that differ in tags
 * or artwork still match. Files with no parseable audio payload are hashed
 * whole, so they never match each other just for being empty.
 */
export async function hashAudioPayload(
  fullPath: string,
  fileSize: number,
): Promise<string> {
  const parsed = await audioRanges(fullPath, fileSize).catch(() => null);
  const ranges = parsed?.filter(({ start, end }) => end > start);
  const hash = createHash('sha256');
  for (const { start, end } of ranges?.length
    ? ranges
    : [{ start: 0, end: fileSize }]) {
    if (end > start) {
      await pipeline(
        createReadStream(fullPath, { start, end: end - 1 }),
        hash,
        { end: false },
      );
    }
  }
  return hash.digest('hex');
}
