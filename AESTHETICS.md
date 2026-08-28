# Aesthetics

## Philosophy

The app should feel composed, immersive, and quietly premium. The interface stays uncluttered by letting content carry the visual weight while controls, navigation, and supporting information recede until needed. Favor strong hierarchy, generous spacing, confident typography, and large uninterrupted surfaces over excessive cards, borders, labels, and persistent controls. Minimalism should never come at the expense of clarity or usability.

Visual richness should come from presentation rather than decoration. Use scale, imagery, typography, subtle depth, contextual color, and restrained atmospheric backgrounds to give important moments presence. The interface can adapt its tone to the content being shown, while keeping foreground elements precise and highly legible. Utility screens should be clean and efficient; important presentation moments can become more expressive and immersive.

Interaction should feel immediate, spatial, and predictable. Keep primary navigation stable, make the most likely action obvious, and progressively reveal secondary functionality through contextual menus, sheets, expanded states, and detail views. Motion should explain relationships and transitions rather than exist for spectacle. Controls can be visually understated while maintaining generous interaction areas and clear feedback.

The guiding principle is **less visible complexity, not less capability**. Every element should earn its place by improving comprehension, hierarchy, interaction, state, or presentation. The result should feel like a carefully arranged stage: content receives the spotlight, the interface provides structure without competing for attention, and the product knows when to become visually expressive—and when to remain quiet.

## Subject

This is one codebase serving a family of indie-web apps that all sit on the same foundation: your work lives in ordinary files and folders you own—kept in the browser, on a local or network drive, or in Dropbox—in open, portable formats, with no export step and no proprietary database.

- **FloppyDisk.link** — the umbrella. A personal workspace for creative documents and knowledge: Markdown writing with live preview, images, PDFs, and reference material, organized into projects and folders, available across devices and offline. The generalist surface; utility-first throughout.
- **TuneBook.link** (currently BrowserChords.com) — the sheet-music and tab specialization. Render ChordPro with live transpose, capo, and Nashville / Roman-numeral notation; view PDF lead sheets and charts; one standardized format for tabs, lyrics, and notes; practice along with an MP3 attached to a song. The reader/performer surface.
- **TapePlayer.link** — the music player. An iTunes-lineage library: narrow through genre / artist / album columns into a dense, virtualized track list, then hand off to a playback bar and now-playing view. Common audio formats including MP3 and read-only m4a. The listening surface.

Each surface has a different job, so each spends its expressiveness in a different place (see *Utility vs. expressive* below). The philosophy above and the tokens below are shared across all three; the file browser, add-file flow, headers, and viewers are literally shared components and must read as one product.

## Tokens

**Color.** The foreground palette stays near-neutral so artwork and content supply the color.

- `--ink: #111` — headings
- `--body: #000` on `--paper: #fff`
- `--muted: #666` / `--faint: #888` — labels and secondary metadata
- `--line: #ddd` — hairline rules and column borders
- `--raised: #fafafa` — toolbars, section headers, playback bar
- `--primary: #004eca` — selection and primary actions (existing)
- `--accent: #ce1ebb` — one highlight per view at most, never structural (existing)
- **Contextual color** — a heavily desaturated, lightened wash derived from the content in view: album art in TapePlayer, a chosen songbook or project accent in TuneBook and FloppyDisk. Permitted only on large background surfaces behind presentation moments. Foreground text and controls never take the derived color; they stay on the neutral palette above so legibility is constant.

**Type.** Three roles:

- *Utility / UI* — `system-ui` (keep). Native, fast, and invisible: correct for toolbars, filter columns, the track list, the file browser, the editor, and the viewers—i.e. most of every surface.
- *Data* — `system-ui` with `font-variant-numeric: tabular-nums` for track numbers, durations, timestamps, and transpose / capo values. Make this a global rule, not a per-component choice.
- *Display* — one characterful face used only in presentation moments: album titles and the now-playing title in TapePlayer, the song title on a rendered chart in TuneBook, empty- and first-run headlines everywhere. Pick a face with a real point of view (e.g. a text serif such as Fraunces or Source Serif, or a humanist sans such as Söhne or Hanken Grotesk)—not another neutral system sans. Large sizes, used sparingly.

**Structure.**

- The uppercase 11px letterspaced label at reduced opacity is the house label style (already set in the filter and track headers). Reuse it wherever a column or section needs naming; do not introduce a second label style.
- Numbering appears only where order carries real information: track numbers within an album, verse / section order in a chart. Not on navigation, not on doc sections.
- Hairline `--line` rules and square corners on structural containers; border-radius only on interactive chips and art thumbnails.

## Signature

Content-derived expressiveness, spent once per surface:

- **TapePlayer** — the contextual color wash behind a single piece of music. The library stays resolutely neutral and dense; selecting an album or entering now-playing lets that album's art bleed a quiet tone into the surrounding surface, then releases it the moment you return to browsing.
- **TuneBook** — the rendered chart itself as the hero. The performance view drops the chrome, sets the song in the display face, and makes transpose / capo feel like a physical control on the page rather than a settings field.
- **FloppyDisk** — the plain folder of files as the interface. The workspace shows real files and folders with almost no adornment, so the format *is* the product; expressiveness is reserved for the reading and writing surface.

## Utility vs. expressive

- **Utility — stay clean and efficient:** the file and folder browser, the add-file flow, the Markdown editor, TapePlayer's filter columns and virtualized track list, and the ChordPro / PDF / image viewers. Tight density, stable layout, no atmosphere. This is the majority of every surface.
- **Expressive — allowed presence:** TapePlayer's album detail and now-playing; TuneBook's performance / rendered-chart view; and empty and first-run states everywhere. Larger artwork or type, the display face, the contextual wash, and a single orchestrated transition in.

## Where the risk is

The contextual color wash is the deliberate risk: it turns cheap if the derived tone is too saturated or the transition too eager. Keep the sample desaturated and light, confine it to background surfaces, and keep the motion short and singular. If it does not feel quietly premium in practice, cut it rather than tune it indefinitely.
