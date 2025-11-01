/**
 * Allow exhaustive checking of case statements, by throwing an UnhandledCaseError
 * in the default branch.
 */
export class UnhandledCaseError extends Error {
  constructor(value: never, typeName: string) {
    super(`There was an unhandled case for "${typeName}": ${value}`);
    this.name = 'UnhandledCaseError';
  }
}

/**
 * Ensures that a type is never.
 */
export function ensureNever(_value: never) {}

/**
 * Ensure some T exists when the type systems knows it can be null or undefined.
 */
export function ensureExists<T>(
  item: T | null | undefined,
  message: string = 'an item',
): T {
  if (item === null) {
    throw new Error(message || 'Expected ${name} to exist, and it was null.');
  }
  if (item === undefined) {
    throw new Error(
      message || 'Expected ${name} to exist, and it was undefined.',
    );
  }
  return item;
}

export function getEnv(key: string): string {
  if (!process.env[key]) {
    console.error(process.env);
  }
  return ensureExists(process.env[key], `Could not find "${key}" in env file`);
}

/**
 * Mock out Google Analytics for anything that's not production so that we have run-time
 * code coverage in development and testing.
 */
export function maybeMockGoogleAnalytics() {
  if (process.env.NODE_ENV === 'development') {
    (window as any).ga = (event: any, ...payload: any[]) => {
      const style = 'color: #FF6D00; font-weight: bold';
      console.log(`[analytics] %c"${event}"`, style, ...payload);
    };
  } else if (process.env.NODE_ENV !== 'production') {
    (window as any).ga = () => {};
  }
}

let _generation = 0;
export function getGeneration() {
  return _generation++;
}

// test-only
export function resetGeneration() {
  _generation = 0;
}

export function maybeGetProperty(value: any, property: string): string | null {
  if (
    value &&
    typeof value === 'object' &&
    typeof value[property] === 'string'
  ) {
    return value[property];
  }
  return null;
}

export function throttle1<Arg1>(
  callback: (arg1: Arg1) => void,
  flushRef: React.MutableRefObject<null | (() => void)>,
  interval: number,
): (arg1: Arg1) => void {
  let timeout = false;
  let wasFlushed = false;
  let arg1Cache: Arg1;
  return (arg1: Arg1) => {
    arg1Cache = arg1;
    if (timeout || wasFlushed) {
      return;
    }
    timeout = true;

    const timeoutId = setTimeout(() => {
      callback(arg1Cache);
      flushRef.current = null;
      timeout = false;
    }, interval);

    flushRef.current = () => {
      callback(arg1Cache);
      clearTimeout(timeoutId);
      flushRef.current = null;
      wasFlushed = true;
    };
  };
}

/**
 * Access unknown object properties in a type safe way.
 */
export function getProp(object: unknown, ...keys: string[]): unknown {
  for (const key of keys) {
    if (!object || typeof object !== 'object') {
      return null;
    }
    object = (object as any)[key];
  }
  return object;
}

/**
 * Access unknown object string property in a type safe way.
 */
export function getStringProp(
  object: unknown,
  ...keys: string[]
): string | null {
  const value = getProp(object, ...keys);
  if (typeof value === 'string') {
    return value;
  }
  return null;
}

/**
 * Access unknown object number property in a type safe way.
 */
export function getNumberProp(
  object: unknown,
  ...keys: string[]
): number | null {
  const value = getProp(object, ...keys);
  if (typeof value === 'number') {
    return value;
  }
  return null;
}

/**
 * An implementaion of node's path.join().
 */
export function pathJoin(...segments: string[]) {
  const parts: string[] = [];
  for (let segment of segments) {
    if (parts.length > 0 && segment[0] === '/') {
      // Remove leading slashes from non-first part.
      segment = segment.slice(1);
    }
    if (segment[segment.length - 1] === '/') {
      segment = segment.slice(0, segment.length - 1);
    }
    parts.push(...segment.split('/'));
  }

  const resultParts: string[] = [];
  for (const part of parts) {
    if (part === '.') {
      continue;
    }
    if (part === '..') {
      resultParts.pop();
      continue;
    }
    resultParts.push(part);
  }

  const result = resultParts.join('/');

  // Add on the trailing '/' if it exists
  const endSegment = segments[segments.length - 1];
  if (endSegment && endSegment[endSegment.length - 1] === '/') {
    return result + '/';
  }

  return result;
}

/**
 * Convert an arbitrary Dropbox or network error into a nice message.
 */
export function dropboxErrorMessage(error: any): string {
  if (error?.status >= 500 && error?.status < 600) {
    return 'Dropbox seems to be down at the moment. See https://status.dropbox.com/';
  }
  const name = error?.name;
  if (typeof name === 'string') {
    if (name === 'TypeError') {
      return 'Unable to connect to the internet. Try again?';
    }
  }

  console.error(error);
  return 'There was an error with Dropbox. Try refreshing?';
}

let isSettingScrollTop = false;

/**
 * Listeners should ignore this, as it wasn't user generated.
 */
export function setScrollTop(scrollTop: number) {
  isSettingScrollTop = true;
  const { scrollingElement } = document;
  if (scrollingElement) {
    scrollingElement.scrollTop = scrollTop;
  }
  // Go ahead and give a full rAF cycle to ignore user events.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      isSettingScrollTop = false;
    });
  });
}

/**
 * See if the app is setting the scrolltop, as it may be ignorable.
 */
export function isAppSettingScrollTop(): boolean {
  return isSettingScrollTop;
}

// List taken from: https://developer.mozilla.org/en-US/docs/Web/Media/Formats/Image_types
export const imageExtensions = new Set([
  'apng',
  'avif',
  'gif',
  'jpg',
  'jpeg',
  'jfif',
  'pjpeg',
  'pjp',
  'png',
  'svg',
  'webp',
  'bmp',
  'ico',
  'cur',
  'tif',
  'tiff',
]);

export function getUrlForFile(fsName: string, path: string): string | null {
  let extension;
  for (let i = path.length; i >= 0; i--) {
    if (path[i] === '/') {
      break;
    }
    if (path[i] === '.') {
      extension = path.slice(i - path.length + 1);
    }
  }
  if (extension === 'pdf') {
    return fsName + '/pdf' + path;
  }
  if (isChordProExtension(extension)) {
    return fsName + '/file' + path;
  }
  if (extension && imageExtensions.has(extension)) {
    return fsName + '/image' + path;
  }
  return null;
}

/**
 * getDirName('/foo/bar/baz.html') === '/foo/bar'
 */
export function getDirName(path: string): string {
  const parts = path.split('/');
  parts.pop();
  const folder = parts.join('/');
  if (folder === '') {
    return '/';
  }
  return folder;
}

/**
 * getPathFileName('/foo/bar/baz.html') === 'baz.html'
 */
export function getPathFileName(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1];
}

/**
 * Get the file name component of a path, with no extension.
 */
export function getPathFileNameNoExt(path: string) {
  const fileName = getPathFileName(path);
  return fileName.replace(/\.\w+$/, '');
}
/**
 * Dropbox doesn't support relative paths, but a user may input them.
 * Canonicalize them so that Dropbox is happy.
 */
export function canonicalizePath(path: string): string {
  const parts = path.split('/');
  const finalParts = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (i === 0 && part === '') {
      // '/Songs/../Hey Jude' -> ["", "Songs", "..", "Hey Jude"]
      //                          ^^ skip this one
      continue;
    }
    if (part === '.') {
      continue;
    }
    if (part === '..') {
      finalParts.pop();
      continue;
    }
    finalParts.push(part);
  }
  return '/' + finalParts.join('/');
}

export function updatePathRoot(path: string, oldRoot: string, newRoot: string) {
  return newRoot + path.slice(oldRoot.length);
}

/**
 * Downloads a file blob for a user by creating and clicking a `<a>` tag on the user's
 * behalf.
 */
export function downloadBlobForUser(fileName: string, blob: Blob): void {
  const a = document.createElement('a');
  const url = window.URL.createObjectURL(blob);

  a.style.display = 'none';
  document.body.appendChild(a);
  a.href = url;
  a.download = fileName;
  a.click();
  window.URL.revokeObjectURL(url);
  a.remove();
}

export function isChordProFilePath(path: string) {
  const parts = path.split('.');
  const extension = parts[parts.length - 1].toLocaleLowerCase();
  return isChordProExtension(extension);
}

export function isChordProExtension(extension: string | undefined) {
  // Known extensions: https://www.chordpro.org/chordpro/chordpro-file-format-specification/
  return (
    extension === 'chopro' ||
    extension === 'chordpro' ||
    extension === 'cho' ||
    extension === 'crd' ||
    extension === 'chord' ||
    extension === 'pro'
  );
}

/**
 * A type aware version of Object.entries.
 */
export function typedObjectEntries<T extends object, K extends keyof T>(
  obj: T,
): [K, T[K]][] {
  return Object.entries(obj as any) as any;
}

/**
 * Convert some value into a record to bypass some of TS's constraints
 * on interface access.
 */
export function asRecord<T extends object>(obj: T): Record<string, unknown> {
  return obj as any;
}

/**
 * Convert some value into a record to bypass some of TS's constraints
 * on interface access, but retain the typ
 */
export function asTypedRecord<T extends object, K extends keyof T>(
  obj: T,
): Record<K, T[K]> {
  return obj as any;
}

export function assertType<T>(value: T): T {
  return value;
}

export function debounce<F extends (...args: any) => void>(
  callback: F,
  wait: number,
): F {
  let timeout: ReturnType<typeof setTimeout>;

  const result: any = (...args: any[]): void => {
    clearTimeout(timeout);

    timeout = setTimeout(() => {
      callback(...args);
    }, wait);
  };

  return result;
}

/**
 * Inserts text at a line index in a source text.
 */
export function insertTextAtLine(
  source: string,
  lineIndex: number,
  insert: string,
) {
  let count = 0;
  let startIndex = 0;
  for (startIndex = 0; startIndex < source.length; startIndex++) {
    if (source[startIndex] === '\n') {
      count++;
    }
    if (count === lineIndex) {
      break;
    }
  }

  return source.slice(0, startIndex) + '\n' + insert + source.slice(startIndex);
}

export function isElementInViewport(element: Element): boolean {
  const rect = element.getBoundingClientRect();

  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <=
      (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

/**
 * Convert EventTargets or raw Elements into HTMLElements to get access to the
 * prototype methods of HTMLElement.
 */
export function htmlElementOrNull(
  value: Node | Element | HTMLElement | EventTarget | null | undefined,
): HTMLElement | null {
  if (value instanceof HTMLElement) {
    return value;
  }
  return null;
}

/**
 * Ternaries in React components can be awkward. Instead this function makes it a bit
 * cleaner.
 */
export function ifExists<T>(value: any, lambda: () => T) {
  return value ? lambda() : null;
}

export function sluggify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD') // Decompose accented characters
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumerics with dashes
    .replace(/^-+|-+$/g, '') // Trim leading/trailing dashes
    .replace(/-{2,}/g, '-'); // Collapse multiple dashes
}

const scriptLoaded: Map<string, Promise<void>> = new Map();

/**
 * Make sure a script gets dynamically loaded.
 */
export function ensureScriptLoaded(src: string): Promise<void> {
  const loadedPromise = scriptLoaded.get(src);
  if (loadedPromise) {
    return loadedPromise;
  }
  const { resolve, reject, promise } = Promise.withResolvers<void>();
  scriptLoaded.set(src, promise);

  const script = document.createElement('script');
  script.src = src;
  script.async = true;
  script.onload = () => resolve();
  script.onerror = (error) => reject(error);
  document.head.appendChild(script);

  return promise;
}

import type * as PDFJS from 'pdfjs-dist';

export async function getPDFJS(): Promise<typeof PDFJS> {
  await ensureScriptLoaded('/pdf.min.js');
  const pdfjs: typeof PDFJS = (window as any).pdfjsLib;

  if (process.env.NODE_ENV !== 'test') {
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.js';
  }
  return pdfjs;
}

import type * as ZIP from '@zip.js/zip.js';

export async function getZipJs(): Promise<typeof ZIP> {
  await ensureScriptLoaded('/zip.min.js');
  return (window as any).zip;
}

/**
 * Process items with bounded concurrency. If the initial chunks all fail, then the
 * processing is canceled
 */
export function processInChunks<T>(
  items: Iterable<T>,
  concurrency: number,
  fn: (item: T) => Promise<void>,
) {
  const iterator = items[Symbol.iterator]();
  const taskStatuses = new Set<Promise<boolean>>();
  const { resolve, reject, promise } = Promise.withResolvers();
  let initialBlocker = Promise.resolve();
  let failed = false;
  let allDone = false;

  const startNextItem = async () => {
    if (failed) {
      return;
    }
    const { done, value } = iterator.next();
    if (done) {
      if (!allDone) {
        Promise.all(taskStatuses).then(resolve);
        allDone = true;
      }
      return;
    }

    const nextPromise = initialBlocker.then(() => fn(value));

    // Mark the task status.
    taskStatuses.add(
      nextPromise.then(
        () => true, // success
        () => false, // failure
      ),
    );

    nextPromise.then(
      () => {
        // We're ready to start the next task.
        startNextItem();
      },
      (error) => {
        console.error(error);
        if (!failed) {
          startNextItem();
        }
      },
    );
  };

  for (let i = 0; i < concurrency; i++) {
    startNextItem();
  }

  // Go through all of the initial batch.
  initialBlocker = Promise.all(taskStatuses).then((statuses) => {
    if (statuses.every((status) => !status)) {
      // Every initial task failed. Cancel and reject.
      failed = true;
      reject();
    }
  });

  return promise;
}

export function isInViewport(el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= window.innerHeight &&
    rect.right <= window.innerWidth
  );
}

/**
 * Ensures that an element is visible within the viewport, and scrolls if not.
 */
export function ensureElementIsInView(
  element: Element,
  options?: Partial<{
    topOffset: number;
    bottomOffset: number;
    behavior: ScrollBehavior;
  }>,
): void {
  const topOffset = options?.topOffset ?? 0;
  const bottomOffset = options?.bottomOffset ?? 0;
  const behavior = options?.behavior ?? 'smooth';

  const { top, bottom } = element.getBoundingClientRect();

  if (top < topOffset) {
    // The element is above the page.
    window.scrollBy({
      top: top - topOffset,
      behavior,
    });
  } else if (bottom > window.innerHeight - bottomOffset) {
    // The element is below the page.
    window.scrollBy({
      top: bottom - window.innerHeight + bottomOffset,
      behavior,
    });
  }
}

/**
 * Normalizes the keyboard event into a string representation appropriate for
 * case statements.
 */
export function getKeyboardString(event: KeyboardEvent) {
  let key = '';
  if (event.metaKey && event.key !== 'Meta') {
    key += 'Meta+';
  }
  if (event.ctrlKey && event.key !== 'Control') {
    key += 'Control+';
  }
  if (event.altKey && event.key !== 'Alt') {
    key += 'Alt+';
  }
  if (event.shiftKey && event.key !== 'Shift') {
    key += 'Shift+';
  }
  key += event.key;
  return key;
}
