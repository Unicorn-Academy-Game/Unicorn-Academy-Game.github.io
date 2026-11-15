"""Draws the title lettering as outlines and writes them to `src/ui/wordmark-paths.ts`.

Fredoka is a variable font, and its letters are built from shapes that overlap (the crossbar of an A over its legs, the
stem of a D under its bowl, the arms of a Y over its stem). Filled, the overlaps cannot be seen. Stroked, every edge of
every piece is drawn, and lines show inside the letter. So the pieces are merged here into one outline per letter
before the game ever draws them, and the title does not wait for the font to load either.

    python3 -m venv /tmp/ua-font/.venv
    /tmp/ua-font/.venv/bin/pip install fonttools brotli skia-pathops uharfbuzz
    /tmp/ua-font/.venv/bin/python tools/art/wordmark.py

The font is `@fontsource-variable/fredoka` from node_modules, under the SIL Open Font License 1.1.
"""

from __future__ import annotations

import io
import math
from dataclasses import dataclass
from pathlib import Path

import uharfbuzz as hb
from fontTools.pens.areaPen import AreaPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.ttLib.removeOverlaps import removeOverlaps
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parents[2]
FONT = ROOT / "node_modules/@fontsource-variable/fredoka/files/fredoka-latin-wght-normal.woff2"
OUT = ROOT / "src/ui/wordmark-paths.ts"

WIDTH = 520
# A counter the outline leaves less than this much of is filled in, in the units of the title.
MIN_COUNTER = 14


@dataclass(frozen=True)
class Line:
    text: str
    size: float
    spacing: float
    tilt: float
    baseline: float
    ink: float
    lift: float


LINES = [
    Line("Unicorn", 138, 1, -2, 138, 24, 9),
    Line("Academy", 96, 9, 0, 240, 24, 9),
    Line("the Fan Game", 52, 6, 0, 318, 14, 5),
]


def instance(weight: int) -> TTFont:
    font = instancer.instantiateVariableFont(TTFont(FONT), {"wght": weight}, inplace=False)
    font.flavor = None
    removeOverlaps(font)
    return font


def shape(font: TTFont, text: str) -> list[tuple[str, float]]:
    """Each glyph's name and where its pen starts, in font units, kerned."""
    buffer = io.BytesIO()
    font.save(buffer)
    hb_font = hb.Font(hb.Face(hb.Blob(buffer.getvalue())))
    run = hb.Buffer()
    run.add_str(text)
    run.guess_segment_properties()
    hb.shape(hb_font, run, {"kern": True, "liga": False, "calt": False})
    order = font.getGlyphOrder()
    pen = 0.0
    glyphs = []
    for info, position in zip(run.glyph_infos, run.glyph_positions):
        glyphs.append((order[info.codepoint], pen + position.x_offset))
        pen += position.x_advance
    return glyphs


def contours(recording: RecordingPen) -> list[list[tuple[str, tuple]]]:
    """A recorded glyph cut into its closed contours."""
    out, current = [], []
    for operation in recording.value:
        current.append(operation)
        if operation[0] in ("closePath", "endPath"):
            out.append(current)
            current = []
    return out


def replay(contour: list[tuple[str, tuple]], pen) -> None:
    for operation, arguments in contour:
        getattr(pen, operation)(*arguments)


def area_of(contour: list[tuple[str, tuple]]) -> float:
    pen = AreaPen()
    replay(contour, pen)
    return pen.value


@dataclass(frozen=True)
class Drawn:
    outline: str
    plugs: str
    top: float
    bottom: float


def ntos(value: float) -> str:
    return f"{value:.1f}".rstrip("0").rstrip(".")


def draw(font: TTFont, line: Line) -> Drawn:
    """
    One line as a single path in the viewBox, centred and tilted about the middle of its baseline, and the extent of its
    letters. The counters (the holes in a, d, e and the like) that the dark outline would leave a pinhole in come back as
    `plugs`, a second path the title fills with the outline's colour, so no sliver of the background or of the shadow
    shows through a closed counter.
    """
    scale = line.size / font["head"].unitsPerEm
    glyphs = shape(font, line.text)
    last, last_pen = glyphs[-1]
    width = (last_pen + font["hmtx"][last][0]) * scale + line.spacing * (len(glyphs) - 1)
    glyph_set = font.getGlyphSet()
    cos, sin = math.cos(math.radians(line.tilt)), math.sin(math.radians(line.tilt))
    path = SVGPathPen(glyph_set, ntos=ntos)
    plugs = SVGPathPen(glyph_set, ntos=ntos)
    bounds = BoundsPen(glyph_set)
    for index, (name, pen) in enumerate(glyphs):
        dx = pen * scale + line.spacing * index - width / 2
        matrix = (
            scale * cos, scale * sin, scale * sin, -scale * cos,
            WIDTH / 2 + dx * cos, line.baseline + dx * sin,
        )
        recording = RecordingPen()
        glyph_set[name].draw(TransformPen(recording, matrix))
        parts = contours(recording)
        areas = [area_of(part) for part in parts]
        outer = math.copysign(1, max(areas, key=abs)) if areas else 1
        for part, area in zip(parts, areas):
            replay(part, path)
            replay(part, bounds)
            is_hole = math.copysign(1, area) != outer
            # What shows of a counter is its width less the outline, which covers half its own width on each side.
            visible = 2 * math.sqrt(abs(area) / math.pi) - line.ink
            if is_hole and visible < MIN_COUNTER:
                replay(part, plugs)
    _, top, _, bottom = bounds.bounds
    return Drawn(path.getCommands(), plugs.getCommands(), top, bottom)


def main() -> None:
    font = instance(700)
    rows = [(line, draw(font, line)) for line in LINES]
    height = math.ceil(max(drawn.bottom + line.ink / 2 + line.lift for line, drawn in rows)) + 2
    entries = "\n".join(
        f"  {{ text: '{line.text}', d: '{drawn.outline}', plugs: '{drawn.plugs}', top: {drawn.top:.1f}, bottom: {drawn.bottom:.1f}, ink: {line.ink}, lift: {line.lift} }},"
        for line, drawn in rows
    )
    OUT.write_text(
        "// Written by tools/art/wordmark.py from Fredoka (SIL Open Font License 1.1). Do not edit by hand.\n\n"
        "export interface WordmarkLine {\n"
        "  /** The words this line spells. */\n"
        "  readonly text: string;\n"
        "  /** The whole line as one outline in the viewBox, with the overlaps of the font's own pieces merged. */\n"
        "  readonly d: string;\n"
        "  /** The counters that the outline closes up to a pinhole, which the title fills in with the outline's colour. */\n"
        "  readonly plugs: string;\n"
        "  /** The vertical extent of the letters, which the gradient is fitted to. */\n"
        "  readonly top: number;\n"
        "  readonly bottom: number;\n"
        "  /** The width of the dark outline, and how far its shadow falls. */\n"
        "  readonly ink: number;\n"
        "  readonly lift: number;\n"
        "}\n\n"
        f"export const WORDMARK_WIDTH = {WIDTH};\n"
        f"export const WORDMARK_HEIGHT = {height};\n"
        f"export const WORDMARK_LINES: readonly WordmarkLine[] = [\n{entries}\n];\n"
    )
    print(f"wrote {OUT.relative_to(ROOT)}, {OUT.stat().st_size} bytes, {WIDTH} by {height}")


if __name__ == "__main__":
    main()
