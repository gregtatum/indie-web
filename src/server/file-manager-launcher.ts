import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

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
