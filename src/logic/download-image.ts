import { T } from 'src';
import { fixupFileMetadata } from 'src/logic/offline-db';
import { pathJoin } from 'src/utils';
import { FileSystem } from 'src/logic/file-system';

export const imageCache: Record<string, string> = Object.create(null);

/**
 * Downloads an image from Dropbox and returns the objectURL.
 */
export async function downloadImage(
  fileSystem: FileSystem,
  db: T.OfflineDB | null,
  folderPath: string,
  unresolvedSrc: string,
): Promise<string> {
  const src =
    unresolvedSrc[0] === '/'
      ? // This is an absolute path.
        unresolvedSrc
      : // This is a relative path.
        pathJoin(folderPath, unresolvedSrc);

  if (imageCache[src]) {
    // Would it be better to just get this from the IndexedDB?
    return imageCache[src];
  }

  try {
    if (db) {
      try {
        const file = await db.getFile(src);
        if (file?.type === 'blob') {
          const objectURL = (imageCache[src] = URL.createObjectURL(file.blob));
          return objectURL;
        }
      } catch (error) {
        console.error('Error with indexeddb', error);
      }
    }

    const { blob, metadata } = await fileSystem.loadBlob(src);
    if (db) {
      await db.addBlobFile(metadata, blob);
    }
    const objectURL = (imageCache[src] = URL.createObjectURL(blob));
    return objectURL;
  } catch (error) {
    console.error('Could not download image', error);
    throw error;
  }
}
