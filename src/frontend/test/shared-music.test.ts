import type { TrackMetadata } from 'shared/@types/shared';
import {
  defaultPreferComposerGroupingForGenre,
  getTrackFilterArtist,
  nativePrivateTextTagValue,
  parsePreferComposerGroupingTag,
  serializePreferComposerGroupingTag,
} from 'shared/music';

const BASE_TRACK: TrackMetadata = {
  path: '/track.mp3',
  title: 'Track',
  artist: 'Artist',
  albumArtist: 'Album Artist',
  composer: 'Composer',
  album: 'Album',
  genre: 'Rock',
  preferComposerGrouping: null,
  track: 1,
  duration: 180,
  size: 1024,
  mtime: '2024-01-01T00:00:00Z',
  coverArt: null,
  hasEmbeddedArt: false,
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
