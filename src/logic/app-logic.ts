import { T } from 'src';
import { UnhandledCaseError } from '../utils';

let browserName: string;
export function getBrowserName() {
  if (!browserName) {
    const { userAgent } = navigator;
    if (userAgent.includes('Firefox')) {
      browserName = 'Firefox';
    } else if (userAgent.includes('Safari')) {
      browserName = 'Safari';
    } else if (userAgent.includes('Chrome')) {
      browserName = 'Chrome';
    } else if (userAgent.includes('Opera')) {
      browserName = 'Opera';
    } else {
      browserName = 'Your Browser';
    }
  }
  return browserName;
}

export function getFileSystemDisplayName(fileSystem: T.FileSystemName): string {
  switch (fileSystem) {
    case 'dropbox':
      return 'Dropbox';
    case 'indexeddb':
      return getBrowserName();
    default:
      throw new UnhandledCaseError(fileSystem, 'FileSystemName');
  }
}
