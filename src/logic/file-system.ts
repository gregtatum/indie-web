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
        (response) => {
          return fixupFileMetadata(response.result);
        },
        (error) => {
          return error;
        },
      );
  }
}
