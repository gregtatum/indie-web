# Batch Edit — design & implementation plan

Status: implemented (see `BatchEditGrid.tsx`, `TrackEditorPanel.tsx`,
`TrackEditorSidebar.tsx`). `task check` passes, including
`BatchEditGrid.test.tsx`. The save-failure/retry test from the plan below was
not added — no real (non-mocked) way to force a single write to fail was
found; the inline error/retry affordance itself is implemented but only
exercised manually. Column resizing was not added to the grid (out of scope
for v1, not mentioned in the plan).

## Problem

`EditTrackModal` already has a real bulk-edit mode (multi-select → "Edit
Selection"): it aggregates `DETAIL_FIELDS` across tracks, shows "Mixed"
placeholders, and applies one typed value to every selected track. What it
can't do is show many tracks at once and edit *each one's own value* — e.g.
fixing 40 mistyped track titles individually without opening 40 modals.

Batch Edit is a new library mode for that: a track-listing grid with a few
core fields editable inline, plus a persistent sidebar (the existing
single/bulk track editor, reused as-is) for anything deeper.

## Entry point

- `TrackContextMenu`: multi-selection gets a new **Batch Edit** item,
  alongside the existing **Edit Selection** (which stays — different job:
  "set one value on everyone" vs. "edit each one's own values").
- Clicking it freezes the current `selectedTrackPaths` into new state
  `batchEditTrackPaths: string[] | null` (action `setMusicBatchEditTrackPaths`).
  `selectedTrackPaths` itself is untouched, so the sidebar immediately shows
  the bulk editor for the whole frozen set.

## Layout / lifecycle

- `MusicLibraryView`'s body currently renders
  `Splitter(AlbumHero | Splitter(FilterPanels | TracksView))`.
  When `batchEditTrackPaths` is non-null, it renders
  `Splitter(BatchEditGrid | TrackEditorSidebar)` instead — a full takeover of
  the primary content area, matching the documented "detail view" pattern
  (inline header with title + actions + close, not a new route).
- Inline header: `Batch Edit · N tracks` + a Close (×) button. Escape also
  exits. Exiting just nulls `batchEditTrackPaths`; selection and filters are
  untouched.
- New splitter gets its own persisted offset key:
  `persistLocalStorage="musicBatchEditSplitterOffset"`.
- Working set is fixed at entry (just the tracks that were selected) — not
  the whole filtered library. No add/remove-from-set UI for v1.

## The grid (`BatchEditGrid`)

- Rows: `tracks.filter(t => batchEditTrackPaths.includes(t.path))`,
  virtualized the same way `Tracks` is today (`@tanstack/react-virtual`).
- CSS grid (not flex — flex can't cleanly support toggleable columns).
  Default columns, all visible: **Track #, Title, Artist, Album Artist,
  Album, Genre**.
- Selection reuses the existing global `selectedTrackPaths` /
  `setMusicSelectedTracks`, with the same click / shift-click / cmd-click
  semantics as `Tracks` — so `TrackEditorSidebar`'s single-vs-bulk logic
  needs zero changes.

### Cell editing

- On top of row selection, the grid tracks a **cell cursor** (row × column)
  for keyboard editing:
  - Arrow keys move the cursor.
  - Tab / Shift+Tab move across columns.
  - Typing a printable character opens an inline `<input>` seeded with that
    character (replacing the cell's value, spreadsheet-style).
  - Enter commits and moves the cursor down a row.
  - Escape cancels and restores the prior value.
- **Save model: immediate per-cell autosave.** Committing a cell fires the
  same single-change shape `EditTrackModal` already builds (one
  `frameId`/value) through `POST /music/write-track-tags`, scoped to that one
  track, then patches the row via the same `applyIndexedTrackChanges` logic
  used today. While in flight: a subtle saving indicator on the cell. On
  failure: inline error state (red outline, click/retry), scoped to that
  cell — no modal, no toast, no batch rollback.

### Row order (sort-lock)

- Row order is **not** a live-derived sort — it's an explicit array
  `batchEditRowOrder: string[]`, computed once and held fixed until the user
  explicitly changes it.
- Initial value: the order the tracks were already in within the underlying
  `tracks` list at entry time (typically Track # within Album already).
- Clicking a column header re-sorts `batchEditRowOrder` by that column's
  current values, **two-state toggle** (asc/desc) on repeated clicks, with a
  direction arrow shown in the active header.
- Editing any cell — including the currently-sorted column — updates the
  track's value in place but never touches `batchEditRowOrder`. Rows do not
  jump under the cursor mid-edit-session. Re-sorting is always an explicit
  header click.
- Cost: O(n) filter + O(n log n) sort only on the rare explicit click; a
  plain array indexed by the virtualizer exactly like today. No perf concern
  at ~1000 rows.

### Column visibility

- Right-click a column header opens a small **checklist popover** (not the
  existing single-shot `Menu`, which closes after one click — bad for
  toggling several columns). Stays open until dismissed (reuse
  `useDismissOnOutsideClick` / `useEscape` patterns from `Menus.tsx`).
- Persisted via a new `persistedState.musicBatchEditColumns` key, same
  mechanism as the existing `musicTrackColumnWidths`.

## The sidebar (`TrackEditorSidebar`)

- Extract `EditTrackModal`'s inner content (header, Details/Artwork/ID3
  `Tabs`, footer, all load/save/bulk-aggregation state) into a standalone
  `TrackEditorPanel` component. Nothing inside it is currently
  modal-specific — only the outermost `<Modal>` wrapper is.
- `EditTrackModal` becomes a thin wrapper:
  `<Modal><TrackEditorPanel .../></Modal>`.
- `TrackEditorSidebar` renders `TrackEditorPanel` directly in the splitter's
  end pane with sidebar chrome (bordered panel, no overlay) instead of modal
  chrome.
- Behavior is inherited for free: single row selected → full single-track
  editor (Artwork/ID3 included); multiple rows selected → existing "Mixed"
  bulk editor. No fork needed since selection is shared.
- A bulk edit applied from the sidebar updates the same `tracks` data the
  grid reads from, so grid cells reflect it live — the sort-lock rule above
  still applies (position doesn't change, content does), regardless of
  whether the edit came from the grid or the sidebar.

## Aesthetics compliance (per `AESTHETICS.md`)

- Pure utility treatment — same bucket as the filter columns / track list,
  not the expressive album hero: `system-ui`, tabular-nums on Track #,
  hairline `--line` row separators only, the existing `--selection-*` ramp
  for row highlight, full-bleed with no surrounding card.
- No display face, no imagery, no atmosphere.
- Inline header (title + actions + close) matches the documented detail-view
  pattern already used elsewhere — no new chrome style introduced.
- New CSS classes follow the existing `{component}{subcomponent}{items}`
  convention: `.musicBatchEdit*`.

## State additions

- `music` reducer: `batchEditTrackPaths: string[] | null`.
- Action: `setMusicBatchEditTrackPaths(paths: string[] | null)`.
- Local component state (not redux, ephemeral/UI-only):
  - `batchEditRowOrder: string[]` + current sort column/direction.
  - Cell cursor position, inline-edit-in-progress value.
  - Per-cell save/error status (keyed by `${path}:${frameId}`).
- `persistedState.musicBatchEditColumns` — new localStorage-backed key,
  mirroring `musicTrackColumnWidths`.

## File-by-file (implementation, once approved)

- `src/frontend/store/reducers/music.ts` — add `batchEditTrackPaths`
  reducer, reset it on `view-music`.
- `src/frontend/store/actions/*` (wherever music actions live) — add
  `setMusicBatchEditTrackPaths`.
- `src/frontend/components/Music/TrackContextMenu.tsx` — add the **Batch
  Edit** menu item for multi-selection.
- `src/frontend/components/Music/MusicLibraryView.tsx` — branch the body
  splitter on `batchEditTrackPaths`.
- `src/frontend/components/Music/BatchEditGrid.tsx` (new) — grid, cell
  cursor/keyboard nav, per-cell autosave, sort-lock, column popover.
- `src/frontend/components/Music/TrackEditorPanel.tsx` (new, extracted from
  `EditTrackModal.tsx`) — the reusable editor guts.
- `src/frontend/components/Music/EditTrackModal.tsx` — shrink to
  `<Modal><TrackEditorPanel /></Modal>`.
- `src/frontend/components/Music/TrackEditorSidebar.tsx` (new) — thin
  sidebar-chrome wrapper around `TrackEditorPanel`.
- `src/frontend/components/Music/index.css` — new `.musicBatchEdit*` rules.
- `src/frontend/logic/persisted-state.ts` (or wherever
  `musicTrackColumnWidths` lives) — add `musicBatchEditColumns`.

## Testing plan

New file `BatchEditGrid.test.tsx`, same real-server harness as
`EditTrackModal.test.tsx` (`useMusicTestServer`, `renderMusicApp`,
`buildMp3WithTags`/`writeTrack`, `clearMusicMount` from
`test/utils/music.tsx`). No mocked music server — every assertion drives the
real DOM and reads back real files/tags.

- **Entry**: write real MP3s, select multiple rows, right-click → Batch
  Edit, assert the grid renders their real tag values.
- **Per-cell autosave**: edit a cell, Enter, then `fetchTrackTags`/
  `fetchIndexTrack` to confirm the frame changed on disk; assert other
  rows/cells are untouched (proves single-track write, not bulk apply).
- **Save failure**: need a real failure condition (no fetch mocking) — e.g.
  a path removed from the mount between scan and edit — to exercise the
  inline error/retry affordance. Flagged as the one item to confirm
  feasibility on before relying on it.
- **Sort-lock**: sort by a column, edit a value in that column such that a
  live re-sort *would* reorder rows, assert DOM order is unchanged; click the
  header again and assert it *does* reorder.
- **Column visibility**: toggle a column off via the header popover, assert
  it disappears; re-render against the same server and assert it stayed
  hidden (localStorage round-trip).
- **Sidebar reuse**: single row selected → full single-track editor incl.
  Artwork/ID3; multiple rows → existing "Mixed" bulk editor. Mostly wiring
  checks since `TrackEditorPanel`'s own logic is already covered by
  `EditTrackModal.test.tsx`.
- **Exit**: Close button and Escape return to the normal library view with
  selection intact.

Guardrails matching the existing file: `INDIE_WEB_SKIP_LOCALHOST_TESTS`
describe-guard, ~30s per-test timeout, `afterEach` clearing the shared mount,
`offsetHeight`/`offsetWidth` jsdom stubs for the virtualizer.

Post-implementation: run `task check` for the automated pass; visual/feel
confirmation (spacing, inline-edit affordance, column popover) needs the user
in a real browser — not claimed as "done" from tests alone.

## Open items

- Feasibility check: a real (non-mocked) way to force one write to fail, for
  the save-failure test.
- Nice-to-have, deferred: a third click on a sorted header to reset to
  original order (declined for v1 — two-state toggle only).
