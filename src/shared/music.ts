/**
 * Shared utils and constants for the music component.
 */
import type { TrackMetadata } from './@types/shared.ts';

/**
 * The serialized music index is read by the server and frontend. Keeping the
 * current version here avoids the two environments drifting when a new indexed
 * field is added.
 */
export const MUSIC_INDEX_VERSION = 7 as const;

/**
 * App-owned ID3 user-defined text (TXXX) description. Normal music players
 * should ignore this frame, while the local indexer can use it for private
 * filtering/grouping preferences.
 */
export const PREFER_COMPOSER_GROUPING_TAG_DESCRIPTION =
  'indie-web:prefer-composer-grouping';

/**
 * The modal uses a three-state control. The persisted index stores only the
 * explicit override as boolean|null; null means "Auto".
 */
export type PreferComposerGroupingValue = 'auto' | 'true' | 'false';

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
 * Converts the modal value into the TXXX payload. "Auto" writes an empty value
 * instead of deleting the frame because node-id3's update path preserves
 * unmentioned array entries. Empty parses back to null and has the same grouping
 * semantics as an absent tag.
 */
export function serializePreferComposerGroupingTag(
  value: PreferComposerGroupingValue,
): PrivateTextTag {
  return {
    description: PREFER_COMPOSER_GROUPING_TAG_DESCRIPTION,
    value: value === 'auto' ? '' : value,
  };
}

/**
 * Converts the indexed tri-state value into the modal's string value.
 */
export function preferComposerGroupingFormValue(
  value: boolean | null,
): PreferComposerGroupingValue {
  if (value === true) {
    return 'true';
  }
  if (value === false) {
    return 'false';
  }
  return 'auto';
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
 * Composer grouping defaults on for Classical music, but the private tag wins
 * when it is explicitly true or false.
 */
export function shouldPreferComposerGrouping(track: TrackMetadata): boolean {
  if (track.preferComposerGrouping !== null) {
    return track.preferComposerGrouping;
  }
  return track.genre === 'Classical';
}

/**
 * Artist filter and display sorting should use this effective grouping artist,
 * not the raw artist field. Classical tracks usually sort under composer, while
 * pop/jazz/etc. keep the album-artist-first strategy. Missing values fall back
 * through the rest of the chain so tracks remain discoverable.
 */
export function getTrackFilterArtist(track: TrackMetadata): string | null {
  if (shouldPreferComposerGrouping(track)) {
    return track.composer || track.albumArtist || track.artist;
  }
  return track.albumArtist || track.artist;
}
