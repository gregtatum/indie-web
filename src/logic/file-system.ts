import { Dropbox } from 'dropbox';
import { T } from 'src';
import { fixupFileMetadata } from './offline-db';

type SaveMode = 'overwrite' | 'add' | 'update';

export abstract class FileSystem {
  abstract saveFile(
    path: string,
    mode: SaveMode,
    contents: any,
  ): Promise<T.FileMetadata>;

  abstract loadBlob(path: string): Promise<BlobFile>;
  abstract loadText(path: string): Promise<TextFile>;
}

export interface BlobFile {
  metadata: T.FileMetadata;
  blob: Blob;
}

export interface TextFile {
  metadata: T.FileMetadata;
  text: string;
}

export abstract class FileSystemError<T = any> {
  error: T;
  constructor(error: T) {
    this.error = error;
  }

  /**
   * The human friendly string version of this error.
   */
  abstract toString(): string;

  /**
   * The HTTP status code.
   */
  abstract status(): number;

  /**
   * Was this error because the path was not found?
   */
  abstract isNotFound(): boolean;
}

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
        (error) => Promise.reject(new DropboxError(error)),
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
        (error) => Promise.reject(new DropboxError(error)),
      );
  }

  loadText(path: string): Promise<TextFile> {
    return this.loadBlob(path).then(async ({ metadata, blob }) => ({
      metadata,
      text: await blob.text(),
    }));
  }
}
