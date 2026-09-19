import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { basename } from 'node:path';
import { promises as fs, type Stats } from 'node:fs';
import { ClientError } from '../route-utils.ts';
import type { T } from '../index.ts';

const execFile = promisify(execFileCallback);

/**
 * Launches the OS's native file manager (Finder, Explorer, ...) with a given
 * file selected.
 */
export interface FileManagerLauncher {
  // Shown verbatim as the menu item text, e.g. "Show in Finder".
  label: string;
  reveal(path: string): Promise<void>;
}

/**
 * Only macOS and Windows get a launcher. Linux is intentionally omitted: the
 * servers this app runs as on Linux are almost always headless (Docker
 * containers, bare VPS instances) with no desktop session or file manager to
 * open into, and there's no reliable way to detect a desktop environment
 * from here. Rather than guess and fail, the feature is simply not offered.
 */
const fileManagerLaunchers: Partial<
  Record<NodeJS.Platform, FileManagerLauncher>
> = {
  darwin: {
    label: 'Show in Finder',
    async reveal(path) {
      await execFile('/usr/bin/open', ['-R', path]);
    },
  },
  win32: {
    label: 'Show in Explorer',
    async reveal(path) {
      try {
        await execFile('explorer.exe', ['/select,', path]);
      } catch (error: any) {
        // Explorer exits with a non-zero code even when it succeeds, so only
        // treat a failure to spawn it at all (e.g. missing binary) as real.
        if (error?.code === 'ENOENT') {
          throw error;
        }
      }
    },
  },
};

export function getFileManagerLauncher(): FileManagerLauncher | null {
  return fileManagerLaunchers[process.platform] ?? null;
}

/**
 * Checks that a folder exists and it is a directory, not a file.
 */
export async function doesFolderExist(path: string): Promise<boolean> {
  try {
    const stats = await fs.stat(path);
    return stats.isDirectory();
  } catch (error: any) {
    // Error NO ENTry
    if (error?.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

export function getMetadata(
  clientPath: string,
  stats: Stats,
): T.FolderMetadata | T.FileMetadata {
  return stats.isDirectory()
    ? getFolderMetadata(clientPath)
    : getFileMetadata(clientPath, stats);
}

export function getFolderMetadata(clientPath: string): T.FolderMetadata {
  return {
    type: 'folder',
    name: basename(clientPath),
    path: clientPath,
    id: `id:${clientPath}`,
  };
}

export function getFileMetadata(
  clientPath: string,
  stats: Stats,
): T.FileMetadata {
  return {
    type: 'file',
    name: basename(clientPath),
    path: clientPath,
    // The ID is used by Dropbox for some smarter tracking of individual files
    // as they are moved. We don't have this, so just set it to the path.
    id: `id:${clientPath}`,
    clientModified: stats.mtime.toISOString(),
    serverModified: stats.ctime.toISOString(),
    // Dropbox has revision tracking. Instead for our case, just do the last
    // modified time to simulate this feature.
    rev: `rev:${stats.mtime.getTime()}`,
    size: stats.size,
    isDownloadable: true,
    hash: '',
  };
}

export function parseHeaderRequest(
  metaHeader?: string,
): Record<string, string> {
  if (!metaHeader) {
    throw new ClientError('No File-Store-Request was provided.');
  }
  let metadata: unknown;
  try {
    metadata = JSON.parse(decodeURIComponent(metaHeader));
  } catch {
    throw new ClientError('Invalid JSON in the File-Store-Request.');
  }
  if (!metadata || typeof metadata !== 'object') {
    throw new ClientError('Expected the File-Store-Request to be an object.');
  }
  for (const [key, value] of Object.entries(metadata)) {
    if (typeof key !== 'string' || typeof value !== 'string') {
      throw new ClientError(
        'Expected all keys and values of the File-Store-Request to be strings.',
      );
    }
  }
  return metadata as Record<string, string>;
}
