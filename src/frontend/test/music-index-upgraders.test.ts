import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { upgradeMusicIndex } from 'frontend/logic/music/music-index-upgraders';

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

// v1 → v2: genre field added (backfilled as null on upgrade)
describe('upgradeMusicIndex v1 → v2', () => {
  const v1Fixture = JSON.parse(
    readFileSync(join(__dirname, 'fixtures/music-index-v1.json'), 'utf-8'),
  );

  it('upgrades a v1 index to v2', () => {
    const { index, wasUpgraded } = upgradeMusicIndex(v1Fixture);
    expect(wasUpgraded).toBe(true);
    expect(index).toMatchSnapshot();
  });

  it('sets version to 2', () => {
    const { index } = upgradeMusicIndex(v1Fixture);
    expect(index.version).toBe(2);
  });

  it('backfills genre as null on all tracks', () => {
    const { index } = upgradeMusicIndex(v1Fixture);
    for (const track of index.tracks) {
      expect(track.genre).toBeNull();
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

  it('returns wasUpgraded: false for a current v2 index', () => {
    const v2: unknown = {
      version: 2,
      scannedAt: '2025-01-01T00:00:00.000Z',
      tracks: [],
    };
    const { wasUpgraded } = upgradeMusicIndex(v2);
    expect(wasUpgraded).toBe(false);
  });
});

// v2 → v3: (example — fill in when v3 is introduced)
// describe('upgradeMusicIndex v2 → v3', () => {
//   const v2Fixture = JSON.parse(
//     readFileSync(join(__dirname, 'fixtures/music-index-v2.json'), 'utf-8'),
//   );
//
//   it('upgrades a v2 index to v3', () => {
//     const { index, wasUpgraded } = upgradeMusicIndex(v2Fixture);
//     expect(wasUpgraded).toBe(true);
//     expect(index).toMatchSnapshot();
//   });
//
//   it('returns wasUpgraded: false for a current v3 index', () => {
//     const v3: unknown = { version: 3, scannedAt: '...', tracks: [] };
//     const { wasUpgraded } = upgradeMusicIndex(v3);
//     expect(wasUpgraded).toBe(false);
//   });
// });
