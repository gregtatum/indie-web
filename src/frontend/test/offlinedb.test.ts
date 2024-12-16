import {
  createFileMetadata,
  foldersFromPaths,
  setupDBWithFiles,
  createFolderMetadata,
} from './utils/fixtures';
import { PlainInternal } from 'frontend/store/actions';
import { IDBFS, openIDBFS } from 'frontend/logic/file-system/indexeddb-fs';

describe('offline db', () => {
  // Ignore "Dropbox wasn't available" errors.
  beforeEach(() => {
    const consoleError = console.error.bind(console);
    jest.spyOn(console, 'error').mockImplementation((message) => {
      if (
        String(message) !== 'Error: The current FileSystem is not available.'
      ) {
        consoleError(message);
      }
    });
  });

  it('opens', async () => {
    await openIDBFS('test-db');
  });

  it('can add files', async () => {
    const idbfs = await openIDBFS('test-db');
    const path = '/band/song.chopro';

    const error = await idbfs.loadText(path).catch((error) => error);
    expect(error.isNotFound()).toBe(true);

    const metadata = createFileMetadata(path);
    const text = 'This is a song.';
    await idbfs.saveText(metadata, 'overwrite', text);

    const file = await idbfs.loadText(metadata.path);
    expect(file.metadata.path).toEqual(path);
    expect(file.text).toEqual(text);
    idbfs.close();
  });

  /**
   * Get a text represent of a file tree, similar to the Unix `tree` command.
   */
  async function getFileTree(
    idbfs: IDBFS,
    path = '/',
    indent = '',
    // This is an object so it can be passed into the recursive calls.
    fileCount = { value: 0 },
    assertFileCounts = true,
  ): Promise<string> {
    let output = '';
    if (path === '/') {
      output += '\n.\n';
    }
    const files = await idbfs.listFiles(path);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Output the art
      const art = i === files.length - 1 ? '└──' : '├──';
      output += `${indent}${art} ${file.name}\n`;
      if (file.type === 'folder') {
        const nextIndent = i + 1 === files.length ? '    ' : '│   ';
        output += await getFileTree(
          idbfs,
          file.path,
          indent + nextIndent,
          fileCount,
          false /* assertFileCounts */,
        );
      }

      // Validate the files exist, as the folder listing and the actual files should agree.
      if (file.type === 'file') {
        fileCount.value++;
        if (!(await idbfs.fileExists(file.path))) {
          throw new Error('Could not find file in the database: ' + file.path);
        }
      }
    }

    const actualFileCount = await idbfs.getFileCount();
    if (assertFileCounts && fileCount.value !== actualFileCount) {
      throw new Error(
        `There were ${fileCount.value} files in the folder listings, ` +
          `but ${actualFileCount} in the database.`,
      );
    }
    return output;
  }

  it('can create files as the root of the folder', async () => {
    const idbfs = await openIDBFS('test-db');
    const paths = ['/song.chopro', '/song2.chopro'];
    for (const path of paths) {
      await idbfs.saveText(
        createFileMetadata(path),
        'overwrite',
        'This is a song.',
      );
    }

    expect(await getFileTree(idbfs)).toMatchInlineSnapshot(`
      "
      .
      ├── song.chopro
      └── song2.chopro
      "
    `);
    idbfs.close();
  });

  it('will only create one file when added multiple times', async () => {
    const idbfs = await openIDBFS('test-db');
    const paths = ['/song.chopro', '/song.chopro'];
    for (const path of paths) {
      await idbfs.saveText(
        createFileMetadata(path),
        'overwrite',
        'This is a song.',
      );
    }

    expect(await getFileTree(idbfs)).toMatchInlineSnapshot(`
      "
      .
      └── song.chopro
      "
    `);
    idbfs.close();
  });

  it('Can create files in subdirectories', async () => {
    const idbfs = await openIDBFS('test-db');
    await idbfs.createFolder('/French.coach');
    await idbfs.createFolder('/Spanish.coach');
    const paths = ['/French.coach/words.json', '/Spanish.coach/words.json'];
    for (const path of paths) {
      await idbfs.saveText(createFileMetadata(path), 'overwrite', '{}');
    }

    expect(await getFileTree(idbfs)).toMatchInlineSnapshot(`
      "
      .
      ├── French.coach
      │   └── words.json
      └── Spanish.coach
          └── words.json
      "
    `);
    idbfs.close();
  });

  it('can create files inside of a directory', async () => {
    const idbfs = await openIDBFS('test-db');

    await idbfs.addFolderListing('/subdirectory', []);

    const paths = ['/subdirectory/song.chopro', '/subdirectory/song2.chopro'];
    for (const path of paths) {
      await idbfs.saveText(
        createFileMetadata(path),
        'overwrite',
        'This is a song.',
      );
    }

    expect(await getFileTree(idbfs)).toMatchInlineSnapshot(`
      "
      .
      └── subdirectory
          ├── song.chopro
          └── song2.chopro
      "
    `);
    idbfs.close();
  });

  // Fake indexeddb doesn't support blobs.
  // https://github.com/dumbmatter/fakeIndexedDB/issues/56
  it('can add Blobs', async () => {
    const idbfs = await openIDBFS('test-db');
    const path = '/band/song.chopro';
    const error = await idbfs.loadText(path).catch((error) => error);
    expect(error.isNotFound()).toBe(true);

    const metadata = createFileMetadata(path);
    const text = 'This is a song';
    const blob = new Blob([text]);
    await idbfs.saveBlob(metadata, 'overwrite', blob);

    const fileRow = await idbfs.loadBlob(metadata.path);
    expect(await fileRow.blob.text()).toEqual(text);
    expect(fileRow.metadata.path).toEqual(path);
    idbfs.close();
  });

  it('can list an empty database', async () => {
    const idbfs = await openIDBFS('test-db');
    const files = await idbfs.listFiles('/');
    expect(files).toEqual([]);
  });

  it('throws an error when adding a file over a folder', async () => {
    const idbfs = await openIDBFS('test-db');
    await idbfs.saveText('/campaign', 'overwrite', 'My cool campaign notes');
    expect(await getFileTree(idbfs)).toMatchInlineSnapshot(`
      "
      .
      └── campaign
      "
    `);
    await expect(idbfs.createFolder('/campaign/subfolder')).rejects.toThrow(
      'A parent folder was actually a file: /campaign',
    );
    expect(await getFileTree(idbfs)).toMatchInlineSnapshot(`
      "
      .
      └── campaign
      "
    `);
  });

  it('use the setupDBWithFiles', async () => {
    const { idbfs } = await setupDBWithFiles([
      '/band/song 1.chopro',
      '/band/song 2.chopro',
      '/band/song 3.chopro',
      '/band/song 4.chopro',
    ]);

    expect(await getFileTree(idbfs)).toMatchInlineSnapshot(`
      "
      .
      └── band
          ├── song 1.chopro
          ├── song 2.chopro
          ├── song 3.chopro
          └── song 4.chopro
      "
    `);

    {
      const folderListings = await idbfs.listFiles('/');
      for (const folderListing of folderListings) {
        // This will be a uuid, overwrite it.
        folderListing.id = 'id:CREATEFOLDERMETADATA5';
      }
      expect(folderListings).toEqual([createFolderMetadata('/band')]);
    }
    {
      const folderListings = await idbfs.listFiles('/band');
      expect(folderListings).toEqual([
        createFileMetadata('/band/song 1.chopro'),
        createFileMetadata('/band/song 2.chopro'),
        createFileMetadata('/band/song 3.chopro'),
        createFileMetadata('/band/song 4.chopro'),
      ]);
    }
    idbfs.close();
  });

  it('can move a file in a subfolder', async () => {
    const { idbfs } = await setupDBWithFiles([
      '/band/song 1.chopro',
      '/band/song 2.chopro',
      '/band/song 3.chopro',
      '/band/song 4.chopro',
    ]);

    expect(await getFileTree(idbfs)).toMatchInlineSnapshot(`
      "
      .
      └── band
          ├── song 1.chopro
          ├── song 2.chopro
          ├── song 3.chopro
          └── song 4.chopro
      "
    `);

    // Now move it by updating the metadata.
    await idbfs.updateMetadata(
      '/band/song 3.chopro',
      createFileMetadata('/band/song 3 (renamed).chopro'),
    );

    expect(await getFileTree(idbfs)).toMatchInlineSnapshot(`
      "
      .
      └── band
          ├── song 1.chopro
          ├── song 2.chopro
          ├── song 3 (renamed).chopro
          └── song 4.chopro
      "
    `);

    idbfs.close();
  });

  it('can move a file in a subfolder', async () => {
    const { fetchTextFile, fetchFileListing, dispatch, idbfs } =
      await setupDBWithFiles([
        '/band/song 1.chopro',
        '/band/song 2.chopro',
        '/band/song 3.chopro',
        '/band/song 4.chopro',
      ]);

    // The file should exist.
    expect(await idbfs.loadBlob('/band/song 3.chopro')).toBeTruthy();
    expect(await fetchTextFile('/band/song 3.chopro')).toEqual(
      'song 3.chopro file contents',
    );
    expect(await fetchFileListing('/band')).toEqual([
      '/band/song 1.chopro',
      '/band/song 2.chopro',
      '/band/song 3.chopro',
      '/band/song 4.chopro',
    ]);

    // Now move it by updating the metadata.
    await idbfs.updateMetadata(
      '/band/song 3.chopro',
      createFileMetadata('/band/song 3 (renamed).chopro'),
    );

    // Check that the file listing in the offline db is up to date.
    const folderListings = await idbfs.listFiles('/band');
    expect(folderListings).toEqual([
      createFileMetadata('/band/song 1.chopro'),
      createFileMetadata('/band/song 2.chopro'),
      createFileMetadata('/band/song 3 (renamed).chopro'),
      createFileMetadata('/band/song 4.chopro'),
    ]);

    // Signal to the store that moving the file is done so the internal cache there
    // can be updated as well.
    dispatch(
      PlainInternal.moveFileDone(
        '/band/song 3.chopro',
        createFileMetadata('/band/song 3 (renamed).chopro'),
      ),
    );

    // The database should be updated.
    expect(await wasRejected(idbfs.loadBlob('/band/song 3.chopro'))).toEqual(
      true,
    );
    expect(await idbfs.loadBlob('/band/song 3 (renamed).chopro')).toBeTruthy();

    expect(await fetchTextFile('/band/song 3.chopro')).toEqual(null);
    expect(await fetchTextFile('/band/song 3 (renamed).chopro')).toEqual(
      'song 3.chopro file contents',
    );

    expect(await fetchFileListing('/band')).toEqual([
      '/band/song 1.chopro',
      '/band/song 2.chopro',
      '/band/song 3 (renamed).chopro',
      '/band/song 4.chopro',
    ]);

    idbfs.close();
  });

  it('can move a folder', async () => {
    const { fetchTextFile, fetchFileListing, dispatch, idbfs } =
      await setupDBWithFiles([
        '/band/song 1.chopro',
        '/band/song 2.chopro',
        '/band/song 3.chopro',
        '/band/to-practice/practice 1.chopro',
        '/band/to-practice/practice 2.chopro',
      ]);

    // The files should exist before the move.
    {
      expect(await idbfs.loadBlob('/band/song 3.chopro')).toBeTruthy();
      expect(
        await idbfs.loadBlob('/band/to-practice/practice 2.chopro'),
      ).toBeTruthy();
      expect(await fetchTextFile('/band/song 3.chopro')).toBeTruthy();
      expect(
        await fetchTextFile('/band/to-practice/practice 2.chopro'),
      ).toBeTruthy();

      expect(await fetchFileListing('/band')).toEqual([
        '/band/song 1.chopro',
        '/band/song 2.chopro',
        '/band/song 3.chopro',
        '/band/to-practice',
      ]);
    }

    // Now move it by updating the metadata.
    await idbfs.updateMetadata('/band', createFolderMetadata('/band (moved)'));

    // Check that the file listing in the offline db is up to date.
    expect(await wasRejected(idbfs.listFiles('/band'))).toEqual(true);
    expect(await wasRejected(idbfs.listFiles('/band/to-practice'))).toEqual(
      true,
    );

    // Check the listings at '/'
    {
      const folderListings = await idbfs.listFiles('/');
      expect(folderListings).toEqual([
        createFolderMetadata('/band (moved)', folderListings[0].id),
      ]);
    }

    // Check the listings at '/band (moved)'
    {
      const folderListings = await idbfs.listFiles('/band (moved)');
      expect(folderListings).toEqual([
        createFileMetadata('/band (moved)/song 1.chopro', folderListings[0].id),
        createFileMetadata('/band (moved)/song 2.chopro', folderListings[1].id),
        createFileMetadata('/band (moved)/song 3.chopro', folderListings[2].id),
        createFolderMetadata('/band (moved)/to-practice', folderListings[3].id),
      ]);
    }

    // Check the listings at '/band (moved)/to-practice'
    {
      const folderListings = await idbfs.listFiles('/band (moved)/to-practice');
      expect(folderListings).toEqual([
        createFileMetadata(
          '/band (moved)/to-practice/practice 1.chopro',
          folderListings[0].id,
        ),
        createFileMetadata(
          '/band (moved)/to-practice/practice 2.chopro',
          folderListings[1].id,
        ),
      ]);
    }

    // The database file's should be updated.
    expect(await wasRejected(idbfs.loadBlob('/band/song 3.chopro'))).toBe(true);
    expect(await idbfs.loadBlob('/band (moved)/song 3.chopro')).toBeTruthy();
    expect(
      await wasRejected(idbfs.loadBlob('/band/to-practice/practice 2.chopro')),
    ).toBe(true);
    expect(
      await idbfs.loadBlob('/band (moved)/to-practice/practice 2.chopro'),
    ).toBeTruthy();

    // Signal to the store that moving the file is done so the internal cache there
    // can be updated as well.
    dispatch(
      PlainInternal.moveFileDone(
        '/band',
        createFolderMetadata('/band (moved)'),
      ),
    );

    // The store should be up to date as well.
    {
      expect(await fetchTextFile('/band/song 3.chopro')).toBe(null);
      expect(await fetchTextFile('/band (moved)/song 3.chopro')).toBeTruthy();
      expect(await fetchTextFile('/band/to-practice/practice 2.chopro')).toBe(
        null,
      );
      expect(
        await fetchTextFile('/band (moved)/to-practice/practice 2.chopro'),
      ).toBeTruthy();

      expect(await fetchFileListing('/band')).toEqual(undefined);
      expect(await fetchFileListing('/band (moved)')).toEqual([
        '/band (moved)/song 1.chopro',
        '/band (moved)/song 2.chopro',
        '/band (moved)/song 3.chopro',
        '/band (moved)/to-practice',
      ]);
      expect(await fetchFileListing('/band (moved)/to-practice')).toEqual([
        '/band (moved)/to-practice/practice 1.chopro',
        '/band (moved)/to-practice/practice 2.chopro',
      ]);
    }

    idbfs.close();
  });

  it('can delete a file in a subfolder', async () => {
    const { fetchTextFile, fetchFileListing, dispatch, idbfs } =
      await setupDBWithFiles([
        '/band/song 1.chopro',
        '/band/song 2.chopro',
        '/band/song 3.chopro',
        '/band/song 4.chopro',
      ]);

    // The file should exist.
    expect(await idbfs.loadBlob('/band/song 3.chopro')).toBeTruthy();
    expect(await fetchTextFile('/band/song 3.chopro')).toEqual(
      'song 3.chopro file contents',
    );
    expect(await fetchFileListing('/band')).toEqual([
      '/band/song 1.chopro',
      '/band/song 2.chopro',
      '/band/song 3.chopro',
      '/band/song 4.chopro',
    ]);

    const metadata = createFileMetadata('/band/song 3.chopro');
    // Now move it by updating the metadata.
    await idbfs.delete(metadata.path);

    // Check that the file listing in the offline db is up to date.
    const folderListings = await idbfs.listFiles('/band');
    expect(folderListings).toEqual([
      createFileMetadata('/band/song 1.chopro'),
      createFileMetadata('/band/song 2.chopro'),
      createFileMetadata('/band/song 4.chopro'),
    ]);

    // The database should be updated.
    expect(await wasRejected(idbfs.loadBlob('/band/song 3.chopro'))).toBe(true);

    // Signal to the store that moving the file is done so the internal cache there
    // can be updated as well.
    dispatch(PlainInternal.deleteFileDone(metadata));

    // The store should be up to date as well.
    expect(await fetchTextFile('/band/song 3.chopro')).toEqual(null);

    expect(await fetchFileListing('/band')).toEqual([
      '/band/song 1.chopro',
      '/band/song 2.chopro',
      '/band/song 4.chopro',
    ]);

    idbfs.close();
  });

  it('can delete a folder', async () => {
    const { fetchTextFile, fetchFileListing, dispatch, idbfs } =
      await setupDBWithFiles([
        '/band/song 1.chopro',
        '/band/song 2.chopro',
        '/band/song 3.chopro',
        '/band/to-practice/practice 1.chopro',
        '/band/to-practice/practice 2.chopro',
      ]);

    // The files should exist before the delete.
    {
      expect(await idbfs.loadBlob('/band/song 3.chopro')).toBeTruthy();
      expect(
        await idbfs.loadBlob('/band/to-practice/practice 2.chopro'),
      ).toBeTruthy();
      expect(await fetchTextFile('/band/song 3.chopro')).toBeTruthy();
      expect(
        await fetchTextFile('/band/to-practice/practice 2.chopro'),
      ).toBeTruthy();

      expect(await fetchFileListing('/band')).toEqual([
        '/band/song 1.chopro',
        '/band/song 2.chopro',
        '/band/song 3.chopro',
        '/band/to-practice',
      ]);
    }

    // Now delete the folder.
    const metadata = createFolderMetadata('/band/to-practice');
    await idbfs.delete(metadata.path);

    expect(await wasRejected(idbfs.listFiles('/band/to-practice'))).toEqual(
      true,
    );

    // Check the listings at '/'
    {
      const folderListings = await idbfs.listFiles('/');
      expect(folderListings).toEqual([
        createFolderMetadata('/band', folderListings[0].id),
      ]);
    }

    // Check the listings at '/band'
    {
      const folderListings = await idbfs.listFiles('/band');
      expect(folderListings).toEqual([
        createFileMetadata('/band/song 1.chopro'),
        createFileMetadata('/band/song 2.chopro'),
        createFileMetadata('/band/song 3.chopro'),
      ]);
    }

    // The database file's should be updated.
    expect(await idbfs.loadBlob('/band/song 3.chopro')).toBeTruthy();
    expect(
      await wasRejected(idbfs.loadBlob('/band/to-practice/practice 2.chopro')),
    ).toBe(true);

    // Signal to the store that deleting the file is done so the internal cache there
    // can be updated as well.
    dispatch(PlainInternal.deleteFileDone(metadata));

    // The store should be up to date as well.
    {
      expect(await fetchTextFile('/band/song 3.chopro')).toBeTruthy();
      expect(await fetchTextFile('/band/to-practice/practice 2.chopro')).toBe(
        null,
      );

      expect(await fetchFileListing('/band')).toEqual([
        '/band/song 1.chopro',
        '/band/song 2.chopro',
        '/band/song 3.chopro',
      ]);
      expect(await fetchFileListing('/band/to-practice')).toEqual(undefined);
    }

    idbfs.close();
  });

  it('can delete a subfolder', async () => {
    const { idbfs } = await setupDBWithFiles([
      'README.md',
      '/band/song 1.chopro',
      '/band/song 2.chopro',
      '/band/song 3.chopro',
      '/band/to-practice/practice 1.chopro',
      '/band/to-practice/practice 2.chopro',
    ]);

    expect(await getFileTree(idbfs)).toMatchInlineSnapshot(`
      "
      .
      ├── README.md
      └── band
          ├── song 1.chopro
          ├── song 2.chopro
          ├── song 3.chopro
          └── to-practice
              ├── practice 1.chopro
              └── practice 2.chopro
      "
    `);

    await idbfs.delete('/band');

    expect(await getFileTree(idbfs)).toMatchInlineSnapshot(`
      "
      .
      └── README.md
      "
    `);

    idbfs.close();
  });
});

describe('database test setup', () => {
  it('can use the test-only folder utility', () => {
    const folders = foldersFromPaths([
      '/Led Zeppelin/Stairway to Heaven.chopro',
      '/Led Zeppelin/Immigrant Song.chopro',
      '/Tutorial.txt',
    ]);
    expect(folders).toEqual({
      'Led Zeppelin': {
        'Stairway to Heaven.chopro': null,
        'Immigrant Song.chopro': null,
      },
      'Tutorial.txt': null,
    });
  });
});

function wasRejected(promise: Promise<any>): Promise<boolean> {
  return promise.then(
    () => false,
    () => true,
  );
}
