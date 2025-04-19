import { Dropbox, files } from 'dropbox';
import { FileStoreError, FileStore } from 'frontend/logic/file-store';
import { T } from 'frontend';
import { openIDBFS } from './indexeddb-fs';

export const IDB_CACHE_NAME = 'dropbox-fs-cache';

export class DropboxError extends FileStoreError {
  toString() {
    if (this.error?.status >= 500 && this.error?.status < 600) {
      return 'Dropbox seems to be down at the moment. See https://status.dropbox.com/';
    }
    const name = this.error?.name;
    if (typeof name === 'string') {
      if (name === 'TypeError') {
        return 'Unable to connect to the internet. Try again?';
      }
    }

    console.error(this.error);
    return 'There was an error with Dropbox. Try refreshing?';
  }

  status() {
    return this.error?.status;
  }

  isNotFound() {
    return (
      this.error?.error?.error?.['.tag'] === 'path' &&
      this.error?.error?.error?.path?.['.tag'] === 'not_found'
    );
  }

  static wrap(error: any) {
    return Promise.reject(new DropboxError(error));
  }
}

function toPath(pathOrMetadata: string | T.FileMetadata) {
  return typeof pathOrMetadata === 'string'
    ? pathOrMetadata
    : pathOrMetadata.path;
}

export class DropboxFS extends FileStore {
  #dropbox: Dropbox;
  cachePromise?: Promise<void>;

  constructor(dropbox: Dropbox) {
    super();
    this.#dropbox = dropbox;
    if (process.env.NODE_ENV === 'test') {
      this.cachePromise = Promise.resolve();
    } else {
      this.cachePromise = void openIDBFS(IDB_CACHE_NAME).then((IDBFS) => {
        this.cache = IDBFS;
      });
    }
  }

  saveBlob(
    pathOrMetadata: string | T.FileMetadata,
    mode: T.SaveMode,
    contents: any,
  ): Promise<T.FileMetadata> {
    return this.#dropbox

      .filesUpload({
        path: toPath(pathOrMetadata),
        contents,
        mode: {
          '.tag': mode as any,
        },
        autorename: mode === 'add' ? true : false,
      })

      .then((response) => {
        const metadata = fixupFileMetadata(response.result);
        this.cache?.saveBlob(metadata, mode, contents).catch((error) => {
          console.error('Failed to save blob to IDBFS cache', error);
        });
        return metadata;
      }, DropboxError.wrap);
  }

  loadBlob(path: string): Promise<T.BlobFile> {
    return this.#dropbox

      .filesDownload({ path })

      .then((response): T.BlobFile => {
        const metadata = fixupFileMetadata(response.result);
        const blob = (response as T.FilesDownloadResponse).result.fileBlob;
        this.cache?.saveBlob(metadata, 'overwrite', blob).catch((error) => {
          console.error('Failed to save blob to IDBFS', error);
        });
        return { metadata, blob };
      }, DropboxError.wrap);
  }

  listFiles(path: string): Promise<T.FolderListing> {
    return this.#dropbox
      .filesListFolder({
        path,
      })
      .then((response) => {
        const files: T.FolderListing = [];

        for (const entry of response.result.entries) {
          if (entry['.tag'] === 'file' || entry['.tag'] === 'folder') {
            files.push(fixupMetadata(entry));
          }
        }

        files.sort((a, b) => {
          // Sort folders first
          if (a.type === 'file' && b.type === 'folder') {
            return 1;
          }
          if (b.type === 'file' && a.type === 'folder') {
            return -1;
          }
          // Sort by file name second.
          return a.name.localeCompare(b.name);
        });

        this.cache?.addFolderListing(path, files).catch((error) => {
          console.error('Failed to update folder listing in IDBFS', error);
        });

        return files;
      }, DropboxError.wrap);
  }

  move(
    fromPath: string,
    toPath: string,
  ): Promise<T.FileMetadata | T.FolderMetadata> {
    return this.#dropbox
      .filesMoveV2({
        from_path: fromPath,
        to_path: toPath,
      })
      .then(({ result }) => {
        if (result.metadata['.tag'] === 'deleted') {
          // Satisfy the types.
          throw new Error('Unexpected deletion.');
        }
        this.cache?.move(fromPath, toPath).catch((error) => {
          console.error('Failed to move file in IDBFS cache.', error);
        });
        return fixupMetadata(result.metadata);
      }, DropboxError.wrap);
  }

  async createFolder(path: string): Promise<T.FolderMetadata> {
    let metadata: T.FolderMetadata;
    try {
      const response = await this.#dropbox.filesCreateFolderV2({ path });
      const { name, id } = response.result.metadata;
      metadata = { type: 'folder', path, name, id };
    } catch (error) {
      return DropboxError.wrap(error);
    }

    await this.cache?.addFolderListing(path, []).catch((error) => {
      console.error('Failed to update folder listing in IDBFS', error);
    });

    return metadata;
  }

  compressFolder(path: string): Promise<Blob> {
    return this.#dropbox

      .filesDownloadZip({ path })

      .then(
        ({ result }) => (result as T.BlobZipFileMetadata).fileBlob,
        DropboxError.wrap,
      );
  }

  delete(path: string): Promise<void> {
    return this.#dropbox.filesDeleteV2({ path }).then((error) => {
      this.cache?.delete(path).catch(() => {
        console.error('Failed to delete file in IDBFS cache.', error);
      });
    }, DropboxError.wrap);
  }
}

export function fixupMetadata(
  rawMetadata: files.FileMetadataReference | files.FolderMetadataReference,
): T.FileMetadata | T.FolderMetadata {
  if (rawMetadata['.tag'] === 'file') {
    return fixupFileMetadata(rawMetadata);
  } else {
    return fixupFolderMetadata(rawMetadata);
  }
}

function fixupFileMetadata(
  rawMetadata: files.FileMetadata | files.FileMetadataReference,
): T.FileMetadata {
  return {
    type: 'file',
    name: rawMetadata.name,
    path: rawMetadata.path_display ?? '',
    id: rawMetadata.id,
    clientModified: rawMetadata.client_modified,
    serverModified: rawMetadata.server_modified,
    rev: rawMetadata.rev,
    size: rawMetadata.size,
    isDownloadable: rawMetadata.is_downloadable ?? false,
    hash: rawMetadata.content_hash ?? '',
  };
}

function fixupFolderMetadata(
  rawMetadata: files.FolderMetadataReference,
): T.FolderMetadata {
  return {
    type: 'folder',
    name: rawMetadata.name,
    path: rawMetadata.path_display ?? '',
    id: rawMetadata.id,
  };
}
