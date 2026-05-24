import * as React from 'react';
import { A, $$, Hooks } from 'frontend';
import { useAudioPlayer } from 'frontend/hooks/useAudioPlayer';
import { useMediaSession } from 'frontend/hooks/useMediaSession';

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function PlaybackBar() {
  const dispatch = Hooks.useDispatch();
  const musicPlaybackStatus = $$.getMusicPlaybackStatus();
  const trackPath = $$.getMusicPlaybackTrackPath();
  const allTracks = $$.getMusicTracks();
  const filteredTracks = $$.getFilteredMusicTracks();
  const { currentTime, duration, volume, play, pause, seek, setVolume } =
    useAudioPlayer();

  const trackMetadata = trackPath
    ? (allTracks.find((t) => t.path === trackPath) ?? null)
    : null;
  const isPlaying = musicPlaybackStatus === 'playing';

  const idx = filteredTracks.findIndex((t) => t.path === trackPath);
  const prevTrack =
    idx > 0
      ? () => dispatch(A.musicPlaybackLoad(filteredTracks[idx - 1].path))
      : undefined;
  const nextTrack =
    idx !== -1 && idx < filteredTracks.length - 1
      ? () => dispatch(A.musicPlaybackLoad(filteredTracks[idx + 1].path))
      : undefined;

  useMediaSession({
    musicPlaybackStatus,
    trackMetadata,
    play,
    pause,
  });

  if (musicPlaybackStatus === 'idle') {
    return null;
  }

  return (
    <div
      className="musicPlaybackBar"
      role="region"
      aria-label="Playback controls"
    >
      <div className="musicPlaybackAlbumArt" aria-hidden="true" />

      <div className="musicPlaybackTrackInfo">
        <span className="musicPlaybackTitle">
          {trackMetadata?.title ?? trackPath}
        </span>
        <span className="musicPlaybackArtist">{trackMetadata?.artist}</span>
      </div>

      <div className="musicPlaybackControls">
        <div className="musicPlaybackButtons">
          <button
            type="button"
            className="musicPlaybackBtn"
            aria-label="Previous track"
            onClick={prevTrack}
            disabled={!prevTrack}
          >
            <img src="/svg/backward-step.svg" alt="" />
          </button>
          <button
            type="button"
            className="musicPlaybackBtn musicPlaybackPlayBtn"
            aria-label={isPlaying ? 'Pause' : 'Play'}
            onClick={isPlaying ? pause : play}
            disabled={musicPlaybackStatus === 'loading'}
          >
            <img src={isPlaying ? '/svg/pause.svg' : '/svg/play.svg'} alt="" />
          </button>
          <button
            type="button"
            className="musicPlaybackBtn"
            aria-label="Next track"
            onClick={nextTrack}
            disabled={!nextTrack}
          >
            <img src="/svg/forward-step.svg" alt="" />
          </button>
        </div>

        <div className="musicPlaybackScrubber">
          <span className="musicPlaybackTime">{formatTime(currentTime)}</span>
          <input
            type="range"
            className="musicPlaybackSeek"
            aria-label="Seek"
            min={0}
            max={duration || 0}
            step={1}
            value={currentTime}
            onChange={(e) => seek(Number(e.target.value))}
          />
          <span className="musicPlaybackTime">{formatTime(duration)}</span>
        </div>
      </div>

      <div className="musicPlaybackVolume">
        <img src="/svg/volume-max.svg" alt="" />
        <input
          type="range"
          className="musicPlaybackVolumeSlider"
          aria-label="Volume"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
        />
      </div>
    </div>
  );
}
