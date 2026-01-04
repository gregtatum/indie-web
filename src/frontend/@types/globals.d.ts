declare global {
  interface WorkerLocation {
    readonly href: string;
    readonly origin: string;
    readonly protocol: string;
    readonly host: string;
    readonly hostname: string;
    readonly port: string;
    readonly pathname: string;
    readonly search: string;
    readonly hash: string;
    toString(): string;
  }

  interface WorkerNavigator {
    readonly userAgent: string;
    readonly language: string;
    readonly languages: readonly string[];
    readonly onLine: boolean;
    readonly platform: string;
    readonly hardwareConcurrency: number;
  }

  interface SharedWorkerGlobalScope extends EventTarget {
    readonly name: string;
    readonly location: WorkerLocation;
    readonly navigator: WorkerNavigator;
    readonly performance: Performance;
    onconnect:
      | ((this: SharedWorkerGlobalScope, ev: MessageEvent) => unknown)
      | null;
    close(): void;
    addEventListener(
      type: 'connect',
      listener: (this: SharedWorkerGlobalScope, ev: MessageEvent) => unknown,
      options?: boolean | AddEventListenerOptions,
    ): void;
    addEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ): void;
    removeEventListener(
      type: 'connect',
      listener: (this: SharedWorkerGlobalScope, ev: MessageEvent) => unknown,
      options?: boolean | EventListenerOptions,
    ): void;
    removeEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions,
    ): void;
    dispatchEvent(event: Event): boolean;
  }
}

export {};
