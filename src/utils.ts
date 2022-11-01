/**
 * Allow exhaustive checking of case statements, by throwing an UnhandledCaseError
 * in the default branch.
 */
export class UnhandledCaseError extends Error {
  constructor(value: never, typeName: string) {
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    super(`There was an unhandled case for "${typeName}": ${value}`);
    this.name = 'UnhandledCaseError';
  }
}

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
  return ensureExists(process.env[key], `Could not find "${key}" in .env file`);
}

/**
 * Mock out Google Analytics for anything that's not production so that we have run-time
 * code coverage in development and testing.
 */
export function maybeMockGoogleAnalytics() {
  if (process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    (window as any).ga = (event: any, ...payload: any[]) => {
      const style = 'color: #FF6D00; font-weight: bold';
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions, @typescript-eslint/no-unsafe-argument
      console.log(`[analytics] %c"${event}"`, style, ...payload);
    };
  } else if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    typeof value[property] === 'string'
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
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
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  if (error?.status >= 500 && error?.status < 600) {
    return 'Dropbox seems to be down at the moment. See https://status.dropbox.com/';
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  const name = error?.name;
  if (typeof name === 'string') {
    if (name === 'TypeError') {
      return 'Unable to connect to the internet. Try again?';
    }
  }

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

export function getDirName(path: string): string {
  return path.split('/').slice(0, -1).join('/');
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

export function getUrlForFile(path: string): string | null {
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
    return '/pdf' + path;
  }
  if (extension === 'chopro' || extension === 'chordpro') {
    return '/file' + path;
  }
  if (extension && imageExtensions.has(extension)) {
    return '/image' + path;
  }
  return null;
}
