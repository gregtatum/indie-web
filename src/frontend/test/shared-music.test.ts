import type { TrackMetadata } from 'shared/@types/shared';
import {
  defaultPreferComposerGroupingForGenre,
  getTrackFilterArtist,
  nativePrivateTextTagValue,
  parsePreferComposerGroupingTag,
  resolveOrganizationPath,
  sanitizeFilenameSegment,
  serializePreferComposerGroupingTag,
  type OrganizationTrackFields,
} from 'shared/music';

const BASE_TRACK: TrackMetadata = {
  path: '/track.mp3',
  title: 'Track',
  artist: 'Artist',
  albumArtist: 'Album Artist',
  composer: 'Composer',
  album: 'Album',
  genre: 'Rock',
  year: null,
  preferComposerGrouping: null,
  track: 1,
  duration: 180,
  size: 1024,
  mtime: '2024-01-01T00:00:00Z',
  folderArtworkPath: null,
  hasEmbeddedArtwork: false,
};

describe('shared music helpers', () => {
  it('uses composer first when the private tag explicitly enables it', () => {
    expect(
      getTrackFilterArtist({
        ...BASE_TRACK,
        preferComposerGrouping: true,
      }),
    ).toBe('Composer');
  });

  it('ignores composer when the private tag explicitly disables it', () => {
    expect(
      getTrackFilterArtist({
        ...BASE_TRACK,
        genre: 'Classical',
        preferComposerGrouping: false,
      }),
    ).toBe('Album Artist');
  });

  it('uses composer first for Classical tracks with no explicit private tag', () => {
    expect(
      getTrackFilterArtist({
        ...BASE_TRACK,
        genre: 'Classical',
        preferComposerGrouping: null,
      }),
    ).toBe('Composer');
  });

  it('uses Classical as the genre default for composer grouping', () => {
    expect(defaultPreferComposerGroupingForGenre('Classical')).toBe(true);
    expect(defaultPreferComposerGroupingForGenre('Electronic')).toBe(false);
  });

  it('falls back through album artist and artist', () => {
    expect(
      getTrackFilterArtist({
        ...BASE_TRACK,
        composer: null,
        albumArtist: null,
        genre: 'Classical',
      }),
    ).toBe('Artist');
  });

  it('parses and serializes the prefer composer grouping tag', () => {
    expect(
      parsePreferComposerGroupingTag([
        serializePreferComposerGroupingTag('true'),
      ]),
    ).toBe(true);
    expect(
      parsePreferComposerGroupingTag([
        serializePreferComposerGroupingTag('false'),
      ]),
    ).toBe(false);
  });

  it('normalizes native TXXX value shapes', () => {
    expect(
      nativePrivateTextTagValue({
        description: 'indie-web:prefer-composer-grouping',
        text: ['true'],
      }),
    ).toEqual({
      description: 'indie-web:prefer-composer-grouping',
      value: 'true',
    });
  });
});

const ORGANIZATION_TRACK: OrganizationTrackFields = {
  genre: 'Rock',
  artist: 'Pink Floyd',
  albumArtist: 'Pink Floyd',
  album: 'The Dark Side of the Moon',
  year: '1973',
  title: 'Time',
  track: 4,
  composer: null,
};

describe('resolveOrganizationPath', () => {
  it('substitutes every token and zero-pads the track number', () => {
    expect(
      resolveOrganizationPath(
        '{Genre}/{Artist}/{Year} - {AlbumArtist}/{Track} - {Title}',
        ORGANIZATION_TRACK,
      ),
    ).toBe('/Rock/Pink Floyd/1973 - Pink Floyd/04 - Time.mp3');
  });

  it('drops a missing field but collapses the dangling separator around it', () => {
    expect(
      resolveOrganizationPath(
        '{Genre}/{Artist}/{Year} - {AlbumArtist}/{Track} - {Title}',
        { ...ORGANIZATION_TRACK, year: null },
      ),
    ).toBe('/Rock/Pink Floyd/Pink Floyd/04 - Time.mp3');
  });

  it('sanitizes a slash inside a resolved field value instead of nesting a folder', () => {
    expect(
      resolveOrganizationPath('{Artist}/{Title}', {
        ...ORGANIZATION_TRACK,
        artist: 'AC/DC',
      }),
    ).toBe('/AC-DC/Time.mp3');
  });

  it('renders a null track number as an empty segment token', () => {
    expect(
      resolveOrganizationPath('{Track} - {Title}', {
        ...ORGANIZATION_TRACK,
        track: null,
      }),
    ).toBe('/Time.mp3');
  });
});

describe('sanitizeFilenameSegment', () => {
  it('replaces filesystem-illegal characters with a dash', () => {
    expect(sanitizeFilenameSegment('Rock & Roll: Vol. 2?')).toBe(
      'Rock & Roll- Vol. 2-',
    );
  });

  it('leaves an already-safe value untouched', () => {
    expect(sanitizeFilenameSegment('Pink Floyd')).toBe('Pink Floyd');
  });
});
