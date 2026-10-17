# Test fixtures

Tiny m4a files, regenerated with ffmpeg from this directory:

```sh
ffmpeg -f lavfi -i anullsrc=r=8000:cl=mono -t 1 -c:a aac -b:a 8k \
  -metadata title="Fixture Title" -metadata artist="Fixture Artist" \
  -metadata album_artist="Fixture Album Artist" -metadata album="Fixture Album" \
  -metadata composer="Fixture Composer" -metadata track="3/12" \
  -metadata disc="1/2" -metadata date="2020" -metadata genre="Jazz" \
  -metadata comment="Fixture comment" tagged.m4a

ffmpeg -f lavfi -i color=c=red:s=16x16 -frames:v 1 -update 1 cover.jpg
ffmpeg -i tagged.m4a -i cover.jpg -map 0:a -map 1:v -c copy \
  -disposition:v:0 attached_pic tagged-with-art.m4a
rm cover.jpg

head -c 600 tagged.m4a > corrupt.m4a
```

- `tagged.flac`: FLAC with title, artist and album tags (`ffmpeg -f lavfi -i anullsrc=r=8000:cl=mono -t 1 -metadata title="Fixture Title" -metadata artist="Fixture Artist" -metadata album="Fixture Album" tagged.flac`).
- `tagged.m4a`: AAC with the standard tags above.
- `tagged-with-art.m4a`: the same, plus an embedded cover.
- `corrupt.m4a`: truncated before the header finishes, so ffmpeg fails on it.

## iTunes-style fixtures

`itunes-*.m4a` graft a scrubbed iTunes `ilst` (account atoms replaced, cover removed, a synthetic `ownr` and `iTunMOVI` added) onto a tiny ffmpeg-made file with `src/server/test/fixtures/m4a-graft.py`:

```sh
ffmpeg -f lavfi -i anullsrc=r=8000:cl=mono -t 1 -c:a aac -b:a 8k base-last.m4a
ffmpeg -i base-last.m4a -c copy -movflags +faststart base-first.m4a
S="music/<an iTunes purchase>.m4a"
python3 -I src/server/test/fixtures/m4a-graft.py "$S" base-first.m4a itunes-padded.m4a --moov-first --meta-padding 512 --free-padding 1024
python3 -I src/server/test/fixtures/m4a-graft.py "$S" base-first.m4a itunes-tight.m4a --moov-first
python3 -I src/server/test/fixtures/m4a-graft.py "$S" base-last.m4a itunes-moov-last.m4a
python3 -I src/server/test/fixtures/m4a-graft.py "$S" base-first.m4a itunes-co64.m4a --moov-first --co64
python3 -I src/server/test/fixtures/m4a-graft.py "$S" base-first.m4a itunes-gnre.m4a --moov-first --meta-padding 512 --gnre
```

- `itunes-padded.m4a`: `moov` first, padding inside `meta` and after `moov`.
- `itunes-tight.m4a`: `moov` first, no padding.
- `itunes-moov-last.m4a`: `moov` after `mdat`.
- `itunes-co64.m4a`: `moov` first, 64-bit chunk offsets.
- `itunes-gnre.m4a`: numeric `gnre` genre atom instead of `©gen`.

## FLAC fixtures

`flac-rich.flac` and `flac-tight.flac` are encoded with the `flac` and `metaflac` tools from a short sine wave. They are checked in, so running the tests does not need either tool. The tests also check the audio with `flac -t` when it is installed, and skip that check when it is not.

```sh
ffmpeg -f lavfi -i "sine=frequency=440:sample_rate=8000" -t 1 -ac 1 tone.wav
ffmpeg -f lavfi -i color=c=red:s=16x16 -frames:v 1 -update 1 cover.jpg
flac -s --padding=1024 --seekpoint=250ms -T "ARTIST=Fixture Artist" -T "ARTIST=Second Artist" \
  -T "TITLE=Fixture Title" -T "ALBUM=Fixture Album" -T "TRACKNUMBER=2" -T "TOTALTRACKS=9" \
  -T "CUSTOM_TAG=keep me" -T "REPLAYGAIN_TRACK_GAIN=-3.00 dB" -o flac-rich.flac tone.wav
metaflac --import-picture-from="|image/jpeg|||cover.jpg" flac-rich.flac
flac -s --no-padding -T "TITLE=Fixture Title" -T "ARTIST=Fixture Artist" -o flac-tight.flac tone.wav
```

- `flac-rich.flac`: seek table, a repeated `ARTIST`, tags the app does not edit, a front cover, and padding.
- `flac-tight.flac`: seek table and two tags, with no padding, so any growth rewrites the file.

The ID3v2-prefixed, two-comment-block, and truncated cases are built from these inside the tests.
