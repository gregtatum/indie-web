import { ensureExists } from 'frontend/utils';

type WorkerMessage = {
  type?: string;
  connectionCount?: number;
};

type WorkerError = {
  kind?: 'idb-error';
  message: string;
  isNotFound?: boolean;
};

type WorkerResponse = {
  type: 'idbfs-response';
  id: string;
  ok: boolean;
  result?: unknown;
  error?: WorkerError;
};

type WorkerPing = {
  type: 'ping';
  source: string;
  sentAt: number;
};

export class WorkerClient {
  #worker: SharedWorker;
  #pending = new Map<
    string,
    {
      resolve: (value: any) => void;
      reject: (error: WorkerError) => void;
    }
  >();
  #requestId = 0;

  constructor() {
    const scripts = document.querySelectorAll('script[src$="bundle.js"]');
    if (scripts.length === 0) {
      throw new Error('Could not find the bundle.js script.');
    }

    if (scripts.length > 1) {
      throw new Error('More than one bundle.js script was found.');
    }
    const [script] = scripts;
    const src = ensureExists(
      script.getAttribute('src'),
      "The src attribute didn't exist",
    );
    this.#worker = new SharedWorker(src);
    this.#worker.port.start();
    this.#worker.port.addEventListener('message', (event) => {
      const { data } = event;
      if (!data || typeof data !== 'object') {
        return;
      }
      const message = data as WorkerMessage | WorkerResponse;
      if (message.type === 'idbfs-response' && 'id' in message) {
        const response = message as WorkerResponse;
        const pending = this.#pending.get(response.id);
        if (!pending) {
          return;
        }
        this.#pending.delete(response.id);
        if (response.ok) {
          pending.resolve(response.result);
        } else {
          pending.reject(
            response.error ?? { message: 'Unknown worker error.' },
          );
        }
        return;
      }
      if (message.type === 'worker-ready' || message.type === 'pong') {
        console.log('[worker.client]', message);
      }
    });
  }

  requestIDBFS<T>(name: string, method: string, args: unknown[]): Promise<T> {
    const id = `${Date.now()}-${this.#requestId++}`;
    this.#worker.port.postMessage({
      type: 'idbfs-request',
      id,
      name,
      method,
      args,
    });

    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
    });
  }

  ping(): void {
    const message: WorkerPing = {
      type: 'ping',
      source: window.location.href,
      sentAt: Date.now(),
    };
    this.#worker.port.postMessage(message);
  }
}
