import * as T from 'frontend/@types';
import { getNumberProp, getStringProp, sluggify } from 'frontend/utils';

export type EditorAutocompleteSettings = {
  markdown: boolean;
  chordpro: boolean;
};

export type MusicPlaybackResume = {
  serverId: string;
  serverUrl: string;
  trackPath: string;
  currentTime: number;
  updatedAt: number;
};

export type MusicTrackColumnWidths = {
  artist: number;
  album: number;
};

/**
 * Wraps one localStorage key with shared read/write/remove behavior. Subclasses
 * own the raw string conversion for each persisted shape.
 */
abstract class Storage<T> {
  readonly key: string;

  constructor(key: string) {
    this.key = key;
  }

  read(): T {
    return this.readRaw(window.localStorage.getItem(this.key));
  }

  write(value: T): void {
    const raw = this.writeRaw(value);
    if (raw === null) {
      window.localStorage.removeItem(this.key);
    } else {
      window.localStorage.setItem(this.key, raw);
    }
  }

  remove(): void {
    window.localStorage.removeItem(this.key);
  }

  protected abstract readRaw(raw: string | null): T;
  protected abstract writeRaw(value: T): string | null;
}

/**
 * Stores plain strings without JSON encoding. Writing null removes the key.
 */
class StringStorage extends Storage<string | null> {
  protected readRaw(raw: string | null): string | null {
    return raw;
  }

  protected writeRaw(value: string | null): string | null {
    return value;
  }
}

/**
 * Stores booleans as "true" / "false" strings. Unknown values read as null so
 * callers can choose the correct feature default.
 */
class BooleanStorage extends Storage<boolean | null> {
  protected readRaw(raw: string | null): boolean | null {
    if (raw === 'true') {
      return true;
    }
    if (raw === 'false') {
      return false;
    }
    return null;
  }

  protected writeRaw(value: boolean | null): string | null {
    return value === null ? null : String(value);
  }
}

/**
 * Stores numbers as strings for legacy layout values like splitter offsets.
 */
class NumberEntry extends Storage<number | null> {
  protected readRaw(raw: string | null): number | null {
    if (raw === null) {
      return null;
    }
    const number = Number(raw);
    return Number.isNaN(number) ? null : number;
  }

  protected writeRaw(value: number | null): string | null {
    return value === null ? null : String(value);
  }
}

/**
 * Stores structured values as JSON and validates only their shape on read.
 * Malformed or structurally invalid values fall back without mutating storage.
 */
class JsonStorage<T, DefaultValue> extends Storage<T | DefaultValue> {
  private parse: (value: unknown) => T | null;
  private defaultValue: DefaultValue;

  constructor(options: {
    key: string;
    defaultValue: DefaultValue;
    parse(value: unknown): T | null;
  }) {
    super(options.key);
    this.parse = options.parse;
    this.defaultValue = options.defaultValue;
  }

  protected readRaw(raw: string | null): T | DefaultValue {
    if (raw === null) {
      return this.defaultValue;
    }
    try {
      const parsed = this.parse(JSON.parse(raw));
      return parsed === null ? this.defaultValue : parsed;
    } catch {
      return this.defaultValue;
    }
  }

  protected writeRaw(value: T | DefaultValue): string {
    return JSON.stringify(value);
  }
}

export const localStorageEntries = {
  fileStoreServer: new StringStorage('fileStoreServer'),
  appHideEditor: new BooleanStorage('appHideEditor'),
  appEditorOnly: new BooleanStorage('appEditorOnly'),
  fileStoreName: new StringStorage('fileStoreName'),
  openAIApiKey: new StringStorage('openAIAPIKey'),
  hasOnboarded: new BooleanStorage('hasOnboarded'),
  experimentalFeatures: new BooleanStorage('experimentalFeatures'),
  fileStoreCacheEnabled: new BooleanStorage('fileStoreCacheEnabled'),
  dropboxCodeVerifier: new StringStorage('dropboxCodeVerifier'),
  dropboxRedirectURL: new StringStorage('dropboxRedirectURL'),

  dropboxOauth: new JsonStorage({
    key: 'dropboxOauth',
    defaultValue: null,
    parse(value): T.DropboxOauth | null {
      const accessToken = getStringProp(value, 'accessToken');
      const refreshToken = getStringProp(value, 'refreshToken');
      const expires = getNumberProp(value, 'expires');
      if (accessToken !== null && refreshToken !== null && expires !== null) {
        return { accessToken, refreshToken, expires };
      }
      return null;
    },
  }),
  fileStoreServers: new JsonStorage({
    key: 'fileStoreServers',
    defaultValue: [] as T.FileStoreServer[],
    parse(value): T.FileStoreServer[] | null {
      if (!Array.isArray(value)) {
        return null;
      }

      const servers: T.FileStoreServer[] = [];
      for (const serverUnknown of value) {
        const url = getStringProp(serverUnknown, 'url');
        const name = getStringProp(serverUnknown, 'name');
        let id = getStringProp(serverUnknown, 'id');
        const rawStoreType = getStringProp(serverUnknown, 'storeType');
        const storeType: T.FileStoreServer['storeType'] =
          rawStoreType === 'music' ? 'music' : 'files';
        if (url && name) {
          if (!id) {
            id = sluggify(name);
          }
          servers.push({ url, name, id, storeType });
        }
      }
      return servers;
    },
  }),

  editorAutocompleteSettings: new JsonStorage({
    key: 'editorAutocompleteSettings',
    defaultValue: { markdown: false, chordpro: true },
    parse(value): EditorAutocompleteSettings | null {
      if (!value || typeof value !== 'object') {
        return null;
      }

      function getBooleanishProp(object: unknown, key: string): boolean | null {
        if (!object || typeof object !== 'object') {
          return null;
        }
        const value = (object as Record<string, unknown>)[key];
        return typeof value === 'boolean' ? value : null;
      }

      return {
        markdown: Boolean(getBooleanishProp(value, 'markdown')),
        chordpro: Boolean(getBooleanishProp(value, 'chordpro') ?? true),
      };
    },
  }),

  musicPlaybackResume: new JsonStorage({
    key: 'musicPlaybackResume',
    defaultValue: null,
    parse(value): MusicPlaybackResume | null {
      const serverId = getStringProp(value, 'serverId');
      const serverUrl = getStringProp(value, 'serverUrl');
      const trackPath = getStringProp(value, 'trackPath');
      const currentTime = getNumberProp(value, 'currentTime');
      const updatedAt = getNumberProp(value, 'updatedAt');
      if (
        serverId !== null &&
        serverUrl !== null &&
        trackPath !== null &&
        currentTime !== null &&
        updatedAt !== null
      ) {
        return { serverId, serverUrl, trackPath, currentTime, updatedAt };
      }
      return null;
    },
  }),

  musicTrackColumnWidths: new JsonStorage({
    key: 'musicTrackColumnWidths',
    defaultValue: null,
    parse(value): MusicTrackColumnWidths | null {
      const artist = getNumberProp(value, 'artist');
      const album = getNumberProp(value, 'album');
      if (artist !== null && album !== null) {
        return { artist, album };
      }
      return null;
    },
  }),

  splitterOffset(key: string): Storage<number | null> {
    return new NumberEntry(key);
  },
};

/**
 * Used for logout and data-removal flows. This intentionally clears every
 * localStorage value for the origin, not just keys registered above.
 */
export function clearAllLocalStorageForUserDataRemoval(): void {
  window.localStorage.clear();
}
