import { type T } from 'frontend';
import { FileStore } from 'frontend/logic/file-store';

export class ServerFS extends FileStore {
  apiBaseUrl: string;

  constructor(apiBaseUrl: string) {
    super();
    if (!apiBaseUrl.endsWith('/')) {
      apiBaseUrl += '/';
    }
    this.apiBaseUrl = apiBaseUrl + 'fs-server';
  }

  async fetchJSON<T>(endpoint: string, body: Record<string, any>): Promise<T> {
    const response = await fetch(`${this.apiBaseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async fetchBlob(endpoint: string, body: Record<string, any>): Promise<Blob> {
    const response = await fetch(`${this.apiBaseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await response.text());
    return response.blob();
  }

  async saveBlob(
    pathOrMetadata: string | T.FileMetadata,
    mode: T.SaveMode,
    contents: Blob,
  ): Promise<T.FileMetadata> {
    const path =
      typeof pathOrMetadata === 'string' ? pathOrMetadata : pathOrMetadata.path;

    const response = await fetch(`${this.apiBaseUrl}/save-blob`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-File-Metadata': JSON.stringify({
          path,
          mode,
        }),
      },
      body: contents,
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    return response.json();
  }

  async loadBlob(path: string): Promise<T.BlobFile> {
    const { metadata, contents } = await this.fetchJSON<any>('/load-blob', {
      path,
    });
    return {
      metadata,
      blob: new Blob([Uint8Array.from(atob(contents), (c) => c.charCodeAt(0))]),
    };
  }

  async listFiles(path: string): Promise<T.FolderListing> {
    return this.fetchJSON('/list-files', { path });
  }

  async move(
    fromPath: string,
    toPath: string,
  ): Promise<T.FileMetadata | T.FolderMetadata> {
    return this.fetchJSON('/move', { fromPath, toPath });
  }

  async createFolder(folderPath: string): Promise<T.FolderMetadata> {
    return this.fetchJSON('/create-folder', { folderPath });
  }

  async delete(targetPath: string): Promise<void> {
    await this.fetchJSON('/delete', { targetPath });
  }

  async compressFolder(path: string): Promise<Blob> {
    return this.fetchBlob('/compress-folder', { path });
  }
}
