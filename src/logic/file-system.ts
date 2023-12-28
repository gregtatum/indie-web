import { Dropbox } from 'dropbox';
import { T } from 'src';
import { fixupFileMetadata } from './offline-db';
import { getStringProp } from 'src/utils';

type SaveMode = 'overwrite' | 'add' | 'update';

export abstract class FileSystem {
  abstract saveFile(
    path: string,
    mode: SaveMode,
    contents: any,
  ): Promise<T.FileMetadata>;
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
}

export class DropboxError extends FileSystemError {
  toString() {
    return (
      getStringProp(this.error, 'message') ?? 'There was a Dropbox API error'
    );
  }

  status() {
    return this.error?.status;
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
      })
      .then(
        (response) => {
          return fixupFileMetadata(response.result);
        },
        (error) => {
          return error;
        },
      );
  }
}
