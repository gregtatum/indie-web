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
