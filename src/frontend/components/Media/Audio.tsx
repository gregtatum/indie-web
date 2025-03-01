import * as React from 'react';
import { Hooks } from 'frontend';

type AudioProps = {
  folderPath: string;
  line: { type: 'audio'; lineIndex: number; src: string; mimetype: string };
};

let _playerId = 0;
let _activePlayerId = -1;
let _makePreviousPlayerInactive: (() => void) | void;

export function MediaAudio(props: AudioProps) {
  const { folderPath, line } = props;
  const {
    togglePlay,
    is404,
    audio,
    path,
    isPlaying,
    duration,
    name,
    isLoadRequested,
  } = Hooks.useAudio(folderPath, line);
  const canvasRef = React.useRef<null | HTMLCanvasElement>(null);
  const wrapperRef = React.useRef<null | HTMLDivElement>(null);
  const playerId = React.useMemo(() => _playerId++, []);
  const [isActivePlayer, setIsActivePlayer] = React.useState(false);

  // Only allow one audio player to be active at a time.
  React.useEffect(() => {
    if (!isPlaying || !audio) {
      return () => {};
    }
    setIsActivePlayer(true);
    _activePlayerId = playerId;
    if (_makePreviousPlayerInactive && _activePlayerId !== playerId) {
      _makePreviousPlayerInactive();
    }
    _makePreviousPlayerInactive = () => {
      audio.pause();
      setIsActivePlayer(false);
    };
    return () => {
      if (_activePlayerId === playerId) {
        _makePreviousPlayerInactive = undefined;
      }
    };
  }, [isPlaying, audio]);

  // Stop the audio when the component is unloaded.
  React.useEffect(() => {
    return () => {
      audio?.pause();
    };
  }, [audio]);

  if (is404) {
    return <div className="mediaMissing">Missing audio file: {path}</div>;
  }

  let className = 'mediaAudio';
  if (isActivePlayer) {
    className += ' active';
  }
  return (
    <div className={className} data-load-requested={isLoadRequested}>
      <div className="mediaAudioWave" ref={wrapperRef}>
        <AudioWaveform audio={audio} canvasRef={canvasRef} />
        <Scrubbers
          audio={audio}
          canvasRef={canvasRef}
          wrapperRef={wrapperRef}
        />
      </div>
      <div className="mediaAudioControls">
        <button
          className="mediaAudioControlsPlay"
          type="button"
          aria-label={isPlaying ? 'Pause' : 'Play'}
          onClick={togglePlay}
        >
          <span
            data-icon-mask={isPlaying ? 'pause' : 'play'}
            className="icon-mask"
          ></span>
        </button>
        <div className="mediaAudioControlsSpacer"></div>
        <div className="mediaAudioControlsName">{name}</div>
        <div className="mediaAudioControlsDuration">{duration}</div>
      </div>
    </div>
  );
}

function getWaveform(audioBuffer: AudioBuffer, size: number) {
  performance.mark('Chords: getWaveform');
  const leftChannel = audioBuffer.getChannelData(0);
  const rightChannel = audioBuffer.getChannelData(1);

  const waveform: number[] = [];
  const window = Math.floor(leftChannel.length / size);
  let sum = 0;
  let maxWaveHeight = 0;
  for (let i = 0; i < leftChannel.length; i++) {
    sum += Math.abs(leftChannel[i]);
    sum += Math.abs(rightChannel[i]);

    if (i % window === window - 1) {
      const value = sum / window;
      waveform[Math.floor(i / window)] = value;
      sum = 0;
      maxWaveHeight = Math.max(maxWaveHeight, value);
    }
  }
  return {
    waveform: applyGaussianBlur(waveform, 5),
    waveformBlurred: applyGaussianBlur(waveform, 20),
    maxWaveHeight,
  };
}

function applyGaussianBlur(numbers: number[], kernelSize: number): number[] {
  const kernel = createGaussianKernel(kernelSize);
  const result: number[] = [];

  const halfKernelSize = Math.round(kernelSize / 2);
  let sum = 0;
  let numberIndex = 0;
  let kernelIndex = 0;

  while (numberIndex < numbers.length) {
    let lookupIndex = numberIndex - halfKernelSize + kernelIndex;
    // Keep the lookup in range.
    lookupIndex = Math.max(lookupIndex, 0);
    lookupIndex = Math.min(lookupIndex, numbers.length);

    // The sum should never get over 1 here.
    sum += kernel[kernelIndex] * numbers[lookupIndex];

    kernelIndex++;

    // The end of the kernel is reached, start on the next number.
    if (kernelIndex === kernelSize) {
      result[numberIndex] = sum;
      numberIndex++;
      sum = 0;
      kernelIndex = 0;
    }
  }

  return result;
}

function createGaussianKernel(n: number): number[] {
  const sigma = n / 6;
  const mean = (n - 1) / 2;
  const kernel: number[] = [];

  for (let i = 0; i < n; i++) {
    kernel.push(
      (1 / (Math.sqrt(2 * Math.PI) * sigma)) *
        Math.exp(-((i - mean) ** 2) / (2 * sigma ** 2)),
    );
  }

  const sum = kernel.reduce((a, b) => a + b, 0);
  return kernel.map((x) => x / sum);
}

interface WaveformProps {
  audio: HTMLAudioElement | null;
  canvasRef: React.RefObject<HTMLCanvasElement>;
}

function AudioWaveform(props: WaveformProps) {
  const { audio, canvasRef } = props;
  const ctx = Hooks.useContext2D(canvasRef);
  const activeColor = '#ce1ebb55';

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    let { width, height } = canvas.getBoundingClientRect();
    width *= devicePixelRatio;
    height *= devicePixelRatio;
    canvas.width = width;
    canvas.height = height;
  }, [canvasRef]);

  // Draw a wave form.
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ctx) {
      return;
    }

    const { width, height } = canvas;
    if (!audio) {
      ctx.fillStyle = activeColor;
      for (let x = 0; x < width; x++) {
        const wavePosition = Math.PI * (x / width) * 10;
        const y = (Math.cos(wavePosition) * 0.5 + 0.5) * height;
        ctx.fillRect(x, y, 1, height - y);
      }
      return;
    }
    performance.mark('Chords: start effect');

    // The metadata must be loaded in order to draw the wave form.
    audio.addEventListener('loadedmetadata', async () => {
      performance.mark('Chords: loadedmetadata');
      const audioContext = new AudioContext();

      performance.mark('Chords: Fetch array buffer');
      // audio.src should be a blob URL.
      const buffer = await fetch(audio.src).then((r) => r.arrayBuffer());
      performance.mark('Chords: Decode audio data');
      const audioBuffer = await audioContext.decodeAudioData(buffer);
      const { waveform, waveformBlurred, maxWaveHeight } = getWaveform(
        audioBuffer,
        width,
      );

      // Clear out the color.
      ctx.clearRect(0, 0, width, height);

      ctx.fillStyle = '#aaa';
      for (let x = 0; x < waveform.length; x++) {
        const y = (1 - waveform[x] / maxWaveHeight) * height;
        ctx.fillRect(x, y, 1, height);
      }

      ctx.fillStyle = '#ce1ebb55';
      for (let x = 0; x < waveformBlurred.length; x++) {
        const y = (1 - waveformBlurred[x] / maxWaveHeight) * height;
        ctx.fillRect(x, y, 1, height);
      }
    });
  }, [canvasRef, ctx, audio]);

  return <canvas style={{ width: '100%', height: '100px' }} ref={canvasRef} />;
}

interface ScrubbersProps {
  audio: HTMLAudioElement | null;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  wrapperRef: React.RefObject<HTMLDivElement>;
}

function Scrubbers(props: ScrubbersProps) {
  const { audio, wrapperRef } = props;
  const audioRef = Hooks.propToRef(audio);
  const playPositionRef = React.useRef<HTMLDivElement | null>(null);
  const hoverPositionRef = React.useRef<HTMLDivElement | null>(null);
  const horizontalLineRef = React.useRef<HTMLDivElement | null>(null);
  const touchIdRef = React.useRef<number | null>(null);
  const isMouseDownRef = React.useRef(false);

  function hideHover() {
    const hoverEl = hoverPositionRef.current;
    if (!hoverEl) {
      return;
    }
    hoverEl.style.left = '-10px';
  }

  function toSongRatio(clientX: number): number {
    const wrapperEl = wrapperRef.current;
    if (!wrapperEl) {
      return 0;
    }
    const { width, left } = wrapperRef.current.getBoundingClientRect();
    const ratio = (clientX - left) / width;
    if (ratio > 1) {
      return 1;
    }
    if (ratio < 0) {
      return 0;
    }
    if (Number.isNaN(ratio)) {
      console.error(
        new Error(
          `A NaN song ratio was computed: (${clientX} - ${left}) / ${width}`,
        ),
      );
      return 0;
    }
    return ratio;
  }

  function moveHover(clientX: number) {
    const hoverEl = hoverPositionRef.current;
    if (!hoverEl) {
      return;
    }
    hoverEl.style.left = (toSongRatio(clientX) * 100).toFixed(2) + '%';
  }

  function adjustAudioTime(clientX: number) {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.currentTime = audio.duration * toSongRatio(clientX);
  }

  const invalidate = [audio];

  Hooks.useListener(wrapperRef, 'mousedown', invalidate, (event) => {
    adjustAudioTime((event as MouseEvent).clientX);
    isMouseDownRef.current = true;
  });

  Hooks.useListener(wrapperRef, 'mouseout', invalidate, () => {
    hideHover();
    isMouseDownRef.current = false;
  });

  Hooks.useListener(wrapperRef, 'mousemove', invalidate, (event) => {
    const { clientX } = event as MouseEvent;
    moveHover(clientX);
    if (isMouseDownRef.current) {
      event.preventDefault();
      adjustAudioTime(clientX);
    }
  });

  Hooks.useListener(wrapperRef, 'mouseup', invalidate, (event) => {
    const { clientX } = event as MouseEvent;
    if (isMouseDownRef.current) {
      adjustAudioTime(clientX);
      isMouseDownRef.current = false;
    }
  });

  Hooks.useListener(wrapperRef, 'touchstart', invalidate, (event) => {
    const { touches } = event as TouchEvent;
    if (touches.length > 1) {
      return;
    }
    const [touch] = (event as TouchEvent).touches;
    touchIdRef.current = touch.identifier;
    moveHover(touch.clientX);
    adjustAudioTime(touch.clientX);
  });

  Hooks.useListener(wrapperRef, 'touchend', invalidate, (event) => {
    for (const touch of (event as TouchEvent).changedTouches) {
      if (touch.identifier === touchIdRef.current) {
        touchIdRef.current = null;
        hideHover();
        adjustAudioTime(touch.clientX);
      }
    }
  });

  Hooks.useListener(
    wrapperRef,
    'touchmove',
    invalidate,
    (event) => {
      for (const touch of (event as TouchEvent).touches) {
        if (touch.identifier === touchIdRef.current) {
          event.preventDefault();
          event.stopImmediatePropagation();
          moveHover(touch.clientX);
          adjustAudioTime(touch.clientX);
        }
      }
    },
    true, // capture
  );

  Hooks.useListener(audio, 'timeupdate', invalidate, (event) => {
    if (!horizontalLineRef.current || !playPositionRef.current) {
      return;
    }
    const { duration, currentTime } = event.target as HTMLAudioElement;
    const width = `${((currentTime / duration) * 100).toFixed(2)}%`;
    horizontalLineRef.current.style.width = width;
    playPositionRef.current.style.left = width;
  });

  return (
    <>
      <div
        className="mediaAudioScrubberPlayPosition"
        ref={playPositionRef}
      ></div>
      <div className="mediaAudioScrubberHorizontalLine">
        <div ref={horizontalLineRef}></div>
      </div>
      <div
        className="mediaAudioScrubberHoverPosition"
        ref={hoverPositionRef}
      ></div>
    </>
  );
}
