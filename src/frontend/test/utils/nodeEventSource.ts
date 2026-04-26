import nodeFetch from 'node-fetch';

/**
 * Minimal EventSource polyfill for jsdom (which lacks a native implementation).
 * Uses node-fetch to buffer the full SSE response then replays events synchronously.
 * Sufficient for tests because the server completes quickly.
 */
export class NodeEventSource {
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  private controller = new AbortController();

  constructor(url: string) {
    nodeFetch(url, { signal: this.controller.signal as any })
      .then((res) => res.text())
      .then((text) => {
        for (const chunk of text.split('\n\n')) {
          if (chunk.startsWith('data: ') && this.onmessage) {
            this.onmessage({ data: chunk.slice(6) });
          }
        }
      })
      .catch(() => {
        this.onerror?.();
      });
  }

  close() {
    this.controller.abort();
  }
}
