import { T } from 'frontend';

export class NodeFSClient extends FileSystem {
  apiBaseUrl: string;

  constructor(apiBaseUrl: string) {
    super();
    this.apiBaseUrl = apiBaseUrl;
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
    const filePath =
      typeof pathOrMetadata === 'string' ? pathOrMetadata : pathOrMetadata.path;
    const base64Contents = await contents.text().then((text) => btoa(text));
    return this.fetch('/saveBlob', { filePath, contents: base64Contents });
  }

  async loadBlob(filePath: string): Promise<T.BlobFile> {
    const { metadata, contents } = await this.fetch('/loadBlob', { filePath });
    return {
      metadata,
      blob: new Blob([Uint8Array.from(atob(contents), (c) => c.charCodeAt(0))]),
    };
  }

  async listFiles(dirPath: string): Promise<T.FolderListing> {
    return this.fetch('/listFiles', { dirPath });
  }

  async move(
    fromPath: string,
    toPath: string,
  ): Promise<T.FileMetadata | T.FolderMetadata> {
    return this.fetch('/move', { fromPath, toPath });
  }

  async createFolder(folderPath: string): Promise<T.FolderMetadata> {
    return this.fetch('/createFolder', { folderPath });
  }

  async delete(targetPath: string): Promise<void> {
    await this.fetch('/delete', { targetPath });
  }
}
