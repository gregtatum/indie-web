import { ApiRoute, ClientError, RequestConflict } from './utils.ts';
import { type T } from './index.ts';
import { resolve, join } from 'node:path';
import { promises as fs } from 'node:fs';

interface ListFilesRequest {
  path: string;
}

/**
 * The mount path should not have
 */
export function setupFsServer(mountPath: string) {
  const route = new ApiRoute();

  if (mountPath[mountPath.length - 1] === '/') {
    throw new Error('The mount path should not end in a trailing slash.');
  }

  route.get('/', async (): Promise<{ routes: string[] }> => {
    return { routes: route.routes.map((r) => r.toString()) };
  });

  /**
   * List files that are within the mounted file store.
   */
  route.post('/list-files', async (request): Promise<T.FolderListing> => {
    let path = request.body?.path;
    if (typeof path !== 'string') {
      throw new ClientError('The path for the file listing was not sent.');
    }
    if (path.startsWith('/')) {
      // Convert an absolute path to a relative one.
      path = '.' + path;
    }
    const listFilesRequest: ListFilesRequest = { path };

    let resolvedPath = resolve(mountPath, listFilesRequest.path);
    if (resolvedPath + '/' === mountPath) {
      // Add the trailing slash if it's missing.
      resolvedPath = mountPath;
    }

    if (!resolvedPath.startsWith(mountPath)) {
      console.error('Resolved path:', resolvedPath);
      throw new ClientError(
        'Invalid path: Access outside of the mount is not allowed.',
      );
    }

    if (!isFolder(resolvedPath)) {
      throw new RequestConflict(
        'The requested path was not a folder: ' + resolvedPath,
      );
    }

    // Since the folder exists, any errors listing the files will be a server error.
    // "stat"ing the indiviual files is assumed to be fallible, and won't totally fail
    // the request.
    const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
    const listing: T.FolderListing = [];

    for (const entry of entries) {
      const entryPath = join(resolvedPath, entry.name);
      try {
        const stats = await fs.stat(entryPath);

        // Slice off the mount path, but retain the final '/'.
        // const mountPath = '/mount/path/'
        // const entryPath = '/mount/path/foobar'
        // const clientPath = '/foobar'
        const clientPath = entryPath.slice(mountPath.length);

        // The ID is used by Dropbox for some smarter tracking of individual files
        // as they are moved. We don't have this, so just set it to the path.
        const id = `id:${entryPath}`;

        if (entry.isDirectory()) {
          listing.push({
            type: 'folder',
            name: entry.name,
            path: clientPath,
            id,
          });
        } else {
          // Dropbox has revision tracking. Instead for our case, just do the last
          // modified time to simulate this feature.
          const rev = `rev:${stats.mtime.getTime()}`;

          listing.push({
            type: 'file',
            name: entry.name,
            path: clientPath,
            id,
            clientModified: stats.mtime.toISOString(),
            serverModified: stats.ctime.toISOString(),
            rev,
            size: stats.size,
            isDownloadable: true,
            hash: '', // Currently unimplemented.
          });
        }
      } catch (error) {
        console.error('Unable to read a file, ignoring it', error);
      }
    }

    return listing;
  });

  return route.router;
}

export async function isFolder(path: string): Promise<boolean> {
  try {
    const stats = await fs.stat(path);
    return stats.isDirectory();
  } catch (error) {
    if (
      error &&
      'code' &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return false;
    }
    throw error;
  }
}
