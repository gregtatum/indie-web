---
section: Working with files
order: 1
---

# ChordPro Files

## What is ChordPro?

ChordPro is a plain-text format for writing songs with chords embedded directly
in the lyrics. It is easy to read in a text editor, but also structured enough
for software to parse. That structure enables rendering, automatic transposition
into new keys, and consistent formatting across devices.

For the official overview, see the
[ChordPro introduction](https://www.chordpro.org/chordpro/chordpro-introduction/).

## Why it works well here

- It is readable without special tooling.
- The parser can extract metadata like title and artist.
- Chords are machine-readable, which enables transposing and alternate displays.
- The same file can render well on phones, tablets, and desktop.

## Example song

```
# A simple ChordPro song.

{title: Swing Low Sweet Chariot}

{comment: Chorus}
Swing [D]low, sweet [G]chari[D]ot,
Comin’ for to carry me [A7]home.
Swing [D7]low, sweet [G]chari[D]ot,
Comin’ for to [A7]carry me [D]home.

{comment: Verse}

I [D]looked over Jordan, and [G]what did I [D]see,
Comin’ for to carry me [A7]home.
A [D]band of angels [G]comin’ after [D]me,
Comin’ for to [A7]carry me [D]home.
```

## Supported directives

These are the ChordPro directives currently supported.

### Metadata

- `{title: ...}`
- `{subtitle: ...}`
- `{artist: ...}`
- `{key: ...}`
- `{capo: ...}`

### Comments and Formatting

- `{comment: ...}`
- `{c: ...}` (short form comment)

### Formatting

- `{comment_italic: ...}`
- `{comment_bold: ...}`
- `{comment_box: ...}`

### Media

- `{image: src="/path/to/score.png"}`
- `{audio: src="/path/to/song.mp3" mimetype="audio/mp3"}`

### Audio playback

You can drag and drop audio files such as MP3s directly onto a rendered song.
The file is saved alongside the song and a ChordPro directive is inserted for you.
This makes it easy to practice with a backing track while viewing chords.

The inserted directive looks like this:

```
{audio: src="/path/to/song.mp3" mimetype="audio/mp3"}
```

### Spotify links

When a title is available, the header includes a Spotify search link for the
song title and artist to quickly jump to recordings.

### Images and sheet music exports

For creating and exporting sheet music, I recommend
[MuseScore](https://musescore.org/en). It is great for engraving, and it can
export PDFs or images that you can mix and match with your ChordPro files.

You can drag and drop images directly into a rendered song. The file is saved
next to the song and an image directive is inserted automatically:

```
{image: src="/path/to/score.png"}
```

A simple workflow is to keep the original MuseScore files in a relative
`./assets` folder, then export PDFs or images into the main song folder for
easy playing and browsing.

Example folder layout:

```
Folk Music
├── Amazing Grace.pdf
├── Scarborough Fair.chopro
├── House of the Rising Sun.chopro
├── Greensleeves.png
├── Shenandoah.pdf
└── assets
    ├── Amazing Grace.mscz
    ├── Scarborough Fair.mscz
    ├── Scarborough Fair (lead 1).png
    └── Scarborough Fair (lead 2).png
```

### Display modes

These directives change how chord symbols are displayed. The underlying chords
stay the same, but the output is rendered as scale degrees. This makes it possible to play a song in any key.

- `{chords: nashville}` uses the [Nashville Number System](https://en.wikipedia.org/wiki/Nashville_Number_System),
  a practical shorthand for describing chords by scale degree (for example,
  `1`, `4`, `5`, `6m`, `b7`). It is common in studio and live settings when
  players need to transpose quickly. This is useful when you want a progression
  that is instantly reusable in any key.
- `{chords: roman}` uses [Roman numeral analysis](https://en.wikipedia.org/wiki/Roman_numeral_analysis),
  which represents chords with Roman numerals (for example, `I`, `IV`, `V`, `vi`,
  `bVII`). This is often used in theory and teaching contexts because it shows
  function and quality in a key-neutral way. It is useful when you want to study
  or compare harmonic function across songs.
