import type { Store } from 'frontend/@types';

let store: Store | null = null;

export function setStore(nextStore: Store): void {
  store = nextStore;
}

export function getStore(): Store | null {
  return store;
}
