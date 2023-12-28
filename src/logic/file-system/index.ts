import { T } from 'src';

export type SaveMode = 'overwrite' | 'add' | 'update';

export abstract class FileSystem {
  abstract saveFile(
    path: string,
    mode: SaveMode,
    contents: any,
  ): Promise<T.FileMetadata>;

  abstract loadBlob(path: string): Promise<BlobFile>;
  abstract loadText(path: string): Promise<TextFile>;

  abstract listFiles(
    path: string,
  ): Promise<Array<T.FileMetadata | T.FolderMetadata>>;

  abstract move(
    fromPath: string,
    toPath: string,
  ): Promise<T.FileMetadata | T.FolderMetadata>;

  abstract compressFolder(path: string): Promise<Blob>;

  abstract delete(path: string): Promise<void>;

  cache?: FileSystem;
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
