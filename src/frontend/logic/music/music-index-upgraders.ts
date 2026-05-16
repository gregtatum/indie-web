import * as T from 'shared/@types/shared';

/**
 * In-memory upgraders for the MusicIndex serialized data format.
 *
 * The TypeScript type system only knows about the current MusicIndex format.
 * When the server returns an older serialized format (e.g. the server binary is
 * behind the UI), these upgraders normalize it to the current format before
 * anything else in the frontend touches it.
 *
 * Rules:
 *   1. Each upgrader takes a loosely-typed input (`{ version: N } & Record<string, unknown>`)
 *      rather than importing old type definitions. Old formats are documented via
 *      checked-in JSON fixtures, not TypeScript types.
 *   2. Each upgrader is permanent. Once written and tested, never modify it.
 *      If you need to change an upgrader, that means the fixture test is wrong.
 *   3. To add a new version: write an upgrader from vN→v(N+1), add a fixture,
 *      add a test, and wire it into `upgradeMusicIndex`. Nothing else changes.
 */

type V1Blob = { version: 1 } & Record<string, unknown>;

/** v1 → v2: backfill genre as null (v1 had no genre field). */
function upgradeV1ToV2(blob: V1Blob): T.MusicIndex {
  const tracks = (blob.tracks as Record<string, unknown>[]).map((t) => ({
    path: t.path as string,
    title: (t.title as string | null) ?? null,
    artist: (t.artist as string | null) ?? null,
    album: (t.album as string | null) ?? null,
    genre: null,
    duration: (t.duration as number | null) ?? null,
    size: t.size as number,
    mtime: t.mtime as string,
  }));
  return {
    version: 2,
    scannedAt: blob.scannedAt as string,
    tracks,
  };
}

/**
 * Upgrades any serialized MusicIndex to the current format.
 * Returns the normalized index and whether an upgrade was applied.
 * Callers should surface a rescan recommendation when `wasUpgraded` is true,
 * since upgraded data (e.g. backfilled genre: null) is incomplete compared to
 * what a fresh scan would produce.
 */
export function upgradeMusicIndex(blob: unknown): {
  index: T.MusicIndex;
  wasUpgraded: boolean;
} {
  const raw = blob as { version?: number } & Record<string, unknown>;
  if (raw.version === 1) {
    return { index: upgradeV1ToV2(raw as V1Blob), wasUpgraded: true };
  }
  return { index: raw as unknown as T.MusicIndex, wasUpgraded: false };
}
