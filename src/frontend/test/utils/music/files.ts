import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as T from 'frontend/@types';
import { MusicTestServer } from './server';

export function buildMp3WithTags(
  tags: Partial<{
    title: string;
    artist: string;
    album: string;
    genre: string;
  }>,
): Buffer {
  function frame(id: string, content: Buffer): Buffer {
    const header = Buffer.alloc(10);
    header.write(id, 0, 4, 'ascii');
    header.writeUInt32BE(content.length, 4);
    header.writeUInt16BE(0, 8);
    return Buffer.concat([header, content]);
  }
  function textFrame(id: string, text: string): Buffer {
    return frame(
      id,
      Buffer.concat([Buffer.from([0x00]), Buffer.from(text, 'latin1')]),
    );
  }
  const frames: Buffer[] = [];
  if (tags.title) {
    frames.push(textFrame('TIT2', tags.title));
  }
  if (tags.artist) {
    frames.push(textFrame('TPE1', tags.artist));
  }
  if (tags.album) {
    frames.push(textFrame('TALB', tags.album));
  }
  if (tags.genre) {
    frames.push(textFrame('TCON', tags.genre));
  }
  const frameData = Buffer.concat(frames);
  const id3Header = Buffer.alloc(10);
  id3Header.write('ID3', 0, 3, 'ascii');
  id3Header.writeUInt8(3, 3);
  id3Header.writeUInt8(0, 4);
  id3Header.writeUInt8(0, 5);
  const size = frameData.length;
  id3Header.writeUInt8((size >> 21) & 0x7f, 6);
  id3Header.writeUInt8((size >> 14) & 0x7f, 7);
  id3Header.writeUInt8((size >> 7) & 0x7f, 8);
  id3Header.writeUInt8(size & 0x7f, 9);
  return Buffer.concat([id3Header, frameData]);
}

// Minimal valid MP3: ID3v2.3 header with no frames (11 bytes).
// Enough for the server to recognise it as an audio file without needing
// the full music-metadata tag parsing to succeed.
export function buildMinimalMp3(): Buffer {
  const header = Buffer.alloc(10);
  header.write('ID3', 0, 3); // ID3v2 marker
  header.writeUInt8(3, 3); // version 2.3
  header.writeUInt8(0, 4); // revision
  header.writeUInt8(0, 5); // flags
  header.writeUInt32BE(0, 6); // size = 0 (no frames)
  return header;
}

export function writeMusicIndex(
  server: MusicTestServer,
  tracks: T.TrackMetadata[],
  needsRescan = false,
): void {
  writeFileSync(
    join(server.mountDir, '.music-index.json'),
    JSON.stringify({
      version: 4,
      scannedAt: '2024-01-01T00:00:00Z',
      tracks,
      needsRescan,
    }),
  );
}
