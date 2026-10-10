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

- `tagged.m4a`: AAC with the standard tags above.
- `tagged-with-art.m4a`: the same, plus an embedded cover.
- `corrupt.m4a`: truncated before the header finishes, so ffmpeg fails on it.
