import { Dropbox, DropboxAuth, files } from 'dropbox';
import { FileSystemError, SaveMode, FileSystem } from 'src/logic/file-system';
import { T } from 'src';
import { openIDBFS } from './indexeddb-fs';
import { getNumberProp, getStringProp } from 'src/utils';

export const IDB_CACHE_NAME = 'dropbox-fs-cache';

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

function toPath(pathOrMetadata: string | T.FileMetadata) {
  return typeof pathOrMetadata === 'string'
    ? pathOrMetadata
    : pathOrMetadata.path;
}

export class DropboxFS extends FileSystem {
  #dropbox: Dropbox;
  #auth: DropboxAuth;
  cachePromise?: Promise<void>;
  #refresh?: Promise<void>;

  constructor(dropbox: Dropbox) {
    super();
    this.#dropbox = dropbox;
    this.#auth = (dropbox as any).auth;
    if (process.env.NODE_ENV === 'test') {
      this.cachePromise = Promise.resolve();
    } else {
      const cachePromise = openIDBFS(IDB_CACHE_NAME);
      void cachePromise.then((IDBFS) => {
        this.cache = IDBFS;
      });
      this.cachePromise = cachePromise.then(() => {});
    }
  }

  /**
   * Ensure the token is still valid and doesn't need to be refreshed. It will
   * automatically by refreshed when the token is expired.
   */
  ensureTokenIsValid(): Promise<void> {
    if (this.#refresh) {
      return this.#refresh;
    }

    const accessToken = this.#auth.getAccessToken();
    const expiresIn = this.#auth.getAccessTokenExpiresAt();
    const refreshToken = this.#auth.getRefreshToken();

    // This API type is wrong. It returns a promise.
    const promise = this.#auth.checkAndRefreshAccessToken() as any;
    this.#refresh = promise;

    // If the access token changes, then save it to local storage.
    promise.finally(() => {
      const newAccessToken = this.#auth.getAccessToken();
      console.log(`!!! done`, expiresIn);
      if (accessToken !== newAccessToken) {
        storeDropboxAccessTokenToLocalStorage(
          newAccessToken,
          Number(expiresIn),
          refreshToken,
        );
      }
      this.#refresh = undefined;
    });

    return promise;
  }

  async saveBlob(
    pathOrMetadata: string | T.FileMetadata,
    mode: SaveMode,
    contents: any,
  ): Promise<T.FileMetadata> {
    await this.ensureTokenIsValid();

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

  async loadBlob(path: string): Promise<T.BlobFile> {
    await this.ensureTokenIsValid();

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

  async listFiles(path: string): Promise<T.FolderListing> {
    await this.ensureTokenIsValid();

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

  async move(
    fromPath: string,
    toPath: string,
  ): Promise<T.FileMetadata | T.FolderMetadata> {
    await this.ensureTokenIsValid();

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

  async compressFolder(path: string): Promise<Blob> {
    await this.ensureTokenIsValid();

    return this.#dropbox

      .filesDownloadZip({ path })

      .then(
        ({ result }) => (result as T.BlobZipFileMetadata).fileBlob,
        DropboxError.wrap,
      );
  }

  async delete(path: string): Promise<void> {
    await this.ensureTokenIsValid();

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

export function getDropboxOauthFromLocalStorage(): T.DropboxOauth | null {
  const oauthString = window.localStorage.getItem('dropboxOauth');
  if (!oauthString) {
    return null;
  }

  let oauthRaw: unknown;
  try {
    oauthRaw = JSON.parse(oauthString);
  } catch (error) {
    console.error(
      'Could not parse the Dropbox oauth data from localStorage',
      error,
    );
    return null;
  }

  const accessToken = getStringProp(oauthRaw, 'accessToken');
  const refreshToken = getStringProp(oauthRaw, 'refreshToken');
  const expires = getNumberProp(oauthRaw, 'expires');

  if (accessToken !== null && refreshToken !== null && expires !== null) {
    return { accessToken, refreshToken, expires };
  }

  console.error(
    'Could not find all of the required Dropbox oauth data from localStorage',
    { accessToken, refreshToken, expires },
  );
  return null;
}

export function storeDropboxAccessTokenToLocalStorage(
  accessToken: string,
  expiresIn: number,
  refreshToken: string,
): T.DropboxOauth {
  // Convert the expires into milliseconds, and end it at 90% of the time.
  const expires = Date.now() + expiresIn * 1000 * 0.9;

  const oauth: T.DropboxOauth = {
    accessToken,
    expires,
    refreshToken,
  };
  window.localStorage.setItem('dropboxOauth', JSON.stringify(oauth));
  return oauth;
}
