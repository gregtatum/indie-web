import { T } from 'src';

export type SaveMode = 'overwrite' | 'add' | 'update';

export abstract class FileSystem {
  // Await on this during initialization.
  cachePromise?: Promise<void>;

  abstract saveBlob(
    pathOrMetadata: string | T.FileMetadata,
    mode: SaveMode,
    contents: Blob,
  ): Promise<T.FileMetadata>;

  saveText(
    pathOrMetadata: string | T.FileMetadata,
    mode: SaveMode,
    text: string,
  ): Promise<T.FileMetadata> {
    return this.saveBlob(
      pathOrMetadata,
      mode,
      new Blob([text], { type: 'text/plain' }),
    );
  }

  abstract loadBlob(path: string): Promise<T.BlobFile>;

  loadText(path: string): Promise<T.TextFile> {
    return this.loadBlob(path).then(async ({ metadata, blob }) => {
      return {
        metadata,
        text: await blob.text(),
      };
    });
  }

  abstract listFiles(path: string): Promise<T.FolderListing>;

  abstract move(
    fromPath: string,
    toPath: string,
  ): Promise<T.FileMetadata | T.FolderMetadata>;

  abstract compressFolder(path: string): Promise<Blob>;

  abstract delete(path: string): Promise<void>;

  cache?: FileSystemCache;
}

export abstract class FileSystemCache extends FileSystem {
  abstract addFolderListing(
    path: string,
    files: T.FolderListing,
  ): Promise<T.FolderListingRow>;
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
