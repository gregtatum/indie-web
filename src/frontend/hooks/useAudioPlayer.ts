import * as React from 'react';
import { A, $, Hooks } from 'frontend';
import {
  persistedState,
  MusicPlaybackResume,
} from 'frontend/logic/persisted-state';

const MUSIC_PLAYBACK_RESUME_TIMEOUT_MS = 10_000;
const MUSIC_PLAYBACK_RESUME_INTERVAL_MS = 5_000;

export interface AudioPlayerState {
  currentTime: number;
  duration: number;
  volume: number;
  play(): void;
  pause(): void;
  seek(time: number): void;
  setVolume(volume: number): void;
}

/**
 * Manages audio playback for the music library using an <audio> element.
 *
 * Playback state that other components need (the playing track path and status)
 * lives in Redux. High-frequency values that only the playback bar needs
 * (currentTime, duration, volume) are kept as local React state to avoid
 * store churn on every tick.
 *
 * When a new track is dispatched via musicPlaybackLoad, this hook sets the
 * audio src and waits for canplay before dispatching musicPlaybackReady and
 * starting playback. The status effect handles all audio.play() / audio.pause()
 * calls so there is a single code path for both initial play and resume.
 */
export function useAudioPlayer(): AudioPlayerState {
  const { dispatch, getState } = Hooks.useStore();

  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const [volume, setVolumeState] = React.useState(1);

  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const currentTimeRef = React.useRef(0);
  // Tracks whether the current src has loaded enough data to call play().
  const isReadyRef = React.useRef(false);
  const didAttemptResumeRef = React.useRef(false);
  const resumeTimeRef = React.useRef<number | null>(null);
  const shouldPauseAfterResumeRef = React.useRef(false);
  const lastPersistedSnapshotRef = React.useRef<string | null>(null);

  function getAudio(): HTMLAudioElement {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.volume = 1;
      audioRef.current = audio;
    }
    return audioRef.current;
  }

  const trackPath = $.getMusicPlaybackTrackPath(getState());
  const server = $.getCurrentServerOrNull(getState());
  const serverId = $.getServerId(getState());
  const serverUrl = server?.url ?? '';

  React.useEffect(() => {
    if (didAttemptResumeRef.current || !serverId || !serverUrl) {
      return;
    }
    didAttemptResumeRef.current = true;

    const resume = persistedState.musicPlaybackResume.read();
    if (!resume) {
      return;
    }

    if (
      Date.now() - resume.updatedAt > MUSIC_PLAYBACK_RESUME_TIMEOUT_MS ||
      resume.serverId !== serverId ||
      resume.serverUrl !== serverUrl
    ) {
      persistedState.musicPlaybackResume.remove();
      return;
    }

    resumeTimeRef.current = resume.currentTime;
    shouldPauseAfterResumeRef.current = true;
    dispatch(A.musicPlaybackLoad(resume.trackPath));
  }, [dispatch, serverId, serverUrl]);

  React.useEffect(() => {
    if (!trackPath || !serverUrl) {
      return;
    }

    const audio = getAudio();
    isReadyRef.current = false;
    currentTimeRef.current = 0;
    setCurrentTime(0);
    setDuration(0);

    audio.src = `${serverUrl}/music/stream-audio?path=${encodeURIComponent(trackPath)}`;
    audio.load();

    function onLoadedMetadata() {
      if (isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
      if (resumeTimeRef.current !== null) {
        audio.currentTime = resumeTimeRef.current;
        currentTimeRef.current = resumeTimeRef.current;
        setCurrentTime(resumeTimeRef.current);
        resumeTimeRef.current = null;
      }
    }

    function onDurationChange() {
      if (isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    }

    function onCanPlay() {
      isReadyRef.current = true;
      dispatch(A.musicPlaybackReady());
      if (shouldPauseAfterResumeRef.current) {
        shouldPauseAfterResumeRef.current = false;
        dispatch(A.musicPlaybackPause());
      }
    }

    function onTimeUpdate() {
      currentTimeRef.current = audio.currentTime;
      setCurrentTime(audio.currentTime);
    }

    function onEnded() {
      const queue = $.getMusicPlaybackQueue(getState());
      const idx = queue.findIndex((t) => t.path === trackPath);
      if (idx !== -1 && idx < queue.length - 1) {
        dispatch(A.musicPlaybackLoad(queue[idx + 1].path));
      } else {
        dispatch(A.musicPlaybackStop());
      }
    }

    function onError() {
      dispatch(A.musicPlaybackError());
    }

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('canplay', onCanPlay, { once: true });
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    // eslint-disable-next-line consistent-return
    return () => {
      isReadyRef.current = false;
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audio.pause();
      audio.src = '';
    };
  }, [trackPath, serverUrl]);

  const status = $.getMusicPlaybackStatus(getState());

  // Handle persisting of the audio playback on refresh.
  React.useEffect(() => {
    if ((status !== 'loading' && status !== 'playing') || !trackPath) {
      persistedState.musicPlaybackResume.remove();
      lastPersistedSnapshotRef.current = null;
      return;
    }

    persistPlaybackResume();

    const interval = window.setInterval(
      persistPlaybackResume,
      MUSIC_PLAYBACK_RESUME_INTERVAL_MS,
    );
    window.addEventListener('pagehide', persistPlaybackResume);

    // eslint-disable-next-line consistent-return
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('pagehide', persistPlaybackResume);
      persistPlaybackResume();
    };

    function persistPlaybackResume() {
      const currentTrackPath = trackPath;
      if (!serverId || !serverUrl || !currentTrackPath) {
        return;
      }

      const audio = audioRef.current;
      const time = audio ? audio.currentTime : currentTimeRef.current;
      const snapshotValue = {
        serverId,
        serverUrl,
        trackPath: currentTrackPath,
        currentTime: Math.max(0, Math.floor(time)),
        updatedAt: Date.now(),
      } satisfies MusicPlaybackResume;
      const snapshot = JSON.stringify(snapshotValue);

      if (snapshot === lastPersistedSnapshotRef.current) {
        return;
      }
      lastPersistedSnapshotRef.current = snapshot;
      persistedState.musicPlaybackResume.write(snapshotValue);
    }
  }, [serverId, serverUrl, status, trackPath]);

  // Responds to play/pause actions dispatched from outside the hook, such as
  // the Space key handler in the track list.
  React.useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (status === 'playing' && isReadyRef.current && audio.paused) {
      audio.play().catch(() => dispatch(A.musicPlaybackError()));
    } else if (status === 'paused' && !audio.paused) {
      audio.pause();
    } else if (status === 'idle' || status === 'error') {
      audio.pause();
    }
  }, [status]);

  React.useEffect(() => {
    return () => {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.src = '';
      }
    };
  }, []);

  return {
    currentTime,
    duration,
    volume,
    play() {
      dispatch(A.musicPlaybackPlay());
    },
    pause() {
      dispatch(A.musicPlaybackPause());
    },
    seek(time: number) {
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = time;
        currentTimeRef.current = time;
        setCurrentTime(time);
      }
    },
    setVolume(v: number) {
      setVolumeState(v);
      const audio = audioRef.current;
      if (audio) {
        audio.volume = v;
      }
    },
  };
}
