/**
 * This file is coercing things into the shape of the store, so be permissive about
 * `any` types here.
 */

import {
  legacy_createStore as reduxCreateStore,
  applyMiddleware,
  type Middleware,
} from 'redux';
import thunk from 'redux-thunk';
import { reducers } from 'src/store/reducers';
import { Store, Action, State } from 'src/@types';
import { T } from 'src';

/**
 * Create a more minimalist action logger.
 */
export const logger =
  (store: Store) => (next: (action: Action) => any) => (action: Action) => {
    const style = 'font-weight: bold; color: #fa0';
    const prevState = store.getState();
    const result = next(action);
    const nextState = store.getState();
    console.log(`[action] %c${action.type}`, style, {
      action,
      prevState,
      nextState,
      stack: (new Error().stack || '(no stack)').split('\n'),
    });
    return result;
  };

/**
 * Isolate the store creation into a function, so that it can be used outside of the
 * app's execution context, e.g. for testing.
 */
export function createStore(): Store {
  const middlewares: Middleware[] = [thunk];

  if (process.env.NODE_ENV !== 'test') {
    middlewares.push(logger as any);
  }
  const store = reduxCreateStore(reducers, applyMiddleware(...middlewares));

  return store as any;
}

function blobToBase64(blob: Blob | undefined): Promise<undefined | string> {
  if (!blob) {
    return Promise.resolve(undefined);
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = () => {
      const { result } = reader;
      if (typeof result === 'string') {
        resolve(result);
      } else {
        reject(new Error());
      }
    };
  });
}

export function base64toBlob(
  b64Data: string,
  contentType = '',
  sliceSize = 512,
): Blob {
  const byteCharacters = atob(b64Data);
  const byteArrays = [];

  for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
    const slice = byteCharacters.slice(offset, offset + sliceSize);

    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }

    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }

  return new Blob(byteArrays, { type: contentType });
}

async function serializeDownloadBlobCache(
  downloadBlobCache: T.DownloadBlobCache,
): Promise<any> {
  const cache: Array<any> = [];
  for (const [k, { metadata, blob }] of downloadBlobCache.entries()) {
    cache.push([
      k,
      {
        metadata,
        blob: await blobToBase64(blob),
      },
    ]);
  }
  return cache;
}

// TODO - This could be written more type safe with a Entries<Map<K,V>> type
// and with a ToRecord<Interface> type. A pseudo-recursive Serializable type
// can be made with:
//
// type SerializableImpl<T> = Record<string, T> | null | string | number;
// type Serializable = SerializeImpl<SerializeImpl<SerializeImpl<never>>>;
export async function serializeState(state: State): Promise<unknown> {
  const { listFilesCache, downloadFileCache, downloadBlobCache } = state;

  return {
    ...state,
    listFilesCache: [...listFilesCache.entries()],
    downloadFileCache: [...downloadFileCache.entries()],
    downloadBlobCache: await serializeDownloadBlobCache(downloadBlobCache),
    offlineDB: null,
  };
}

export function deserializeState(state: any): State {
  const { listFilesCache, downloadFileCache, downloadBlobCache } = state.app;
  return {
    ...state,
    listFilesCache: new Map(listFilesCache),
    downloadFileCache: new Map(downloadFileCache),
    downloadBlobCache: new Map(downloadBlobCache),
  };
}
