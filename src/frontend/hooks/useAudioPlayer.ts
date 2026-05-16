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
 * Manages audio playback for the music library using the Web Audio API.
 *
 * Playback state that other components need (the playing track path and status)
 * lives in Redux. High-frequency values that only the playback bar needs
 * (currentTime, duration, volume) are kept as local React state to avoid
 * store churn on every tick.
 *
 * When a new track is dispatched via musicPlaybackLoad, this hook fetches the
 * full audio file from the server, decodes it with AudioContext.decodeAudioData,
 * and begins playback immediately. Pausing and resuming work by stopping and
 * recreating AudioBufferSourceNode at the saved position, since that node type
 * cannot be paused directly. Seeking follows the same stop-and-restart approach.
 * Volume is routed through a persistent GainNode so it can be adjusted without
 * interrupting playback.
 *
 * The AudioContext is created lazily on the first play action to satisfy browser
 * autoplay policies, which require a user gesture before audio can start.
 */
export function useAudioPlayer(): AudioPlayerState {
  const { dispatch, getState } = Hooks.useStore();

  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const [volume, setVolumeState] = React.useState(1);

  const audioContextRef = React.useRef<AudioContext | null>(null);
  const gainNodeRef = React.useRef<GainNode | null>(null);
  const audioBufferRef = React.useRef<AudioBuffer | null>(null);
  const sourceNodeRef = React.useRef<AudioBufferSourceNode | null>(null);
  const pausePositionRef = React.useRef<number>(0);
  const playStartTimeRef = React.useRef<number>(0);
  const isPlayingRef = React.useRef<boolean>(false);
  const tickIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const volumeRef = React.useRef<number>(1);

  function getOrCreateContext(): AudioContext {
    if (!audioContextRef.current) {
      const ctx = new AudioContext();
      const gain = ctx.createGain();
      gain.gain.value = volumeRef.current;
      gain.connect(ctx.destination);
      audioContextRef.current = ctx;
      gainNodeRef.current = gain;
    }
    return audioContextRef.current;
  }

  function startTick(ctx: AudioContext) {
    if (tickIntervalRef.current !== null) return;
    tickIntervalRef.current = setInterval(() => {
      if (isPlayingRef.current) {
        setCurrentTime(ctx.currentTime - playStartTimeRef.current);
      }
    }, 250);
  }

  function stopTick() {
    if (tickIntervalRef.current !== null) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
  }

  function stopSourceNode() {
    isPlayingRef.current = false;
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
      } catch {}
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    stopTick();
  }

  function startPlayback(offset: number) {
    const ctx = getOrCreateContext();
    const buffer = audioBufferRef.current;
    if (!buffer) return;

    stopSourceNode();

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gainNodeRef.current!);
    source.start(0, offset);

    source.onended = () => {
      if (isPlayingRef.current) {
        isPlayingRef.current = false;
        dispatch(A.musicPlaybackStop());
      }
    };

    sourceNodeRef.current = source;
    playStartTimeRef.current = ctx.currentTime - offset;
    isPlayingRef.current = true;
    startTick(ctx);
  }

  const trackPath = $.getMusicPlaybackTrackPath(getState());
  const serverUrl = $.getCurrentServerOrNull(getState())?.url ?? '';

  // Fetch and decode audio whenever the track path or server URL changes.
  React.useEffect(() => {
    if (!trackPath || !serverUrl) return;

    let cancelled = false;
    stopSourceNode();
    audioBufferRef.current = null;
    pausePositionRef.current = 0;
    setCurrentTime(0);
    setDuration(0);

    const url = `${serverUrl}/music/stream-audio?path=${encodeURIComponent(trackPath)}`;

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((buf) => {
        if (cancelled) return null;
        return getOrCreateContext().decodeAudioData(buf);
      })
      .then((audioBuffer) => {
        if (cancelled || !audioBuffer) return;
        audioBufferRef.current = audioBuffer;
        setDuration(audioBuffer.duration);
        dispatch(A.musicPlaybackReady());
        startPlayback(0);
      })
      .catch(() => {
        if (!cancelled) dispatch(A.musicPlaybackError());
      });

    return () => {
      cancelled = true;
    };
  }, [trackPath, serverUrl]);

  const status = $.getMusicPlaybackStatus(getState());

  // Responds to play/pause actions dispatched from outside the hook, such as
  // the Space key handler in the song list.
  React.useEffect(() => {
    if (
      status === 'playing' &&
      !isPlayingRef.current &&
      audioBufferRef.current
    ) {
      startPlayback(pausePositionRef.current);
    } else if (status === 'paused' && isPlayingRef.current) {
      const ctx = audioContextRef.current;
      if (ctx) {
        pausePositionRef.current = ctx.currentTime - playStartTimeRef.current;
      }
      stopSourceNode();
    } else if (status === 'idle' || status === 'error') {
      stopSourceNode();
      pausePositionRef.current = 0;
    }
  }, [status]);

  React.useEffect(() => {
    return () => {
      stopSourceNode();
      audioContextRef.current?.close();
      audioContextRef.current = null;
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
      setCurrentTime(time);
      pausePositionRef.current = time;
      if (isPlayingRef.current) {
        startPlayback(time);
      }
    },
    setVolume(v: number) {
      setVolumeState(v);
      volumeRef.current = v;
      if (gainNodeRef.current) {
        gainNodeRef.current.gain.value = v;
      }
    },
  };
}
