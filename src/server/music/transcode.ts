import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { basename, dirname, extname } from 'node:path';
import { parseFile } from 'music-metadata';
import {
  IMPORT_BITRATE_TOLERANCE_PERCENT,
  IMPORT_QUALITY_LEVELS,
  LOSSY_FORMATS,
  type ImportQualitySettings,
  type LossyFormat,
  type MaximumQuality,
} from '../../shared/music.ts';
import { ClientError, type MountPath } from '../route-utils.ts';
import { MUSIC_STAGING_DIRNAME, isUnderClientPath } from './logic.ts';
import { runFfmpeg } from './ffmpeg.ts';

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

function isInStaging(mountPath: MountPath, fullPath: string): boolean {
  const clientPath = mountPath.toClientPath(fullPath);
  return (
    clientPath !== null &&
    isUnderClientPath(clientPath, `/${MUSIC_STAGING_DIRNAME}`)
  );
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
  targetPath: string,
  source: SourceAudio,
  plan: ConversionPlan,
): Promise<void> {
  const tempPath = joinWithinMount(
    mountPath,
    dirname(targetPath),
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
    await assertDestinationFree(targetPath);
    await fs.rename(tempPath, targetPath);
  } catch (error) {
    await fs.rm(tempPath, { force: true });
    throw error;
  }
}

async function assertDestinationFree(targetPath: string): Promise<void> {
  if (await pathExists(targetPath)) {
    throw new ClientError(
      `A file already exists at ${basename(targetPath)} in the destination.`,
    );
  }
}

export async function importStagedTrack(
  mountPath: MountPath,
  fromClientPath: string,
  toClientPath: string,
  settings: ImportQualitySettings,
): Promise<string> {
  const sourcePath = mountPath.resolve(fromClientPath);
  const requestedPath = mountPath.resolve(toClientPath);
  if (!sourcePath || !requestedPath) {
    throw new ClientError('Invalid path.');
  }
  if (!isInStaging(mountPath, sourcePath)) {
    throw new ClientError('Only staged tracks can be organized.');
  }
  if (isInStaging(mountPath, requestedPath)) {
    throw new ClientError('Tracks cannot be organized into the staging area.');
  }
  const extension = extname(sourcePath).toLowerCase();
  if (!KIND_BY_EXTENSION[extension]) {
    throw new ClientError('Unsupported audio file type.');
  }
  if (extname(requestedPath).toLowerCase() !== extension) {
    throw new ClientError('The destination must keep the same file type.');
  }

  const source = await probeSource(sourcePath);
  const plan = source && planConversion(source, settings);
  let targetPath = requestedPath;
  let targetClientPath = toClientPath;
  if (plan) {
    targetPath = joinWithinMount(
      mountPath,
      dirname(requestedPath),
      `${basename(requestedPath, extname(requestedPath))}${plan.extension}`,
    );
    targetClientPath = `${toClientPath.slice(0, -extension.length)}${plan.extension}`;
  }

  await assertDestinationFree(targetPath);
  await fs.mkdir(dirname(targetPath), { recursive: true });
  if (source && plan) {
    try {
      await convertFile(mountPath, sourcePath, targetPath, source, plan);
    } catch (error) {
      if (error instanceof ClientError) {
        throw error;
      }
      const reason = error instanceof Error ? error.message : String(error);
      throw new ClientError(
        `Could not convert ${basename(sourcePath)}: ${reason}`,
      );
    }
    await fs.rm(sourcePath);
  } else {
    await fs.rename(sourcePath, targetPath);
  }
  return targetClientPath;
}
