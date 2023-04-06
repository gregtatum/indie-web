import * as React from 'react';
import { Hooks } from 'src';
import { ensureExists } from 'src/utils';

type Props = {
  folderPath: string;
  line: { type: 'audio'; lineIndex: number; src: string; mimetype: string };
};

export function MediaAudio({
  folderPath,
  line,
  ...props
}: React.AudioHTMLAttributes<HTMLAudioElement> & Props) {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const { play, is404, isLoaded, path, src } = Hooks.useMedia(
    folderPath,
    line,
    audioRef,
    getEmptyMediaUrl,
  );

  // Draw a wave form.
  React.useEffect(() => {
    if (line.type !== 'audio') {
      return;
    }
    if (!audioRef.current || !canvasRef.current) {
      return;
    }
    if (!isLoaded) {
      return;
    }
    const audio = audioRef.current;
    const canvas = canvasRef.current;
    performance.mark('Chords: start effect');

    // The metadata must be loaded in order to draw the wave form.
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    audio.addEventListener('loadedmetadata', async () => {
      performance.mark('Chords: loadedmetadata');
      const audioContext = new AudioContext();

      let { width, height } = canvas.getBoundingClientRect();
      width *= devicePixelRatio;
      height *= devicePixelRatio;
      canvas.width = width;
      canvas.height = height;

      const ctx = ensureExists(canvas.getContext('2d'));
      // Provie a filled in color.
      ctx.fillStyle = '#ccc';
      ctx.fillRect(0, 0, width, height);

      performance.mark('Chords: Fetch array buffer');
      const buffer = await fetch(src).then((r) => r.arrayBuffer());
      performance.mark('Chords: Decode audio data');
      const audioBuffer = await audioContext.decodeAudioData(buffer);
      const { waveform, waveformBlurred, maxWaveHeight } = getWaveform(
        audioBuffer,
        width,
      );

      // Clear out the color.
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = '#aaa';
      for (let x = 0; x < waveform.length; x++) {
        const y = (1 - waveform[x] / maxWaveHeight) * ctx.canvas.height;
        ctx.fillRect(x, y, 1, ctx.canvas.height);
      }

      ctx.fillStyle = '#ce1ebb55';
      for (let x = 0; x < waveformBlurred.length; x++) {
        const y = (1 - waveformBlurred[x] / maxWaveHeight) * ctx.canvas.height;
        ctx.fillRect(x, y, 1, ctx.canvas.height);
      }
    });
  }, [line, isLoaded]);

  if (is404) {
    return <div className="mediaMissing">Missing audio file: {path}</div>;
  }

  return (
    <>
      {isLoaded ? (
        <canvas style={{ width: '100%', height: '100px' }} ref={canvasRef} />
      ) : null}
      <audio
        className="mediaAudio"
        ref={audioRef}
        controls
        {...props}
        src={src}
        onError={(event) => {
          console.error((event.target as HTMLAudioElement).error);
        }}
        onPlaying={play}
      />
    </>
  );
}

let _emptyAudio: string;
function getEmptyMediaUrl() {
  if (!_emptyAudio) {
    // Lazily initialize the audio.
    _emptyAudio =
      'data:audio/x-wav;base64,UklGRooWAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YWYW' +
      'A'.repeat(7000);
  }

  return _emptyAudio;
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
