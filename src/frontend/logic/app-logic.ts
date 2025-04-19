import { T } from 'frontend';
import { UnhandledCaseError, ensureNever } from '../utils';

let browserName: string;
export function getBrowserName() {
  if (!browserName) {
    const { userAgent } = navigator;
    if (userAgent.includes('Firefox')) {
      browserName = 'Firefox Storage';
    } else if (userAgent.includes('Safari')) {
      browserName = 'Safari Storage';
    } else if (userAgent.includes('Chrome')) {
      browserName = 'Chrome Storage';
    } else if (userAgent.includes('Opera')) {
      browserName = 'Opera Storage';
    } else {
      browserName = 'Browser Storage';
    }
  }
  return browserName;
}

export function getFileSystemDisplayName(fileSystem: T.FileSystemName): string {
  switch (fileSystem) {
    case 'dropbox':
      return 'Dropbox';
    case 'browser':
      return getBrowserName();
    case 'file-store-server':
      throw new Error('The file store server should use the name property.');
    default:
      throw new UnhandledCaseError(fileSystem, 'FileSystemName');
  }
}

export function toFileSystemName(text: unknown): T.FileSystemName | null {
  // Type trickery to ensure we handle all of the cases.
  const name = text as T.FileSystemName;
  switch (name) {
    case 'dropbox':
      return 'dropbox';
    case 'browser':
      return 'browser';
    case 'file-store-server':
      return 'file-store-server';
    default: {
      ensureNever(name);
      return null;
    }
  }
}
