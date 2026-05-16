import { upgradeMusicIndex } from 'frontend/logic/music/music-index-upgraders';
import v1Fixture from './fixtures/music-index-v1.json';

/**
 * These tests verify that in-memory upgraders correctly normalize old serialized
 * MusicIndex formats. Upgraders are write-once: if a test here breaks, something
 * has gone wrong — do not update the upgrader, investigate why the fixture changed.
 *
 * Snapshot testing is the primary assertion: the snapshot is the ground truth for
 * what a correctly upgraded index looks like.
 */

describe('upgradeMusicIndex', () => {
  it('upgrades a v1 index to the current format', () => {
    const { index, wasUpgraded } = upgradeMusicIndex(v1Fixture);
    expect(wasUpgraded).toBe(true);
    expect(index).toMatchSnapshot();
  });

  it('sets version to 2 after upgrade', () => {
    const { index } = upgradeMusicIndex(v1Fixture);
    expect(index.version).toBe(2);
  });

  it('backfills genre as null on all tracks', () => {
    const { index } = upgradeMusicIndex(v1Fixture);
    for (const track of index.tracks) {
      expect(track.genre).toBeNull();
    }
  });

  it('preserves all other track fields during upgrade', () => {
    const { index } = upgradeMusicIndex(v1Fixture);
    const track = index.tracks[0];
    expect(track.path).toBe('/Artist/Album/track.mp3');
    expect(track.title).toBe('Test Track');
    expect(track.artist).toBe('Test Artist');
    expect(track.album).toBe('Test Album');
    expect(track.duration).toBe(180.5);
    expect(track.size).toBe(3145728);
  });

  it('preserves null fields during upgrade', () => {
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
