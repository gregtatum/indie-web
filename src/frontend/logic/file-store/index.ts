import { T } from 'frontend';

export abstract class FileStore {
  // Await on this during initialization.
  cachePromise?: Promise<void>;

  abstract saveBlob(
    pathOrMetadata: string | T.FileMetadata,
    mode: T.SaveMode,
    contents: Blob,
  ): Promise<T.FileMetadata>;

  saveText(
    pathOrMetadata: string | T.FileMetadata,
    mode: T.SaveMode,
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

  abstract createFolder(path: string): Promise<T.FolderMetadata>;

  abstract compressFolder(path: string): Promise<Blob>;

  abstract delete(path: string): Promise<void>;

  cache?: FileStoreCache;
}

export abstract class FileStoreCache extends FileStore {
  abstract addFolderListing(
    path: string,
    files: T.FolderListing,
  ): Promise<T.FolderListingRow>;
}

/**
 * A shared error type that all FileStore implementors can throw with to provide
 * a consistent interface.
 */
export abstract class FileStoreError<T = any> {
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
