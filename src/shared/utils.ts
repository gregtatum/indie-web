/**
 * Contains pure utils that can be shared with the front-end and server. Do not
 * add any path manipulation utils here as there are different security constraints
 * between the server and frontend, and it's best to keep them separate.
 */

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

/**
 * Fires the callback immediately on the first call, then at most once every
 * `wait` ms for as long as calls keep arriving. The most recent args are used
 * for each trailing fire.
 */
export function throttle<F extends (...args: any) => void>(
  callback: F,
  wait: number,
): F {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let pendingArgs: any[] | null = null;

  function fire(...args: any[]) {
    callback(...args);
    timeout = setTimeout(() => {
      timeout = null;
      if (pendingArgs) {
        const args = pendingArgs;
        pendingArgs = null;
        fire(...args);
      }
    }, wait);
  }

  const result: any = (...args: any[]): void => {
    if (!timeout) {
      fire(...args);
    } else {
      pendingArgs = args;
    }
  };

  return result;
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
 * on interface access, but retain the type.
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
