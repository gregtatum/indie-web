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

type Parser<T> = (value: unknown) => T | null;

/**
 * Wraps one localStorage key with shared read/write/remove behavior. Subclasses
 * own the raw string conversion for each persisted shape.
 */
abstract class LocalStorageEntry<T> {
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
class StringEntry extends LocalStorageEntry<string | null> {
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
class BooleanEntry extends LocalStorageEntry<boolean | null> {
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
class NumberEntry extends LocalStorageEntry<number | null> {
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
class JsonEntry<T> extends LocalStorageEntry<T> {
  private parse: Parser<T>;
  private defaultValue: T;

  constructor(key: string, parse: Parser<T>, defaultValue: T) {
    super(key);
    this.parse = parse;
    this.defaultValue = defaultValue;
  }

  protected readRaw(raw: string | null): T {
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

  protected writeRaw(value: T): string {
    return JSON.stringify(value);
  }
}

/**
 * Validates the persisted OAuth token bundle without checking expiration.
 */
function parseDropboxOauth(value: unknown): T.DropboxOauth | null {
  const accessToken = getStringProp(value, 'accessToken');
  const refreshToken = getStringProp(value, 'refreshToken');
  const expires = getNumberProp(value, 'expires');
  if (accessToken !== null && refreshToken !== null && expires !== null) {
    return { accessToken, refreshToken, expires };
  }
  return null;
}

/**
 * Keeps backward compatibility with older saved servers that did not have an id
 * or storeType by deriving the same defaults the old reader used.
 */
function parseFileStoreServers(value: unknown): T.FileStoreServer[] | null {
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
}

/**
 * Reads editor autocomplete settings with per-editor defaults. Missing fields
 * are valid because older persisted values may not include every editor.
 */
function parseEditorAutocompleteSettings(
  value: unknown,
): EditorAutocompleteSettings | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return {
    markdown: Boolean(getBooleanishProp(value, 'markdown')),
    chordpro: Boolean(getBooleanishProp(value, 'chordpro') ?? true),
  };
}

/**
 * Validates the shape of a resume snapshot. Freshness and server matching are
 * playback correctness checks, so they stay in the audio player hook.
 */
function parseMusicPlaybackResume(value: unknown): MusicPlaybackResume | null {
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
}

/**
 * Validates saved column widths. UI constraints such as minimum width are
 * applied by the music table code that consumes this value.
 */
function parseMusicTrackColumnWidths(
  value: unknown,
): MusicTrackColumnWidths | null {
  const artist = getNumberProp(value, 'artist');
  const album = getNumberProp(value, 'album');
  if (artist !== null && album !== null) {
    return { artist, album };
  }
  return null;
}

/**
 * Reads optional boolean object fields while rejecting non-boolean values.
 */
function getBooleanishProp(object: unknown, key: string): boolean | null {
  if (!object || typeof object !== 'object') {
    return null;
  }
  const value = (object as Record<string, unknown>)[key];
  return typeof value === 'boolean' ? value : null;
}

export const localStorageEntries = {
  dropboxOauth: new JsonEntry<T.DropboxOauth | null>(
    'dropboxOauth',
    parseDropboxOauth,
    null,
  ),
  fileStoreServers: new JsonEntry<T.FileStoreServer[]>(
    'fileStoreServers',
    parseFileStoreServers,
    [],
  ),
  fileStoreServer: new StringEntry('fileStoreServer'),
  appHideEditor: new BooleanEntry('appHideEditor'),
  appEditorOnly: new BooleanEntry('appEditorOnly'),
  fileStoreName: new StringEntry('fileStoreName'),
  openAIApiKey: new StringEntry('openAIAPIKey'),
  hasOnboarded: new BooleanEntry('hasOnboarded'),
  editorAutocompleteSettings: new JsonEntry<EditorAutocompleteSettings>(
    'editorAutocompleteSettings',
    parseEditorAutocompleteSettings,
    { markdown: false, chordpro: true },
  ),
  experimentalFeatures: new BooleanEntry('experimentalFeatures'),
  fileStoreCacheEnabled: new BooleanEntry('fileStoreCacheEnabled'),
  dropboxCodeVerifier: new StringEntry('dropboxCodeVerifier'),
  dropboxRedirectURL: new StringEntry('dropboxRedirectURL'),
  musicPlaybackResume: new JsonEntry<MusicPlaybackResume | null>(
    'musicPlaybackResume',
    parseMusicPlaybackResume,
    null,
  ),
  musicTrackColumnWidths: new JsonEntry<MusicTrackColumnWidths | null>(
    'musicTrackColumnWidths',
    parseMusicTrackColumnWidths,
    null,
  ),
  splitterOffset(key: string): LocalStorageEntry<number | null> {
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
