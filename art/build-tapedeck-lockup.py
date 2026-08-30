#!/usr/bin/env python3
"""Regenerate the TapeDeck brand SVGs from art/tapedeck.link.svg:

  data/common/svg/tapedeck-mark.svg     cassette icon, cleaned of Inkscape cruft
  data/common/svg/tapedeck-lockup.svg   cassette icon + wordmark

art/tapedeck.link.svg is edited directly in Inkscape (magenta doubling, shadow
wedges, node tweaks). The wordmark is Hanken Grotesk (the --font-display face)
instanced at a display weight and flattened to outlines so the SVG carries no
font dependency.

    pip install fonttools brotli uharfbuzz svgpathtools
    python art/build-tapedeck-lockup.py

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
ART = "art/tapedeck.link.svg"
MARK_OUT = "data/common/svg/tapedeck-mark.svg"
LOCKUP_OUT = "data/common/svg/tapedeck-lockup.svg"

WEIGHT = 680          # point on the 100-900 axis; a wordmark wants a touch heavier than body
TRACKING = -10        # letter tracking, font units (upem 1000) ~ -0.01em
MAIN = "TapeDeck"
SUFFIX = ".link"
GAP_ICON_TEXT = 210   # font-unit gap between the icon and the "T"
ICON_CAP_RATIO = 1.8  # ink-cassette height as a multiple of cap height

INK = "#111111"       # used to identify the "front" cassette for sizing
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


def attr(tag, name):
    m = re.search(rf'\b{name}="([^"]*)"', tag)
    if m:
        return m.group(1)
    style = re.search(r'style="([^"]*)"', tag)
    if style:
        m = re.search(rf"(?:^|;)\s*{name}\s*:\s*([^;]+)", style.group(1))
        if m:
            return m.group(1).strip()
    return None


# 2. Read the hand-maintained cassette art -------------------------------
art_svg = open(ART).read()
art_viewbox = re.search(r'viewBox="([^"]+)"', art_svg).group(1)
cells = []  # (path_obj, {fill, stroke, stroke-width, class})
for tag in re.findall(r"<path\b.*?/>", art_svg, re.S):
    d = re.search(r'\bd="([^"]+)"', tag)
    if not d:
        continue
    cells.append(
        (
            parse_path(d.group(1)),
            {
                "class": attr(tag, "class"),
                "fill": attr(tag, "fill") or "none",
                "stroke": attr(tag, "stroke"),
                "stroke-width": attr(tag, "stroke-width"),
            },
        )
    )

# The ink strokes define the cassette's nominal box (keeps sizing stable across
# Inkscape tweaks to the magenta / wedges).
ink = [p for p, s in cells if (s["stroke"] or "").lower().startswith("#111")]
fb = [p.bbox() for p in ink]
fxmin = min(b[0] for b in fb)
fymin = min(b[2] for b in fb)
fymax = max(b[3] for b in fb)
front_h = fymax - fymin

cap = tt["OS/2"].sCapHeight or int(upem * 0.7)
icon_h = ICON_CAP_RATIO * cap
icon_scale = icon_h / front_h

full = [p.bbox() for p, _ in cells]
mark_w = (max(b[1] for b in full) - fxmin) * icon_scale  # from ink left edge

# 3. Lay out the wordmark after the icon
main_d, x_after = run(MAIN, mark_w + GAP_ICON_TEXT)
suffix_d, x_end = run(SUFFIX, x_after + TRACKING)
wb = parse_path(main_d + " " + suffix_d).bbox()
word_mid = (wb[2] + wb[3]) / 2


def place(p):
    """Mark space (y-down) -> lockup inner space (y-up), ink box centred on word_mid."""
    p = p.translated(complex(-fxmin, -fymin)).scaled(icon_scale)
    return p.scaled(1, -1).translated(complex(0, word_mid + icon_h / 2))


placed = [(place(p), s) for p, s in cells]

# 4. viewBox from the real extent of everything -------------------------
ys, xs = [], []
for p, _ in placed:
    b = p.bbox()
    xs += [b[0], b[1]]
    ys += [b[2], b[3]]
for d in (main_d, suffix_d):
    b = parse_path(d).bbox()
    xs += [b[0], b[1]]
    ys += [b[2], b[3]]
top, bottom = max(ys), min(ys)
scale_out = 100.0 / (top - bottom)
vw = round(max(xs) * scale_out, 2)

def path_el(p, s, sw_scale=1.0):
    a = [f'class="{s["class"]}"'] if s["class"] else []
    a.append(f'fill="{s["fill"]}"')
    if s["stroke"] and s["stroke"] != "none":
        a += [
            f'stroke="{s["stroke"]}"',
            'stroke-linecap="round"',
            'stroke-linejoin="round"',
        ]
        if s["stroke-width"]:
            a.append(f'stroke-width="{round(float(s["stroke-width"]) * sw_scale, 2)}"')
    return f'<path {" ".join(a)} d="{round1(p.d())}"/>'


mark = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{art_viewbox}" fill="none">
<title>TapeDeck</title>
{chr(10).join(path_el(p, s) for p, s in cells)}
</svg>
'''
open(MARK_OUT, "w").write(mark)
print("wrote", MARK_OUT, "| viewBox", art_viewbox, "| bytes", len(mark))

lockup = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vw} 100" fill="none">
<title>TapeDeck.link</title>
<g transform="scale({scale_out:.5f}) translate(0 {top}) scale(1 -1)">
{chr(10).join(path_el(p, s, icon_scale) for p, s in placed)}
<path class="lockupWord" d="{round1(main_d)}" fill="{INK}"/>
<path class="lockupSuffix" d="{round1(suffix_d)}" fill="{SUFFIX_FILL}"/>
</g>
</svg>
'''
open(LOCKUP_OUT, "w").write(lockup)
print("wrote", LOCKUP_OUT, "| viewBox 0 0", vw, "100 | bytes", len(lockup))
