import {
  ApiRoute,
  ClientError,
  RequestConflict,
  MountPath,
  ServerError,
} from './utils.ts';
import type { T } from './index.ts';
import { basename, dirname } from 'node:path';
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
export function fileStoreRoute(mountPath: MountPath) {
  const route = new ApiRoute();

  mountPath.logPath();
  mountPath.validate();

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

    const resolvedPath = mountPath.resolve(
      listFilesRequest.path,
      true /* expectedFolder */,
    );

    if (!(await doesFolderExist(resolvedPath))) {
      throw mountPath.makeError(
        RequestConflict,
        'The requested path was not a folder: %s',
        resolvedPath,
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
      const entryPath = mountPath.joinWithinMount(resolvedPath, entry.name);
      try {
        // Slice off the mount path, but retain the final '/'.
        // const mountPath = '/mount/path/'
        // const entryPath = '/mount/path/foobar'
        // const clientPath = '/foobar'
        const clientPath = entryPath.slice(mountPath.getRiskyRawPath().length);

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

    const resolvedPath = mountPath.resolve(clientPath);
    if (resolvedPath === mountPath.getRiskyRawPath()) {
      throw new ClientError('Invalid path.');
    }

    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);
    await mkdir(dirname(resolvedPath), { recursive: true });
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

    const resolvedPath = mountPath.resolve(clientPath);
    if (resolvedPath === mountPath.getRiskyRawPath()) {
      throw new ClientError('Invalid path.');
    }

    const stats = await fs.stat(resolvedPath);
    const fileMetadata = getFileMetadata(clientPath, stats);

    response.setHeader('Content-Type', 'application/octet-stream');
    response.setHeader('File-Store-Response', JSON.stringify(fileMetadata));

    const stream = createReadStream(resolvedPath);
    stream.pipe(response);
    await finished(stream);
  });

  route.post(
    '/move',
    async (request): Promise<T.FileMetadata | T.FolderMetadata> => {
      const { fromPath, toPath } = request.body;
      if (typeof fromPath !== 'string' || typeof toPath !== 'string') {
        throw new ClientError('Missing fromPath or toPath in move request.');
      }

      const fromResolved = mountPath.resolve(fromPath);
      const toResolved = mountPath.resolve(toPath);
      await rename(fromResolved, toResolved);
      const stats = await fs.stat(toResolved);
      return getMetadata(toPath, stats);
    },
  );

  route.post('/create-folder', async (request): Promise<T.FolderMetadata> => {
    const { folderPath } = request.body;
    if (typeof folderPath !== 'string') {
      throw new ClientError('Missing folderPath in create-folder request.');
    }

    const resolvedPath = mountPath.resolve(folderPath);
    await mkdir(resolvedPath, { recursive: true });
    return getFolderMetadata(folderPath);
  });

  route.addBlobRoute('POST', '/compress-folder', async (req, res) => {
    const { path } = req.body;
    if (typeof path !== 'string') {
      res.status(400).json({ error: 'Missing path' });
      return;
    }

    const resolvedPath = mountPath.resolve(path);

    if (!(await doesFolderExist(resolvedPath))) {
      throw mountPath.makeError(
        RequestConflict,
        'The requested path was not a folder: %s',
        resolvedPath,
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
