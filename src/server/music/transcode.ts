import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { availableParallelism } from 'node:os';
import { basename, dirname, extname, posix } from 'node:path';
import { parseFile } from 'music-metadata';
import {
  IMPORT_BITRATE_TOLERANCE_PERCENT,
  IMPORT_QUALITY_LEVELS,
  LOSSY_FORMATS,
  type ImportQualitySettings,
  type LossyFormat,
  type MaximumQuality,
} from '../../shared/music.ts';
import type { MountPath } from '../route-utils.ts';
import { runFfmpeg } from './ffmpeg.ts';

const MIN_CONCURRENT_CONVERSIONS = 1;
const MAX_CONCURRENT_CONVERSIONS = 4;
const DURATION_TOLERANCE_SECONDS = 1;
const CD_SAMPLE_RATE = 44_100;
const CD_BITS_PER_SAMPLE = 16;

type SourceKind = 'flac' | LossyFormat;
type LossyLevel = Exclude<MaximumQuality, 'original' | 'lossless'>;

const KIND_BY_EXTENSION: Record<string, SourceKind> = {
  '.flac': 'flac',
  '.m4a': 'm4a',
  '.mp3': 'mp3',
};

const MP3_VBR_QUALITY: Record<LossyLevel, number> = {
  high: 0,
  standard: 4,
  compact: 5,
};

export interface SourceAudio {
  kind: SourceKind;
  lossless: boolean;
  durationSeconds: number | null;
  bitrateKbps: number | null;
  sampleRate: number | null;
  bitsPerSample: number | null;
}

export interface ConversionPlan {
  extension: string;
  encoderArgs: string[];
}

export interface StagedConversionResult {
  paths: string[];
  renamed: Map<string, string>;
  errors: Array<{ path: string; message: string }>;
}

export function parseImportQualitySettings(
  value: unknown,
): ImportQualitySettings | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const { maximumQuality, lossyFormat } = value as Record<string, unknown>;
  const level = IMPORT_QUALITY_LEVELS.find(({ id }) => id === maximumQuality);
  const format = LOSSY_FORMATS.find(({ id }) => id === lossyFormat);
  return level && format
    ? { maximumQuality: level.id, lossyFormat: format.id }
    : null;
}

export function planConversion(
  source: SourceAudio,
  settings: ImportQualitySettings,
): ConversionPlan | null {
  const { maximumQuality } = settings;
  if (maximumQuality === 'original') {
    return null;
  }
  if (maximumQuality === 'lossless') {
    const exceedsCdQuality =
      (source.bitsPerSample ?? 0) > CD_BITS_PER_SAMPLE ||
      (source.sampleRate ?? 0) > CD_SAMPLE_RATE;
    return source.kind === 'flac' && exceedsCdQuality ? cdQualityFlac() : null;
  }

  const maxKbps = IMPORT_QUALITY_LEVELS.find(
    ({ id }) => id === maximumQuality,
  )?.maxKbps;
  if (!maxKbps) {
    return null;
  }
  if (source.lossless) {
    return lossyPlan(settings.lossyFormat, maximumQuality, maxKbps);
  }
  if (source.kind === 'flac' || source.bitrateKbps === null) {
    return null;
  }
  const limitKbps = maxKbps * (1 + IMPORT_BITRATE_TOLERANCE_PERCENT / 100);
  return source.bitrateKbps > limitKbps
    ? lossyPlan(source.kind, maximumQuality, maxKbps)
    : null;
}

function cdQualityFlac(): ConversionPlan {
  return {
    extension: '.flac',
    encoderArgs: [
      '-c:a',
      'flac',
      '-af',
      `aresample=osr=${CD_SAMPLE_RATE}:osf=s16:dither_method=triangular`,
    ],
  };
}

function lossyPlan(
  format: LossyFormat,
  level: LossyLevel,
  maxKbps: number,
): ConversionPlan {
  if (format === 'm4a') {
    return {
      extension: '.m4a',
      encoderArgs: ['-c:a', 'aac', '-b:a', `${maxKbps}k`],
    };
  }
  return {
    extension: '.mp3',
    encoderArgs: [
      '-c:a',
      'libmp3lame',
      '-q:a',
      String(MP3_VBR_QUALITY[level]),
      '-id3v2_version',
      '3',
    ],
  };
}

async function probeSource(fullPath: string): Promise<SourceAudio | null> {
  const kind = KIND_BY_EXTENSION[extname(fullPath).toLowerCase()];
  if (!kind) {
    return null;
  }
  try {
    const { format } = await parseFile(fullPath, { duration: true });
    return {
      kind,
      lossless: format.lossless ?? kind === 'flac',
      durationSeconds: format.duration ?? null,
      bitrateKbps: format.bitrate ? format.bitrate / 1000 : null,
      sampleRate: format.sampleRate ?? null,
      bitsPerSample: format.bitsPerSample ?? null,
    };
  } catch {
    return null;
  }
}

function joinWithinMount(mountPath: MountPath, ...parts: string[]): string {
  const joined = mountPath.joinWithinMount(...parts);
  if (!joined) {
    throw new Error('The path escapes the mount.');
  }
  return joined;
}

async function pathExists(fullPath: string): Promise<boolean> {
  try {
    await fs.access(fullPath);
    return true;
  } catch {
    return false;
  }
}

async function chooseTargetPath(
  mountPath: MountPath,
  sourcePath: string,
  extension: string,
): Promise<string> {
  const dir = dirname(sourcePath);
  const stem = basename(sourcePath, extname(sourcePath));
  const preferred = joinWithinMount(mountPath, dir, `${stem}${extension}`);
  if (preferred === sourcePath) {
    return preferred;
  }
  let candidate = preferred;
  for (let n = 2; await pathExists(candidate); n++) {
    candidate = joinWithinMount(mountPath, dir, `${stem} (${n})${extension}`);
  }
  return candidate;
}

async function verifyConverted(
  tempPath: string,
  sourceDurationSeconds: number | null,
): Promise<void> {
  const { format } = await parseFile(tempPath, { duration: true });
  if (
    sourceDurationSeconds !== null &&
    Math.abs((format.duration ?? 0) - sourceDurationSeconds) >
      DURATION_TOLERANCE_SECONDS
  ) {
    throw new Error('The converted file is not the same length.');
  }
}

async function convertFile(
  mountPath: MountPath,
  sourcePath: string,
  source: SourceAudio,
  plan: ConversionPlan,
): Promise<string> {
  const targetPath = await chooseTargetPath(
    mountPath,
    sourcePath,
    plan.extension,
  );
  const tempPath = joinWithinMount(
    mountPath,
    dirname(sourcePath),
    `.converting-${randomUUID()}${plan.extension}`,
  );
  try {
    await runFfmpeg(
      [
        '-i',
        sourcePath,
        '-map',
        '0:a:0',
        '-map',
        '0:v?',
        '-c:v',
        'copy',
        '-disposition:v',
        'attached_pic',
        '-map_metadata',
        '0',
        ...plan.encoderArgs,
        tempPath,
      ],
      'transcode',
    );
    await verifyConverted(tempPath, source.durationSeconds);
    await fs.rename(tempPath, targetPath);
  } catch (error) {
    await fs.rm(tempPath, { force: true });
    throw error;
  }
  if (targetPath !== sourcePath) {
    await fs.rm(sourcePath);
  }
  return targetPath;
}

/**
 * Converts staged tracks in place according to the import quality settings.
 * A track that cannot be converted stays as imported and is reported in
 * `errors`, so one bad file never blocks the rest of an import.
 */
export async function convertStagedTracks(
  mountPath: MountPath,
  clientPaths: string[],
  settings: ImportQualitySettings,
): Promise<StagedConversionResult> {
  const result: StagedConversionResult = {
    paths: [...clientPaths],
    renamed: new Map(),
    errors: [],
  };
  if (settings.maximumQuality === 'original') {
    return result;
  }

  async function convertOne(index: number): Promise<void> {
    const clientPath = clientPaths[index];
    const sourcePath = mountPath.resolve(clientPath);
    if (!sourcePath) {
      return;
    }
    const source = await probeSource(sourcePath);
    const plan = source && planConversion(source, settings);
    if (!source || !plan) {
      return;
    }
    try {
      const targetPath = await convertFile(mountPath, sourcePath, source, plan);
      const converted = posix.join(
        posix.dirname(clientPath),
        basename(targetPath),
      );
      result.paths[index] = converted;
      result.renamed.set(clientPath, converted);
    } catch (error) {
      result.errors.push({
        path: clientPath,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  let workerCount = availableParallelism() - 1;
  if (workerCount < MIN_CONCURRENT_CONVERSIONS) {
    workerCount = MIN_CONCURRENT_CONVERSIONS;
  }
  if (workerCount > MAX_CONCURRENT_CONVERSIONS) {
    workerCount = MAX_CONCURRENT_CONVERSIONS;
  }
  if (workerCount > clientPaths.length) {
    workerCount = clientPaths.length;
  }

  let next = 0;
  async function runWorker(): Promise<void> {
    while (next < clientPaths.length) {
      await convertOne(next++);
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < workerCount; i++) {
    workers.push(runWorker());
  }
  await Promise.all(workers);
  return result;
}
