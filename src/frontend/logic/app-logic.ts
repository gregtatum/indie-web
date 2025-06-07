import { T } from 'frontend';
import { UnhandledCaseError, ensureExists, ensureNever } from '../utils';

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

export function getFileStoreDisplayName(
  fileStore: T.FileStoreName,
  server: T.FileStoreServer | null,
): string {
  switch (fileStore) {
    case 'dropbox':
      return 'Dropbox';
    case 'browser':
      return getBrowserName();
    case 'server':
      return ensureExists(
        server,
        'Expected the server to exist when viewing a file store server',
      ).name;
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
    case 'server':
      return 'server';
    default: {
      ensureNever(name);
      return null;
    }
  }
}

export function sortFiles(files: Array<T.FileMetadata | T.FolderMetadata>) {
  return files.slice().sort((a, b) => {
    let aType = a.type;
    let bType = b.type;

    // Treat language coach folders as files.
    if (a.name.endsWith('.coach')) {
      aType = 'file';
    }
    if (b.name.endsWith('.coach')) {
      bType = 'file';
    }
    if (aType !== bType) {
      return aType === 'folder' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}
