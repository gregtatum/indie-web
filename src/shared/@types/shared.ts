export type DownloadedTextFile = {
  metadata: FileMetadata;
  text: string;
};

export type DownloadedBlob = {
  metadata: FileMetadata;
  blob: Blob;
};

/**
 * Dropbox types with nothing optional.
 */
export interface FileMetadata {
  type: 'file';
  name: string; // '500 Miles _ Surrender.chopro';
  path: string; // '/500 Miles _ Surrender.chopro';
  // DropboxFS: 'id:ywUpYqVN8XAAAAAAAAAACw'
  // IDBFS: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'
  id: string;
  clientModified: string; // '2022-04-22T16:39:21Z';
  serverModified: string; // '2022-04-24T17:54:38Z';
  // DropboxFS: '015dd6a2747a0250000000266f484e0'
  // IDBFS: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'
  rev: string;
  size: number; //3296;
  isDownloadable: boolean; // true;
  hash: string; // 'bb6d43dfb6aff9dca4ff4d51f0146b64bdf325c73cd63193189b26ca052a2c51';
}

/**
 * Dropbox types with nothing optional.
 */
export interface FolderMetadata {
  type: 'folder';
  name: string; // 'Bent and Bruised';
  path: string; // '/Bent and Bruised';
  id: string; // 'id:ywUpYqVN8XAAAAAAAAAAPA';
}

export type FolderListing = Array<FileMetadata | FolderMetadata>;

export interface BlobFile {
  metadata: FileMetadata;
  blob: Blob;
}

export interface TextFile {
  metadata: FileMetadata;
  text: string;
}

export type SaveMode = 'overwrite' | 'add' | 'update';
