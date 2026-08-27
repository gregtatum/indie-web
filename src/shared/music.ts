/**
 * Shared utils and constants for the music component.
 */
import type { TrackMetadata, TrackTagsResponse } from './@types/shared.ts';

/**
 * The serialized music index is read by the server and frontend. Keeping the
 * current version here avoids the two environments drifting when a new indexed
 * field is added.
 */
export const MUSIC_INDEX_VERSION = 8 as const;

/**
 * App-owned ID3 user-defined text (TXXX) description. Normal music players
 * should ignore this frame, while the local indexer can use it for private
 * filtering/grouping preferences.
 */
export const PREFER_COMPOSER_GROUPING_TAG_DESCRIPTION =
  'indie-web:prefer-composer-grouping';

export type PreferComposerGroupingValue = 'true' | 'false';

/**
 * The dependency-specific native tag values are normalized into this small
 * shape before app-level parsing, so shared code stays independent of
 * music-metadata and node-id3.
 */
export interface PrivateTextTag {
  description: string;
  value: string;
}

/**
 * Private tag booleans are intentionally strict. Unknown and empty values are
 * treated as null so they behave like an absent explicit override.
 */
export function parseBooleanTagValue(value: string): boolean | null {
  switch (value.trim().toLowerCase()) {
    case 'true':
      return true;
    case 'false':
      return false;
    default:
      return null;
  }
}

export function parsePreferComposerGroupingTag(
  tags: PrivateTextTag[],
): boolean | null {
  const tag = tags.find(
    (tag) => tag.description === PREFER_COMPOSER_GROUPING_TAG_DESCRIPTION,
  );
  return tag ? parseBooleanTagValue(tag.value) : null;
}

/**
 * Converts the modal choice into the TXXX payload. The UI may label one choice
 * as the current default, but saves still write an explicit boolean so later
 * genre edits do not silently change a user-confirmed grouping preference.
 */
export function serializePreferComposerGroupingTag(
  value: PreferComposerGroupingValue,
): PrivateTextTag {
  return {
    description: PREFER_COMPOSER_GROUPING_TAG_DESCRIPTION,
    value,
  };
}

/**
 * Converts the indexed nullable override into the modal's binary radio value.
 * A missing private tag resolves to the genre default for display, but the next
 * edit persists the selected value explicitly as "true" or "false".
 */
export function preferComposerGroupingFormValue(
  value: boolean | null,
  genre: string,
): PreferComposerGroupingValue {
  if (value === true) {
    return 'true';
  }
  if (value === false) {
    return 'false';
  }
  return defaultPreferComposerGroupingForGenre(genre) ? 'true' : 'false';
}

/**
 * The app-level default for artist grouping. Classical music commonly belongs
 * under composer for library browsing, while other genres stay grouped by album
 * artist. An explicit private tag can still lock either behavior.
 */
export function defaultPreferComposerGroupingForGenre(genre: string): boolean {
  return genre === 'Classical';
}

/**
 * music-metadata has exposed TXXX values in more than one shape depending on
 * tag version and parser normalization. This keeps the server adapter tolerant
 * while preserving a single shared parser for app-owned private tags.
 */
export function nativePrivateTextTagValue(
  value: unknown,
): PrivateTextTag | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.description !== 'string') {
    return null;
  }

  if (typeof record.value === 'string') {
    return { description: record.description, value: record.value };
  }
  if (typeof record.text === 'string') {
    return { description: record.description, value: record.text };
  }
  if (
    Array.isArray(record.text) &&
    record.text.length > 0 &&
    typeof record.text[0] === 'string'
  ) {
    return { description: record.description, value: record.text[0] };
  }
  return null;
}

/**
 * Resolves the private-tag override and genre default into a concrete grouping
 * strategy. Callers that sort or filter by "artist" should use this result
 * instead of checking the genre directly, so explicit user choices always win.
 */
export function shouldPreferComposerGrouping(track: TrackMetadata): boolean {
  if (track.preferComposerGrouping !== null) {
    return track.preferComposerGrouping;
  }
  return defaultPreferComposerGroupingForGenre(track.genre ?? '');
}

/**
 * Returns the effective artist key for filtering and display sorting:
 *
 * - Prefer composer: Composer -> Album Artist -> Artist
 * - Do not prefer composer: Album Artist -> Artist
 *
 * Keeping this fallback chain in one shared helper avoids split behavior
 * between frontend filters, sort keys, and any future server-side indexing.
 */
export function getTrackFilterArtist(track: TrackMetadata): string | null {
  if (shouldPreferComposerGrouping(track)) {
    return track.composer || track.albumArtist || track.artist;
  }
  return track.albumArtist || track.artist;
}

/**
 * Canonical default ordering for a flat track list: grouped by effective
 * artist, then album, then track number, with title/path as a stable
 * tiebreaker for missing track numbers. Used to sort the index at scan time;
 * a future frontend sort UI can reuse this as its default/fallback order.
 */
export function compareTracksDefault(
  a: TrackMetadata,
  b: TrackMetadata,
): number {
  const artistCompare = (getTrackFilterArtist(a) ?? '').localeCompare(
    getTrackFilterArtist(b) ?? '',
  );
  if (artistCompare !== 0) {
    return artistCompare;
  }
  const albumCompare = (a.album ?? '').localeCompare(b.album ?? '');
  if (albumCompare !== 0) {
    return albumCompare;
  }
  const trackCompare = (a.track ?? Infinity) - (b.track ?? Infinity);
  if (trackCompare !== 0) {
    return trackCompare;
  }
  return (a.title ?? a.path).localeCompare(b.title ?? b.path);
}

/**
 * Some files contain more than one tag source. For example, an older iTunes
 * version may have left an ID3v2.4 tag that is now wrapped by a newer ID3v2.3
 * tag. The app standardizes on ID3v2.3 because it is the most widely compatible
 * format and the only format that node-id3 writes. Reads therefore prefer
 * ID3v2.3 and fall back to other formats only for fields that it does not
 * contain.
 */
export const TAG_FORMAT_PRIORITY = [
  'ID3v2.3',
  'ID3v2.4',
  'ID3v2.2',
  'ID3v1',
  'iTunes',
] as const;

/**
 * ID3v2.2 uses 3-character frame IDs. ID3v1 uses fixed fields instead of frame
 * IDs, which music-metadata exposes as plain words such as "genre". iTunes
 * (M4A/MP4) uses its own atom names, e.g. "©nam" for title. This maps a
 * canonical ID3v2.3 or ID3v2.4 frame ID to the frame ID used by formats that
 * name the same field differently.
 */
const FRAME_ID_ALIASES: Record<string, Partial<Record<string, string>>> = {
  TIT2: { 'ID3v2.2': 'TT2', ID3v1: 'title', iTunes: '©nam' },
  TPE1: { 'ID3v2.2': 'TP1', ID3v1: 'artist', iTunes: '©ART' },
  TPE2: { 'ID3v2.2': 'TP2', iTunes: 'aART' },
  TALB: { 'ID3v2.2': 'TAL', ID3v1: 'album', iTunes: '©alb' },
  TCOM: { 'ID3v2.2': 'TCM', iTunes: '©wrt' },
  TRCK: { 'ID3v2.2': 'TRK', ID3v1: 'track', iTunes: 'trkn' },
  TPOS: { 'ID3v2.2': 'TPA', iTunes: 'disk' },
  TYER: { 'ID3v2.2': 'TYE', ID3v1: 'year' },
  TCON: { 'ID3v2.2': 'TCO', ID3v1: 'genre', iTunes: '©gen' },
  TBPM: { 'ID3v2.2': 'TBP' },
  COMM: { 'ID3v2.2': 'COM', ID3v1: 'comment' },
};

/**
 * Resolves a single field's value across a file's embedded tag blocks, in
 * TAG_FORMAT_PRIORITY order. Binary and empty values don't count as a
 * match, so the chain keeps falling through to the next format.
 */
export function resolveTagValue(
  blocks: TrackTagsResponse['blocks'],
  frameId: string,
): string | undefined {
  for (const format of TAG_FORMAT_PRIORITY) {
    const block = blocks.find((b) => b.format === format);
    if (!block) {
      continue;
    }
    const lookupId = FRAME_ID_ALIASES[frameId]?.[format] ?? frameId;
    const tag = block.tags.find(
      (t) => t.id === lookupId && t.binary === undefined,
    );
    if (tag && tag.value !== '') {
      return tag.value;
    }
  }
  return undefined;
}

/**
 * The frame IDs the app reads, edits, and migrates. Kept as one shared list
 * so the scanner, the /track-tags resolved view, and write-time gap-fill
 * migration all agree on exactly which fields "belong" to ID3v2.3.
 */
export const APP_FRAME_IDS = [
  'TIT2',
  'TPE1',
  'TPE2',
  'TALB',
  'TCOM',
  'TRCK',
  'TPOS',
  'TYER',
  'TCON',
  'TBPM',
  'COMM',
] as const;

/**
 * "TAG" + title(30) + artist(30) + album(30) + year(4) + comment(28) + zero
 * byte + track byte + genre byte.
 */
export const ID3V1_TAG_SIZE = 128;

/**
 * The 80 canonical ID3v1 genre names, in their spec byte-index order. Later
 * "Winamp extended" genres (80+) are excluded as not universally supported.
 */
export const ID3V1_GENRES = [
  'Blues',
  'Classic Rock',
  'Country',
  'Dance',
  'Disco',
  'Funk',
  'Grunge',
  'Hip-Hop',
  'Jazz',
  'Metal',
  'New Age',
  'Oldies',
  'Other',
  'Pop',
  'R&B',
  'Rap',
  'Reggae',
  'Rock',
  'Techno',
  'Industrial',
  'Alternative',
  'Ska',
  'Death Metal',
  'Pranks',
  'Soundtrack',
  'Euro-Techno',
  'Ambient',
  'Trip-Hop',
  'Vocal',
  'Jazz+Funk',
  'Fusion',
  'Trance',
  'Classical',
  'Instrumental',
  'Acid',
  'House',
  'Game',
  'Sound Clip',
  'Gospel',
  'Noise',
  'Alt. Rock',
  'Bass',
  'Soul',
  'Punk',
  'Space',
  'Meditative',
  'Instrumental Pop',
  'Instrumental Rock',
  'Ethnic',
  'Gothic',
  'Darkwave',
  'Techno-Industrial',
  'Electronic',
  'Pop-Folk',
  'Eurodance',
  'Dream',
  'Southern Rock',
  'Comedy',
  'Cult',
  'Gangsta Rap',
  'Top 40',
  'Christian Rap',
  'Pop/Funk',
  'Jungle',
  'Native American',
  'Cabaret',
  'New Wave',
  'Psychedelic',
  'Rave',
  'Showtunes',
  'Trailer',
  'Lo-Fi',
  'Tribal',
  'Acid Punk',
  'Acid Jazz',
  'Polka',
  'Retro',
  'Musical',
  'Rock & Roll',
  'Hard Rock',
] as const;

/**
 * The ID3v1 byte value meaning "no genre set".
 */
export const ID3V1_GENRE_UNSET = 0xff;

const ID3V1_GENRE_LOOKUP = new Map(
  ID3V1_GENRES.map((name, index) => [name.toLowerCase(), index]),
);

/**
 * Maps a free-text ID3v2 genre (TCON) to its ID3v1 byte value. Only an exact
 * (case-insensitive) match survives; anything else maps to "unset".
 */
export function id3v1GenreIndex(genre: string | null | undefined): number {
  if (!genre) {
    return ID3V1_GENRE_UNSET;
  }
  return ID3V1_GENRE_LOOKUP.get(genre.toLowerCase()) ?? ID3V1_GENRE_UNSET;
}

/**
 * The subset of a track's fields ID3v1 can represent (no album artist,
 * composer, or "total tracks" — ID3v1 has no room for them).
 */
export interface Id3v1TagFields {
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  /** A 4-character numeric year string, e.g. "1988". */
  year?: string | null;
  genre?: string | null;
  /** Clamped to the 0-255 byte range; 0 (or missing) means "unset". */
  track?: number | null;
}

/**
 * Replaces characters outside Latin-1 with "?" rather than letting Buffer's
 * latin1 encoding silently truncate them to the wrong character.
 */
function toLatin1Sanitized(value: string): string {
  let result = '';
  for (const char of value) {
    result += (char.codePointAt(0) ?? 0) <= 0xff ? char : '?';
  }
  return result;
}

/**
 * Writes a Latin-1 field into a fixed-width slot, truncating as needed.
 * Leaves a missing value's (already zero-filled) slot untouched.
 */
function writeFixedLatin1Field(
  buffer: Buffer,
  value: string | null | undefined,
  offset: number,
  length: number,
): void {
  if (!value) {
    return;
  }
  buffer.write(
    toLatin1Sanitized(value).slice(0, length),
    offset,
    length,
    'latin1',
  );
}

/**
 * Builds a fresh 128-byte ID3v1.1 tag block from a track's current ID3v2
 * field values.
 */
export function buildId3v1TagBuffer(fields: Id3v1TagFields): Buffer {
  const block = Buffer.alloc(ID3V1_TAG_SIZE, 0x00);
  block.write('TAG', 0, 3, 'ascii');
  writeFixedLatin1Field(block, fields.title, 3, 30);
  writeFixedLatin1Field(block, fields.artist, 33, 30);
  writeFixedLatin1Field(block, fields.album, 63, 30);
  writeFixedLatin1Field(block, fields.year, 93, 4);
  // Bytes 97-124: comment — this app never sets one on the ID3v1 tag it
  // writes, so that range is left zero-filled.
  block.writeUInt8(0, 125); // ID3v1.1 marker.
  const track = fields.track ?? 0;
  block.writeUInt8(track >= 0 && track <= 255 ? track : 0, 126);
  block.writeUInt8(id3v1GenreIndex(fields.genre), 127);
  return block;
}
