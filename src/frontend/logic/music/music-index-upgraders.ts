import * as T from 'shared/@types/shared';

/**
 * In-memory upgraders for the MusicIndex serialized data format.
 *
 * ## Two upgrade paths
 *
 * There are two distinct situations where an old index format is encountered,
 * and they are handled differently:
 *
 * 1. **Server upgraded, index on disk is old** — the server detects the version
 *    mismatch at scan time and rebuilds the index from scratch, producing a
 *    complete, up-to-date index. No upgrader involved.
 *
 * 2. **UI upgraded, server binary is old** — the server returns an older format
 *    because it doesn't know about the new version yet. The upgraders here
 *    normalize that response so the UI remains functional. The data is
 *    incomplete (e.g. genre is backfilled as null rather than read from tags),
 *    so the UI prompts the user to rescan once the server is also upgraded.
 *
 * These upgraders are a compatibility shim for case 2 only. A rescan is always
 * the authoritative way to get complete data.
 *
 * ## Rules
 *   1. Each upgrader takes a loosely-typed input (`IndexVersion<N>`) rather than
 *      importing old type definitions. Old formats are documented via checked-in
 *      JSON fixtures, not TypeScript types.
 *   2. Each upgrader is permanent. Once written and tested, never modify it.
 *      If you need to change an upgrader, that means the fixture test is wrong.
 *   3. To add a new version: write an upgrader from vN→v(N+1), add a fixture,
 *      add a test, and wire it into `upgradeMusicIndex`. Nothing else changes.
 */

/** Loosely-typed shape of a serialized MusicIndex at version N. */
type IndexVersion<N extends number> = { version: N } & Record<string, unknown>;

/** The version number of the current MusicIndex format. */
export const CURRENT_MUSIC_INDEX_VERSION = 5 satisfies T.MusicIndex['version'];

/** v1 → v2: backfill genre as null (v1 had no genre field). */
function upgradeV1ToV2(blob: IndexVersion<1>): IndexVersion<2> {
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
    version: 2 as const,
    scannedAt: blob.scannedAt as string,
    tracks,
  } as unknown as IndexVersion<2>;
}

/** v2 → v3: backfill track as null (v2 had no track number field). */
function upgradeV2ToV3(blob: IndexVersion<2>): IndexVersion<3> {
  const tracks = (blob.tracks as Record<string, unknown>[]).map((t) => ({
    path: t.path as string,
    title: (t.title as string | null) ?? null,
    artist: (t.artist as string | null) ?? null,
    album: (t.album as string | null) ?? null,
    genre: (t.genre as string | null) ?? null,
    track: null as number | null,
    duration: (t.duration as number | null) ?? null,
    size: t.size as number,
    mtime: t.mtime as string,
  }));
  return {
    version: 3 as const,
    scannedAt: blob.scannedAt as string,
    tracks,
  } as unknown as IndexVersion<3>;
}

/** v3 → v4: backfill coverArt as null (v3 had no cover art field). */
function upgradeV3ToV4(blob: IndexVersion<3>): IndexVersion<4> {
  const tracks = (blob.tracks as Record<string, unknown>[]).map((t) => ({
    path: t.path as string,
    title: (t.title as string | null) ?? null,
    artist: (t.artist as string | null) ?? null,
    album: (t.album as string | null) ?? null,
    genre: (t.genre as string | null) ?? null,
    track: (t.track as number | null) ?? null,
    duration: (t.duration as number | null) ?? null,
    size: t.size as number,
    mtime: t.mtime as string,
    coverArt: null,
  }));
  return {
    version: 4 as const,
    scannedAt: blob.scannedAt as string,
    tracks,
  } as unknown as IndexVersion<4>;
}

/** v4 → v5: backfill hasEmbeddedArt as false (v4 had no embedded art field). */
function upgradeV4ToV5(blob: IndexVersion<4>): T.MusicIndex {
  const tracks = (blob.tracks as Record<string, unknown>[]).map((t) => ({
    path: t.path as string,
    title: (t.title as string | null) ?? null,
    artist: (t.artist as string | null) ?? null,
    album: (t.album as string | null) ?? null,
    genre: (t.genre as string | null) ?? null,
    track: (t.track as number | null) ?? null,
    duration: (t.duration as number | null) ?? null,
    size: t.size as number,
    mtime: t.mtime as string,
    coverArt: (t.coverArt as string | null) ?? null,
    hasEmbeddedArt: false,
  }));
  return {
    version: 5 as const,
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
 *
 * To add support for a new version N: add `else if (raw.version === N - 1)`
 * that calls your new upgradeV(N-1)ToV(N) function. Each step upgrades one
 * version at a time; chaining handles multi-step upgrades automatically.
 */
export function upgradeMusicIndex(blob: unknown): {
  index: T.MusicIndex;
  wasUpgraded: boolean;
} {
  let raw = blob as { version?: number } & Record<string, unknown>;
  let wasUpgraded = false;
  if (raw.version === 1) {
    raw = upgradeV1ToV2(raw as IndexVersion<1>) as unknown as typeof raw;
    wasUpgraded = true;
  }
  if (raw.version === 2) {
    raw = upgradeV2ToV3(raw as IndexVersion<2>) as unknown as typeof raw;
    wasUpgraded = true;
  }
  if (raw.version === 3) {
    raw = upgradeV3ToV4(raw as IndexVersion<3>) as unknown as typeof raw;
    wasUpgraded = true;
  }
  if (raw.version === 4) {
    raw = upgradeV4ToV5(raw as IndexVersion<4>) as unknown as typeof raw;
    wasUpgraded = true;
  }
  return { index: raw as unknown as T.MusicIndex, wasUpgraded };
}
