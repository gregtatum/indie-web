import * as React from 'react';
import { $$, A, Hooks, T } from 'frontend';
import type { MusicTrackSource } from 'frontend/logic/music/metadata';

/**
 * A track source backed by the real, indexed music library.
 */
export function useMusicLibraryTrackSource(): MusicTrackSource {
  const dispatch = Hooks.useDispatch();
  const tracks = $$.getMusicTracks();
  const needsRescan = $$.getMusicNeedsRescan();
  const servedIndexVersion = $$.getMusicServedIndexVersion();

  return React.useMemo(
    () => ({
      tracks,
      updateTracks: (nextTracks: T.TrackMetadata[]) => {
        dispatch(A.setMusicTracks(nextTracks, needsRescan, servedIndexVersion));
      },
    }),
    [dispatch, tracks, needsRescan, servedIndexVersion],
  );
}

/**
 * A track source backed by a staged drag-and-drop import batch, rather than
 * the real music index.
 */
export function useMusicImportTrackSource(
  batch: T.MusicImportBatch,
): MusicTrackSource {
  const dispatch = Hooks.useDispatch();
  const { batchId, tracks } = batch;

  return React.useMemo(
    () => ({
      tracks,
      updateTracks: (nextTracks: T.TrackMetadata[]) => {
        dispatch(
          A.setMusicImportBatchTracks(
            batchId,
            nextTracks as T.StagedTrackMetadata[],
          ),
        );
      },
    }),
    [dispatch, batchId, tracks],
  );
}
