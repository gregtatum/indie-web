import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import type { T } from '../index.ts';
import { copyRange } from './file-copy.ts';

/**
 * A minimal ID3v2.3 editor for mp3 files. It rewrites only the leading tag and
 * leaves the audio, and any tags further into the file, byte for byte as they
 * were. Frames it doesn't edit are carried over untouched, so ratings, play
 * counts, and other apps' private frames survive. It is built against a
 * correctness oracle that uses ffmpeg and ffprobe. See
 * src/server/test/mp3-oracle.ts.
 *
 * The app standardizes on ID3v2.3. A leading ID3v2.2 or ID3v2.4 tag is
 * upgraded: frames that have an ID3v2.3 equivalent are converted, and the rest
 * are dropped. When the edited tag fits in the old one, it is written in
 * place. Otherwise the file is copied with a new tag in front of the audio.
 */

const HEADER_BYTES = 10;
const FOOTER_BYTES = 10;
const MAX_TAG_BYTES = 0x0fffffff;
const NEW_PADDING_BYTES = 1024;
const MAX_KEPT_PADDING_BYTES = 16 * 1024;

const FLAG_UNSYNCHRONISATION = 0x80;
const FLAG_EXTENDED_HEADER = 0x40;
const FLAG_COMPRESSION_V22 = 0x40;
const FLAG_FOOTER = 0x10;

const FRAME_GROUPING_V24 = 0x0040;
const FRAME_COMPRESSION_V24 = 0x0008;
const FRAME_ENCRYPTION_V24 = 0x0004;
const FRAME_UNSYNCHRONISATION_V24 = 0x0002;
const FRAME_DATA_LENGTH_V24 = 0x0001;

const ENCODING_LATIN1 = 0;
const ENCODING_UTF16 = 1;
const ENCODING_UTF16BE = 2;
const ENCODING_UTF8 = 3;
const PICTURE_TYPE_FRONT_COVER = 3;
const COMMENT_LANGUAGE = Buffer.from('eng', 'latin1');
const UTF16_LE_BOM = Buffer.from([0xff, 0xfe]);

export class Id3UnsupportedError extends Error {
  readonly code = 'unsupported-format';
}

type Version = 2 | 3 | 4;

/**
 * A frame holds one piece of information, like the title. Its data is stored
 * the way an ID3v2.3 frame stores it.
 */
interface Frame {
  id: string; // four-character code, e.g. TIT2
  flags: number; // the two ID3v2.3 frame flag bytes
  data: Buffer;
}

interface LeadingTag {
  totalSize: number; // bytes from the file start to the first audio byte
  frames: Frame[];
}

const V23_TEXT_FRAME_IDS = new Set([
  'TALB',
  'TBPM',
  'TCOM',
  'TCON',
  'TCOP',
  'TDAT',
  'TDLY',
  'TENC',
  'TEXT',
  'TFLT',
  'TIME',
  'TIT1',
  'TIT2',
  'TIT3',
  'TKEY',
  'TLAN',
  'TLEN',
  'TMED',
  'TOAL',
  'TOFN',
  'TOLY',
  'TOPE',
  'TORY',
  'TOWN',
  'TPE1',
  'TPE2',
  'TPE3',
  'TPE4',
  'TPOS',
  'TPUB',
  'TRCK',
  'TRDA',
  'TRSN',
  'TRSO',
  'TSIZ',
  'TSRC',
  'TSSE',
  'TYER',
]);

const V22_TO_V23_FRAME_IDS: Record<string, string> = {
  TAL: 'TALB',
  TBP: 'TBPM',
  TCM: 'TCOM',
  TCO: 'TCON',
  TCR: 'TCOP',
  TDA: 'TDAT',
  TDY: 'TDLY',
  TEN: 'TENC',
  TFT: 'TFLT',
  TIM: 'TIME',
  TKE: 'TKEY',
  TLA: 'TLAN',
  TLE: 'TLEN',
  TMT: 'TMED',
  TOA: 'TOPE',
  TOF: 'TOFN',
  TOL: 'TOLY',
  TOR: 'TORY',
  TOT: 'TOAL',
  TP1: 'TPE1',
  TP2: 'TPE2',
  TP3: 'TPE3',
  TP4: 'TPE4',
  TPA: 'TPOS',
  TPB: 'TPUB',
  TRC: 'TSRC',
  TRD: 'TRDA',
  TRK: 'TRCK',
  TSI: 'TSIZ',
  TSS: 'TSSE',
  TT1: 'TIT1',
  TT2: 'TIT2',
  TT3: 'TIT3',
  TXT: 'TEXT',
  TXX: 'TXXX',
  TYE: 'TYER',
  COM: 'COMM',
  ULT: 'USLT',
  PIC: 'APIC',
  UFI: 'UFID',
  POP: 'POPM',
  CNT: 'PCNT',
  MCI: 'MCDI',
};

const V24_TO_V23_DATE_FRAME_IDS: Record<string, string> = {
  TDRC: 'TYER', // recording time; ID3v2.3 only holds the year
  TDOR: 'TORY', // original release time; likewise
};

const ENCODED_FRAME_IDS = new Set(['TXXX', 'COMM', 'USLT', 'APIC']);
const BINARY_FRAME_IDS = new Set(['PRIV', 'UFID', 'POPM', 'PCNT', 'MCDI']);

function corrupt(detail: string): Error {
  return new Error(`Corrupt mp3: ${detail}`);
}

/**
 * Reads a sync safe integer, which uses only the low 7 bits of each byte, so
 * the top bit is always 0. Four bytes hold 28 bits. MPEG audio frames start
 * with a sync marker, a 0xFF byte followed by a byte whose top three bits are
 * set. Sync safe sizes can never form that pattern, so a player scanning for
 * audio can't mistake a size in the tag for the start of a frame.
 */
function readSyncSafe(buf: Buffer, pos: number): number {
  let value = 0;
  for (let i = 0; i < 4; i++) {
    const byte = buf[pos + i];
    if (byte & 0x80) {
      throw corrupt('a size is not sync safe.');
    }
    value = (value << 7) | byte;
  }
  return value;
}

function writeSyncSafe(value: number): Buffer {
  return Buffer.from([
    (value >> 21) & 0x7f,
    (value >> 14) & 0x7f,
    (value >> 7) & 0x7f,
    value & 0x7f,
  ]);
}

function removeUnsynchronisation(data: Buffer): Buffer {
  const out: number[] = [];
  for (let i = 0; i < data.length; i++) {
    out.push(data[i]);
    if (data[i] === 0xff && data[i + 1] === 0x00) {
      i++;
    }
  }
  return Buffer.from(out);
}

function isWide(encoding: number): boolean {
  return encoding === ENCODING_UTF16 || encoding === ENCODING_UTF16BE;
}

function decodeString(bytes: Buffer, encoding: number): string {
  switch (encoding) {
    case ENCODING_UTF16:
      if (bytes[0] === 0xfe && bytes[1] === 0xff) {
        return decodeUtf16be(bytes.subarray(2));
      }
      return bytes.toString('utf16le', bytes[0] === 0xff ? 2 : 0);
    case ENCODING_UTF16BE:
      return decodeUtf16be(bytes);
    case ENCODING_UTF8:
      return bytes.toString('utf8');
    default:
      return bytes.toString('latin1');
  }
}

function decodeUtf16be(bytes: Buffer): string {
  const even = bytes.subarray(0, bytes.length - (bytes.length % 2));
  return Buffer.from(even).swap16().toString('utf16le');
}

/**
 * Reads a string that ends in a terminator, which is one zero byte or, in
 * UTF-16, two zero bytes on a two-byte boundary.
 */
function readTerminated(
  data: Buffer,
  start: number,
  encoding: number,
): { text: string; next: number } {
  const step = isWide(encoding) ? 2 : 1;
  let end = start;
  while (end + step <= data.length) {
    if (data[end] === 0 && (step === 1 || data[end + 1] === 0)) {
      break;
    }
    end += step;
  }
  const text = decodeString(data.subarray(start, end), encoding);
  return { text, next: Math.min(end + step, data.length) };
}

function readValues(bytes: Buffer, encoding: number): string {
  const values = decodeString(bytes, encoding).split('\0');
  while (values.length > 1 && values[values.length - 1] === '') {
    values.pop();
  }
  return values.join('/');
}

/**
 * Builds frame data as an encoding byte, the strings, and any raw bytes. The
 * strings are Latin-1 when they all fit, and UTF-16 otherwise.
 */
function encodeFrameData(
  strings: string[],
  { before = Buffer.alloc(0), after }: { before?: Buffer; after?: Buffer } = {},
): Buffer {
  const wide = strings.some(
    (text) => Buffer.from(text, 'latin1').toString('latin1') !== text,
  );
  const terminator = Buffer.alloc(wide ? 2 : 1);
  const parts = [
    Buffer.from([wide ? ENCODING_UTF16 : ENCODING_LATIN1]),
    before,
  ];
  strings.forEach((text, index) => {
    parts.push(
      wide
        ? Buffer.concat([UTF16_LE_BOM, Buffer.from(text, 'utf16le')])
        : Buffer.from(text, 'latin1'),
    );
    if (index < strings.length - 1 || after) {
      parts.push(terminator);
    }
  });
  if (after) {
    parts.push(after);
  }
  return Buffer.concat(parts);
}

function readUserText(data: Buffer): { description: string; value: string } {
  const encoding = data[0];
  const { text, next } = readTerminated(data, 1, encoding);
  return {
    description: text,
    value: readValues(data.subarray(next), encoding),
  };
}

function readComment(data: Buffer): {
  language: Buffer;
  description: string;
  text: string;
} {
  const encoding = data[0];
  const { text, next } = readTerminated(data, 4, encoding);
  return {
    language: data.subarray(1, 4),
    description: text,
    text: readValues(data.subarray(next), encoding),
  };
}

function readPicture(
  data: Buffer,
  version: Version,
): { mime: string; type: number; description: string; image: Buffer } {
  const encoding = data[0];
  let mime: string;
  let pos: number;
  if (version === 2) {
    const format = data.toString('latin1', 1, 4).toLowerCase();
    mime = format === 'jpg' ? 'image/jpeg' : `image/${format}`;
    pos = 4;
  } else {
    const terminated = readTerminated(data, 1, ENCODING_LATIN1);
    mime = terminated.text;
    pos = terminated.next;
  }
  const type = data[pos];
  const { text, next } = readTerminated(data, pos + 1, encoding);
  return { mime, type, description: text, image: data.subarray(next) };
}

function pictureData(picture: {
  mime: string;
  type: number;
  description: string;
  image: Buffer;
}): Buffer {
  return encodeFrameData([picture.description], {
    before: Buffer.concat([
      Buffer.from(picture.mime, 'latin1'),
      Buffer.alloc(1),
      Buffer.from([picture.type]),
    ]),
    after: picture.image,
  });
}

/**
 * ID3v2.3 text encodings are only Latin-1 and UTF-16 with a byte order mark.
 * Converts frame data written in the UTF-8 and UTF-16BE of ID3v2.4.
 */
function transcodeToV23(id: string, data: Buffer, version: Version): Buffer {
  if (id === 'APIC') {
    return pictureData(readPicture(data, version));
  }
  const encoding = data[0];
  if (id === 'TXXX') {
    const { description, value } = readUserText(data);
    return encodeFrameData([description, value]);
  }
  if (id === 'COMM' || id === 'USLT') {
    const { language, description, text } = readComment(data);
    return encodeFrameData([description, text], { before: language });
  }
  return encodeFrameData([readValues(data.subarray(1), encoding)]);
}

function toV23Frame(
  version: Version,
  sourceId: string,
  data: Buffer,
): Frame | null {
  if (version === 4 && V24_TO_V23_DATE_FRAME_IDS[sourceId]) {
    return {
      id: V24_TO_V23_DATE_FRAME_IDS[sourceId],
      flags: 0,
      data: encodeFrameData([
        readValues(data.subarray(1), data[0]).slice(0, 4),
      ]),
    };
  }
  const id = version === 2 ? V22_TO_V23_FRAME_IDS[sourceId] : sourceId;
  if (!id) {
    return null;
  }
  if (BINARY_FRAME_IDS.has(id) || /^W(?!XXX)[A-Z0-9]{3}$/.test(id)) {
    return { id, flags: 0, data };
  }
  const isText = V23_TEXT_FRAME_IDS.has(id);
  if (!isText && !ENCODED_FRAME_IDS.has(id)) {
    return null;
  }
  const needsTranscoding = version === 2 ? id === 'APIC' : data[0] >= 2;
  return {
    id,
    flags: 0,
    data: needsTranscoding ? transcodeToV23(id, data, version) : data,
  };
}

function parseFrames(
  version: Version,
  tagFlags: number,
  rawBody: Buffer,
): Frame[] {
  const tagUnsynchronised = Boolean(tagFlags & FLAG_UNSYNCHRONISATION);
  const body =
    tagUnsynchronised && version !== 4
      ? removeUnsynchronisation(rawBody)
      : rawBody;
  let pos = 0;
  if (tagFlags & FLAG_EXTENDED_HEADER && version !== 2) {
    pos = version === 3 ? 4 + body.readUInt32BE(0) : readSyncSafe(body, 0);
  }
  const idLength = version === 2 ? 3 : 4;
  const headerLength = version === 2 ? 6 : 10;
  const frames: Frame[] = [];
  while (pos + headerLength <= body.length && body[pos] !== 0) {
    const sourceId = body.toString('latin1', pos, pos + idLength);
    if (!/^[A-Z0-9]+$/.test(sourceId)) {
      throw corrupt('a frame has an invalid ID.');
    }
    let size: number;
    if (version === 2) {
      size = body.readUIntBE(pos + 3, 3);
    } else if (version === 3) {
      size = body.readUInt32BE(pos + 4);
    } else {
      size = readSyncSafe(body, pos + 4);
    }
    const flags = version === 2 ? 0 : body.readUInt16BE(pos + 8);
    const end = pos + headerLength + size;
    if (end > body.length) {
      throw corrupt('a frame is out of range.');
    }
    let data = body.subarray(pos + headerLength, end);
    pos = end;

    if (version === 3) {
      frames.push({ id: sourceId, flags, data });
      continue;
    }
    if (flags & (FRAME_COMPRESSION_V24 | FRAME_ENCRYPTION_V24)) {
      continue;
    }
    if (flags & FRAME_GROUPING_V24) {
      data = data.subarray(1);
    }
    if (flags & FRAME_DATA_LENGTH_V24) {
      data = data.subarray(4);
    }
    if (tagUnsynchronised || flags & FRAME_UNSYNCHRONISATION_V24) {
      data = removeUnsynchronisation(data);
    }
    const frame = toV23Frame(version, sourceId, data);
    if (frame) {
      frames.push(frame);
    }
  }
  return frames;
}

async function readLeadingTag(
  handle: FileHandle,
  fileSize: number,
): Promise<LeadingTag> {
  const header = Buffer.alloc(HEADER_BYTES);
  const { bytesRead } = await handle.read(header, 0, HEADER_BYTES, 0);
  if (bytesRead < HEADER_BYTES || header.toString('latin1', 0, 3) !== 'ID3') {
    return { totalSize: 0, frames: [] };
  }
  const version = header[3];
  const flags = header[5];
  if (version !== 2 && version !== 3 && version !== 4) {
    throw new Id3UnsupportedError(`ID3v2.${version} tags are not supported.`);
  }
  if (version === 2 && flags & FLAG_COMPRESSION_V22) {
    throw new Id3UnsupportedError('Compressed ID3v2.2 tags are not supported.');
  }
  const size = readSyncSafe(header, 6);
  const footer = version === 4 && flags & FLAG_FOOTER ? FOOTER_BYTES : 0;
  const totalSize = HEADER_BYTES + size + footer;
  if (totalSize > fileSize) {
    throw corrupt('the ID3 tag is larger than the file.');
  }
  const body = Buffer.alloc(size);
  await handle.read(body, 0, size, HEADER_BYTES);
  return { totalSize, frames: parseFrames(version, flags, body) };
}

function encodeFrames(frames: Frame[]): Buffer {
  return Buffer.concat(
    frames.map(({ id, flags, data }) => {
      const header = Buffer.alloc(HEADER_BYTES);
      header.write(id, 0, 4, 'latin1');
      header.writeUInt32BE(data.length, 4);
      header.writeUInt16BE(flags, 8);
      return Buffer.concat([header, data]);
    }),
  );
}

function encodeTag(body: Buffer, padding: number): Buffer {
  const size = body.length + padding;
  if (size > MAX_TAG_BYTES) {
    throw new Error('The ID3 tag would be too large.');
  }
  return Buffer.concat([
    Buffer.from('ID3', 'latin1'),
    Buffer.from([3, 0, 0]),
    writeSyncSafe(size),
    body,
    Buffer.alloc(padding),
  ]);
}

/**
 * Edits the leading ID3 tag of an mp3 file without touching its audio. The
 * edit returns the new frames, or nothing to leave the file as it is.
 *
 * If the new tag fits in the room the old one took, and doesn't leave a lot of
 * unused space, only the tag bytes are overwritten. Otherwise the result is
 * written to a temporary file next to the original and then renamed over it,
 * streaming the audio in chunks. If anything fails, the original is left as it
 * was and the temporary file is removed.
 */
async function rewriteLeadingTag(
  resolvedPath: string,
  edit: (frames: Frame[]) => Frame[] | undefined,
): Promise<void> {
  const tmpPath = `${resolvedPath}.${randomUUID()}.tmp`;
  const source = await fs.open(resolvedPath, 'r+');
  let dest: FileHandle | undefined;
  try {
    const { mode, size: fileSize } = await source.stat();
    const tag = await readLeadingTag(source, fileSize);
    const frames = edit(tag.frames);
    if (!frames) {
      return;
    }
    const body = encodeFrames(frames);
    const room = tag.totalSize - HEADER_BYTES - body.length;
    if (tag.totalSize > 0 && room >= 0 && room <= MAX_KEPT_PADDING_BYTES) {
      const bytes = encodeTag(body, room);
      await source.write(bytes, 0, bytes.length, 0);
      return;
    }

    dest = await fs.open(tmpPath, 'wx', mode);
    await dest.write(encodeTag(body, NEW_PADDING_BYTES));
    await copyRange(source, dest, tag.totalSize, fileSize);
    await dest.close();
    dest = undefined;
    await fs.chmod(tmpPath, mode);
    await fs.rename(tmpPath, resolvedPath);
  } catch (error) {
    await dest?.close().catch(() => {});
    await fs.rm(tmpPath, { force: true });
    throw error;
  } finally {
    await source.close();
  }
}

function replaceFrames(
  frames: Frame[],
  isReplaced: (frame: Frame) => boolean,
  replacement: Frame | null,
): Frame[] {
  const first = frames.findIndex(isReplaced);
  const kept = frames.filter((frame) => !isReplaced(frame));
  if (replacement) {
    kept.splice(first === -1 ? 0 : first, 0, replacement);
  }
  return kept;
}

function applyChange(frames: Frame[], change: T.TrackTagUpdate): Frame[] {
  const { frameId, value, description = '' } = change;
  let isReplaced: (frame: Frame) => boolean;
  let data: Buffer;
  if (frameId === 'TXXX') {
    isReplaced = (frame) =>
      frame.id === 'TXXX' &&
      readUserText(frame.data).description === description;
    data = encodeFrameData([description, value]);
  } else if (frameId === 'COMM') {
    isReplaced = (frame) =>
      frame.id === 'COMM' && readComment(frame.data).description === '';
    data = encodeFrameData(['', value], { before: COMMENT_LANGUAGE });
  } else if (/^T[A-Z0-9]{3}$/.test(frameId)) {
    isReplaced = (frame) => frame.id === frameId;
    data = encodeFrameData([value]);
  } else {
    throw new Error(`Unsupported frame ID: ${frameId}`);
  }
  return replaceFrames(
    frames,
    isReplaced,
    value === '' ? null : { id: frameId, flags: 0, data },
  );
}

export async function writeId3Tags(
  resolvedPath: string,
  changes: T.TrackTagUpdate[],
): Promise<void> {
  await rewriteLeadingTag(resolvedPath, (frames) =>
    changes.reduce(applyChange, frames),
  );
}

/**
 * Sets the front cover, which lives in an APIC frame. Any existing pictures
 * are replaced.
 */
export async function writeId3Artwork(
  resolvedPath: string,
  image: { mimeType: 'image/jpeg' | 'image/png'; data: Buffer },
): Promise<void> {
  const data = pictureData({
    mime: image.mimeType,
    type: PICTURE_TYPE_FRONT_COVER,
    description: '',
    image: image.data,
  });
  await rewriteLeadingTag(resolvedPath, (frames) =>
    replaceFrames(frames, (frame) => frame.id === 'APIC', {
      id: 'APIC',
      flags: 0,
      data,
    }),
  );
}

/**
 * Removes every picture and returns how many were removed. A file without any
 * is left alone.
 */
export async function removeId3Artwork(resolvedPath: string): Promise<number> {
  let removed = 0;
  await rewriteLeadingTag(resolvedPath, (frames) => {
    removed = frames.filter((frame) => frame.id === 'APIC').length;
    return removed === 0
      ? undefined
      : frames.filter((frame) => frame.id !== 'APIC');
  });
  return removed;
}
