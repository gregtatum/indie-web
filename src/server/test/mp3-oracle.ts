import { createHash } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { runFfmpeg } from '../music/ffmpeg.ts';
import { packetMd5 } from './m4a-oracle.ts';

const HEADER_BYTES = 10;
const ID3V1_BYTES = 128;

export interface Mp3Snapshot {
  version: number | null;
  frames: Map<string, string>;
  tagEnd: number;
  audioSha: string;
  packetMd5: string;
}

function syncSafe(data: Buffer, pos: number): number {
  return (
    (data[pos] << 21) |
    (data[pos + 1] << 14) |
    (data[pos + 2] << 7) |
    data[pos + 3]
  );
}

function userTextDescription(data: Buffer): string {
  const encoding = data[0];
  if (encoding === 1 || encoding === 2) {
    let end = 1;
    while (end + 2 <= data.length && (data[end] || data[end + 1])) {
      end += 2;
    }
    return data.toString('hex', 1, end);
  }
  const end = data.indexOf(0, 1);
  return data.toString('latin1', 1, end === -1 ? data.length : end);
}

/**
 * Lists the frames of a plain ID3v2.3 or ID3v2.4 tag, keyed by their ID, the
 * description for user text, and a counter for repeats. The values are the
 * hex of the frame flags and data. A tag using unsynchronisation or an
 * extended header is not listed.
 */
function listFrames(
  data: Buffer,
  version: number,
  flags: number,
  tagSize: number,
): Map<string, string> {
  const frames = new Map<string, string>();
  if (flags !== 0) {
    return frames;
  }
  let pos = HEADER_BYTES;
  const end = HEADER_BYTES + tagSize;
  while (pos + HEADER_BYTES <= end && data[pos] !== 0) {
    const id = data.toString('latin1', pos, pos + 4);
    const size =
      version === 4 ? syncSafe(data, pos + 4) : data.readUInt32BE(pos + 4);
    assert.ok(pos + HEADER_BYTES + size <= end, 'frame out of range');
    const body = data.subarray(pos + HEADER_BYTES, pos + HEADER_BYTES + size);
    let key = id === 'TXXX' ? `TXXX:${userTextDescription(body)}` : id;
    for (let n = 2; frames.has(key); n++) {
      key = `${id}#${n}`;
    }
    frames.set(
      key,
      Buffer.concat([data.subarray(pos + 8, pos + 10), body]).toString('hex'),
    );
    pos += HEADER_BYTES + size;
  }
  return frames;
}

export async function snapshotMp3(path: string): Promise<Mp3Snapshot> {
  const data = await readFile(path);
  let version: number | null = null;
  let frames = new Map<string, string>();
  let tagEnd = 0;
  if (data.toString('latin1', 0, 3) === 'ID3') {
    version = data[3];
    const size = syncSafe(data, 6);
    tagEnd = HEADER_BYTES + size;
    if (version === 3 || version === 4) {
      frames = listFrames(data, version, data[5], size);
    }
  }
  const hasId3v1 =
    data.length - ID3V1_BYTES >= tagEnd &&
    data.toString('latin1', data.length - ID3V1_BYTES, data.length - 125) ===
      'TAG';
  const audioEnd = hasId3v1 ? data.length - ID3V1_BYTES : data.length;
  return {
    version,
    frames,
    tagEnd,
    audioSha: createHash('sha256')
      .update(data.subarray(tagEnd, audioEnd))
      .digest('hex'),
    packetMd5: await packetMd5(path),
  };
}

export function changedFrames(
  before: Mp3Snapshot,
  after: Mp3Snapshot,
): string[] {
  const names = new Set([...before.frames.keys(), ...after.frames.keys()]);
  return [...names]
    .filter((name) => before.frames.get(name) !== after.frames.get(name))
    .sort();
}

export function assertAudioUntouched(
  before: Mp3Snapshot,
  after: Mp3Snapshot,
): void {
  assert.equal(after.packetMd5, before.packetMd5, 'audio packets changed');
  assert.equal(after.audioSha, before.audioSha, 'audio bytes changed');
}

export function assertOnlyTheseFramesChanged(
  before: Mp3Snapshot,
  after: Mp3Snapshot,
  allowed: string[],
): void {
  assertAudioUntouched(before, after);
  assert.deepEqual(
    changedFrames(before, after).filter((name) => !allowed.includes(name)),
    [],
    'frames changed that were not requested',
  );
}

export const FIXTURE_TAGS: Record<string, string> = {
  title: 'Fixture Title',
  artist: 'Fixture Artist',
  album_artist: 'Fixture Album Artist',
  album: 'Fixture Album',
  composer: 'Fixture Composer',
  track: '3/12',
  disc: '1/2',
  date: '2020',
  genre: 'Jazz',
  mood: 'Calm',
};

/**
 * Encodes a second of real MPEG audio with no tags at all. ffmpeg always
 * writes an ID3v2 tag first, so it is cut off afterward.
 */
export async function makeBareMp3(path: string): Promise<void> {
  const encoded = `${path}.encoded`;
  await runFfmpeg(
    [
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=1',
      '-c:a',
      'libmp3lame',
      '-b:a',
      '64k',
      '-f',
      'mp3',
      encoded,
    ],
    'quick',
  );
  const data = await readFile(encoded);
  await writeFile(path, data.subarray(HEADER_BYTES + syncSafe(data, 6)));
  await rm(encoded);
}

/**
 * Copies the audio of a bare mp3 and tags it with ffmpeg, which is the
 * independent author of the tag under test.
 */
export async function makeTaggedMp3(
  bare: string,
  path: string,
  options: { version: 3 | 4; id3v1?: boolean; cover?: string },
): Promise<void> {
  const metadata = Object.entries(FIXTURE_TAGS).flatMap(([key, value]) => [
    '-metadata',
    `${key}=${value}`,
  ]);
  await runFfmpeg(
    [
      '-i',
      bare,
      ...(options.cover ? ['-i', options.cover] : []),
      '-map',
      '0:a',
      ...(options.cover
        ? ['-map', '1:v', '-disposition:v:0', 'attached_pic']
        : []),
      '-c',
      'copy',
      ...metadata,
      '-id3v2_version',
      String(options.version),
      '-write_id3v1',
      options.id3v1 ? '1' : '0',
      path,
    ],
    'quick',
  );
}
