import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildId3v1TagBuffer,
  id3v1GenreIndex,
  ID3V1_GENRE_UNSET,
  ID3V1_TAG_SIZE,
} from '../../shared/music.ts';

/**
 * Reads a fixed-width Latin-1 field back out of a built tag buffer, trimming
 * the zero-padding a real ID3v1 reader would also trim.
 */
function readField(block: Buffer, offset: number, length: number): string {
  return block
    .subarray(offset, offset + length)
    .toString('latin1')
    .replace(/\0+$/, '');
}

describe('id3v1GenreIndex', () => {
  it('matches a canonical genre name case-insensitively', () => {
    assert.equal(id3v1GenreIndex('Rock'), 17);
    assert.equal(id3v1GenreIndex('rock'), 17);
    assert.equal(id3v1GenreIndex('ROCK'), 17);
  });

  it('matches the first and last entries in the table', () => {
    assert.equal(id3v1GenreIndex('Blues'), 0);
    assert.equal(id3v1GenreIndex('Hard Rock'), 79);
  });

  it('returns unset for a genre with no exact match', () => {
    assert.equal(id3v1GenreIndex('Some Made Up Genre'), ID3V1_GENRE_UNSET);
    // A Winamp-extended genre beyond the 80 canonical entries, deliberately
    // unsupported (see the ID3V1_GENRES doc comment).
    assert.equal(id3v1GenreIndex('Anime'), ID3V1_GENRE_UNSET);
  });

  it('returns unset for null, undefined, or empty string', () => {
    assert.equal(id3v1GenreIndex(null), ID3V1_GENRE_UNSET);
    assert.equal(id3v1GenreIndex(undefined), ID3V1_GENRE_UNSET);
    assert.equal(id3v1GenreIndex(''), ID3V1_GENRE_UNSET);
  });
});

describe('buildId3v1TagBuffer', () => {
  it('is exactly 128 bytes and starts with the "TAG" marker', () => {
    const block = buildId3v1TagBuffer({});
    assert.equal(block.length, ID3V1_TAG_SIZE);
    assert.equal(block.subarray(0, 3).toString('ascii'), 'TAG');
  });

  it('round-trips title, artist, album, and year into their fixed slots', () => {
    const block = buildId3v1TagBuffer({
      title: 'Blue Monday',
      artist: 'New Order',
      album: 'Singles',
      year: '2005',
    });
    assert.equal(readField(block, 3, 30), 'Blue Monday');
    assert.equal(readField(block, 33, 30), 'New Order');
    assert.equal(readField(block, 63, 30), 'Singles');
    assert.equal(readField(block, 93, 4), '2005');
  });

  it('leaves fields empty (zero-filled) when the source value is missing', () => {
    const block = buildId3v1TagBuffer({});
    assert.equal(readField(block, 3, 30), '');
    assert.equal(readField(block, 33, 30), '');
    assert.equal(readField(block, 63, 30), '');
    assert.equal(readField(block, 93, 4), '');
  });

  it('truncates text fields longer than their fixed width', () => {
    const block = buildId3v1TagBuffer({
      title: 'A'.repeat(40),
      year: '20059999',
    });
    assert.equal(readField(block, 3, 30), 'A'.repeat(30));
    assert.equal(readField(block, 93, 4), '2005');
  });

  it('replaces characters outside Latin-1 with "?" instead of corrupting them', () => {
    // U+3042 (Hiragana "あ") is far outside Latin-1 (0x00-0xFF). Buffer's own
    // 'latin1' encoding would otherwise silently truncate it to a low byte
    // (0x42, 'B') rather than signal the loss.
    const block = buildId3v1TagBuffer({ title: 'あAé' }); // "あ", "A", "é" (é IS Latin-1)
    assert.equal(readField(block, 3, 30), '?Aé');
  });

  it('always writes the ID3v1.1 marker byte (offset 125) as zero', () => {
    const block = buildId3v1TagBuffer({ track: 4 });
    assert.equal(block.readUInt8(125), 0);
  });

  it('writes a valid track number into the track byte (offset 126)', () => {
    const block = buildId3v1TagBuffer({ track: 4 });
    assert.equal(block.readUInt8(126), 4);
  });

  it('writes 0 (unset) for a missing, null, or out-of-range track number', () => {
    assert.equal(buildId3v1TagBuffer({}).readUInt8(126), 0);
    assert.equal(buildId3v1TagBuffer({ track: null }).readUInt8(126), 0);
    assert.equal(buildId3v1TagBuffer({ track: -1 }).readUInt8(126), 0);
    assert.equal(buildId3v1TagBuffer({ track: 256 }).readUInt8(126), 0);
  });

  it('writes the exact byte boundary values 0 and 255 for the track number', () => {
    assert.equal(buildId3v1TagBuffer({ track: 0 }).readUInt8(126), 0);
    assert.equal(buildId3v1TagBuffer({ track: 255 }).readUInt8(126), 255);
  });

  it('maps a matching genre name to its ID3v1 byte (offset 127)', () => {
    const block = buildId3v1TagBuffer({ genre: 'Rock' });
    assert.equal(block.readUInt8(127), 17);
  });

  it('writes unset (0xff) for a missing or unmapped genre', () => {
    assert.equal(buildId3v1TagBuffer({}).readUInt8(127), ID3V1_GENRE_UNSET);
    assert.equal(
      buildId3v1TagBuffer({ genre: 'Not A Real Genre' }).readUInt8(127),
      ID3V1_GENRE_UNSET,
    );
  });
});
