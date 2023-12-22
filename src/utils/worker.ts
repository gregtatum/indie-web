/**
 * This file contains code that is worker-safe. It is re-exported to the main index as well.
 */

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
