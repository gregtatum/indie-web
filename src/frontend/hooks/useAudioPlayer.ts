import * as React from 'react';
import { A, $, Hooks } from 'frontend';

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
  // Tracks whether the current src has loaded enough data to call play().
  const isReadyRef = React.useRef(false);

  function getAudio(): HTMLAudioElement {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.volume = 1;
      audioRef.current = audio;
    }
    return audioRef.current;
  }

  const trackPath = $.getMusicPlaybackTrackPath(getState());
  const serverUrl = $.getCurrentServerOrNull(getState())?.url ?? '';

  React.useEffect(() => {
    if (!trackPath || !serverUrl) {
      return;
    }

    const audio = getAudio();
    isReadyRef.current = false;
    setCurrentTime(0);
    setDuration(0);

    audio.src = `${serverUrl}/music/stream-audio?path=${encodeURIComponent(trackPath)}`;
    audio.load();

    function onLoadedMetadata() {
      if (isFinite(audio.duration)) {
        setDuration(audio.duration);
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
    }

    function onTimeUpdate() {
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
