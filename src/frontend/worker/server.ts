type WorkerMessage = {
  type?: string;
};

/**
 * The shared worker allows for all tabs to share a context for working with files.
 * This allows for centralized activities such as caching and indexing.
 */
export class WorkerServer {
  #worker: SharedWorkerGlobalScope;
  #ports: MessagePort[] = [];

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

      port.addEventListener('message', (messageEvent) => {
        const { data } = messageEvent;
        if (!data || typeof data !== 'object') {
          return;
        }
        this.log('message recieved', data);

        if ((data as WorkerMessage).type === 'ping') {
          port.postMessage({
            type: 'pong',
            connectionCount: this.#ports.length,
            receivedAt: Date.now(),
          });
        }
      });
    };
  }
}
