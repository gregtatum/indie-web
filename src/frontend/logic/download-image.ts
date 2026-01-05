import { pathJoin } from 'frontend/utils';
import { FileStore } from 'frontend/logic/file-store';
import { IDBError } from './file-store/indexeddb-fs';

export const imageCache: Record<string, string> = Object.create(null);

/**
 * Downloads an image from Dropbox and returns the objectURL.
 */
export async function downloadImage(
  fileStore: FileStore,
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
    if (fileStore.cache) {
      try {
        const file = await fileStore.cache.loadBlob(src);
        const objectURL = (imageCache[src] = URL.createObjectURL(file.blob));
        return objectURL;
      } catch (error) {
        if (error instanceof IDBError) {
          error.cacheLog();
        } else {
          console.error(error);
        }
      }
    }

    const { blob } = await fileStore.loadBlob(src);
    const objectURL = (imageCache[src] = URL.createObjectURL(blob));
    return objectURL;
  } catch (error) {
    console.error('Could not download image', error);
    throw error;
  }
}
