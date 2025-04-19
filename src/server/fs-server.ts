import { ApiRoute, ClientError, RequestConflict } from './utils.ts';
import { type T } from './index.ts';
import { resolve, join } from 'node:path';
import { promises as fs } from 'node:fs';
import { writeFile, mkdir, readFile, rename } from 'node:fs/promises';
import archiver from 'archiver';
import { finished } from 'stream/promises';

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

  route.post('/save-blob', async (request): Promise<T.FileMetadata> => {
    const { path, contents } = request.body;
    if (typeof path !== 'string' || typeof contents !== 'string') {
      throw new ClientError('Missing path or contents in save-blob request.');
    }

    const resolvedPath = resolve(mountPath, '.' + path);
    if (!resolvedPath.startsWith(mountPath)) {
      throw new ClientError(
        'Invalid path: Access outside of mount not allowed.',
      );
    }

    await mkdir(join(resolvedPath, '..'), { recursive: true });
    const buffer = Buffer.from(contents, 'base64');
    await writeFile(resolvedPath, buffer);

    const stats = await fs.stat(resolvedPath);
    return {
      type: 'file',
      name: join(path).split('/').pop() || '',
      path,
      id: `id:${resolvedPath}`,
      clientModified: stats.mtime.toISOString(),
      serverModified: stats.ctime.toISOString(),
      rev: `rev:${stats.mtime.getTime()}`,
      size: stats.size,
      isDownloadable: true,
      hash: '',
    };
  });

  route.post(
    '/load-blob',
    async (
      request,
    ): Promise<{ metadata: T.FileMetadata; contents: string }> => {
      const { path } = request.body;
      if (typeof path !== 'string') {
        throw new ClientError('Missing path in load-blob request.');
      }

      const resolvedPath = resolve(mountPath, '.' + path);
      if (!resolvedPath.startsWith(mountPath)) {
        throw new ClientError(
          'Invalid path: Access outside of mount not allowed.',
        );
      }

      const buffer = await readFile(resolvedPath);
      const stats = await fs.stat(resolvedPath);

      const metadata: T.FileMetadata = {
        type: 'file',
        name: join(path).split('/').pop() || '',
        path,
        id: `id:${resolvedPath}`,
        clientModified: stats.mtime.toISOString(),
        serverModified: stats.ctime.toISOString(),
        rev: `rev:${stats.mtime.getTime()}`,
        size: stats.size,
        isDownloadable: true,
        hash: '',
      };

      return {
        metadata,
        contents: buffer.toString('base64'),
      };
    },
  );

  route.post(
    '/move',
    async (request): Promise<T.FileMetadata | T.FolderMetadata> => {
      const { fromPath, toPath } = request.body;
      if (typeof fromPath !== 'string' || typeof toPath !== 'string') {
        throw new ClientError('Missing fromPath or toPath in move request.');
      }

      const fromResolved = resolve(mountPath, '.' + fromPath);
      const toResolved = resolve(mountPath, '.' + toPath);

      if (
        !fromResolved.startsWith(mountPath) ||
        !toResolved.startsWith(mountPath)
      ) {
        throw new ClientError(
          'Invalid path: Access outside of mount not allowed.',
        );
      }

      await rename(fromResolved, toResolved);

      const stats = await fs.stat(toResolved);
      const id = `id:${toResolved}`;
      const name = toPath.split('/').pop() || '';

      return stats.isDirectory()
        ? { type: 'folder', name, path: toPath, id }
        : {
            type: 'file',
            name,
            path: toPath,
            id,
            clientModified: stats.mtime.toISOString(),
            serverModified: stats.ctime.toISOString(),
            rev: `rev:${stats.mtime.getTime()}`,
            size: stats.size,
            isDownloadable: true,
            hash: '',
          };
    },
  );

  route.post('/create-folder', async (request): Promise<T.FolderMetadata> => {
    const { folderPath } = request.body;
    if (typeof folderPath !== 'string') {
      throw new ClientError('Missing folderPath in create-folder request.');
    }

    const resolvedPath = resolve(mountPath, '.' + folderPath);
    if (!resolvedPath.startsWith(mountPath)) {
      throw new ClientError(
        'Invalid path: Access outside of mount not allowed.',
      );
    }

    await mkdir(resolvedPath, { recursive: true });

    return {
      type: 'folder',
      name: folderPath.split('/').pop() || '',
      path: folderPath,
      id: `id:${resolvedPath}`,
    };
  });

  route.addBlobRoute('POST', '/compress-folder', async (req, res) => {
    const { path } = req.body;
    if (typeof path !== 'string') {
      res.status(400).json({ error: 'Missing path' });
      return;
    }

    const resolvedPath = resolve(mountPath, '.' + path);
    if (!resolvedPath.startsWith(mountPath)) {
      res.status(403).json({ error: 'Path outside of mount is not allowed.' });
      return;
    }

    try {
      console.log(`!!! a`);
      const stats = await fs.stat(resolvedPath);
      if (!stats.isDirectory()) {
        res.status(400).json({ error: 'Provided path is not a folder.' });
        return;
      }

      const archive = archiver('zip', { zlib: { level: 9 } });

      archive.on('warning', (err) => {
        console.warn('Archive warning:', err);
      });

      archive.on('error', (err) => {
        console.error('Archive error:', err);
        res.status(500).end();
      });

      console.log(`!!! b`);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${path.split('/').pop() || 'archive'}.zip"`,
      );
      archive.pipe(res);
      archive.directory(resolvedPath, false);
      archive.finalize();

      await finished(res);
    } catch (err) {
      console.error('Compression failed:', err);
      res.status(500).json({ error: 'Failed to compress folder.' });
    }
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
