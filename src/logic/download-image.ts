import { pathJoin } from 'src/utils';
import { FileSystem } from 'src/logic/file-system';
import { IDBError } from './file-system/indexeddb-fs';

export const imageCache: Record<string, string> = Object.create(null);

/**
 * Downloads an image from Dropbox and returns the objectURL.
 */
export async function downloadImage(
  fileSystem: FileSystem,
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
    if (fileSystem.cache) {
      try {
        const file = await fileSystem.cache.loadBlob(src);
        const objectURL = (imageCache[src] = URL.createObjectURL(file.blob));
        return objectURL;
      } catch (error) {
        (error as IDBError)?.cacheLog();
      }
    }

    const { blob } = await fileSystem.loadBlob(src);
    const objectURL = (imageCache[src] = URL.createObjectURL(blob));
    return objectURL;
  } catch (error) {
    console.error('Could not download image', error);
    throw error;
  }
}
