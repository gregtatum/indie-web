/**
 * Shared utils and constants for the music component.
 */
import type { TrackMetadata } from './@types/shared.ts';

export const MUSIC_INDEX_VERSION = 7 as const;

export const PREFER_COMPOSER_GROUPING_TAG_DESCRIPTION =
  'indie-web:prefer-composer-grouping';

export type PreferComposerGroupingValue = 'auto' | 'true' | 'false';

export interface PrivateTextTag {
  description: string;
  value: string;
}

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

export function serializePreferComposerGroupingTag(
  value: PreferComposerGroupingValue,
): PrivateTextTag {
  return {
    description: PREFER_COMPOSER_GROUPING_TAG_DESCRIPTION,
    value: value === 'auto' ? '' : value,
  };
}

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

export function shouldPreferComposerGrouping(track: TrackMetadata): boolean {
  if (track.preferComposerGrouping !== null) {
    return track.preferComposerGrouping;
  }
  return track.genre === 'Classical';
}

export function getTrackFilterArtist(track: TrackMetadata): string | null {
  if (shouldPreferComposerGrouping(track)) {
    return track.composer || track.albumArtist || track.artist;
  }
  return track.albumArtist || track.artist;
}
