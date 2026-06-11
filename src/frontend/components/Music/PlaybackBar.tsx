import * as React from 'react';
import { A, $$, Hooks } from 'frontend';
import { useAudioPlayer } from 'frontend/hooks/useAudioPlayer';
import { useMediaSession } from 'frontend/hooks/useMediaSession';
import { getTrackFilterArtist } from 'frontend/logic/music/metadata';

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
  const playbackQueue = $$.getMusicPlaybackQueue();
  const playbackQueuePanelSelections =
    $$.getMusicPlaybackQueuePanelSelections();
  const server = $$.getCurrentServer();
  const { currentTime, duration, volume, play, pause, seek, setVolume } =
    useAudioPlayer();

  const trackMetadata = trackPath
    ? (allTracks.find((t) => t.path === trackPath) ?? null)
    : null;

  const artUrl = trackMetadata?.coverArt
    ? `${server.url}/music/cover-art?path=${encodeURIComponent(trackMetadata.coverArt)}`
    : null;
  const isPlaying = musicPlaybackStatus === 'playing';

  const idx = playbackQueue.findIndex((t) => t.path === trackPath);
  const prevTrack =
    idx > 0
      ? () => dispatch(A.musicPlaybackLoad(playbackQueue[idx - 1].path))
      : undefined;
  const nextTrack =
    idx !== -1 && idx < playbackQueue.length - 1
      ? () => dispatch(A.musicPlaybackLoad(playbackQueue[idx + 1].path))
      : undefined;

  useMediaSession({
    musicPlaybackStatus,
    trackMetadata,
    play,
    pause,
  });

  function restorePanelSelections(
    panelSelections: Partial<Record<'genre' | 'artist' | 'album', string[]>>,
  ) {
    dispatch(A.setMusicPanelSelection('genre', panelSelections.genre));
    dispatch(A.setMusicPanelSelection('artist', panelSelections.artist));
    dispatch(A.setMusicPanelSelection('album', panelSelections.album));
  }

  function selectCurrentTrack() {
    if (trackMetadata) {
      dispatch(A.setMusicSelectedTracks([trackMetadata.path]));
    }
  }

  function handleTitleClick() {
    if (!trackMetadata) {
      return;
    }
    restorePanelSelections(playbackQueuePanelSelections);
    selectCurrentTrack();
  }

  function handleArtistClick() {
    if (!trackMetadata) {
      return;
    }
    const artist = getTrackFilterArtist(trackMetadata);
    dispatch(A.setMusicPanelSelection('genre'));
    dispatch(A.setMusicPanelSelection('artist', artist ? [artist] : undefined));
    dispatch(A.setMusicPanelSelection('album'));
    selectCurrentTrack();
  }

  function handleAlbumClick() {
    if (!trackMetadata) {
      return;
    }
    dispatch(A.setMusicPanelSelection('genre'));
    dispatch(A.setMusicPanelSelection('artist'));
    dispatch(
      A.setMusicPanelSelection(
        'album',
        trackMetadata.album ? [trackMetadata.album] : undefined,
      ),
    );
    selectCurrentTrack();
  }

  if (musicPlaybackStatus === 'idle') {
    return null;
  }

  return (
    <div
      className="musicPlaybackBar"
      role="region"
      aria-label="Playback controls"
    >
      <button
        type="button"
        className="musicPlaybackAlbumArt musicPlaybackAlbumArtButton"
        aria-label="Show album"
        onClick={handleAlbumClick}
        disabled={!trackMetadata}
      >
        {artUrl ? <img src={artUrl} alt="" /> : null}
      </button>

      <div className="musicPlaybackTrackInfo">
        {trackMetadata ? (
          <>
            <button
              type="button"
              className="musicPlaybackTitle musicPlaybackTrackButton"
              aria-label="Show playing track"
              onClick={handleTitleClick}
            >
              {trackMetadata.title ?? trackMetadata.path}
            </button>
            <button
              type="button"
              className="musicPlaybackArtist musicPlaybackTrackButton"
              aria-label={`Show ${trackMetadata.artist || 'artist'}`}
              onClick={handleArtistClick}
            >
              {trackMetadata.artist}
            </button>
          </>
        ) : (
          <span className="musicPlaybackTitle">{trackPath}</span>
        )}
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
            disabled={
              musicPlaybackStatus === 'loading' ||
              musicPlaybackStatus === 'error'
            }
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
