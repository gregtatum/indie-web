# Drag-and-drop import & organize — design & implementation plan

Status: Phases 0, 1, 2, and 3 done (`task check` passes, including new
`route-music-staged-batch.test.ts`, `MusicImport.test.tsx`, and unit tests
for `resolveOrganizationPath`/`sanitizeFilenameSegment` in
`shared-music.test.ts`). Phase 2 also wired up the import batch-edit
screen's rendering (which Phase 1 had left unwired) and generalized
`BatchEditGrid`/`TrackEditorSidebar`/`TrackEditorPanel` behind a shared
`MusicTrackSource` so the import and selection-based batch-edit flows share
one implementation. Phase 3 added `OrganizeImportView.tsx` (presets, custom
template input, live per-track preview, per-track path override) and a
shared `useMusicImportDiscardConfirm` hook (now used by both the batch-edit
and organize screens) in `frontend/hooks/music.tsx`. "Back to edit"
persists immediately; free-text template edits are debounced (400ms) before
persisting — **none of this has a real-browser visual confirmation yet**.
Phase 4 (commit) up next. Phases below are the intended checkpoints; each
should land, pass `task check`, and get a visual confirmation in a real
browser before moving to the next.

All frontend tests for this feature live in one file,
`src/frontend/test/MusicImport.test.tsx`, nested by phase — not a new
`*.test.tsx` per screen. Add to it, don't create siblings.

Phase 1 incidentally fixed a real gap: `MusicLibraryView` only rendered the
drop target in its normal (non-error) branch, which meant a never-scanned
mount (showing "Music library not found. Run a scan first.") couldn't accept
a drop at all — closed via `withDropTarget()` wrapping every branch. It also
surfaced and fixed a test-environment-only bug: a native `File`/`Blob`
posted as a fetch body silently serialized to the string "[object File]"
under node-fetch (used by the test harness) — fixed in `ServerFS.saveBlob`
by sending `contents.arrayBuffer()` instead of the Blob itself, plus adding
real `File`/`Blob`/`crypto.randomUUID` to `fix-jsdom.ts`'s environment
patches.

## Problem

Today, adding music means dropping files into some folder in the file
browser, then manually fixing ID3 tags one at a time (or via the existing
selection-based [Batch Edit](BATCH_EDIT_PLAN.md)) and manually placing them
into whatever folder structure the library uses. This plan adds a guided
import: drag a pile of MP3s onto the app, batch-fix their tags, then apply a
folder/filename naming scheme to file them all at once — nothing touches the
real library until you explicitly finish.

## Data-flow decisions (validated against the current server/index code)

- **Staging area:** dropped files upload immediately to a hidden
  `.music-staging/<batchId>/` folder inside the mount. `findAudioFiles` in
  `src/server/music/logic.ts` already skips any dot-prefixed file or
  directory during a scan, and `updateIndexAfterTrackTagWrites` only patches
  tracks that already exist in the persisted index — so files parked here are
  invisible to the real library, filters, and album hero until explicitly
  moved out. No scanner changes needed.
- **Tag editing while staged:** `/write-track-tags` operates purely on a
  client path; it doesn't require index membership. The existing batch-edit
  grid/sidebar/autosave can point at staging paths unmodified.
- **Getting staged tracks into a grid:** staged files aren't in the
  persisted index, so a new endpoint parses just the given paths and returns
  `TrackMetadata[]` without touching `.music-index.json`.
- **Committing:** `/move` (`src/server/file-store/route.ts`) is a raw
  `rename()` — it throws if the destination folder doesn't exist. Commit must
  `create-folder` each new destination directory before moving files into it.

## Template scope (confirmed)

The naming-scheme template controls **both the destination folder and the
filename** — not just the folder. Presets therefore end in a filename
segment, not just a folder path:

```
{Genre}/{Artist}/{Year} - {AlbumArtist}/{Track} - {Title}
{Genre}/{Artist}/{AlbumArtist}/{Track} - {Title}
{Artist}/{Year} - {AlbumArtist}/{Track} - {Title}
{Artist}/{AlbumArtist}/{Track} - {Title}
```

The `.mp3` extension is always appended automatically and is never part of
the template text.

**Tokens:** `{Genre}` `{Artist}` `{AlbumArtist}` `{Album}` `{Year}`
`{Title}` `{Track}` `{Composer}`. `{Track}` zero-pads to 2 digits. A `/` in
the template is a folder separator; a `/` *inside a resolved field value*
(rare, but possible free-text tag data) is replaced, not treated as a
separator — see sanitization below.

**Missing fields:** a track missing a field used by the template (e.g. no
Year) drops that literal token to an empty string but keeps the surrounding
literal text and separators collapse (no empty path segments, no dangling
` - `). This is visible in the live per-track preview before committing, not
a silent surprise.

**Sanitization:** a new shared `sanitizeFilenameSegment()` strips/replaces
filesystem-illegal characters (`/ \ : * ? " < > |` and control characters) in
each *resolved token value* — needed because free-text tags (e.g. an artist
name with a slash) must not accidentally create extra folder nesting or fail
on a Windows-synced Dropbox folder.

## Collision handling (confirmed)

At commit time, if a staged track's resolved destination path collides with
another staged track's destination, or with a file that already exists in
the real library:

- That one track is flagged inline in the batch UI with an error state
  (scoped to the row, same visual language as the existing per-cell
  save-error state in `BatchEditGrid`) and is **not** moved.
- Every other, non-colliding track in the batch commits normally.
- The user fixes the naming/tags for the flagged track (or the template) and
  retries just that row — no full-batch rollback, no full-batch block.

## Persistent header nag & resume

Staged imports must survive navigating away from the import screens (back to
normal library browsing, the Files view, even a page reload) without being
forgotten — surfaced as a small chip in the music toolbar, not just inside
the batch-edit/organize screens themselves.

- **Manifest on disk:** each batch writes `.music-staging/<batchId>/batch.json`
  (plain `fs.writeFile`, no tmp+rename needed — this is ephemeral working
  state, not the durable index) with `{ batchId, createdAt, step, trackPaths, template }`,
  updated whenever the batch's step or template changes.
- **Discovery endpoint:** `GET /music/staged-batches` lists
  `.music-staging/*/batch.json` and returns lightweight summaries
  (`batchId`, `trackCount`, `step`, `createdAt`) — no per-track tag parsing,
  so it's cheap to call on every app load.
- **No special-casing needed for the Files browser:** nothing in
  `src/server/file-store` or `ListFiles.tsx` filters dot-prefixed entries
  today (`.music-index.json` itself is already visible there), so
  `.music-staging/` doesn't need new hide-from-browser logic — consistent
  with existing behavior.
- **Header chip:** added to the existing `toolbar` div in
  `src/frontend/components/Music/index.tsx` (same row as *Scan Library* and
  the *Library / Files* toggle, so it rides the same header-portal mechanism
  for free) — `MusicForServer` calls `GET /music/staged-batches` on mount and
  whenever a batch's step changes. Shows nothing when there are no staged
  batches; otherwise a quiet button, e.g. "3 staged · Resume import", that
  loads the batch (`scan-paths` on its `trackPaths`) and jumps straight to
  its saved `step` (editing or organizing, with its saved template).
- Multiple concurrent staged batches are allowed for v1 (drop twice before
  finishing the first) — the chip shows a count and, if more than one
  exists, clicking opens a short picker rather than guessing which to
  resume.

## Phases

### Phase 0 — Foundations

- `src/server/music/logic.ts` / `route.ts`: new `POST /music-index/scan-paths`
  — reuses the same per-file parsing `performScan` already does internally,
  but takes an explicit path list and returns `TrackMetadata[]` without
  reading or writing `.music-index.json`.
- `src/server/music/logic.ts` / `route.ts`: batch manifest read/write helpers
  and `GET /music/staged-batches` (see *Persistent header nag & resume*).
- `shared/music.ts`: `resolveOrganizationPath(template, track)` and
  `sanitizeFilenameSegment()` — pure, shared so a future "reorganize library"
  action could reuse them without new plumbing.
- `src/frontend/store/reducers/music.ts`: new `musicImportBatch` state —
  `{ batchId: string; tracks: TrackMetadata[]; step: 'editing' | 'organizing'; template: string } | null`,
  kept separate from the real `tracks` list; and `musicStagedBatchSummaries`
  for the header chip's lightweight list.
- Actions: `setMusicImportBatch`, `setMusicImportBatchStep`,
  `setMusicStagedBatchSummaries`, plus per-track update/removal actions
  mirroring `applyIndexedTrackChanges`.

### Phase 1 — Drop target & staging upload

- App-wide drop target in the Library view, wired with the existing
  `Hooks.useFileDrop` (same primitive as `useFolderArtworkDrop` and the file
  browser's upload-on-drop). Styling follows AESTHETICS.md: quiet, spatial
  hover affordance, not a modal takeover.
- Drop filter: `.mp3` only, matching the existing `write-track-tags`
  MP3-only constraint. Non-MP3 files in the drop are reported via the same
  inline-message pattern `uploadFilesWithMessages` already uses for
  unsupported drops (e.g. its folder-drop message), not silently dropped.
- Accepted files upload to `.music-staging/<batchId>/` via
  `fileStore.saveBlob(path, 'add', file)` — the same call
  `uploadFilesWithMessages` already makes.
- After upload, call `scan-paths` on the new staging paths, populate
  `musicImportBatch`, and switch the view into the batch-edit screen.

**Checkpoint:** drop a handful of MP3s onto the library view; confirm they
land in `.music-staging/` on disk and the grid opens pre-populated with their
real tag values.

### Phase 2 — Staged batch-edit screen

- Generalize `BatchEditGrid` and `TrackEditorSidebar` to accept an injected
  track source (paths + a tracks array) instead of hardcoding
  `$$.getMusicTracks()` / the global `batchEditTrackPaths`, so import-mode
  batch editing and the existing selection-based batch edit share one
  implementation.
- In import mode, the header's × close button becomes a primary CTA
  ("Continue") instead. × (or Escape) instead offers to discard the staged
  batch, which deletes `.music-staging/<batchId>/` and clears
  `musicImportBatch`.
- Per-cell autosave is unchanged — it already just POSTs to
  `/write-track-tags` for whatever path it's given.

**Checkpoint:** batch-edit a staged import the same way the existing
selection-based batch edit works today; confirm edits persist to the staged
files and Continue enables once ready.

### Phase 3 — Organization-scheme screen

- New detail-view screen (same inline-header takeover pattern as batch edit)
  shown after Continue: the four built-in presets above, plus a custom text
  input for the same token syntax.
- Live preview: for every staged track, the resolved destination path via
  `resolveOrganizationPath`, updating as the template text changes.
- Per-track override: allow editing a single track's resolved path directly
  in the preview list (covers the rare one-off exception) without having to
  change the whole-batch template.

### Phase 4 — Commit ("Done")

- For each staged track (skipping any already flagged by a collision from a
  prior attempt): `create-folder` the destination directory if needed, then
  `fileStore.move()` from the staging path to the final path.
- Detect and flag collisions per the rule above before issuing any moves for
  the affected row.
- After moves succeed: merge the moved tracks into the live in-memory
  `tracks`/index using the same "patch without a full rescan" approach
  `useMusicIndexFolderArtworkPatch` already uses, then clear
  `musicImportBatch` and return to the normal library view.
- Progress affordance reuses the existing scan message-list pattern
  ("Organizing… 4 / 12") rather than inventing a new one.

**Checkpoint:** full drop → edit → organize → commit cycle; confirm files
land at the expected paths, tags are correct on disk, `.music-staging/` is
empty afterward, and the library view shows the new tracks without a manual
rescan.

### Phase 5 — Edge cases, tests, polish

- Tests: real-server harness (`useMusicTestServer`, `buildMp3WithTags`, no
  mocked music server — matches every existing music test), added as nested
  `describe`s in the same `MusicImport.test.tsx`, covering the full
  drop → stage → edit → organize → commit path, plus: collision handling,
  non-MP3 rejection, discard/cancel cleanup, and a missing-field template
  case.
- `task check` for the automated pass.
- `task screenshots` for the drop-hover state, the import batch-edit screen's
  CTA header, and the organize screen — then a real-browser confirmation
  before calling any of this done, since it's new layout/positioning.
- AESTHETICS.md compliance pass: utility treatment throughout (this is file
  management, not a presentation moment) — no new chrome style invented,
  reuses the existing detail-view/CTA/error-state language.

### Phase 6 — Add `year` to the real music index

Deferred to the end of this process rather than done alongside Phase 0, so
the rest of the plan (and its code) isn't full of caveats about a gap that
stops existing the moment this phase lands.

- Add `year: string | null` to the real `TrackMetadata` type, bump
  `MUSIC_INDEX_VERSION`, add the upgrader in
  `frontend/logic/music/music-index-upgraders.ts`, a `music-index-v{N}.json`
  fixture, and a snapshot test — per the versioning steps already documented
  on `MusicIndex` in `shared/@types/shared.ts`.
- Have `performScan` keep `year` from `scanSingleAudioFile` instead of
  discarding it.
- Once real tracks carry `year`, `StagedTrackMetadata` collapses into plain
  `TrackMetadata` and `scan-paths`/`scanTrackFiles`'s separate `year`
  plumbing can be deleted — at that point `resolveOrganizationPath` also
  works unmodified against real (not just staged) tracks, which is what
  actually unlocks a future "reorganize library" action.

## File-by-file (once approved)

- `src/server/music/logic.ts`, `route.ts` — `scan-paths` endpoint.
- `shared/music.ts` — `resolveOrganizationPath`, `sanitizeFilenameSegment`.
- `src/frontend/store/reducers/music.ts`, `store/actions/*` —
  `musicImportBatch` state and actions.
- `src/frontend/components/Music/BatchEditGrid.tsx`,
  `TrackEditorSidebar.tsx` — generalize the track source.
- `src/frontend/components/Music/MusicLibraryView.tsx` — drop target,
  routing between library / import-batch-edit / organize screens.
- `src/frontend/components/Music/OrganizeImportView.tsx` (new) — the
  naming-scheme screen.
- `src/frontend/components/Music/index.css` — new
  `.musicImport*`/`.musicOrganize*` rules, following the existing
  `{component}{subcomponent}{items}` convention.

## Open items

- Exact CTA copy ("Continue" vs. "Next: Organize" vs. something else) —
  decide during Phase 2/3 UI work, easy to bikeshed live rather than upfront.
- ~~Whether a page reload mid-import should offer to resume~~ — resolved:
  yes, via the persistent header chip + on-disk manifest above.
- Discarding a staged batch (× on the import batch-edit screen, or a
  "discard" action from the header chip's picker) deletes
  `.music-staging/<batchId>/` entirely, including `batch.json` — no
  separate trash/undo for v1, consistent with there being no undo on a
  regular file delete elsewhere in the app today.
