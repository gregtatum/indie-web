import * as Offline from 'src/logic/offline-db';
import { createStore } from 'src/store/create-store';
import { ensureExists } from 'src/utils';
import {
  createFileMetadata,
  foldersFromPaths,
  setupDBWithFiles,
  createFolderMetadata,
} from './fixtures';
import { PlainInternal } from 'src/store/actions';

describe('offline db', () => {
  it('opens', async () => {
    const { dispatch } = createStore();
    await dispatch(Offline.openDB());
  });

  it('can add files', async () => {
    const { dispatch } = createStore();
    const db = await dispatch(Offline.openDB());
    const path = '/band/song.chopro';
    expect(await db.getFile(path)).toBeUndefined();

    const metadata = createFileMetadata(path);
    const text = 'This is a song.';
    await db.addTextFile(metadata, text);

    const fileRow = await db.getFile(metadata.path);
    if (fileRow?.type !== 'text') {
      throw new Error('Expected text type');
    }
    expect(fileRow.text).toEqual(text);
    expect(fileRow.metadata.path).toEqual(path);
    db.close();
  });

  // Fake indexeddb doesn't support blobs.
  // https://github.com/dumbmatter/fakeIndexedDB/issues/56
  it.skip('can add Blobs', async () => {
    const { dispatch } = createStore();
    const db = await dispatch(Offline.openDB());
    const path = '/band/song.chopro';
    expect(await db.getFile(path)).toBeUndefined();

    const metadata = createFileMetadata(path);
    const text = 'This is a song';
    const blob = new Blob([text]);
    await db.addBlobFile(metadata, blob);

    const fileRow = await db.getFile(metadata.path);
    if (fileRow?.type !== 'blob') {
      throw new Error('Expected blob type');
    }
    expect(await fileRow.blob.text()).toEqual(text);
    expect(fileRow.metadata.path).toEqual(path);
    db.close();
  });

  it('can add a folder listing', async () => {
    const { dispatch } = createStore();
    const db = await dispatch(Offline.openDB());
    const path = '/band/';
    expect(await db.getFolderListing(path)).toBeUndefined();

    const files = [
      createFileMetadata('/band/song 1.chopro'),
      createFileMetadata('/band/song 2.chopro'),
      createFileMetadata('/band/song 3.chopro'),
      createFileMetadata('/band/song 4.chopro'),
    ];

    await db.addFolderListing(path, files);

    const folderListings = ensureExists(await db.getFolderListing(path));
    expect(folderListings.files).toEqual(files);
    expect(folderListings.path).toEqual(path);
    db.close();
  });

  it('use the setupDBWithFiles', async () => {
    const { db } = await setupDBWithFiles([
      '/band/song 1.chopro',
      '/band/song 2.chopro',
      '/band/song 3.chopro',
      '/band/song 4.chopro',
    ]);

    {
      const folderListings = await db.getFolderListing('/');
      expect(folderListings?.files).toEqual([createFolderMetadata('/band')]);
      expect(folderListings?.path).toEqual('/');
    }
    {
      const folderListings = await db.getFolderListing('/band');
      expect(folderListings?.files).toEqual([
        createFileMetadata('/band/song 1.chopro'),
        createFileMetadata('/band/song 2.chopro'),
        createFileMetadata('/band/song 3.chopro'),
        createFileMetadata('/band/song 4.chopro'),
      ]);
      expect(folderListings?.path).toEqual('/band');
    }
    db.close();
  });

  it('can move a file in a subfolder', async () => {
    const { fetchTextFile, fetchFileListing, dispatch, db } =
      await setupDBWithFiles([
        '/band/song 1.chopro',
        '/band/song 2.chopro',
        '/band/song 3.chopro',
        '/band/song 4.chopro',
      ]);

    // The file should exist.
    expect(await db.getFile('/band/song 3.chopro')).toBeTruthy();
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
    await db.updateMetadata(
      '/band/song 3.chopro',
      createFileMetadata('/band/song 3 (renamed).chopro'),
    );

    // Check that the file listing in the offline db is up to date.
    const folderListings = await db.getFolderListing('/band');
    expect(folderListings?.files).toEqual([
      createFileMetadata('/band/song 1.chopro'),
      createFileMetadata('/band/song 2.chopro'),
      createFileMetadata('/band/song 3 (renamed).chopro'),
      createFileMetadata('/band/song 4.chopro'),
    ]);

    // The database should be updated.
    expect(await db.getFile('/band/song 3.chopro')).toBe(undefined);
    expect(await db.getFile('/band/song 3 (renamed).chopro')).toBeTruthy();

    // Signal to the store that moving the file is done so the internal cache there
    // can be updated as well.
    dispatch(
      PlainInternal.moveFileDone(
        '/band/song 3.chopro',
        createFileMetadata('/band/song 3 (renamed).chopro'),
      ),
    );

    // The store should be up to date as well.
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

    db.close();
  });

  it('can move a folder', async () => {
    const { fetchTextFile, fetchFileListing, dispatch, db } =
      await setupDBWithFiles([
        '/band/song 1.chopro',
        '/band/song 2.chopro',
        '/band/song 3.chopro',
        '/band/to-practice/practice 1.chopro',
        '/band/to-practice/practice 2.chopro',
      ]);

    // The files should exist before the move.
    {
      expect(await db.getFile('/band/song 3.chopro')).toBeTruthy();
      expect(
        await db.getFile('/band/to-practice/practice 2.chopro'),
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
    await db.updateMetadata('/band', createFolderMetadata('/band (moved)'));

    // Check that the file listing in the offline db is up to date.
    expect(await db.getFolderListing('/band')).toEqual(undefined);
    expect(await db.getFolderListing('/band/to-practice')).toEqual(undefined);

    // Check the listings at '/'
    {
      const folderListings = await db.getFolderListing('/');
      expect(folderListings?.files).toEqual([
        createFolderMetadata('/band (moved)'),
      ]);
    }

    // Check the listings at '/band (moved)'
    {
      const folderListings = await db.getFolderListing('/band (moved)');
      expect(folderListings?.files).toEqual([
        createFileMetadata('/band (moved)/song 1.chopro'),
        createFileMetadata('/band (moved)/song 2.chopro'),
        createFileMetadata('/band (moved)/song 3.chopro'),
        createFolderMetadata('/band (moved)/to-practice'),
      ]);
      expect(folderListings?.path).toEqual('/band (moved)');
    }

    // Check the listings at '/band (moved)/to-practice'
    {
      const folderListings = await db.getFolderListing(
        '/band (moved)/to-practice',
      );
      expect(folderListings?.files).toEqual([
        createFileMetadata('/band (moved)/to-practice/practice 1.chopro'),
        createFileMetadata('/band (moved)/to-practice/practice 2.chopro'),
      ]);
    }

    // The database file's should be updated.
    expect(await db.getFile('/band/song 3.chopro')).toBe(undefined);
    expect(await db.getFile('/band (moved)/song 3.chopro')).toBeTruthy();
    expect(await db.getFile('/band/to-practice/practice 2.chopro')).toBe(
      undefined,
    );
    expect(
      await db.getFile('/band (moved)/to-practice/practice 2.chopro'),
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

    db.close();
  });

  it('can delete a file in a subfolder', async () => {
    const { fetchTextFile, fetchFileListing, dispatch, db } =
      await setupDBWithFiles([
        '/band/song 1.chopro',
        '/band/song 2.chopro',
        '/band/song 3.chopro',
        '/band/song 4.chopro',
      ]);

    // The file should exist.
    expect(await db.getFile('/band/song 3.chopro')).toBeTruthy();
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
    await db.deleteFile(metadata);

    // Check that the file listing in the offline db is up to date.
    const folderListings = await db.getFolderListing('/band');
    expect(folderListings?.files).toEqual([
      createFileMetadata('/band/song 1.chopro'),
      createFileMetadata('/band/song 2.chopro'),
      createFileMetadata('/band/song 4.chopro'),
    ]);

    // The database should be updated.
    expect(await db.getFile('/band/song 3.chopro')).toBe(undefined);

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

    db.close();
  });

  it('can delete a folder', async () => {
    const { fetchTextFile, fetchFileListing, dispatch, db } =
      await setupDBWithFiles([
        '/band/song 1.chopro',
        '/band/song 2.chopro',
        '/band/song 3.chopro',
        '/band/to-practice/practice 1.chopro',
        '/band/to-practice/practice 2.chopro',
      ]);

    // The files should exist before the delete.
    {
      expect(await db.getFile('/band/song 3.chopro')).toBeTruthy();
      expect(
        await db.getFile('/band/to-practice/practice 2.chopro'),
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
    await db.deleteFile(metadata);

    expect(await db.getFolderListing('/band/to-practice')).toEqual(undefined);

    // Check the listings at '/'
    {
      const folderListings = await db.getFolderListing('/');
      expect(folderListings?.files).toEqual([createFolderMetadata('/band')]);
    }

    // Check the listings at '/band'
    {
      const folderListings = await db.getFolderListing('/band');
      expect(folderListings?.files).toEqual([
        createFileMetadata('/band/song 1.chopro'),
        createFileMetadata('/band/song 2.chopro'),
        createFileMetadata('/band/song 3.chopro'),
      ]);
      expect(folderListings?.path).toEqual('/band');
    }

    // The database file's should be updated.
    expect(await db.getFile('/band/song 3.chopro')).toBeTruthy();
    expect(await db.getFile('/band/to-practice/practice 2.chopro')).toBe(
      undefined,
    );

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

    db.close();
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
