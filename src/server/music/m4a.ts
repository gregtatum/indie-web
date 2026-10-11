import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import type { M4A_WRITABLE_FRAME_IDS } from '../../shared/music.ts';
import type { T } from '../index.ts';

/**
 * A minimal m4a metadata editor. It rewrites only the ilst tag list and leaves
 * every other atom, including the audio, byte for byte as it was. This keeps
 * the freeform tags, ratings, and purchase data that an ffmpeg rewrite drops.
 * It is built against a correctness oracle that uses ffmpeg and ffprobe. See
 * src/server/test/m4a-oracle.ts.
 *
 * When the new tags change the size of moov, the editor first tries to absorb
 * the difference in existing padding. If there is none, it moves the audio
 * and fixes the chunk offsets that point into it.
 *
 * Files with an unusual structure, such as fragmented files, are rejected with
 * an unsupported-format error rather than edited in a lossy way.
 */

type M4aFrameId = (typeof M4A_WRITABLE_FRAME_IDS)[number];

const COPY_CHUNK_BYTES = 1024 * 1024;
const MIN_ATOM_BYTES = 8;
const MAX_UINT32 = 0xffffffff;
const COVER_FLAG_JPEG = 13;
const COVER_FLAG_PNG = 14;

const ATOM_TYPES = {
  TIT2: '©nam', // title
  TPE1: '©ART', // artist
  TPE2: 'aART', // album artist
  TALB: '©alb', // album
  TCOM: '©wrt', // composer
  TRCK: 'trkn', // track number/total
  TPOS: 'disk', // disc number/total
  TYER: '©day', // year
  TCON: '©gen', // genre
  TBPM: 'tmpo', // tempo in BPM
  COMM: '©cmt', // comment
} as const satisfies Record<M4aFrameId, string>;

const OFFSET_CONTAINERS = new Set([
  'moov', // movie: holds all track and metadata atoms
  'trak', // one track (audio or cover art)
  'mdia', // media info for a track
  'minf', // media information (handler-specific)
  'stbl', // sample table, parent of stco/co64 chunk offsets
]);

class NothingToChange extends Error {}

export class M4aUnsupportedError extends Error {
  readonly code = 'unsupported-format';
}

type AtomType =
  (typeof ATOM_TYPES)[M4aFrameId] | (string & Record<never, never>);

/**
 * An atom is the basic building block of an MP4 file. It starts with a size
 * and a four-character type, and the rest of it is its contents.
 */
interface Atom {
  type: AtomType; // four-character code, e.g. moov or ©nam
  start: number; // byte offset of the atom's size field
  end: number; // byte offset just past the atom's last byte
  headerSize: number; // 8, or 16 with a 64-bit size
}

function atomType(name: string): Buffer {
  return Buffer.from(name, 'latin1');
}

function makeAtom(type: string, ...parts: Buffer[]): Buffer {
  const body = Buffer.concat(parts);
  const header = Buffer.alloc(MIN_ATOM_BYTES);
  header.writeUInt32BE(body.length + MIN_ATOM_BYTES, 0);
  atomType(type).copy(header, 4);
  return Buffer.concat([header, body]);
}

function makeFree(size: number): Buffer {
  return makeAtom('free', Buffer.alloc(size - MIN_ATOM_BYTES));
}

function makeDataAtom(flags: number, payload: Buffer): Buffer {
  const prefix = Buffer.alloc(8);
  prefix.writeUInt32BE(flags, 0);
  return makeAtom('data', prefix, payload);
}

function parseAtoms(buf: Buffer, start: number, end: number): Atom[] {
  const atoms: Atom[] = [];
  let pos = start;
  while (pos + MIN_ATOM_BYTES <= end) {
    let size = buf.readUInt32BE(pos);
    const headerSize = MIN_ATOM_BYTES;
    if (size === 1) {
      throw new M4aUnsupportedError('64-bit atom sizes inside moov.');
    }
    if (size === 0) {
      size = end - pos;
    }
    if (size < headerSize || pos + size > end) {
      throw new Error('Corrupt m4a: atom size is out of range.');
    }
    atoms.push({
      type: buf.toString('latin1', pos + 4, pos + 8),
      start: pos,
      end: pos + size,
      headerSize,
    });
    pos += size;
  }
  return atoms;
}

function contentStart(box: Buffer): number {
  return box.toString('latin1', 4, 8) === 'meta' ? 12 : MIN_ATOM_BYTES;
}

function childAtoms(box: Buffer): Atom[] {
  return parseAtoms(box, contentStart(box), box.length);
}

function emptyMeta(): Buffer {
  const hdlr = makeAtom(
    'hdlr',
    Buffer.alloc(8),
    atomType('mdir'),
    atomType('appl'),
    Buffer.alloc(9),
  );
  return makeAtom('meta', Buffer.alloc(4), hdlr);
}

function emptyBox(type: string): Buffer {
  return type === 'meta' ? emptyMeta() : makeAtom(type);
}

function assertSupportedMeta(meta: Buffer): void {
  if (meta.toString('latin1', 12, 16) === 'hdlr') {
    throw new M4aUnsupportedError('QuickTime-style metadata is not supported.');
  }
  const hdlr = childAtoms(meta).find((atom) => atom.type === 'hdlr');
  if (
    hdlr &&
    meta.toString('latin1', hdlr.start + 16, hdlr.start + 20) !== 'mdir'
  ) {
    throw new M4aUnsupportedError('Only iTunes-style metadata is supported.');
  }
}

function spliceChildren(
  box: Buffer,
  replacements: Map<number, Buffer>,
): Buffer {
  const start = contentStart(box);
  const parts: Buffer[] = [];
  let pos = start;
  for (const atom of childAtoms(box)) {
    parts.push(box.subarray(pos, atom.start));
    parts.push(
      replacements.get(atom.start) ?? box.subarray(atom.start, atom.end),
    );
    pos = atom.end;
  }
  parts.push(box.subarray(pos));
  return withBody(box.subarray(0, start), Buffer.concat(parts));
}

function withBody(header: Buffer, body: Buffer): Buffer {
  const copy = Buffer.from(header);
  copy.writeUInt32BE(copy.length + body.length, 0);
  return Buffer.concat([copy, body]);
}

function appendChild(box: Buffer, child: Buffer): Buffer {
  const start = contentStart(box);
  return withBody(
    box.subarray(0, start),
    Buffer.concat([box.subarray(start), child]),
  );
}

function onlyChild(box: Buffer, type: string): Atom | undefined {
  const matches = childAtoms(box).filter((atom) => atom.type === type);
  if (matches.length > 1) {
    throw new M4aUnsupportedError(`More than one ${type} atom.`);
  }
  return matches[0];
}

function editChild(
  box: Buffer,
  type: string,
  edit: (child: Buffer) => Buffer,
): Buffer {
  const found = onlyChild(box, type);
  if (!found) {
    return appendChild(box, edit(emptyBox(type)));
  }
  return spliceChildren(
    box,
    new Map([[found.start, edit(box.subarray(found.start, found.end))]]),
  );
}

function fitPadding(growth: number, padding: number): number | undefined {
  const remaining = padding - growth;
  return remaining === 0 || remaining >= MIN_ATOM_BYTES ? remaining : undefined;
}

function editIlstInMeta(meta: Buffer, edit: (ilst: Buffer) => Buffer): Buffer {
  assertSupportedMeta(meta);
  const children = childAtoms(meta);
  const ilsts = children.filter((atom) => atom.type === 'ilst');
  if (ilsts.length > 1) {
    throw new M4aUnsupportedError('More than one ilst atom.');
  }
  const ilstAtom = ilsts[0];
  if (!ilstAtom) {
    return appendChild(meta, edit(makeAtom('ilst')));
  }
  const newIlst = edit(meta.subarray(ilstAtom.start, ilstAtom.end));
  const growth = newIlst.length - (ilstAtom.end - ilstAtom.start);
  const next = children[children.indexOf(ilstAtom) + 1];
  const replacements = new Map<number, Buffer>([[ilstAtom.start, newIlst]]);
  if (next?.type === 'free' && growth !== 0) {
    const remaining = fitPadding(growth, next.end - next.start);
    replacements.set(
      next.start,
      remaining ? makeFree(remaining) : Buffer.alloc(0),
    );
  }
  return spliceChildren(meta, replacements);
}

function parseNumberPair(value: string, frameId: string): [number, number] {
  const match = /^\s*(\d{1,5})\s*(?:\/\s*(\d{1,5})\s*)?$/.exec(value);
  if (!match) {
    throw new Error(`${frameId} must look like "3" or "3/12".`);
  }
  const number = Number(match[1]);
  const total = Number(match[2] ?? 0);
  if (number > 0xffff || total > 0xffff) {
    throw new Error(`${frameId} is out of range.`);
  }
  return [number, total];
}

function buildItem(change: T.TrackTagUpdate): Buffer {
  const frameId = change.frameId as M4aFrameId;
  const type = ATOM_TYPES[frameId];
  switch (frameId) {
    case 'TRCK':
    case 'TPOS': {
      const [number, total] = parseNumberPair(change.value, frameId);
      const payload = Buffer.alloc(frameId === 'TRCK' ? 8 : 6);
      payload.writeUInt16BE(number, 2);
      payload.writeUInt16BE(total, 4);
      return makeAtom(type, makeDataAtom(0, payload));
    }
    case 'TBPM': {
      if (
        !/^\s*\d{1,5}\s*$/.test(change.value) ||
        Number(change.value) > 0xffff
      ) {
        throw new Error('TBPM must be a whole number from 0 to 65535.');
      }
      const payload = Buffer.alloc(2);
      payload.writeUInt16BE(Number(change.value), 0);
      return makeAtom(type, makeDataAtom(21, payload));
    }
    default:
      return makeAtom(type, makeDataAtom(1, Buffer.from(change.value, 'utf8')));
  }
}

/**
 * Applies tag changes to an ilst atom, which is the list of tags in an m4a
 * file. Items that are not being changed are kept as the original bytes, so
 * freeform tags, ratings, and purchase data survive an edit. A changed item
 * replaces the old one in the same position, and a new item goes at the end. An
 * empty value removes the item. Writing a genre also removes any numeric gnre
 * item, so the old genre cannot contradict the new one.
 */
function applyChanges(ilst: Buffer, changes: T.TrackTagUpdate[]): Buffer {
  let items = readItems(ilst);
  for (const change of changes) {
    const type = ATOM_TYPES[change.frameId as M4aFrameId];
    if (!type) {
      throw new Error(`Unexpected: no m4a atom for ${change.frameId}.`);
    }
    const dropped = type === '©gen' ? new Set(['gnre']) : new Set<string>();
    items = items.filter((item) => !dropped.has(item.type));
    items =
      change.value === ''
        ? items.filter((item) => item.type !== type)
        : replaceItem(items, { type, bytes: buildItem(change) });
  }
  return writeItems(items);
}

interface IlstItem {
  type: string;
  bytes: Buffer;
}

function readItems(ilst: Buffer): IlstItem[] {
  return childAtoms(ilst).map((atom) => ({
    type: atom.type,
    bytes: ilst.subarray(atom.start, atom.end),
  }));
}

function writeItems(items: IlstItem[]): Buffer {
  return makeAtom('ilst', ...items.map((item) => item.bytes));
}

function replaceItem(items: IlstItem[], replacement: IlstItem): IlstItem[] {
  const first = items.findIndex((item) => item.type === replacement.type);
  if (first === -1) {
    return [...items, replacement];
  }
  const replaced = [...items];
  replaced[first] = replacement;
  return replaced.filter(
    (item, i) => item.type !== replacement.type || i === first,
  );
}

/**
 * A chunk is a run of consecutive audio samples stored together in mdat. The
 * stco and co64 atoms in the sample table hold the absolute byte offset in the
 * file where each chunk starts, and a player uses them to find the audio.
 *
 * When an edit changes the size of anything in front of mdat, every one of
 * those offsets has to move by the same amount, or the player reads the wrong
 * bytes. This shifts every chunk offset at or past the threshold by the given
 * amount, and it throws if a 32-bit stco offset would no longer fit.
 */
function shiftChunkOffsets(
  moov: Buffer,
  threshold: number,
  shift: number,
): void {
  const visit = (start: number, end: number) => {
    for (const atom of parseAtoms(moov, start, end)) {
      if (OFFSET_CONTAINERS.has(atom.type)) {
        visit(atom.start + atom.headerSize, atom.end);
      } else if (atom.type === 'stco' || atom.type === 'co64') {
        const wide = atom.type === 'co64';
        const count = moov.readUInt32BE(atom.start + 12);
        for (let i = 0; i < count; i++) {
          const at = atom.start + 16 + i * (wide ? 8 : 4);
          const offset = wide
            ? Number(moov.readBigUInt64BE(at))
            : moov.readUInt32BE(at);
          if (offset < threshold) {
            continue;
          }
          const moved = offset + shift;
          if (wide) {
            moov.writeBigUInt64BE(BigInt(moved), at);
          } else if (moved > MAX_UINT32) {
            throw new M4aUnsupportedError('Chunk offsets need 64 bits.');
          } else {
            moov.writeUInt32BE(moved, at);
          }
        }
      }
    }
  };
  visit(MIN_ATOM_BYTES, moov.length);
}

function assertNotFragmented(moov: Buffer): void {
  if (childAtoms(moov).some((atom) => atom.type === 'mvex')) {
    throw new M4aUnsupportedError('Fragmented m4a files are not supported.');
  }
}

/**
 * Finds the top-level atoms by reading only their headers and skipping over
 * their contents. This lets the editor locate moov and mdat without loading a
 * large audio file into memory. The offsets it returns are used to copy
 * everything outside moov straight from the source file.
 */
async function readTopLevelAtoms(
  handle: FileHandle,
  fileSize: number,
): Promise<Atom[]> {
  const atoms: Atom[] = [];
  const header = Buffer.alloc(16);
  let pos = 0;
  while (pos < fileSize) {
    const { bytesRead } = await handle.read(header, 0, 16, pos);
    if (bytesRead < MIN_ATOM_BYTES) {
      throw new Error('Corrupt m4a: truncated atom header.');
    }
    let size = header.readUInt32BE(0);
    let headerSize = MIN_ATOM_BYTES;
    if (size === 1) {
      if (bytesRead < 16) {
        throw new Error('Corrupt m4a: truncated atom header.');
      }
      size = Number(header.readBigUInt64BE(8));
      headerSize = 16;
    } else if (size === 0) {
      size = fileSize - pos;
    }
    if (size < headerSize || pos + size > fileSize) {
      throw new Error('Corrupt m4a: atom extends past the end of the file.');
    }
    atoms.push({
      type: header.toString('latin1', 4, 8),
      start: pos,
      end: pos + size,
      headerSize,
    });
    pos += size;
  }
  return atoms;
}

async function copyRange(
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
      throw new Error('Corrupt m4a: unexpected end of file.');
    }
    await dest.write(chunk, 0, bytesRead);
    pos += bytesRead;
  }
}

/**
 * Edits the ilst of an m4a file without touching its audio. Only the moov atom
 * is read into memory, since that is where the tags and the sample table live.
 * The audio in mdat is never loaded, and everything outside moov is streamed
 * from the old file to the new one in chunks of at most one megabyte. Memory
 * use is therefore about the size of moov, no matter how large the file is.
 *
 * The result is written to a temporary file next to the original and then
 * renamed over it. If anything fails, the original is left as it was and the
 * temporary file is removed. The cost is that the whole file is copied, even
 * for a small edit.
 */
async function rewriteIlst(
  resolvedPath: string,
  edit: (ilst: Buffer) => Buffer,
): Promise<void> {
  const tmpPath = `${resolvedPath}.${randomUUID()}.tmp`;
  const source = await fs.open(resolvedPath, 'r');
  let dest: FileHandle | undefined;
  try {
    const { mode, size: fileSize } = await source.stat();
    const atoms = await readTopLevelAtoms(source, fileSize);
    if (atoms[0]?.type !== 'ftyp') {
      throw new Error('Corrupt m4a: missing ftyp atom.');
    }
    if (atoms.some((atom) => atom.type === 'moof')) {
      throw new M4aUnsupportedError('Fragmented m4a files are not supported.');
    }
    const moovIndex = atoms.findIndex((atom) => atom.type === 'moov');
    if (moovIndex === -1) {
      throw new Error('Corrupt m4a: missing moov atom.');
    }
    const moovAtom = atoms[moovIndex];
    const oldMoov = Buffer.alloc(moovAtom.end - moovAtom.start);
    await source.read(oldMoov, 0, oldMoov.length, moovAtom.start);
    if (moovAtom.headerSize !== MIN_ATOM_BYTES) {
      throw new M4aUnsupportedError('64-bit atom sizes inside moov.');
    }
    assertNotFragmented(oldMoov);
    if (childAtoms(oldMoov).some((atom) => atom.type === 'meta')) {
      throw new M4aUnsupportedError('Movie-level metadata is not supported.');
    }

    let moov = editChild(oldMoov, 'udta', (udta) =>
      editChild(udta, 'meta', (meta) => editIlstInMeta(meta, edit)),
    );

    const following = atoms[moovIndex + 1];
    const padding =
      following?.type === 'free' ? following.end - following.start : 0;
    const growth = moov.length - oldMoov.length;
    let regionEnd = moovAtom.end;
    let trailer: Buffer = Buffer.alloc(0);
    let shift = growth;
    if (growth === 0) {
      shift = 0;
    } else if (following?.type === 'free') {
      regionEnd = following.end;
      const remaining = fitPadding(growth, padding);
      if (remaining === undefined) {
        shift = moov.length - oldMoov.length - padding;
      } else {
        shift = 0;
        trailer = remaining === 0 ? Buffer.alloc(0) : makeFree(remaining);
      }
    } else if (growth <= -MIN_ATOM_BYTES) {
      shift = 0;
      trailer = makeFree(-growth);
    }
    if (shift !== 0) {
      moov = Buffer.from(moov);
      shiftChunkOffsets(moov, regionEnd, shift);
    }

    dest = await fs.open(tmpPath, 'wx', mode);
    await copyRange(source, dest, 0, moovAtom.start);
    await dest.write(moov);
    await dest.write(trailer);
    await copyRange(source, dest, regionEnd, fileSize);
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

export async function writeM4aTags(
  resolvedPath: string,
  changes: T.TrackTagUpdate[],
): Promise<void> {
  await rewriteIlst(resolvedPath, (ilst) => applyChanges(ilst, changes));
}

/**
 * Sets the cover art, which lives in the covr item of the ilst. The data atom
 * inside it is flagged as a JPEG or a PNG. Any existing cover is replaced.
 */
export async function writeM4aArtwork(
  resolvedPath: string,
  image: { mimeType: 'image/jpeg' | 'image/png'; data: Buffer },
): Promise<void> {
  const flags =
    image.mimeType === 'image/png' ? COVER_FLAG_PNG : COVER_FLAG_JPEG;
  const bytes = makeAtom('covr', makeDataAtom(flags, image.data));
  await rewriteIlst(resolvedPath, (ilst) =>
    writeItems(replaceItem(readItems(ilst), { type: 'covr', bytes })),
  );
}

/**
 * Removes the cover art and returns how many pictures were removed. A file
 * without any cover is left alone.
 */
export async function removeM4aArtwork(resolvedPath: string): Promise<number> {
  let removed = 0;
  await rewriteIlst(resolvedPath, (ilst) => {
    const items = readItems(ilst);
    for (const item of items.filter(({ type }) => type === 'covr')) {
      removed += childAtoms(item.bytes).filter(
        (atom) => atom.type === 'data',
      ).length;
    }
    if (removed === 0) {
      throw new NothingToChange();
    }
    return writeItems(items.filter(({ type }) => type !== 'covr'));
  });
  return removed;
}
