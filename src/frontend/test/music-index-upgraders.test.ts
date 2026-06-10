import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  upgradeMusicIndex,
  CURRENT_MUSIC_INDEX_VERSION,
} from 'frontend/logic/music/music-index-upgraders';

/**
 * These tests verify that in-memory upgraders correctly normalize old serialized
 * MusicIndex formats. Upgraders are write-once: if a test here breaks, something
 * has gone wrong — do not update the upgrader, investigate why the fixture changed.
 *
 * Snapshot testing is the primary assertion: the snapshot is the ground truth for
 * what a correctly upgraded index looks like.
 *
 * One describe block per version step. Future upgraders add a new block below;
 * existing blocks are never modified.
 */

// v1 → current: genre field added in v2, track number added in v3
describe('upgradeMusicIndex v1 → current', () => {
  const v1Fixture = JSON.parse(
    readFileSync(join(__dirname, 'fixtures/music-index-v1.json'), 'utf-8'),
  );

  it('upgrades a v1 index to current', () => {
    const { index, wasUpgraded } = upgradeMusicIndex(v1Fixture);
    expect(wasUpgraded).toBe(true);
    expect(index).toMatchSnapshot();
  });

  it('sets version to current', () => {
    const { index } = upgradeMusicIndex(v1Fixture);
    expect(index.version).toBe(CURRENT_MUSIC_INDEX_VERSION);
  });

  it('backfills genre as null on all tracks', () => {
    const { index } = upgradeMusicIndex(v1Fixture);
    for (const track of index.tracks) {
      expect(track.genre).toBeNull();
    }
  });

  it('backfills track as null on all tracks', () => {
    const { index } = upgradeMusicIndex(v1Fixture);
    for (const track of index.tracks) {
      expect(track.track).toBeNull();
    }
  });

  it('preserves all other track fields', () => {
    const { index } = upgradeMusicIndex(v1Fixture);
    const track = index.tracks[0];
    expect(track.path).toBe('/Artist/Album/track.mp3');
    expect(track.title).toBe('Test Track');
    expect(track.artist).toBe('Test Artist');
    expect(track.album).toBe('Test Album');
    expect(track.duration).toBe(180.5);
    expect(track.size).toBe(3145728);
  });

  it('preserves null fields', () => {
    const { index } = upgradeMusicIndex(v1Fixture);
    const track = index.tracks[1];
    expect(track.title).toBeNull();
    expect(track.artist).toBeNull();
    expect(track.album).toBeNull();
    expect(track.duration).toBeNull();
  });
});

// v2 → current: track number field added (backfilled as null on upgrade)
describe('upgradeMusicIndex v2 → current', () => {
  const v2Fixture = JSON.parse(
    readFileSync(join(__dirname, 'fixtures/music-index-v2.json'), 'utf-8'),
  );

  it('upgrades a v2 index to current', () => {
    const { index, wasUpgraded } = upgradeMusicIndex(v2Fixture);
    expect(wasUpgraded).toBe(true);
    expect(index).toMatchSnapshot();
  });

  it('sets version to current', () => {
    const { index } = upgradeMusicIndex(v2Fixture);
    expect(index.version).toBe(CURRENT_MUSIC_INDEX_VERSION);
  });

  it('backfills track as null on all tracks', () => {
    const { index } = upgradeMusicIndex(v2Fixture);
    for (const track of index.tracks) {
      expect(track.track).toBeNull();
    }
  });

  it('preserves all other track fields', () => {
    const { index } = upgradeMusicIndex(v2Fixture);
    const track = index.tracks[0];
    expect(track.path).toBe('/Artist/Album/track.mp3');
    expect(track.title).toBe('Test Track');
    expect(track.artist).toBe('Test Artist');
    expect(track.album).toBe('Test Album');
    expect(track.genre).toBe('Rock');
    expect(track.duration).toBe(180.5);
    expect(track.size).toBe(3145728);
  });

  it('preserves null fields', () => {
    const { index } = upgradeMusicIndex(v2Fixture);
    const track = index.tracks[1];
    expect(track.title).toBeNull();
    expect(track.artist).toBeNull();
    expect(track.album).toBeNull();
    expect(track.genre).toBeNull();
    expect(track.duration).toBeNull();
  });

  it('returns wasUpgraded: false for a current index', () => {
    const current: unknown = {
      version: CURRENT_MUSIC_INDEX_VERSION,
      scannedAt: '2025-01-01T00:00:00.000Z',
      tracks: [],
    };
    const { wasUpgraded } = upgradeMusicIndex(current);
    expect(wasUpgraded).toBe(false);
  });
});

// v4 → current: hasEmbeddedArt field added (backfilled as false on upgrade)
describe('upgradeMusicIndex v4 → current', () => {
  const v4Fixture = JSON.parse(
    readFileSync(join(__dirname, 'fixtures/music-index-v4.json'), 'utf-8'),
  );

  it('upgrades a v4 index to current', () => {
    const { index, wasUpgraded } = upgradeMusicIndex(v4Fixture);
    expect(wasUpgraded).toBe(true);
    expect(index).toMatchSnapshot();
  });

  it('sets version to current', () => {
    const { index } = upgradeMusicIndex(v4Fixture);
    expect(index.version).toBe(CURRENT_MUSIC_INDEX_VERSION);
  });

  it('backfills hasEmbeddedArt as false on all tracks', () => {
    const { index } = upgradeMusicIndex(v4Fixture);
    for (const track of index.tracks) {
      expect(track.hasEmbeddedArt).toBe(false);
    }
  });

  it('preserves all other track fields', () => {
    const { index } = upgradeMusicIndex(v4Fixture);
    const track = index.tracks[0];
    expect(track.path).toBe('/Artist/Album/track.mp3');
    expect(track.title).toBe('Test Track');
    expect(track.artist).toBe('Test Artist');
    expect(track.album).toBe('Test Album');
    expect(track.genre).toBe('Rock');
    expect(track.track).toBe(1);
    expect(track.duration).toBe(180.5);
    expect(track.size).toBe(3145728);
    expect(track.coverArt).toBe('/Artist/Album/Folder.jpg');
  });

  it('preserves null fields', () => {
    const { index } = upgradeMusicIndex(v4Fixture);
    const track = index.tracks[1];
    expect(track.title).toBeNull();
    expect(track.artist).toBeNull();
    expect(track.album).toBeNull();
    expect(track.genre).toBeNull();
    expect(track.track).toBeNull();
    expect(track.duration).toBeNull();
    expect(track.coverArt).toBeNull();
  });
});

// v5 → current: albumArtist field added (backfilled as null on upgrade)
describe('upgradeMusicIndex v5 → current', () => {
  const v5Fixture = JSON.parse(
    readFileSync(join(__dirname, 'fixtures/music-index-v5.json'), 'utf-8'),
  );

  it('upgrades a v5 index to current', () => {
    const { index, wasUpgraded } = upgradeMusicIndex(v5Fixture);
    expect(wasUpgraded).toBe(true);
    expect(index).toMatchSnapshot();
  });

  it('sets version to current', () => {
    const { index } = upgradeMusicIndex(v5Fixture);
    expect(index.version).toBe(CURRENT_MUSIC_INDEX_VERSION);
  });

  it('backfills albumArtist as null on all tracks', () => {
    const { index } = upgradeMusicIndex(v5Fixture);
    for (const track of index.tracks) {
      expect(track.albumArtist).toBeNull();
    }
  });

  it('preserves all other track fields', () => {
    const { index } = upgradeMusicIndex(v5Fixture);
    const track = index.tracks[0];
    expect(track.path).toBe('/Artist/Album/track.mp3');
    expect(track.title).toBe('Test Track');
    expect(track.artist).toBe('Test Artist');
    expect(track.album).toBe('Test Album');
    expect(track.genre).toBe('Rock');
    expect(track.track).toBe(1);
    expect(track.duration).toBe(180.5);
    expect(track.size).toBe(3145728);
    expect(track.coverArt).toBe('/Artist/Album/Folder.jpg');
    expect(track.hasEmbeddedArt).toBe(false);
  });
});

// v3 → current: coverArt field added (backfilled as null on upgrade)
describe('upgradeMusicIndex v3 → current', () => {
  const v3Fixture = JSON.parse(
    readFileSync(join(__dirname, 'fixtures/music-index-v3.json'), 'utf-8'),
  );

  it('upgrades a v3 index to current', () => {
    const { index, wasUpgraded } = upgradeMusicIndex(v3Fixture);
    expect(wasUpgraded).toBe(true);
    expect(index).toMatchSnapshot();
  });

  it('sets version to current', () => {
    const { index } = upgradeMusicIndex(v3Fixture);
    expect(index.version).toBe(CURRENT_MUSIC_INDEX_VERSION);
  });

  it('backfills coverArt as null on all tracks', () => {
    const { index } = upgradeMusicIndex(v3Fixture);
    for (const track of index.tracks) {
      expect(track.coverArt).toBeNull();
    }
  });

  it('preserves all other track fields', () => {
    const { index } = upgradeMusicIndex(v3Fixture);
    const track = index.tracks[0];
    expect(track.path).toBe('/Artist/Album/track.mp3');
    expect(track.title).toBe('Test Track');
    expect(track.artist).toBe('Test Artist');
    expect(track.album).toBe('Test Album');
    expect(track.genre).toBe('Rock');
    expect(track.track).toBe(1);
    expect(track.duration).toBe(180.5);
    expect(track.size).toBe(3145728);
  });

  it('preserves null fields', () => {
    const { index } = upgradeMusicIndex(v3Fixture);
    const track = index.tracks[1];
    expect(track.title).toBeNull();
    expect(track.artist).toBeNull();
    expect(track.album).toBeNull();
    expect(track.genre).toBeNull();
    expect(track.track).toBeNull();
    expect(track.duration).toBeNull();
  });
});
