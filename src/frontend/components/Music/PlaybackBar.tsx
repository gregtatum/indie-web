import * as React from 'react';
import { $$ } from 'frontend';
import { useAudioPlayer } from 'frontend/hooks/useAudioPlayer';
import { useMediaSession } from 'frontend/hooks/useMediaSession';

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function PlaybackBar() {
  const status = $$.getMusicPlaybackStatus();
  const trackPath = $$.getMusicPlaybackTrackPath();
  const allTracks = $$.getMusicTracks();
  const { currentTime, duration, volume, play, pause, seek, setVolume } =
    useAudioPlayer();

  const track = trackPath
    ? (allTracks.find((t) => t.path === trackPath) ?? null)
    : null;
  const isPlaying = status === 'playing';

  useMediaSession({ status, track, play, pause });

  if (status === 'idle') {
    return null;
  }

  return (
    <div
      className="musicPlaybackBar"
      role="region"
      aria-label="Playback controls"
    >
      <div className="musicPlaybackTrackInfo">
        <span className="musicPlaybackTitle">{track?.title ?? trackPath}</span>
        <span className="musicPlaybackArtist">{track?.artist}</span>
      </div>
      <button
        type="button"
        aria-label={isPlaying ? 'Pause' : 'Play'}
        onClick={isPlaying ? pause : play}
        disabled={status === 'loading'}
      >
        {isPlaying ? 'Pause' : 'Play'}
      </button>
      <div className="musicPlaybackTime">
        <span>{formatTime(currentTime)}</span>
        <input
          type="range"
          aria-label="Seek"
          min={0}
          max={duration || 0}
          step={1}
          value={currentTime}
          onChange={(e) => seek(Number(e.target.value))}
        />
        <span>{formatTime(duration)}</span>
      </div>
      <label className="musicPlaybackVolume">
        Volume
        <input
          type="range"
          aria-label="Volume"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
        />
      </label>
    </div>
  );
}
