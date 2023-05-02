import * as React from 'react';
import { Hooks } from 'src';
import { ensureExists } from 'src/utils';

type AudioProps = {
  folderPath: string;
  line: { type: 'audio'; lineIndex: number; src: string; mimetype: string };
};

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

  if (is404) {
    return <div className="mediaMissing">Missing audio file: {path}</div>;
  }

  return (
    <div className="mediaAudio" data-load-requested={isLoadRequested}>
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
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
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
  const playPositionRef = React.useRef<HTMLDivElement | null>(null);
  const hoverPositionRef = React.useRef<HTMLDivElement | null>(null);
  const horizontalLineRef = React.useRef<HTMLDivElement | null>(null);
  const hoverRatio = React.useRef<number>(0);

  Hooks.useListener(wrapperRef.current, ['mouseout'], () => {
    const hoverEl = hoverPositionRef.current;
    if (!hoverEl) {
      return;
    }
    hoverEl.style.left = '-10px';
  });

  Hooks.useListener(wrapperRef.current, 'mousemove', (event) => {
    const wrapperEl = wrapperRef.current;
    const hoverEl = hoverPositionRef.current;
    if (!wrapperEl || !hoverEl) {
      return;
    }
    const { clientX } = event as MouseEvent;
    const { width, left } = wrapperEl.getBoundingClientRect();
    const songRatio = (clientX - left) / width;
    hoverRatio.current = songRatio;
    hoverEl.style.left = (songRatio * 100).toFixed(2) + '%';
  });

  Hooks.useListener(
    wrapperRef.current,
    ['mousedown', 'touchstart'],
    () => {
      if (!audio) {
        return;
      }
      audio.currentTime = audio.duration * hoverRatio.current;
    },
    [audio],
  );

  Hooks.useListener(audio, 'timeupdate', (event) => {
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
