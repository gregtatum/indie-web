# SVGs

Source new SVGs from:

https://www.svgrepo.com/collection/dazzle-line-icons/

## Brand lockups

The `*-lockup.svg` files (icon + wordmark) are built by the scripts in `art/`.
Wordmarks are Hanken Grotesk converted to paths, so there's no webfont to load.

- `build-floppydisk-lockup.py` builds `floppydisk-lockup.svg` and
  `floppydisk-mark.svg` from `art/floppy-disk.link.svg`. The lockup has been
  tweaked by hand since, so diff before you overwrite it.
- `build-tapedeck-lockup.py` builds `tapedeck-lockup.svg` and
  `tapedeck-mark.svg` from `art/tapedeck.link.svg`.

Both source files in `art/` are edited directly in Inkscape.
