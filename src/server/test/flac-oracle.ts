import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { packetMd5 } from './m4a-oracle.ts';

export const FRAME_COMMENTS: Record<string, string> = {
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
};

const STREAMINFO = 0;
const PADDING = 1;
const VORBIS_COMMENT = 4;
const PICTURE = 6;

interface RawBlock {
  type: number;
  last: boolean;
  body: Buffer;
}

export interface FlacSnapshot {
  prefix: string;
  blocks: Array<{ type: number; body: string }>;
  comments: Map<string, string[]>;
  pictureTypes: number[];
  lastFlags: boolean[];
  audioSha: string;
  packetMd5: string;
}

function walkBlocks(data: Buffer): {
  prefix: Buffer;
  blocks: RawBlock[];
  audioStart: number;
} {
  const marker = data.indexOf('fLaC', 0, 'latin1');
  assert.ok(marker >= 0, 'no fLaC marker');
  const blocks: RawBlock[] = [];
  let pos = marker + 4;
  for (let last = false; !last;) {
    last = (data[pos] & 0x80) !== 0;
    const length = data.readUIntBE(pos + 1, 3);
    assert.ok(pos + 4 + length <= data.length, 'block out of range');
    blocks.push({
      type: data[pos] & 0x7f,
      last,
      body: data.subarray(pos + 4, pos + 4 + length),
    });
    pos += 4 + length;
  }
  return { prefix: data.subarray(0, marker), blocks, audioStart: pos };
}

function readComments(body: Buffer): Map<string, string[]> {
  const comments = new Map<string, string[]>();
  let pos = 4 + body.readUInt32LE(0);
  const count = body.readUInt32LE(pos);
  pos += 4;
  for (let i = 0; i < count; i++) {
    const length = body.readUInt32LE(pos);
    const entry = body.toString('utf8', pos + 4, pos + 4 + length);
    pos += 4 + length;
    const equals = entry.indexOf('=');
    const name = entry.slice(0, equals).toUpperCase();
    comments.set(name, [
      ...(comments.get(name) ?? []),
      entry.slice(equals + 1),
    ]);
  }
  assert.equal(pos, body.length, 'trailing bytes in Vorbis comment');
  return comments;
}

export async function snapshotFlac(path: string): Promise<FlacSnapshot> {
  const data = await readFile(path);
  const { prefix, blocks, audioStart } = walkBlocks(data);
  assert.equal(blocks[0].type, STREAMINFO, 'STREAMINFO must come first');
  const vorbis = blocks.filter(({ type }) => type === VORBIS_COMMENT);
  assert.ok(vorbis.length <= 1, 'more than one Vorbis comment block');
  return {
    prefix: prefix.toString('hex'),
    blocks: blocks
      .filter(({ type }) => type !== PADDING)
      .map(({ type, body }) => ({ type, body: body.toString('hex') })),
    comments: vorbis[0] ? readComments(vorbis[0].body) : new Map(),
    pictureTypes: blocks
      .filter(({ type }) => type === PICTURE)
      .map(({ body }) => body.readUInt32BE(0)),
    lastFlags: blocks.map(({ last }) => last),
    audioSha: createHash('sha256')
      .update(data.subarray(audioStart))
      .digest('hex'),
    packetMd5: await packetMd5(path),
  };
}

export function changedComments(
  before: FlacSnapshot,
  after: FlacSnapshot,
): string[] {
  const names = new Set([...before.comments.keys(), ...after.comments.keys()]);
  return [...names]
    .filter(
      (name) =>
        JSON.stringify(before.comments.get(name)) !==
        JSON.stringify(after.comments.get(name)),
    )
    .sort();
}

function assertChainWellFormed(snapshot: FlacSnapshot): void {
  assert.deepEqual(
    snapshot.lastFlags,
    snapshot.lastFlags.map(
      (_, index) => index === snapshot.lastFlags.length - 1,
    ),
    'the last-block flag must be set on exactly the final block',
  );
}

export function assertAudioAndStructureUntouched(
  before: FlacSnapshot,
  after: FlacSnapshot,
  options: { changedTypes?: number[] } = {},
): void {
  const changedTypes = options.changedTypes ?? [VORBIS_COMMENT, PICTURE];
  const untouched = (snapshot: FlacSnapshot) =>
    snapshot.blocks.filter(({ type }) => !changedTypes.includes(type));
  assertChainWellFormed(after);
  assert.equal(after.audioSha, before.audioSha, 'audio frames changed');
  assert.equal(after.packetMd5, before.packetMd5, 'audio packets changed');
  assert.equal(after.prefix, before.prefix, 'bytes before fLaC changed');
  assert.deepEqual(untouched(after), untouched(before), 'a block changed');
}

export function assertOnlyTheseCommentsChanged(
  before: FlacSnapshot,
  after: FlacSnapshot,
  allowed: string[],
): void {
  assertAudioAndStructureUntouched(before, after, {
    changedTypes: [VORBIS_COMMENT],
  });
  assert.deepEqual(
    after.blocks.filter(({ type }) => type === PICTURE),
    before.blocks.filter(({ type }) => type === PICTURE),
    'pictures changed',
  );
  const unexpected = changedComments(before, after).filter(
    (name) => !allowed.includes(name),
  );
  assert.deepEqual(unexpected, [], 'comments changed that were not requested');
}

let flacInstalled: Promise<boolean> | undefined;

export function hasFlac(): Promise<boolean> {
  flacInstalled ??= new Promise((resolve) => {
    const child = spawn('flac', ['--version'], { stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
  return flacInstalled;
}

/**
 * Verifies the audio against the MD5 in STREAMINFO with the reference
 * decoder. This is skipped when the flac binary is not installed.
 */
export async function assertFlacVerifies(path: string): Promise<void> {
  if (!(await hasFlac())) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const child = spawn('flac', ['-t', '-s', path], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`flac -t failed (${code}): ${stderr.trim()}`)),
    );
  });
}
