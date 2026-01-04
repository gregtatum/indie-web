import { ensureExists } from 'frontend/utils';

type WorkerMessage = {
  type?: string;
  connectionCount?: number;
};

type WorkerPing = {
  type: 'ping';
  source: string;
  sentAt: number;
};

export class WorkerClient {
  #worker: SharedWorker;

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
      const message = data as WorkerMessage;
      if (message.type === 'worker-ready' || message.type === 'pong') {
        console.log('[worker.client]', message);
      }
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
