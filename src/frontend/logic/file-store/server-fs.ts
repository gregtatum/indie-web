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

  async fetch<T>(endpoint: string, body: Record<string, any>): Promise<T> {
    const response = await fetch(`${this.apiBaseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async saveBlob(
    pathOrMetadata: string | T.FileMetadata,
    mode: T.SaveMode,
    contents: Blob,
  ): Promise<T.FileMetadata> {
    const path =
      typeof pathOrMetadata === 'string' ? pathOrMetadata : pathOrMetadata.path;
    const base64Contents = await contents.text().then((text) => btoa(text));
    return this.fetch('/save-blob', { path, contents: base64Contents });
  }

  async loadBlob(path: string): Promise<T.BlobFile> {
    const { metadata, contents } = await this.fetch<any>('/load-blob', {
      path,
    });
    return {
      metadata,
      blob: new Blob([Uint8Array.from(atob(contents), (c) => c.charCodeAt(0))]),
    };
  }

  async listFiles(path: string): Promise<T.FolderListing> {
    return this.fetch('/list-files', { path });
  }

  async move(
    fromPath: string,
    toPath: string,
  ): Promise<T.FileMetadata | T.FolderMetadata> {
    return this.fetch('/move', { fromPath, toPath });
  }

  async createFolder(folderPath: string): Promise<T.FolderMetadata> {
    return this.fetch('/create-folder', { folderPath });
  }

  async delete(targetPath: string): Promise<void> {
    await this.fetch('/delete', { targetPath });
  }

  compressFolder(_path: string): Promise<Blob> {
    throw new Error('Not implemented.');
  }
}
