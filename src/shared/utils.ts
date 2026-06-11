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
