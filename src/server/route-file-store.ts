import {
  ApiRoute,
  ClientError,
  RequestConflict,
  ServerError,
} from './utils.ts';
import { type T } from './index.ts';
import { resolve, join, basename } from 'node:path';
import { createReadStream, promises as fs, type Stats } from 'node:fs';
import { writeFile, mkdir, rename } from 'node:fs/promises';
import archiver from 'archiver';
import { finished } from 'stream/promises';

const ignoredFiles = new Set(['.DS_Store']);

interface ListFilesRequest {
  path: string;
}

/**
 * The mount path should not have a trailing slash.
 */
export function fileStoreRoute(mountPath: string) {
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
    const path = request.body?.path;
    if (typeof path !== 'string') {
      throw new ClientError('The path for the file listing was not sent.');
    }
    const listFilesRequest: ListFilesRequest = { path };

    const resolvedPath = resolveMountedPath(
      listFilesRequest.path,
      mountPath,
      true /* expectedFolder */,
    );

    if (!(await doesFolderExist(resolvedPath))) {
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
      if (ignoredFiles.has(entry.name)) {
        continue;
      }
      const entryPath = join(resolvedPath, entry.name);
      try {
        // Slice off the mount path, but retain the final '/'.
        // const mountPath = '/mount/path/'
        // const entryPath = '/mount/path/foobar'
        // const clientPath = '/foobar'
        const clientPath = entryPath.slice(mountPath.length);

        listing.push(getMetadata(clientPath, await fs.stat(entryPath)));
      } catch (error) {
        console.error('Unable to read a file, ignoring it', error);
      }
    }

    return listing;
  });

  route.post('/save-blob', async (request): Promise<T.FileMetadata> => {
    const metadata = parseHeaderRequest(request.header('File-Store-Request'));

    const clientPath = metadata.path;
    if (!clientPath) {
      throw new ClientError('Invalid or missing path in metadata.');
    }

    const resolvedPath = resolveMountedPath(clientPath, mountPath);
    if (resolvedPath === mountPath) {
      throw new ClientError('Invalid path.');
    }

    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);
    await mkdir(join(resolvedPath, '..'), { recursive: true });
    await writeFile(resolvedPath, buffer);

    const stats = await fs.stat(resolvedPath);
    return getFileMetadata(clientPath, stats);
  });

  route.post('/load-blob', async (request, response): Promise<void> => {
    const metadata = parseHeaderRequest(request.header('File-Store-Request'));

    const clientPath = metadata.path;
    if (!clientPath) {
      throw new ClientError('Invalid or missing path in metadata.');
    }

    const resolvedPath = resolveMountedPath(clientPath, mountPath);
    if (resolvedPath === mountPath) {
      throw new ClientError('Invalid path.');
    }

    const stats = await fs.stat(resolvedPath);
    const fileMetadata = getFileMetadata(clientPath, stats);

    console.log(`!!! load-blob`);
    response.setHeader('Content-Type', 'application/octet-stream');
    response.setHeader('File-Store-Response', JSON.stringify(fileMetadata));

    const stream = createReadStream(resolvedPath);
    stream.pipe(response);
    await finished(stream);
    console.log(`!!! stream done`);
  });

  route.post(
    '/move',
    async (request): Promise<T.FileMetadata | T.FolderMetadata> => {
      const { fromPath, toPath } = request.body;
      if (typeof fromPath !== 'string' || typeof toPath !== 'string') {
        throw new ClientError('Missing fromPath or toPath in move request.');
      }

      const fromResolved = resolveMountedPath(fromPath, mountPath);
      const toResolved = resolveMountedPath(fromPath, toPath);
      await rename(fromResolved, toResolved);
      const stats = await fs.stat(toResolved);
      return getMetadata(toResolved, stats);
    },
  );

  route.post('/create-folder', async (request): Promise<T.FolderMetadata> => {
    const { folderPath } = request.body;
    if (typeof folderPath !== 'string') {
      throw new ClientError('Missing folderPath in create-folder request.');
    }

    const resolvedPath = resolveMountedPath(folderPath, mountPath);
    await mkdir(resolvedPath, { recursive: true });
    return getFolderMetadata(folderPath);
  });

  route.addBlobRoute('POST', '/compress-folder', async (req, res) => {
    const { path } = req.body;
    if (typeof path !== 'string') {
      res.status(400).json({ error: 'Missing path' });
      return;
    }

    const resolvedPath = resolveMountedPath(path, mountPath);

    if (!(await doesFolderExist(resolvedPath))) {
      throw new RequestConflict(
        'The requested path was not a folder: ' + resolvedPath,
      );
    }
    try {
      const archive = archiver('zip', { zlib: { level: 9 } });

      archive.on('warning', (err) => {
        console.warn('Archive warning:', err);
      });

      archive.on('error', (err) => {
        console.error('Archive error:', err);
        res.status(500).end();
      });

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
      throw new ServerError(`Failed to compress ${path}`);
    }
  });

  return route.router;
}

/**
 * Checks that a folder exists and it is a directory, not a file.
 */
async function doesFolderExist(path: string): Promise<boolean> {
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

function getMetadata(
  clientPath: string,
  stats: Stats,
): T.FolderMetadata | T.FileMetadata {
  return stats.isDirectory()
    ? getFolderMetadata(clientPath)
    : getFileMetadata(clientPath, stats);
}

function getFolderMetadata(clientPath: string): T.FolderMetadata {
  return {
    type: 'folder',
    name: basename(clientPath),
    path: clientPath,
    id: `id:${clientPath}`,
  };
}

function getFileMetadata(clientPath: string, stats: Stats): T.FileMetadata {
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

/**
 * Always check that a file path is within the mount.
 */
function resolveMountedPath(
  clientPath: string,
  mountPath: string,
  expectedFolder = false,
) {
  if (!clientPath.startsWith('/')) {
    clientPath = '/' + clientPath;
  }
  let resolvedPath = resolve(
    mountPath,
    // Convert an absolute path to a relative one.
    '.' + clientPath,
  );

  if (expectedFolder && resolvedPath[resolvedPath.length - 1] !== '/') {
    // Add the trailing slash if it's missing.
    resolvedPath += '/';
  }

  if (!resolvedPath.startsWith(mountPath)) {
    console.error('Resolved path:', resolvedPath);
    throw new ClientError(
      'Invalid path: Access outside of the mount is not allowed.',
    );
  }

  return resolvedPath;
}

function parseHeaderRequest(metaHeader?: string): Record<string, string> {
  if (!metaHeader) {
    throw new ClientError('No File-Store-Request was provided.');
  }
  let metadata: unknown;
  try {
    metadata = JSON.parse(metaHeader);
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
