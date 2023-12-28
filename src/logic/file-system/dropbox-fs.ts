import { Dropbox } from 'dropbox';
import {
  BlobFile,
  FileSystemError,
  SaveMode,
  TextFile,
} from 'src/logic/file-system';
import { T } from 'src';
import { fixupFileMetadata, fixupMetadata } from 'src/logic/offline-db';

export class DropboxError extends FileSystemError {
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

export class DropboxFS extends FileSystem {
  #dropbox: Dropbox;
  constructor(dropbox: Dropbox) {
    super();
    this.#dropbox = dropbox;
  }

  saveFile(
    path: string,
    mode: SaveMode,
    contents: any,
  ): Promise<T.FileMetadata> {
    return this.#dropbox

      .filesUpload({
        path,
        contents,
        mode: {
          '.tag': mode as any,
        },
        autorename: mode === 'add' ? true : false,
      })

      .then(
        (response) => fixupFileMetadata(response.result),
        DropboxError.wrap,
      );
  }

  loadBlob(path: string): Promise<BlobFile> {
    return this.#dropbox

      .filesDownload({ path })

      .then(
        (response): BlobFile => ({
          metadata: fixupFileMetadata(response.result),
          blob: (response as T.FilesDownloadResponse).result.fileBlob,
        }),
        DropboxError.wrap,
      );
  }

  loadText(path: string): Promise<TextFile> {
    return this.loadBlob(path).then(async ({ metadata, blob }) => ({
      metadata,
      text: await blob.text(),
    }));
  }

  listFilesCache(
    _path: string,
  ): Promise<Array<T.FileMetadata | T.FolderMetadata>> | null {
    return null;
  }

  listFiles(path: string): Promise<Array<T.FileMetadata | T.FolderMetadata>> {
    return this.#dropbox
      .filesListFolder({
        path,
      })
      .then((response) => {
        const files: Array<T.FileMetadata | T.FolderMetadata> = [];

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
        return fixupMetadata(result.metadata);
      }, DropboxError.wrap);
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
    return this.#dropbox
      .filesDeleteV2({ path })
      .then(() => {}, DropboxError.wrap);
  }
}
