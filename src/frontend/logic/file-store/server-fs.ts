import { type T } from 'frontend';
import { FileStore } from 'frontend/logic/file-store';
import { openIDBFS } from 'frontend/logic/file-store/indexeddb-fs';

function log(key: string, ...args: any[]) {
  const style = 'color: #006DFF; font-weight: bold';
  if (process.env.NODE_ENV !== 'test') {
    console.log(`[server-fs] %c"${key}"`, style, ...args);
  }
}

export class ServerFS extends FileStore {
  apiBaseUrl: string;
  cachePromise?: Promise<void>;

  constructor(server: T.FileStoreServer) {
    super();
    let apiBaseUrl = server.url;
    if (!apiBaseUrl.endsWith('/')) {
      apiBaseUrl += '/';
    }
    this.apiBaseUrl = apiBaseUrl + 'file-store';

    this.cachePromise = openIDBFS(`server-fs-cache(${server.id})`).then(
      (IDBFS) => {
        this.cache = IDBFS;
      },
    );
  }

  async fetchJSON<T>(endpoint: string, body: Record<string, any>): Promise<T> {
    const response = await fetch(`${this.apiBaseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await response.text());
    const json = await response.json();
    return json;
  }

  async saveBlob(
    pathOrMetadata: string | T.FileMetadata,
    mode: T.SaveMode,
    contents: Blob,
  ): Promise<T.FileMetadata> {
    const path =
      typeof pathOrMetadata === 'string' ? pathOrMetadata : pathOrMetadata.path;

    log('saveBlob request', { path, mode });
    const response = await fetch(`${this.apiBaseUrl}/save-blob`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'File-Store-Request': JSON.stringify({ path, mode }),
      },
      body: contents,
    });

    if (!response.ok) {
      const text = await response.text();
      log('saveBlob error', text);
      throw new Error(text);
    }

    const metadata = await response.json();
    log('saveBlob completed', metadata);
    this.cache?.saveBlob(metadata, mode, contents).catch(console.error);

    return metadata;
  }

  async loadBlob(path: string): Promise<T.BlobFile> {
    log('loadBlob requested', path);
    const response = await fetch(`${this.apiBaseUrl}/load-blob`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'File-Store-Request': JSON.stringify({ path }),
      },
      body: null, // or omit this field entirely
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const headerResponse = response.headers.get('File-Store-Response');
    if (!headerResponse) {
      throw new Error('Missing File-Store-Response header');
    }

    const metadata = JSON.parse(headerResponse) as T.FileMetadata;
    const blob = await response.blob();

    const blobFile = { metadata, blob };
    log('loadBlob completed', metadata);
    this.cache?.saveBlob(metadata, 'overwrite', blob).catch(console.error);

    return blobFile;
  }

  async listFiles(path: string): Promise<T.FolderListing> {
    log('listFiles requested', path);
    const listing = await this.fetchJSON<T.FolderListing>('/list-files', {
      path,
    });
    log('listFiles completed', listing);
    this.cache?.addFolderListing(path, listing).catch(console.error);
    return listing;
  }

  async move(
    fromPath: string,
    toPath: string,
  ): Promise<T.FileMetadata | T.FolderMetadata> {
    log('move requested', fromPath, toPath);
    const metadata = await this.fetchJSON('/move', { fromPath, toPath });
    log('move completed', metadata);
    this.cache?.move(fromPath, toPath).catch(console.error);
    return metadata as T.FileMetadata | T.FolderMetadata;
  }

  async createFolder(folderPath: string): Promise<T.FolderMetadata> {
    log('createFolder requested', folderPath);
    const metadata = await this.fetchJSON<T.FolderMetadata>('/create-folder', {
      folderPath,
    });
    log('createFolder completed', metadata);
    this.cache?.addFolderListing(folderPath, []).catch(console.error);
    return metadata;
  }

  async delete(targetPath: string): Promise<void> {
    log('delete requested', targetPath);
    await this.fetchJSON('/delete', { targetPath });
    log('delete completed', targetPath);
    this.cache?.delete(targetPath).catch(console.error);
  }

  async compressFolder(path: string): Promise<Blob> {
    log('compressFolder requested', path);
    const response = await fetch(`${this.apiBaseUrl}/compress-folder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    if (!response.ok) {
      const text = await response.text();
      log('compressFolder error', text);
      throw new Error(text);
    }
    log('compressFolder received', path);
    return response.blob();
  }
}
