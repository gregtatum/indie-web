# Plan: Music Player (Experimental)

## Context

This app has a `FileStore` abstraction with three implementations: `DropboxFS`, `ServerFS`, and an
`IndexedDB` caching layer. There is an existing Node.js/Express Docker server (`src/server/`) that
mounts a local directory and exposes file operations over HTTP. The goal is to build an MP3 player
feature backed exclusively by a **music-specific `ServerFS` instance**.

Dropbox is explicitly **not supported** for the music feature. The music feature is gated behind the
existing "Enable experimental features" toggle.

---

## Decisions

- **Index storage**: A JSON file at a well-known hidden path inside the mount (e.g. `/.music-index.json`),
  not visible in the file browser UI.
- **Index scope**: Server-side singleton. Because the server is a single Node.js process, write
  conflicts are avoided naturally. No multi-client stomping concern.
- **Multi-mount strategy**: If a user wants music on a different mount point, they run a second
  instance of the server pointed at that directory. No subfolder routing inside one server.
- **UI**: Incrementally start with the existing file browser view. A custom player UI is out of scope
  for this plan and will be designed separately.
- **Experimental gate**: The entire music feature is behind `experimentalFeatures`. The existing
  server-based file storage is "Beta"; the music store variant is "Experimental".

---

## Working Style

Each step should be a small, focused, reviewable change. After each step:

1. Run `npm run lint-fix` (or equivalent) to auto-fix formatting
2. Run `task test-all` and confirm it passes before moving on

---

## Implementation Steps

### Step 1: Revert existing music WIP commits

Done — reverted externally.

---

### Step 2: Extend `FileStoreServer` type to support a "music" mode

`T.FileStoreServer` currently has `{ url, name, id }`. Add a **required** `storeType` field:

```ts
export interface FileStoreServer {
  url: string;
  name: string;
  id: string;
  storeType: 'files' | 'music';
}
```

Existing stored objects without `storeType` (persisted in localStorage/etc.) must be migrated on
load — coerce missing/unknown values to `'files'` in the `getServers()` hydration function in the
reducer (line ~89 of `reducers/index.ts`).

Update all construction sites of `FileStoreServer` to supply `storeType`.

**Tests:**
- Unit test in `store.test.ts` (or a new `reducers.test.ts`): call `getServers()` with localStorage
  seeded with old-format data (no `storeType`) and assert it returns `storeType: 'files'`.
- Assert that `storeType: 'music'` round-trips correctly through localStorage.

---

### Step 3: Add "Music Storage" option to the FileStorage setup screen

In `FileStorage.tsx` ("Host Your Own Storage File Storage"), add a "Storage Type" radio or select
when experimental features are enabled:

- **File Storage** (default, existing behavior)
- **Music Storage** _(Experimental)_ — only shown when `experimentalFeatures` is true

When "Music Storage" is selected, show a contextual note explaining:
> "Configure the server to point its mount at your music folder. Each mount point requires its own
> server instance."

The `addFileServer` handler should set `storeType: 'music'` on the created `FileStoreServer`.

**Tests** (React Testing Library, following patterns in `App.test.tsx`):
- Render `FileStorage` with experimental features **off**: assert the Music Storage option is absent.
- Render with experimental features **on**: assert the Music Storage option is present.
- Submit the form with Music Storage selected: assert the dispatched action contains
  `storeType: 'music'`.
- Submit with File Storage selected: assert `storeType: 'files'`.

---

### Step 4: Verify multi-instance server configuration is straightforward

Add a short note/section to the setup screen (visible only for music type) confirming the expected
workflow:

> "To use a different music folder, run a separate server instance with a different mount."

**Tests:**
- No automated test. Manual verification: run two server instances at different ports (e.g.
  `PORT=6543` and `PORT=6544`), each with a different `mount/` directory, and confirm the app can
  add both as separate stores and that their file listings are independent.
- Document this in a comment in `docker-compose.yml` or the server README as the expected pattern.

---

### Step 5: Build the music index on the server

Add a new `route-music.ts` to the server:

**`POST /music-index/scan`**
- Recursively walks the mount directory for audio files (`.mp3`, `.flac`, `.m4a`, `.ogg`, `.wav`)
- Reads ID3/metadata tags using the `music-metadata` npm package
- Writes the result atomically to `<mountPath>/.music-index.json` (write to `.tmp`, then rename)
- Returns the full index as JSON
- If a scan is already in progress, reject with a 409

**`GET /music-index`**
- Returns the current `/.music-index.json` if it exists, or `404` if not yet scanned

Index shape (initial, can evolve):
```ts
interface MusicIndex {
  version: 1;
  scannedAt: string; // ISO timestamp
  tracks: TrackMetadata[];
}

interface TrackMetadata {
  path: string;        // client-relative path, e.g. /Artist/Album/track.mp3
  title: string | null;
  artist: string | null;
  album: string | null;
  duration: number | null; // seconds
  size: number;
  mtime: string;       // ISO timestamp — used for incremental re-scan
}
```

**Incremental scan**: On subsequent scans, compare each file's `mtime` + `size` against the cached
entry. Only re-read tags for changed or new files. Remove entries for deleted files.

**Tests** (new server-side test file `src/server/route-music.test.ts`, using supertest + a temp
directory of fixture audio files — real small MP3s or silent ones generated with ffmpeg):
- `GET /music-index` returns 404 before any scan.
- `POST /music-index/scan` returns a valid index with correct track count.
- Track metadata fields (`title`, `artist`, `album`, `duration`) are populated from ID3 tags.
- A second scan with no file changes does not re-read tags (assert via spy on `music-metadata`).
- Modifying a file's mtime causes only that file to be re-scanned.
- A deleted file is removed from the index on next scan.
- Concurrent scan requests: second request gets a 409.

---

### Step 6: Add audio streaming with range request support

The existing `load-blob` endpoint downloads the whole file — not suitable for audio seeking.

Add **`GET /stream-audio?path=...`** to the server:
- Validates path is within mount
- Reads `Range` header and responds with `206 Partial Content` + `Content-Range`
- Sets `Accept-Ranges: bytes` so the browser `<audio>` element can seek
- Falls back to full `200` response if no `Range` header

**Tests** (server-side, supertest):
- Request without `Range` header → `200`, full file body.
- Request with `Range: bytes=0-99` → `206`, correct `Content-Range` header, correct byte length.
- Request with out-of-range bytes → `416 Range Not Satisfiable`.
- Path traversal attempt (e.g. `../../etc/passwd`) → `400`.
- Non-existent path → `404`.

---

### Step 7: Add the Music view (Experimental, behind feature flag)

- Add a `Music` route/component, gated so it only appears when `experimentalFeatures` is true
- The route is only available when the active file store is a `ServerFS` with `storeType: 'music'`
- Initial UI: reuse the existing `ListFiles` / file browser view (same as any other store)
- Show a "Scan Library" button that calls `POST /music-index/scan` and displays progress/status
- Hide `/.music-index.json` from the file listing in the UI

**Tests** (React Testing Library):
- With experimental features **off**: assert the Music nav item / route is not rendered.
- With experimental features **on** and a `storeType: 'files'` store active: assert Music route is
  not accessible.
- With experimental features **on** and a `storeType: 'music'` store active: assert the Music view
  renders and the "Scan Library" button is present.
- Assert `/.music-index.json` does not appear in the rendered file list even if present in the
  mocked server response.

---

### Step 8: Hide `.music-index.json` from the file browser

In the server's `list-files` handler (already has an `ignoredFiles` set containing `.DS_Store`),
add `'.music-index.json'` to the ignored set. This keeps it transparent on disk but invisible in
the UI.

**Tests** (server-side, supertest):
- Create a mount directory containing `.music-index.json` and a normal file.
- Assert `POST /list-files` response does not include `.music-index.json`.
- Assert the normal file is still returned.

---

## Out of Scope (Future)

- Custom music player UI (playback controls, album art, queue, shuffle)
- Dropbox support
- Multi-device index sync
- Cover art extraction
