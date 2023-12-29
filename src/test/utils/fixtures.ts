import { A, $, T } from 'src';
import { type files } from 'dropbox';
import { ensureExists, UnhandledCaseError } from '../../utils';
import type { FetchMockSandbox } from 'fetch-mock';
import { createStore } from 'src/store/create-store';
import { fixupMetadata } from 'src/logic/file-system/dropbox-fs';
import { IDBFS, openDropboxCache } from 'src/logic/file-system/indexeddb-fs';

export function createFileMetadata(path: string, id?: string): T.FileMetadata {
  const parts = path.split('/');
  const name = ensureExists(parts.pop(), 'Expected a file name');
  return {
    type: 'file',
    name,
    path,
    id: id ?? getPathToId('createFileMetadata', path),
    clientModified: '2022-05-08T15:20:46Z',
    serverModified: '2022-05-15T13:31:17Z',
    rev: '0123456789abcdef0123456789abcde',
    size: 3103,
    isDownloadable: true,
    hash: '0cae1bd6b2d4686a6389c6f0f7f41d42c4ab406a6f6c2af4dc084f1363617336',
  };
}

export function createFolderMetadata(
  path: string,
  id?: string,
): T.FolderMetadata {
  const parts = path.split('/');
  const name = ensureExists(parts.pop(), 'Expected a file name');
  return {
    type: 'folder',
    name,
    path,
    id: id ?? getPathToId('createFolderMetadata', path),
  };
}

type MockedListFolderItem = {
  type: 'file' | 'folder';
  path: string;
};

export function mockDropboxListFolder(
  items: MockedListFolderItem[],
): T.FolderListing {
  const fileList = createFileList(items);
  (window.fetch as FetchMockSandbox)
    .catch(404)
    .mock('https://api.dropboxapi.com/2/files/list_folder', () => {
      return createListFolderResponse(fileList);
    });
  return fileList.map((file) => fixupMetadata(file));
}

export interface MockedFilesDownload {
  metadata: T.FileMetadata;
  text: string;
}

export function mockDropboxFilesDownload(mocks: MockedFilesDownload[] = []) {
  (window.fetch as FetchMockSandbox).post(
    'https://content.dropboxapi.com/2/files/download',
    (url, opts: any) => {
      const argsString = opts?.headers?.['Dropbox-API-Arg'];
      ensureExists(argsString, 'Expected dropbox arguments to be present.');
      const { path } = JSON.parse(argsString);
      const mock = mocks.find((mock) => mock.metadata.path === path);
      if (!mock) {
        return {
          status: 409,
          body: {
            error_summary: 'path/not_found/.',
            error: { '.tag': 'path', path: { '.tag': 'not_found' } },
          },
        };
      }
      return {
        status: 200,
        headers: {
          'Dropbox-Api-Result': JSON.stringify(mock.metadata),
        },
        body: mock.text,
      };
    },
    { overwriteRoutes: true },
  );
}

interface UploadSpy {
  path: string;
  body: string;
}

export function spyOnDropboxFilesUpload(): UploadSpy[] {
  const results: UploadSpy[] = [];
  (window.fetch as FetchMockSandbox).post(
    'https://content.dropboxapi.com/2/files/upload',
    async (url, opts) => {
      const { path } = JSON.parse((opts.headers as any)['Dropbox-API-Arg']);
      results.push({ path, body: await (opts.body as Blob).text() });
      return {
        status: 200,
        body: createFileMetadataReference(path),
      };
    },
  );
  return results;
}

export function createFileList(
  items: MockedListFolderItem[],
): Array<files.FileMetadataReference | files.FolderMetadataReference> {
  const entries: Array<
    files.FileMetadataReference | files.FolderMetadataReference
  > = [];
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
  return entries;
}

export function createListFolderResponse(
  entries: Array<files.FileMetadataReference | files.FolderMetadataReference>,
): Response {
  const response = {
    entries,
    cursor: 'FAKE_CURSOR',
    has_more: false,
  };

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
    id: getPathToId('createFileMetadataReference', path),
    client_modified: '2022-01-01T00:00:00Z',
    server_modified: '2022-05-01T00:00:00Z',
    rev: '0123456789abcdef0123456789abcde',
    size: 3103,
    content_hash:
      '0cae1bd6b2d4686a6389c6f0f7f41d42c4ab406a6f6c2af4dc084f136361733' +
      String(getTestGeneration('createFileMetadataReference.content_hash')),
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
    id: getPathToId('createFolderMetadataReference', path),
  };
}

export function mockDropboxAccessToken(store: T.Store) {
  const accessToken = 'faketoken';
  const expiresIn = 14399;
  const refreshToken = 'refreshToken';
  store.dispatch(A.setDropboxAccessToken(accessToken, expiresIn, refreshToken));
}

let generations = new Map<string, number>();
export function getTestGeneration(name: string): number {
  const generation = (generations.get(name) ?? 0) + 1;
  generations.set(name, generation);
  return generation;
}

// This gets reset between test runs:
let pathToId = new Map<string, string>();

/**
 * Attempt to keep IDs stable for tests.
 */
function getPathToId(key: string, path: string): string {
  const keyedPath = key + ' - ' + path;
  let id = pathToId.get(keyedPath);
  if (!id) {
    id =
      'id:' +
      key.toUpperCase() +
      String(getTestGeneration('createFileMetadataReference.id'));

    pathToId.set(keyedPath, id);
  }
  return id;
}

export function resetTestGeneration() {
  generations = new Map();
  pathToId = new Map();
}

// This type is more documentation than type safe.
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
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
  const folders = foldersFromPaths(paths);
  const idbfs = await openDropboxCache();

  await addTestFoldersToDB(idbfs, folders);

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

  return { dispatch, getState, fetchTextFile, fetchFileListing, idbfs };
}

/**
 * Builds out the offline database with file listings and files.
 */
async function addTestFoldersToDB(
  idbfs: IDBFS,
  folders: TestFolder,
  prevPath = '',
) {
  const files = [];

  for (const [name, children] of Object.entries<TestFolder | null>(folders)) {
    const path = prevPath + '/' + name;

    if (children) {
      const metadata = createFolderMetadata(path);
      files.push(metadata);
      await addTestFoldersToDB(idbfs, children, path);
    } else {
      const metadata = createFileMetadata(path);
      files.push(metadata);
      await idbfs.saveText(metadata, 'overwrite', `${name} file contents`);
    }
  }
  await idbfs.addFolderListing(prevPath || '/', files);
}
