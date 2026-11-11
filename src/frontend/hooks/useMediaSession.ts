import * as React from 'react';
import { A, Hooks } from 'frontend';
import type * as T from 'frontend/@types';
import type { MusicPlaybackStatus } from 'frontend/store/reducers/music';
import { UnhandledCaseError } from 'frontend/utils';

interface MediaSessionProps {
  musicPlaybackStatus: MusicPlaybackStatus;
  trackMetadata: T.TrackMetadata | null;
  play(): void;
  pause(): void;
}

export function useMediaSession({
  musicPlaybackStatus,
  trackMetadata,
  play,
  pause,
}: MediaSessionProps) {
  const dispatch = Hooks.useDispatch();

  const { mediaSession } = navigator;

  // Create a MediaMetadata anytime there is a track playing.
  React.useEffect(() => {
    let metadata = null;
    if (trackMetadata) {
      metadata = new MediaMetadata({
        title: trackMetadata.title ?? undefined,
        artist: trackMetadata.artist ?? undefined,
        album: trackMetadata.album ?? undefined,
      });
    }
    mediaSession.metadata = metadata;
  }, [trackMetadata]);

  React.useEffect(() => {
    switch (musicPlaybackStatus) {
      case 'playing':
        mediaSession.playbackState = 'playing';
        break;
      case 'paused':
        mediaSession.playbackState = 'paused';
        break;
      case 'idle':
      case 'loading':
      case 'error':
        mediaSession.playbackState = 'none';
        break;
      default:
        throw new UnhandledCaseError(
          musicPlaybackStatus,
          'MusicPlaybackStatus',
        );
    }
  }, [musicPlaybackStatus]);

  // These get passed into the action handlers, and so need to be refs.
  const playRef = React.useRef(play);
  playRef.current = play;
  const pauseRef = React.useRef(pause);
  pauseRef.current = pause;

  // Apply all of the action handlers.
  React.useEffect(() => {
    mediaSession.setActionHandler('play', () => {
      playRef.current();
    });
    mediaSession.setActionHandler('pause', () => {
      pauseRef.current();
    });
    mediaSession.setActionHandler('nexttrack', () => {
      dispatch(A.musicPlaybackStep('next'));
    });
    mediaSession.setActionHandler('previoustrack', () => {
      dispatch(A.musicPlaybackStep('previous'));
    });

    return () => {
      // Cleanup the handlers when dismounting.
      mediaSession.setActionHandler('play', null);
      mediaSession.setActionHandler('pause', null);
      mediaSession.setActionHandler('nexttrack', null);
      mediaSession.setActionHandler('previoustrack', null);
    };
  }, []);
}
