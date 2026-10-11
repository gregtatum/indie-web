import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const CONTAINERS = new Set([
  'moov', // movie: holds all track and metadata atoms
  'trak', // one track (audio or cover art)
  'mdia', // media info for a track
  'minf', // media information (handler-specific)
  'stbl', // sample table: where the samples are and how long
  'udta', // user data, parent of the tag metadata
  'edts', // edit list: trims encoder delay
  'dinf', // data information: where the media data lives
]);
const SKIPPED_LEAVES = new Set([
  'free', // padding, expected to change size
  'skip', // padding, same as free
  'stco', // 32-bit chunk offsets, compared relative to mdat instead
  'co64', // 64-bit chunk offsets, compared relative to mdat instead
]);

export const FRAME_ATOMS: Record<string, string> = {
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
};

/**
 * An atom is the basic building block of an MP4 file. It starts with a size
 * and a four-character type, and the rest of it is its contents.
 */
interface Atom {
  type: string; // four-character code, e.g. moov or ©nam
  start: number; // byte offset of the atom's size field
  headerSize: number; // 8, or 16 with a 64-bit size
  end: number; // byte offset just past the atom's last byte
}

export interface M4aSnapshot {
  ilst: Map<string, string>;
  moovLeaves: Map<string, string>;
  chunkOffsets: number[];
  mdatSha: string;
  topLevel: string[];
  packetMd5: string;
}

function atomsIn(data: Buffer, start: number, end: number): Atom[] {
  const atoms: Atom[] = [];
  let pos = start;
  while (pos + 8 <= end) {
    let size = data.readUInt32BE(pos);
    let headerSize = 8;
    if (size === 1) {
      size = Number(data.readBigUInt64BE(pos + 8));
      headerSize = 16;
    } else if (size === 0) {
      size = end - pos;
    }
    assert.ok(size >= headerSize && pos + size <= end, 'atom out of range');
    atoms.push({
      type: data.toString('latin1', pos + 4, pos + 8),
      start: pos,
      headerSize,
      end: pos + size,
    });
    pos += size;
  }
  return atoms;
}

function hex(data: Buffer): string {
  return data.toString('hex');
}

function ilstItems(data: Buffer, ilst: Atom): Map<string, string> {
  const items = new Map<string, string>();
  for (const item of atomsIn(data, ilst.start + 8, ilst.end)) {
    let name = item.type;
    if (item.type === '----') {
      const parts = atomsIn(data, item.start + 8, item.end);
      const text = (type: string) => {
        const atom = parts.find((part) => part.type === type);
        return atom ? data.toString('utf8', atom.start + 12, atom.end) : '';
      };
      name = `----:${text('mean')}:${text('name')}`;
    }
    let unique = name;
    for (let n = 2; items.has(unique); n++) {
      unique = `${name}#${n}`;
    }
    items.set(unique, hex(data.subarray(item.start, item.end)));
  }
  return items;
}

function collectMoov(
  data: Buffer,
  atom: Atom,
  path: string,
  out: {
    ilst: Map<string, string>;
    leaves: Map<string, string>;
    offsets: number[];
  },
): void {
  const here = `${path}/${atom.type}`;
  if (atom.type === 'ilst') {
    out.ilst = ilstItems(data, atom);
  } else if (atom.type === 'meta') {
    const inner = atomsIn(data, atom.start + 12, atom.end);
    out.leaves.set(
      `${here}#version`,
      hex(data.subarray(atom.start + 8, atom.start + 12)),
    );
    for (const child of inner) {
      collectMoov(data, child, here, out);
    }
  } else if (CONTAINERS.has(atom.type)) {
    for (const child of atomsIn(data, atom.start + 8, atom.end)) {
      collectMoov(data, child, here, out);
    }
  } else if (atom.type === 'stco' || atom.type === 'co64') {
    const wide = atom.type === 'co64';
    const count = data.readUInt32BE(atom.start + 12);
    for (let i = 0; i < count; i++) {
      const at = atom.start + 16 + i * (wide ? 8 : 4);
      out.offsets.push(
        wide ? Number(data.readBigUInt64BE(at)) : data.readUInt32BE(at),
      );
    }
  } else if (!SKIPPED_LEAVES.has(atom.type)) {
    let key = here;
    for (let n = 2; out.leaves.has(key); n++) {
      key = `${here}#${n}`;
    }
    out.leaves.set(key, hex(data.subarray(atom.start, atom.end)));
  }
}

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0 && stderr.trim() === '') {
        resolve(stdout);
      } else {
        reject(new Error(`${command} failed (${code}): ${stderr.trim()}`));
      }
    });
  });
}

export async function assertDecodesCleanly(path: string): Promise<void> {
  await run('ffmpeg', [
    '-nostdin',
    '-v',
    'error',
    '-i',
    path,
    '-map',
    '0:a',
    '-f',
    'null',
    '-',
  ]);
}

export async function ffprobeTags(
  path: string,
): Promise<Record<string, string>> {
  const output = await run('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format_tags',
    '-of',
    'json',
    path,
  ]);
  const tags: Record<string, string> = JSON.parse(output).format?.tags ?? {};
  return Object.fromEntries(
    Object.entries(tags).map(([key, value]) => [key.toLowerCase(), value]),
  );
}

async function packetMd5(path: string): Promise<string> {
  const output = await run('ffmpeg', [
    '-nostdin',
    '-v',
    'error',
    '-i',
    path,
    '-map',
    '0:a',
    '-c',
    'copy',
    '-f',
    'md5',
    '-',
  ]);
  return output.trim();
}

export async function snapshotM4a(path: string): Promise<M4aSnapshot> {
  const data = await readFile(path);
  const top = atomsIn(data, 0, data.length);
  const mdat = top.find((atom) => atom.type === 'mdat');
  const moov = top.find((atom) => atom.type === 'moov');
  assert.ok(mdat && moov, 'file needs moov and mdat');
  const collected = {
    ilst: new Map<string, string>(),
    leaves: new Map<string, string>(),
    offsets: [] as number[],
  };
  collectMoov(data, moov, '', collected);
  const payloadStart = mdat.start + mdat.headerSize;
  return {
    ilst: collected.ilst,
    moovLeaves: collected.leaves,
    chunkOffsets: collected.offsets.map((offset) => offset - payloadStart),
    mdatSha: createHash('sha256')
      .update(data.subarray(payloadStart, mdat.end))
      .digest('hex'),
    topLevel: top.map((atom) => atom.type).filter((type) => type !== 'free'),
    packetMd5: await packetMd5(path),
  };
}

export function changedAtoms(
  before: M4aSnapshot,
  after: M4aSnapshot,
): string[] {
  const names = new Set([...before.ilst.keys(), ...after.ilst.keys()]);
  return [...names]
    .filter((name) => before.ilst.get(name) !== after.ilst.get(name))
    .sort();
}

export function assertAudioAndStructureUntouched(
  before: M4aSnapshot,
  after: M4aSnapshot,
): void {
  assert.equal(after.packetMd5, before.packetMd5, 'audio packets changed');
  assert.equal(after.mdatSha, before.mdatSha, 'mdat payload changed');
  assert.deepEqual(
    after.chunkOffsets,
    before.chunkOffsets,
    'a chunk offset no longer points at the same bytes',
  );
  assert.deepEqual(after.topLevel, before.topLevel);
  assert.deepEqual(
    [...after.moovLeaves],
    [...before.moovLeaves],
    'an atom outside ilst changed',
  );
}

export function assertOnlyTheseAtomsChanged(
  before: M4aSnapshot,
  after: M4aSnapshot,
  allowed: string[],
): void {
  assertAudioAndStructureUntouched(before, after);
  const unexpected = changedAtoms(before, after).filter(
    (name) => !allowed.includes(name),
  );
  assert.deepEqual(
    unexpected,
    [],
    'ilst items changed that were not requested',
  );
}
