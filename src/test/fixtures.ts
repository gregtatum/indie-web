import { A, $, T } from 'src';
import { type files } from 'dropbox';
import { ensureExists, UnhandledCaseError } from '../utils';
import type { FetchMockSandbox } from 'fetch-mock';
import { createStore } from 'src/store/create-store';
import * as Offline from 'src/logic/offline-db';

export function createFileMetadata(path: string): T.FileMetadata {
  const parts = path.split('/');
  const name = ensureExists(parts.pop(), 'Expected a file name');
  return {
    type: 'file',
    name,
    path,
    id: 'id:AAAAAAAAAAAAAAAAAAAAAA',
    clientModified: '2022-05-08T15:20:46Z',
    serverModified: '2022-05-15T13:31:17Z',
    rev: '0123456789abcdef0123456789abcde',
    size: 3103,
    isDownloadable: true,
    hash: '0cae1bd6b2d4686a6389c6f0f7f41d42c4ab406a6f6c2af4dc084f1363617336',
  };
}

export function createFolderMetadata(path: string): T.FolderMetadata {
  const parts = path.split('/');
  const name = ensureExists(parts.pop(), 'Expected a file name');
  return {
    type: 'folder',
    name,
    path,
    id: 'id:AAAAAAAAAAAAAAAAAAAAAA',
  };
}

type MockedListFolderItem = {
  type: 'file' | 'folder';
  path: string;
};

export function mockDropboxListFolder(items: MockedListFolderItem[]) {
  (window.fetch as FetchMockSandbox)
    .catch(404)
    .mock('https://api.dropboxapi.com/2/files/list_folder', () => {
      return createListFolderResponse(items);
    });
}

export function createListFolderResponse(
  items: MockedListFolderItem[],
): Response {
  const entries: Array<
    files.FileMetadataReference | files.FolderMetadataReference
  > = [];
  const response = {
    entries,
    cursor: 'FAKE_CURSOR',
    has_more: false,
  };

  for (const { type, path } of items) {
    switch (type) {
      case 'file':
        entries.push(createFileMetadataReference(path));
        break;
      case 'folder':
        entries.push(createFolderMetadataReference(path));
        break;
      default:
        throw new UnhandledCaseError(type, 'file | folder');
    }
  }

  return new Response(JSON.stringify(response), { status: 200 });
}

export function createFileMetadataReference(
  path: string,
): files.FileMetadataReference {
  const parts = path.split('/');
  return {
    '.tag': 'file',
    name: ensureExists(parts.pop()),
    path_lower: path.toLowerCase(),
    path_display: path,
    id: 'id:' + String(getTestGeneration('id')),
    client_modified: '2022-01-01T00:00:00Z',
    server_modified: '2022-05-01T00:00:00Z',
    rev: '0123456789abcdef0123456789abcde',
    size: 3103,
    content_hash:
      '0cae1bd6b2d4686a6389c6f0f7f41d42c4ab406a6f6c2af4dc084f136361733' +
      String(getTestGeneration('content_hash')),
  };
}

export function createFolderMetadataReference(
  path: string,
): files.FolderMetadataReference {
  const parts = path.split('/');
  return {
    '.tag': 'folder',
    name: ensureExists(parts.pop()),
    path_lower: path.toLowerCase(),
    path_display: path,
    id: 'id:' + String(getTestGeneration('id')),
  };
}

export function mockDropboxAccessToken(store: T.Store) {
  const accessToken = 'faketoken';
  const expiresIn = Infinity;
  const refreshToken = 'refreshToken';
  store.dispatch(A.setDropboxAccessToken(accessToken, expiresIn, refreshToken));
}

let generations = new Map<string, number>();
export function getTestGeneration(name: string): number {
  const generation = (generations.get(name) ?? 0) + 1;
  generations.set(name, generation);
  return generation;
}

export function resetTestGeneration() {
  generations = new Map();
}

type TestFolder = Record<string, null | any>;

/**
 * Transforms a list of file paths:
 *   /Led Zeppelin/Stairway to Heaven.chopro
 *   /Led Zeppelin/Immigrant Song.chopro
 *   /Tutorial.txt
 *
 * Into a structured folder listing:
 *  {
 *    'Led Zeppelin': {
 *      'Stairway to Heaven.chopro': null,
 *      'Immigrant Song.chopro': null,
 *    },
 *    'Tutorial.txt': null,
 *  }
 */
export function foldersFromPaths(paths: string[]): TestFolder {
  const rootListing: TestFolder = {};
  for (const path of paths) {
    // ["Led Zeppelin", "Stairway to Heaven.chopro"]
    const folders = path.split('/').filter((p) => p);
    const fileName = ensureExists(folders.pop());
    let nextListing = rootListing;
    // Build out the folders
    for (const folder of folders) {
      let listing = nextListing[folder] as TestFolder | null;
      if (!listing) {
        listing = {} as TestFolder;
        nextListing[folder] = listing;
      }
      nextListing = listing;
    }
    nextListing[fileName] = null;
  }
  return rootListing;
}

/**
 * Creates an offline database pre-loaded with files.
 */
export async function setupDBWithFiles(paths: string[]) {
  const store = createStore();
  const { dispatch, getState } = store;
  const db = await store.dispatch(Offline.openDB());
  const folders = foldersFromPaths(paths);
  await addTestFoldersToDB(db, folders);

  /**
   * Use the store machinery to fetch a file as the active file.
   */
  async function fetchTextFile(path: string): Promise<string | null> {
    await dispatch(A.downloadFile(path));
    dispatch(A.viewFile(path));
    return $.getActiveFileTextOrNull(getState());
  }

  /**
   * Use the store machinery to get the file listing.
   */
  async function fetchFileListing(path: string) {
    await dispatch(A.listFiles(path));
    return $.getListFilesCache(getState())
      .get(path)
      ?.map((listing) => listing.path);
  }

  return { dispatch, getState, fetchTextFile, fetchFileListing, db };
}

/**
 * Builds out the offline database with file listings and files.
 */
async function addTestFoldersToDB(
  db: T.OfflineDB,
  folders: TestFolder,
  prevPath = '',
) {
  const files = [];

  for (const [name, children] of Object.entries<TestFolder | null>(folders)) {
    const path = prevPath + '/' + name;

    if (children) {
      const metadata = createFolderMetadata(path);
      files.push(metadata);
      await addTestFoldersToDB(db, children, path);
    } else {
      const metadata = createFileMetadata(path);
      files.push(metadata);
      await db.addTextFile(metadata, `${name} file contents`);
    }
  }
  await db.addFolderListing(prevPath || '/', files);
}
