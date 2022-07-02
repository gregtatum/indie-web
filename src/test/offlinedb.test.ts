import * as Offline from 'src/logic/offline-db';
import { createStore } from 'src/store/create-store';
import { ensureExists } from 'src/utils';
import { createMetadata } from './fixtures';

describe('offline db', () => {
  it('opens', async () => {
    await Offline.openDB();
  });

  it('can add files', async () => {
    const { dispatch } = createStore();
    const db = await dispatch(Offline.openDB());
    const path = '/band/song.chopro';
    expect(await db.getFile(path)).toBeUndefined();

    const metadata = createMetadata('song.chopro', path);
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

    const metadata = createMetadata('song.chopro', path);
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
      createMetadata('song.chopro', path),
      createMetadata('song.chopro', path),
      createMetadata('song.chopro', path),
      createMetadata('song.chopro', path),
    ];

    await db.addFolderListing(path, files);

    const folderListings = ensureExists(await db.getFolderListing(path));
    expect(folderListings.files).toEqual(files);
    expect(folderListings.path).toEqual(path);
    db.close();
  });
});
