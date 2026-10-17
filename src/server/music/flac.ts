import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import type { FLAC_WRITABLE_FRAME_IDS } from '../../shared/music.ts';
import type { T } from '../index.ts';
import { copyRange } from './file-copy.ts';

/**
 * A minimal FLAC metadata editor. A FLAC file is the marker "fLaC", a chain of
 * metadata blocks, then the audio frames. The editor rebuilds only the chain,
 * touching the VORBIS_COMMENT block for tags and the PICTURE blocks for
 * artwork, and keeps every other block as the original bytes. The audio frames
 * are copied untouched, so the MD5 of the audio in STREAMINFO stays valid.
 * An ID3v2 tag in front of the marker is preserved as is. It is built against
 * an oracle that uses ffmpeg, ffprobe, and flac. See
 * src/server/test/flac-oracle.ts.
 *
 * The chain is padded to fill the space that the old chain used, so most edits
 * do not move the audio. When the new chain does not fit, it grows with fresh
 * padding.
 *
 * Files with more than one Vorbis comment block are rejected with an
 * unsupported-format error rather than edited in an ambiguous way.
 */

type FlacFrameId = (typeof FLAC_WRITABLE_FRAME_IDS)[number];

const BLOCK_HEADER_BYTES = 4;
const MAX_BLOCK_BYTES = 0xffffff;
const NEW_PADDING_BYTES = 8192;
const LAST_BLOCK_FLAG = 0x80;
const ID3_HEADER_BYTES = 10;
const ID3_FOOTER_FLAG = 0x10;
const NEW_VENDOR = 'indie-web';
const FRONT_COVER = 3;

const BLOCK_TYPES = {
  STREAMINFO: 0,
  PADDING: 1,
  VORBIS_COMMENT: 4,
  PICTURE: 6,
} as const;

const COMMENT_NAMES = {
  TIT2: 'TITLE',
  TPE1: 'ARTIST',
  TPE2: 'ALBUMARTIST',
  TALB: 'ALBUM',
  TCOM: 'COMPOSER',
  TRCK: 'TRACKNUMBER',
  TPOS: 'DISCNUMBER',
  TYER: 'DATE',
  TCON: 'GENRE',
  TBPM: 'BPM',
  COMM: 'COMMENT',
} as const satisfies Record<FlacFrameId, string>;

const TOTAL_NAMES: Partial<Record<FlacFrameId, string[]>> = {
  TRCK: ['TRACKTOTAL', 'TOTALTRACKS'],
  TPOS: ['DISCTOTAL', 'TOTALDISCS'],
};

class NothingToChange extends Error {}

export class FlacUnsupportedError extends Error {
  readonly code = 'unsupported-format';
}

interface Block {
  type: number;
  body: Buffer;
}

interface Layout {
  metaStart: number;
  metaEnd: number;
  blocks: Block[];
}

interface VorbisComment {
  vendor: Buffer;
  entries: Buffer[];
}

function corrupt(detail: string): Error {
  return new Error(`Corrupt flac: ${detail}`);
}

async function readAt(
  source: FileHandle,
  position: number,
  length: number,
): Promise<Buffer> {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await source.read(buffer, 0, length, position);
  if (bytesRead !== length) {
    throw corrupt('unexpected end of file.');
  }
  return buffer;
}

async function id3PrefixSize(source: FileHandle, fileSize: number) {
  if (fileSize < ID3_HEADER_BYTES) {
    return 0;
  }
  const header = await readAt(source, 0, ID3_HEADER_BYTES);
  if (header.toString('latin1', 0, 3) !== 'ID3') {
    return 0;
  }
  const size =
    ((header[6] & 0x7f) << 21) |
    ((header[7] & 0x7f) << 14) |
    ((header[8] & 0x7f) << 7) |
    (header[9] & 0x7f);
  const footer = header[5] & ID3_FOOTER_FLAG ? ID3_HEADER_BYTES : 0;
  return ID3_HEADER_BYTES + size + footer;
}

async function readLayout(
  source: FileHandle,
  fileSize: number,
): Promise<Layout> {
  const markerAt = await id3PrefixSize(source, fileSize);
  const marker = await readAt(source, markerAt, 4).catch(() => null);
  if (marker?.toString('latin1') !== 'fLaC') {
    throw corrupt('missing fLaC marker.');
  }
  const metaStart = markerAt + 4;
  const blocks: Block[] = [];
  let position = metaStart;
  for (let last = false; !last;) {
    const header = await readAt(source, position, BLOCK_HEADER_BYTES);
    last = (header[0] & LAST_BLOCK_FLAG) !== 0;
    const type = header[0] & 0x7f;
    const length = header.readUIntBE(1, 3);
    if (type === 127 || position + BLOCK_HEADER_BYTES + length > fileSize) {
      throw corrupt('invalid metadata block.');
    }
    blocks.push({
      type,
      body: await readAt(source, position + BLOCK_HEADER_BYTES, length),
    });
    position += BLOCK_HEADER_BYTES + length;
  }
  if (blocks[0].type !== BLOCK_TYPES.STREAMINFO) {
    throw corrupt('STREAMINFO is not the first block.');
  }
  return { metaStart, metaEnd: position, blocks };
}

function serializeBlock(block: Block, last: boolean): Buffer {
  if (block.body.length > MAX_BLOCK_BYTES) {
    throw new Error('Metadata block is too large for a FLAC file.');
  }
  const header = Buffer.alloc(BLOCK_HEADER_BYTES);
  header[0] = block.type | (last ? LAST_BLOCK_FLAG : 0);
  header.writeUIntBE(block.body.length, 1, 3);
  return Buffer.concat([header, block.body]);
}

function serializeChain(blocks: Block[]): Buffer {
  return Buffer.concat(
    blocks.map((block, index) =>
      serializeBlock(block, index === blocks.length - 1),
    ),
  );
}

function parseVorbisComment(body: Buffer): VorbisComment {
  let position = 0;
  const take = (length: number) => {
    if (position + length > body.length) {
      throw corrupt('Vorbis comment is truncated.');
    }
    const bytes = body.subarray(position, position + length);
    position += length;
    return bytes;
  };
  const takeLength = () => take(4).readUInt32LE(0);
  const vendor = take(takeLength());
  const entries: Buffer[] = [];
  for (let count = takeLength(); count > 0; count--) {
    entries.push(take(takeLength()));
  }
  return { vendor, entries };
}

function serializeVorbisComment({ vendor, entries }: VorbisComment): Buffer {
  const length = (bytes: Buffer) => {
    const prefix = Buffer.alloc(4);
    prefix.writeUInt32LE(bytes.length, 0);
    return prefix;
  };
  const count = Buffer.alloc(4);
  count.writeUInt32LE(entries.length, 0);
  return Buffer.concat([
    length(vendor),
    vendor,
    count,
    ...entries.flatMap((entry) => [length(entry), entry]),
  ]);
}

function entryName(entry: Buffer): string {
  const equals = entry.indexOf(0x3d);
  return entry
    .toString('latin1', 0, equals === -1 ? entry.length : equals)
    .toUpperCase();
}

function setEntry(entries: Buffer[], name: string, value: string): Buffer[] {
  const index = entries.findIndex((entry) => entryName(entry) === name);
  const kept = entries.filter((entry) => entryName(entry) !== name);
  if (value === '') {
    return kept;
  }
  const entry = Buffer.from(`${name}=${value}`, 'utf8');
  if (index === -1) {
    return [...kept, entry];
  }
  kept.splice(index, 0, entry);
  return kept;
}

function parseNumberPair(
  value: string,
  frameId: string,
): { number: string; total?: string } {
  const match = /^\s*(\d{1,5})\s*(?:\/\s*(\d{1,5})\s*)?$/.exec(value);
  if (!match) {
    throw new Error(`${frameId} must look like "3" or "3/12".`);
  }
  return { number: match[1], total: match[2] };
}

function applyChange(entries: Buffer[], change: T.TrackTagUpdate): Buffer[] {
  const frameId = change.frameId as FlacFrameId;
  const name = COMMENT_NAMES[frameId];
  if (!name) {
    throw new Error(`Unexpected: no Vorbis comment for ${change.frameId}.`);
  }
  const totals = TOTAL_NAMES[frameId];
  if (!totals) {
    if (frameId === 'TBPM' && change.value !== '') {
      if (
        !/^\s*\d{1,5}\s*$/.test(change.value) ||
        Number(change.value) > 0xffff
      ) {
        throw new Error('TBPM must be a whole number from 0 to 65535.');
      }
      return setEntry(entries, name, String(Number(change.value)));
    }
    return setEntry(entries, name, change.value);
  }
  if (change.value === '') {
    return [name, ...totals].reduce(
      (next, each) => setEntry(next, each, ''),
      entries,
    );
  }
  const { number, total } = parseNumberPair(change.value, frameId);
  const next = setEntry(
    entries,
    name,
    total === undefined ? number : `${number}/${total}`,
  );
  return total === undefined
    ? next
    : totals.reduce((acc, each) => setEntry(acc, each, ''), next);
}

function editVorbisComment(
  blocks: Block[],
  edit: (comment: VorbisComment) => VorbisComment,
): Block[] {
  const index = blocks.findIndex(
    ({ type }) => type === BLOCK_TYPES.VORBIS_COMMENT,
  );
  const comment: VorbisComment =
    index === -1
      ? { vendor: Buffer.from(NEW_VENDOR), entries: [] }
      : parseVorbisComment(blocks[index].body);
  const replacement = {
    type: BLOCK_TYPES.VORBIS_COMMENT,
    body: serializeVorbisComment(edit(comment)),
  };
  return index === -1
    ? [...blocks, replacement]
    : blocks.map((block, at) => (at === index ? replacement : block));
}

function jpegInfo(data: Buffer) {
  let position = 2;
  while (position + 9 < data.length && data[position] === 0xff) {
    const marker = data[position + 1];
    const isFrame =
      marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) {
      return {
        width: data.readUInt16BE(position + 7),
        height: data.readUInt16BE(position + 5),
        depth: data[position + 4] * data[position + 9],
      };
    }
    position += 2 + data.readUInt16BE(position + 2);
  }
  return undefined;
}

function pngInfo(data: Buffer) {
  const channels: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  if (data.length < 26) {
    return undefined;
  }
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
    depth: data[24] * (channels[data[25]] ?? 1),
  };
}

function buildPicture(image: {
  mimeType: 'image/jpeg' | 'image/png';
  data: Buffer;
}): Block {
  const info = (image.mimeType === 'image/png'
    ? pngInfo(image.data)
    : jpegInfo(image.data)) ?? { width: 0, height: 0, depth: 0 };
  const mime = Buffer.from(image.mimeType, 'latin1');
  const fields = (...values: number[]) => {
    const buffer = Buffer.alloc(values.length * 4);
    values.forEach((value, index) => buffer.writeUInt32BE(value, index * 4));
    return buffer;
  };
  return {
    type: BLOCK_TYPES.PICTURE,
    body: Buffer.concat([
      fields(FRONT_COVER, mime.length),
      mime,
      fields(0, info.width, info.height, info.depth, 0, image.data.length),
      image.data,
    ]),
  };
}

function isFrontCover(block: Block): boolean {
  return (
    block.type === BLOCK_TYPES.PICTURE &&
    block.body.length >= 4 &&
    block.body.readUInt32BE(0) === FRONT_COVER
  );
}

function paddingFor(slack: number): number | undefined {
  if (slack === 0) {
    return undefined;
  }
  return slack >= BLOCK_HEADER_BYTES
    ? slack - BLOCK_HEADER_BYTES
    : NEW_PADDING_BYTES;
}

/**
 * Rebuilds the metadata chain with the edit applied, and writes it to a
 * temporary file next to the original along with the untouched audio, then
 * renames it over the original. If anything fails, the original is left as it
 * was and the temporary file is removed.
 */
async function rewriteChain(
  resolvedPath: string,
  edit: (blocks: Block[]) => Block[],
): Promise<void> {
  const tmpPath = `${resolvedPath}.${randomUUID()}.tmp`;
  const source = await fs.open(resolvedPath, 'r');
  let dest: FileHandle | undefined;
  try {
    const { mode, size: fileSize } = await source.stat();
    const { metaStart, metaEnd, blocks } = await readLayout(source, fileSize);
    if (
      blocks.filter(({ type }) => type === BLOCK_TYPES.VORBIS_COMMENT).length >
      1
    ) {
      throw new FlacUnsupportedError(
        'Files with more than one Vorbis comment block are not supported.',
      );
    }
    const edited = edit(
      blocks.filter(({ type }) => type !== BLOCK_TYPES.PADDING),
    );
    const used = edited.reduce(
      (sum, { body }) => sum + BLOCK_HEADER_BYTES + body.length,
      0,
    );
    const slack = metaEnd - metaStart - used;
    const paddingBytes = paddingFor(slack);
    const chain = serializeChain(
      paddingBytes === undefined
        ? edited
        : [
            ...edited,
            { type: BLOCK_TYPES.PADDING, body: Buffer.alloc(paddingBytes) },
          ],
    );
    const oldChain = await readAt(source, metaStart, metaEnd - metaStart);
    if (chain.equals(oldChain)) {
      throw new NothingToChange();
    }

    dest = await fs.open(tmpPath, 'wx', mode);
    await copyRange(source, dest, 0, metaStart);
    await dest.write(chain);
    await copyRange(source, dest, metaEnd, fileSize);
    await dest.close();
    dest = undefined;
    await fs.chmod(tmpPath, mode);
    await fs.rename(tmpPath, resolvedPath);
  } catch (error) {
    await dest?.close().catch(() => {});
    await fs.rm(tmpPath, { force: true });
    if (error instanceof NothingToChange) {
      return;
    }
    throw error;
  } finally {
    await source.close();
  }
}

export async function writeFlacTags(
  resolvedPath: string,
  changes: T.TrackTagUpdate[],
): Promise<void> {
  await rewriteChain(resolvedPath, (blocks) =>
    editVorbisComment(blocks, (comment) => ({
      vendor: comment.vendor,
      entries: changes.reduce(applyChange, comment.entries),
    })),
  );
}

/**
 * Sets the front cover. An existing front cover is replaced, and pictures of
 * other types are kept.
 */
export async function writeFlacArtwork(
  resolvedPath: string,
  image: { mimeType: 'image/jpeg' | 'image/png'; data: Buffer },
): Promise<void> {
  await rewriteChain(resolvedPath, (blocks) => [
    ...blocks.filter((block) => !isFrontCover(block)),
    buildPicture(image),
  ]);
}

/**
 * Removes every picture and returns how many were removed. A file without any
 * picture is left alone.
 */
export async function removeFlacArtwork(resolvedPath: string): Promise<number> {
  let removed = 0;
  await rewriteChain(resolvedPath, (blocks) => {
    const kept = blocks.filter(({ type }) => type !== BLOCK_TYPES.PICTURE);
    removed = blocks.length - kept.length;
    if (removed === 0) {
      throw new NothingToChange();
    }
    return kept;
  });
  return removed;
}
