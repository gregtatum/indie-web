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

export function getFileStoreDisplayName(fileStore: T.FileStoreName): string {
  switch (fileStore) {
    case 'dropbox':
      return 'Dropbox';
    case 'browser':
      return getBrowserName();
    case 'file-store-server':
      throw new Error('The file store server should use the name property.');
    default:
      throw new UnhandledCaseError(fileStore, 'FileStoreName');
  }
}

export function toFileStoreName(text: unknown): T.FileStoreName | null {
  // Type trickery to ensure we handle all of the cases.
  const name = text as T.FileStoreName;
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
