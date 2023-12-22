let worker: SharedWorker;

export function getSharedWorkerPort(): MessagePort {
  if (!worker) {
    // @ts-ignore - import.meta requires a different module resolution, but this breaks
    // some of the types to change it, so for now just suppress the error.
    worker = new SharedWorker(new URL('./worker.ts', import.meta.url));
  }
  return worker.port;
}
