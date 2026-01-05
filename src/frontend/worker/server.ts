import {
  IDBError,
  IDBFS,
  openIDBFS,
} from 'frontend/logic/file-store/indexeddb-fs';

type IDBFSRequest = {
  type: 'idbfs-request';
  id: string;
  name: string;
  method: string;
  args: unknown[];
};

type WorkerError = {
  kind?: 'idb-error';
  message: string;
  isNotFound?: boolean;
};

/**
 * The shared worker allows for all tabs to share a context for working with files.
 * This allows for centralized activities such as caching and indexing.
 */
export class WorkerServer {
  #worker: SharedWorkerGlobalScope;
  #ports: MessagePort[] = [];
  #idbfsByName = new Map<string, Promise<IDBFS>>();

  log(...args: any[]) {
    console.log('[worker.server]', ...args);
  }

  constructor() {
    this.#worker = self as unknown as SharedWorkerGlobalScope;
    this.#initialize();
    this.log('initialized');
  }

  #initialize(): void {
    this.#worker.onconnect = (event) => {
      const port = event.ports[0];
      if (!port) {
        return;
      }
      this.#ports.push(port);
      port.start();
      port.postMessage({
        type: 'worker-ready',
        connectionCount: this.#ports.length,
      });

      port.addEventListener('message', this.#messagePortHandler(port));
    };
  }

  /**
   * Handle the requests that come from individual ports.
   */
  #messagePortHandler(port: MessagePort) {
    return (messageEvent: MessageEvent<unknown>) => {
      const { data } = messageEvent;
      if (!data || typeof data !== 'object' || !('type' in data)) {
        console.error(data);
        throw new Error('Unexpected message received.');
      }
      this.log('message recieved', data);

      if (data.type === 'ping') {
        port.postMessage({
          type: 'pong',
          connectionCount: this.#ports.length,
          receivedAt: Date.now(),
        });
        return;
      }

      if (data.type === 'idbfs-request') {
        // The method should be infallible, and posts the error response.
        void this.#handleIDBFSRequest(port, data as IDBFSRequest);
      }
    };
  }

  /**
   * Forward the IDBFS requests, and forward them to the @see {IDBFS}
   */
  async #handleIDBFSRequest(
    port: MessagePort,
    message: IDBFSRequest,
  ): Promise<void> {
    const { id, name, method, args } = message;
    try {
      const idbfs = await this.#getIDBFS(name);
      const handler = (idbfs as any)[method];
      if (typeof handler !== 'function') {
        throw new Error(`Unknown IDBFS method: ${method}`);
      }
      let result = await handler.apply(idbfs, args);
      if (method === 'getCachedFolderListing' && result instanceof Set) {
        result = [...result];
      }
      port.postMessage({
        type: 'idbfs-response',
        id,
        ok: true,
        result,
      });
    } catch (error) {
      port.postMessage({
        type: 'idbfs-response',
        id,
        ok: false,
        error: this.#serializeError(error),
      });
    }
  }

  #serializeError(error: unknown): WorkerError {
    if (error instanceof IDBError) {
      return {
        kind: 'idb-error',
        message: String((error as any).error ?? 'IndexedDB error'),
        isNotFound: error.isNotFound(),
      };
    }
    const message =
      typeof error === 'object' && error && 'message' in error
        ? String((error as any).message)
        : String(error);
    return { message };
  }

  async #getIDBFS(name: string): Promise<any> {
    let idbfs = this.#idbfsByName.get(name);
    if (!idbfs) {
      idbfs = openIDBFS(name);
      this.#idbfsByName.set(name, idbfs);
    }
    return idbfs;
  }
}
