---
section: Working with files
order: 4
---

# Music Library

Play music you have bought and downloaded, straight from your own files. When
you buy albums as downloadable files, more of your money reaches the artist and
the files stay yours to keep. Point the app at a folder of audio files and it
builds a browsable library of artists, albums, and tracks.

## Building your library

The music library requires the [Local & Network Storage](/docs/file-store-server.html)
connection, because the folder is scanned on the server.

- Connect a folder that holds your audio files.
- Open the **Music** view and run a scan. The tags in each file are read to
  work out the artist, album, track number, and other details.
- Later scans only read the files that changed, so they finish quickly.

Most common audio formats will play. Editing tags and artwork from the track
editor is supported for MP3 files.

## How tracks are grouped into albums and artists

The library builds its albums and artists from the tags inside your files, so
the same grouping holds no matter how the folders are named.

Albums are grouped by the album tag. Every track that shares an album name is
shown as one album, with its tracks ordered by track number.

Artists are grouped by the album artist tag when it is set, and fall back to the
track artist when it is not. This is what keeps an album together when its
tracks credit different artists. Set the same album artist on every track and
the album files under that one name. Soundtracks, compilation albums, and
various artists releases all rely on this.

Classical music is grouped by composer instead. When a track's genre is set to
`Classical`, its artist is taken from the composer tag first, then the album
artist, then the track artist, so a symphony files under the composer you look
for rather than under whichever orchestra recorded it. To override this for a
track, open it in the track editor and set **Group Artist By** to **Album
Artist** or **Composer**. The choice is saved per track in a private tag that
other music players ignore.

## Recommended folder layout

Because the grouping comes from tags, the folder layout is up to you. A
consistent one still helps: it keeps the files that belong together in one
place, lets the artwork rules below work per album, and is simpler to browse
and back up. Give each album its own folder, with the tracks and a single
`Folder.jpg` inside it.

Grouped by genre:

```
Music/
├── Alternative/
│   ├── Radiohead - 1997 - OK Computer/
│   │   ├── Folder.jpg
│   │   ├── 01 Airbag.mp3
│   │   └── 02 Paranoid Android.mp3
│   └── Foo Fighters - 1997 - The Colour and the Shape/
│       ├── Folder.jpg
│       └── 01 Doll.mp3
└── Jazz/
    └── Miles Davis - 1959 - Kind of Blue/
        ├── Folder.jpg
        ├── 01 So What.mp3
        └── 02 Freddie Freeloader.mp3
```

The same collection without the genre level, grouped by artist and then album:

```
Music/
├── Radiohead/
│   └── 1997 - OK Computer/
│       ├── Folder.jpg
│       └── 01 Airbag.mp3
├── Foo Fighters/
│   └── 1997 - The Colour and the Shape/
│       ├── Folder.jpg
│       └── 01 Doll.mp3
└── Miles Davis/
    └── 1959 - Kind of Blue/
        ├── Folder.jpg
        └── 01 So What.mp3
```

## Album artwork

Album artwork lives in one file next to the tracks, named `Folder.jpg` or
`Folder.png`. This is the single file the library reads for the album, and the
one you replace when you want to change the artwork. If an album has no such
file but one of its tracks carries embedded artwork, that artwork is written
out on the next scan so the album has a starting point.

When you replace the folder artwork with a new file, other stray artwork files
in the folder, such as `cover.jpg` or `front.jpg`, are cleared away so they
cannot take its place. Other music apps leave these files behind under a range
of names, so this keeps things tidy when you move a collection over.

### Embedding artwork into tracks

This step is up to you. Use the **Embed artwork** button in the track editor to
copy the album's `Folder` artwork into the tags of every MP3 in the album,
resized to 1000 by 1000 pixels. This keeps each file portable, so an MP3 player
or another app can read the artwork straight from the file without the folder
next to it.
