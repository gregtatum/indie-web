import * as React from 'react';
import { A, $, $$, Hooks, T } from 'src';
import {
  asTypedRecord,
  ensureExists,
  isChordProFilePath,
  typedObjectEntries,
} from 'src/utils';
import { FileSystem } from './file-system';

export const INDEX_JSON_VERSION = 1;

function createEmptyFileIndex(): T.IndexJSON {
  return {
    version: INDEX_JSON_VERSION,
    files: [],
  };
}

export class FilesIndex {
  static path = '/.index.json';
  static timeout = 3000;

  data: T.IndexJSON;

  #fileSystem: FileSystem;
  #saveTimeout: ReturnType<typeof setTimeout> | null = null;
  #saveGeneration = 0;
  #pendingSaves: Record<T.FileMetadata['id'], T.IndexedFile> = {};
  #pendingSaveRequest: Promise<void> | null = null;

  constructor(fileSystem: FileSystem, state: T.State, data?: T.IndexJSON) {
    this.#fileSystem = fileSystem;
    if (data) {
      this.data = data;
    } else {
      this.data = createEmptyFileIndex();
      this.scheduleSave();
    }

    // The FilesIndex is loaded asynchronously, we may already be viewing
    // a file. Ensure the directives are synchronized.
    const activeFileParsed = $.getActiveFileParsedOrNull(state);
    const activeFile = $.getActiveFileOrNull(state);
    if (activeFileParsed && activeFile) {
      this.synchronizeFile(activeFile.metadata, activeFileParsed.directives);
    }
  }

  synchronizeFile(
    metadata: T.FileMetadata | T.FolderMetadata,
    directives?: T.Directives | undefined,
  ) {
    if (metadata.type === 'folder') {
      return;
    }
    if (metadata.path === FilesIndex.path) {
      return;
    }
    const file = this.data.files.find(
      (file) => file.metadata.id === metadata.id,
    );
    if (file) {
      let needsUpdating = false;

      // Check the deep equality of the metadata.
      for (const [key, oldValue] of typedObjectEntries(file.metadata)) {
        const newValue = asTypedRecord(metadata)[key];
        if (newValue !== oldValue) {
          needsUpdating = true;
          break;
        }
      }

      if (directives && file.lastRevRead !== metadata.rev) {
        // This file has been read and now has directives.
        needsUpdating = true;
      }

      if (needsUpdating) {
        file.metadata = metadata;
        if (directives) {
          // This file was downloaded, so we have the directives.
          file.lastRevRead = metadata.rev;
          file.directives = directives;
        } else {
          // This file either was not downloaded yet, or doesn't need to be downloaded
          // since there are no directives.
          file.lastRevRead = determineLastReadRev(metadata, file.lastRevRead);
        }
        this.#pendingSaves[file.metadata.id] = file;
        this.scheduleSave();
      }

      return;
    }

    // Insert the file at the proper sorted order based on the metadata id. This is done
    // so that the generated JSON is diffable and stable.
    let i = 0;
    const newFiles: T.IndexedFile[] = [];

    // Add on the files lexically before the new metadata.
    for (; i < this.data.files.length; i++) {
      const file = this.data.files[i];
      if (file.metadata.id > metadata.id) {
        break;
      }
      newFiles.push(ensureExists(file));
    }

    const newFile: T.IndexedFile = {
      metadata,
      lastRevRead: determineLastReadRev(metadata, null),
      directives: directives ?? {},
    };
    newFiles.push(newFile);

    this.#pendingSaves[metadata.id] = newFile;

    // Add the remaining files.
    for (; i < this.data.files.length; i++) {
      newFiles.push(ensureExists(this.data.files[i]));
    }

    this.data.files = newFiles;
    this.scheduleSave();
  }

  getFileByPath(path: string): T.IndexedFile | undefined {
    return this.data.files.find((file) => file.metadata.path === path);
  }

  scheduleSave() {
    if (this.#saveTimeout) {
      clearTimeout(this.#saveTimeout);
    }
    const generation = ++this.#saveGeneration;
    // Limit the updates by saving every 3 seconds.
    this.#saveTimeout = setTimeout(() => {
      if (this.#pendingSaveRequest) {
        void this.#pendingSaveRequest.catch().then(() => {
          // Check the generation so that only the latest save is sent.
          if (this.#saveGeneration === generation) {
            this.#pendingSaveRequest = this.#saveImpl();
          }
        });
      }
      this.#pendingSaveRequest = this.#saveImpl();
    }, FilesIndex.timeout);
  }

  async #saveImpl() {
    await this.#fileSystem.saveText(
      FilesIndex.path,
      'overwrite',
      JSON.stringify(this.data, null, '\t'),
    );
    this.#pendingSaveRequest = null;
  }

  reducer(state: T.State, action: T.Action) {
    // Update based on reducer actions.
    switch (action.type) {
      case 'files-index-received': {
        for (const [, files] of $.getListFilesCache(state)) {
          for (const file of files) {
            this.synchronizeFile(file);
          }
        }
        break;
      }
      case 'move-file-done': {
        const { metadata } = action;
        this.synchronizeFile(metadata);
        break;
      }
      case 'list-files-received': {
        for (const metadata of action.files) {
          this.synchronizeFile(metadata);
        }
        break;
      }
      case 'download-file-received': {
        const { path, file } = action;
        let directives: T.Directives | undefined;
        if (isChordProFilePath(path)) {
          directives = $.getActiveFileParsedTransformed(state).directives;
        }
        this.synchronizeFile(file.metadata, directives);
        break;
      }
      default:
      // Do nothing
    }
  }
}

export function tryUpgradeIndexJSON(json: any): T.IndexJSON | null {
  if (!json || typeof json !== 'object') {
    return null;
  }
  // Coerce the type to something that can be accessed.
  const rootJSON = json as Record<string, unknown>;

  switch (rootJSON.version) {
    case INDEX_JSON_VERSION:
      return json as T.IndexJSON;
    default:
      return null;
  }
}

/**
 * A simple hook to load in the FilesIndex on app start.
 */
export function useFilesIndex(): void {
  const dispatch = Hooks.useDispatch();
  const fileSystem = $$.getCurrentFSOrNull();
  React.useEffect(() => {
    if (fileSystem) {
      // TODO - This can still respond with a 401 not authorized.
      // Only load the files index when Dropbox is actually authorized.
      dispatch(A.loadFilesIndex()).catch((error) => console.error(error));
    }
  }, [fileSystem]);
}

function determineLastReadRev(
  metadata: T.FileMetadata,
  lastReadRev: null | string,
): null | string {
  if (isChordProFilePath(metadata.path)) {
    // A ChordPro file has directives that must be read from the file.
    return lastReadRev;
  }

  // This is a static file which doesn't require reading, so the current rev
  // is always listed as the last one read.
  return metadata.rev;
}
