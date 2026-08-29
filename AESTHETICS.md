# Aesthetics

## Philosophy

The app should feel composed, immersive, and quietly premium. The interface stays uncluttered by letting content carry the visual weight while controls, navigation, and supporting information recede until needed. Favor strong hierarchy, generous spacing, confident typography, and large uninterrupted surfaces over excessive cards, borders, labels, and persistent controls. Minimalism should never come at the expense of clarity or usability.

Visual richness should come from presentation rather than decoration. Use scale, imagery, typography, subtle depth, contextual color, and restrained atmospheric backgrounds to give important moments presence. The interface can adapt its tone to the content being shown, while keeping foreground elements precise and highly legible. Utility screens should be clean and efficient; important presentation moments can become more expressive and immersive.

Interaction should feel immediate, spatial, and predictable. Keep primary navigation stable, make the most likely action obvious, and progressively reveal secondary functionality through contextual menus, sheets, expanded states, and detail views. Motion should explain relationships and transitions rather than exist for spectacle. Controls can be visually understated while maintaining generous interaction areas and clear feedback.

The guiding principle is **less visible complexity, not less capability**. Every element should earn its place by improving comprehension, hierarchy, interaction, state, or presentation. The result should feel like a carefully arranged stage: content receives the spotlight, the interface provides structure without competing for attention, and the product knows when to become visually expressive—and when to remain quiet.

## Accessibility

Legibility is a requirement. Visual polish is not. When the two conflict, legibility wins every time — ship the readable version and leave a note for the prettier idea; never the reverse. "It looks more refined faded back" is not a reason to drop below the floor.

- **Contrast floors** — WCAG 2.1 AA, measured as a solid colour against the *actual* background the element sits on (the light page and every tinted card or raised surface it can appear on):
  - Body text, labels, metadata, **syntax highlighting**, placeholder and de-emphasised text: **≥ 4.5:1**. De-emphasised text still carries meaning — "muted" means a *darker* neutral, not a lighter one.
  - Large text (≥ 24px, or ≥ 18.66px bold) and information-bearing non-text marks (icons, focus rings, progress/volume tracks, the boundary of a control, chart strokes): **≥ 3:1**.
  - On the primary reading surfaces — the editor, the rendered document, the track list — aim for **7:1** where it costs nothing.
- **No alpha on a foreground.** Never use `opacity`, or an `rgba()`/`#rrggbbaa` with alpha, to soften text or icons. Composite it to a solid colour over its real background and check that number. A faded mark that lands below the floor is a bug, not a style.
- **Colour is never the only signal.** Pair it with weight, size, an icon, or position. Never rely on hue alone, and never on a red/green distinction, to carry meaning.
- **The violet accent is `--accent-strong` (~8:1 on paper) whenever it is text** — links, syntax marks, captions. `--accent` (`#7c3aed`, ~5.8:1) is for fills, large/bold marks, and control boundaries where size or a background makes up the difference. Never lighten either one for text.
- **Tinted backgrounds are fine** (`--accent-tint` on a selected or hovered row) *because the text on them stays near-black*. Test that pairing in the running app, not the swatch.

## Subject

This is one codebase serving a family of indie-web apps that all sit on the same foundation: your work lives in ordinary files and folders you own—kept in the browser, on a local or network drive, or in Dropbox—in open, portable formats, with no export step and no proprietary database.

- **FloppyDisk.link** — the umbrella. A personal workspace for creative documents and knowledge: Markdown writing with live preview, images, PDFs, and reference material, organized into projects and folders, available across devices and offline. The generalist surface; utility-first throughout.
- **TuneBook.link** (currently BrowserChords.com) — the sheet-music and tab specialization. Render ChordPro with live transpose, capo, and Nashville / Roman-numeral notation; view PDF lead sheets and charts; one standardized format for tabs, lyrics, and notes; practice along with an MP3 attached to a song. The reader/performer surface.
- **TapePlayer.link** — the music player. An iTunes-lineage library: narrow through genre / artist / album columns into a dense, virtualized track list, then hand off to a playback bar and now-playing view. Common audio formats including MP3 and read-only m4a. The listening surface.

Each surface has a different job, so each spends its expressiveness in a different place (see *Utility vs. expressive* below). The philosophy above and the tokens below are shared across all three; the file browser, add-file flow, headers, and viewers are literally shared components and must read as one product.

## Design direction

The intended look is captured in `artifacts/design-direction.png` (FloppyDisk) and `artifacts/music-design-direction*.png` (TapePlayer). These are aspiration, not the current build. The notes below are reconciled against them; where the shipped CSS differs, the direction wins.

## Shared frame

- Every surface runs in the same shell: a top bar of `[brand mark] [context switcher ▾] … [Menu]`, with an optional secondary toolbar beneath it (e.g. TapePlayer's *Scan Library* plus the *Library / Files* toggle).
- The *Library / Files* segmented toggle is the seam between a specialized view and the raw file browser, and the raw side is always the FloppyDisk browser. Every specialized surface keeps this escape hatch.
- Detail views are dismissable panels that take over the primary content area with their own inline header (title, actions, close) — not separate routes. FloppyDisk's Markdown preview and TapePlayer's album detail are the same pattern.
- Breadcrumbs are FloppyDisk's primary navigation: stable, path-shaped, one row.

## Tokens

**Color.** The foreground palette stays near-neutral so artwork and content supply the color. One accent — violet — carries every interaction across all three surfaces.

- `--ink: #111` — headings
- `--body: #000` on `--paper: #fff`
- `--muted: #595959` — labels and secondary metadata; the darkest "quiet" grey that still clears 4.5:1 on `--paper`. There is no lighter `--faint`: anything lower fails the contrast floor (see *Accessibility*).
- `--line: #e6e6e6` — hairline rules, used sparingly (see Structure). Decorative only — never the sole boundary of an interactive control (those need a 3:1 edge).
- `--raised: #fafafa` — toolbars and the playback bar
- `--accent: #7c3aed` — the interactive accent for fills, large/bold marks, and control boundaries: primary buttons, selection fills, progress and volume tracks, the folder and brand marks. ~5.8:1 on `--paper`. Sampled from the direction; treat the hex as approximate.
- `--accent-strong: #5b28d6` — the accent whenever it is **text**: links, syntax-highlight marks, captions. Also the solid fill for a selected filter facet. ~8:1 on `--paper`.
- `--accent-tint: #7c3aed14` — light wash for a selected or hovered row
- `--syntax-string: #0f5132` — the one hue beyond violet/neutral: string-like values in a source editor (ChordPro directive values). Dark green, ~8:1 on `--paper`. Every colour used by syntax highlighting is a token — no literal hex in the highlight styles.
- *Legacy note:* the shipped CSS uses `--primary-color: #004eca` (blue) and `--accent-color: #ce1ebb` (magenta). The direction consolidates on violet; blue retires, and magenta survives only as the FloppyDisk brand mark.
- **Contextual color** — a desaturated wash derived from album art. Not part of the current direction; kept only as a possible future treatment for a full-screen now-playing view. If revived: background surfaces only, never foreground text or controls.

**Type.** Three roles:

- *Utility / UI* — `system-ui` (keep). Native, fast, and invisible: correct for toolbars, filter columns, the track list, the file browser, the editor, and the viewers—i.e. most of every surface.
- *Data* — `system-ui` with `font-variant-numeric: tabular-nums` for track numbers, durations, timestamps, and transpose / capo values. Make this a global rule, not a per-component choice.
- *Display* — one characterful face for presentation moments, validated by the direction: the album title in TapePlayer's album detail, the document title in FloppyDisk's preview panel, the song title on a rendered chart in TuneBook, and empty- / first-run headlines everywhere. Set large in a tight bold. Pick a face with a real point of view (e.g. a text serif such as Fraunces or Source Serif, or a humanist sans such as Söhne or Hanken Grotesk)—not another neutral system sans. Used sparingly.

**Structure.**

- The uppercase ~11px letterspaced label at reduced opacity is the house label style (already set in the filter and track headers). Reuse it wherever a column or section needs naming; do not introduce a second label style.
- Separate the filter columns with whitespace and that label alone — no vertical rules between them.
- Hairline `--line` rules only for: track-list row separators (very faint), the toolbar's bottom edge, and row dividers inside rendered Markdown tables. Nowhere else.
- Rounded corners (~8px) on cards, panels, album art, buttons, and filter pills; fully round on the transport play button. Full-bleed regions — the filter columns and the track list — run edge to edge with no card.
- Metadata reads as middot-separated runs: `2014 • 12 songs • 45:29`, `Rock • Alternative`.
- Two selection weights: a selected filter facet takes a solid `--accent-strong` fill; a selected track takes `--accent-tint` plus a play glyph in the number column. Never the solid fill on a track row.
- Numbering appears only where order carries real information: track numbers within an album, verse / section order in a chart. Not on navigation, not on doc sections.

## Signature

Content given room, once per surface:

- **TapePlayer** — the album hero. Selecting an album swaps the filter columns' space for a large panel: oversized rounded art, the album title in the display face, artist in violet caps, a middot meta line, Play / Shuffle, a short provenance paragraph, and genre chips. The dense library and this panel are the same screen — the columns compress to the side rather than disappearing.
- **TuneBook** — the rendered chart itself as the hero. The performance view drops the chrome, sets the song in the display face, and makes transpose / capo feel like a physical control on the page rather than a settings field.
- **FloppyDisk** — the rendered document. The file list and the Markdown source stay utilitarian; the preview panel is where images run large, tables breathe, and the document title takes the display face.

## Utility vs. expressive

- **Utility — stay clean and efficient:** the file and folder browser, the add-file flow, the Markdown editor and source view, TapePlayer's filter columns and virtualized track list, and the ChordPro / PDF / image viewers. Tight density, stable layout, no atmosphere. This is the majority of every surface.
- **Expressive — allowed presence:** TapePlayer's album detail; TuneBook's performance / rendered-chart view; FloppyDisk's preview panel; and empty and first-run states everywhere. Larger artwork or type, the display face, and a single orchestrated transition in. The filter columns compress toward the edge here — they do not vanish.

## Where the risk is

The expressive panels are the deliberate risk: the album hero and the preview panel can tip the product from a file tool toward a media center. Keep them earning their place with real context — provenance, structure, metadata — not just a bigger image. If a hero adds nothing a thumbnail wouldn't, cut it back. The art-derived background wash, if it is ever revived for now-playing, carries the same test: quietly premium or gone.
