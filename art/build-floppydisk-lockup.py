#!/usr/bin/env python3
"""Regenerate the FloppyDisk brand SVGs from source:

  data/common/svg/floppydisk-lockup.svg   disk icon + wordmark
  data/common/svg/floppydisk-mark.svg     disk icon only

The disk shape comes from art/floppy-disk.link.svg. The wordmark is Hanken
Grotesk (the --font-display face) instanced at a display weight and flattened
to outlines, so the SVG carries no font dependency.

    pip install fonttools brotli uharfbuzz svgpathtools
    python art/build-floppydisk-lockup.py

Run from the repo root.
"""

import io
import re

import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from svgpathtools import parse_path

FONT = "data/common/fonts/hanken-grotesk-latin-wght-normal.woff2"
ART = "art/floppy-disk.link.svg"
LOCKUP_OUT = "data/common/svg/floppydisk-lockup.svg"
MARK_OUT = "data/common/svg/floppydisk-mark.svg"

WEIGHT = 680          # point on the 100-900 axis; a wordmark wants a touch heavier than body
TRACKING = -10        # letter tracking, font units (upem 1000) ~ -0.01em
MAIN = "FloppyDisk"
SUFFIX = ".link"
GAP_ICON_TEXT = 210   # font-unit gap between the icon and the "F"
ICON_CAP_RATIO = 1.8  # icon height as a multiple of cap height; matches the old
                      # 24px favicon set beside 16px text

INK = "#111111"
SHADOW = "#ce1ebb"    # legacy magenta, kept only as the FloppyDisk brand mark
SUFFIX_FILL = "#595959"  # --muted; solid, clears WCAG AA (no alpha on a foreground)

# 1. Instance the variable font at the chosen weight ------------------------
tt = TTFont(FONT)
instancer.instantiateVariableFont(tt, {"wght": WEIGHT}, inplace=True)
tt.flavor = None  # save as plain sfnt so HarfBuzz (built without brotli) can read it
upem = tt["head"].unitsPerEm
buf = io.BytesIO()
tt.save(buf)
font_bytes = buf.getvalue()
glyph_set = tt.getGlyphSet()
glyph_order = tt.getGlyphOrder()


def shape(text):
    hb_font = hb.Font(hb.Face(font_bytes))
    b = hb.Buffer()
    b.add_str(text)
    b.guess_segment_properties()
    hb.shape(hb_font, b, {"kern": True, "liga": True})
    return list(zip(b.glyph_infos, b.glyph_positions))


def glyph_path(gid, x, y=0):
    pen = SVGPathPen(glyph_set)
    glyph_set[glyph_order[gid]].draw(pen)
    d = pen.getCommands()
    return parse_path(d).translated(complex(x, y)).d() if d else ""


def round1(d):
    """Round every number in a path string to 1 dp (sub-pixel at any real size)."""
    return re.sub(
        r"-?\d+\.?\d*(?:e-?\d+)?",
        lambda m: f"{float(m.group()):.1f}".rstrip("0").rstrip("."),
        d,
    )


def run(text, x):
    ds = []
    for info, pos in shape(text):
        d = glyph_path(info.codepoint, x + pos.x_offset, pos.y_offset)
        if d:
            ds.append(d)
        x += pos.x_advance + TRACKING
    return " ".join(ds), x


# 2. Icon geometry. Height is a multiple of cap height (not just cap height, or
#    it reads as shrunk); vertically centred on the wordmark's optical middle.
icon_svg = open(ART).read()
back_raw, front_raw = re.findall(r'<path\b[^>]*\bd="([^"]+)"', icon_svg, re.S)
back_p, front_p = parse_path(back_raw), parse_path(front_raw)
xmin = min(back_p.bbox()[0], front_p.bbox()[0])
xmax = max(back_p.bbox()[1], front_p.bbox()[1])
ymin = min(back_p.bbox()[2], front_p.bbox()[2])
ymax = max(back_p.bbox()[3], front_p.bbox()[3])
cap = tt["OS/2"].sCapHeight or int(upem * 0.7)
icon_h = ICON_CAP_RATIO * cap
icon_scale = icon_h / (ymax - ymin)
icon_adv = (xmax - xmin) * icon_scale

# 3. Lay out the wordmark after the icon
main_d, x_after = run(MAIN, icon_adv + GAP_ICON_TEXT)
suffix_d, x_end = run(SUFFIX, x_after + TRACKING)

wb = parse_path(main_d + " " + suffix_d).bbox()
word_mid = (wb[2] + wb[3]) / 2               # font-space optical centre of the word
top = word_mid + icon_h / 2                   # the icon is the tallest element
bottom = min(wb[2], word_mid - icon_h / 2)
scale_out = 100.0 / (top - bottom)            # normalise the SVG to 100 units tall
vw = round(x_end * scale_out, 2)


def place_icon(raw):
    # Source art is y-down; flip to y-up and centre it on the word's midline.
    p = parse_path(raw).translated(complex(-xmin, -ymin)).scaled(icon_scale)
    return p.scaled(1, -1).translated(complex(0, word_mid + icon_h / 2))


lockup = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vw} 100" fill="none">
<title>FloppyDisk.link</title>
<g transform="scale({scale_out:.5f}) translate(0 {top}) scale(1 -1)">
<path class="lockupDiskBack" fill-rule="evenodd" d="{round1(place_icon(back_raw).d())}" fill="{SHADOW}"/>
<path class="lockupDiskFront" fill-rule="evenodd" d="{round1(place_icon(front_raw).d())}" fill="{INK}"/>
<path class="lockupWord" d="{round1(main_d)}" fill="{INK}"/>
<path class="lockupSuffix" d="{round1(suffix_d)}" fill="{SUFFIX_FILL}"/>
</g>
</svg>
'''
open(LOCKUP_OUT, "w").write(lockup)
print("wrote", LOCKUP_OUT, "| viewBox 0 0", vw, "100 | bytes", len(lockup))

# 4. Standalone mark, tight viewBox
mb = parse_path(back_raw).translated(complex(-xmin, -ymin))
mf = parse_path(front_raw).translated(complex(-xmin, -ymin))
mw, mh = round(xmax - xmin, 2), round(ymax - ymin, 2)
mark = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {mw} {mh}" fill="none">
<title>FloppyDisk</title>
<path class="floppyMarkBack" fill-rule="evenodd" d="{round1(mb.d())}" fill="{SHADOW}"/>
<path class="floppyMarkFront" fill-rule="evenodd" d="{round1(mf.d())}" fill="{INK}"/>
</svg>
'''
open(MARK_OUT, "w").write(mark)
print("wrote", MARK_OUT, "| viewBox 0 0", mw, mh, "| bytes", len(mark))
