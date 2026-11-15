import type { RGB } from '../core/color';
import { distanceInside } from '../core/edt';
import { createRgba, type Rgba } from '../core/image';
import { Painter } from './paint';
import { GEM, PALACE } from './palette';

/**
 * The banner that hangs from the rod on the palace front. It is drawn in final pixels, not
 * modelled, so every pixel of the letters is chosen: a soft cloth with gold trim, a swallowtail hem
 * with fringe and tassels, and a word in rounded gold letters under a small crown. The frames sway
 * like cloth in a light wind, and a glint runs across the letters once per loop.
 */

export const BANNER = {
  name: 'Unicorn',
  /** Width of the cloth in pixels. */
  clothW: 320,
  frames: 12,
  fps: 6,
  /** Pixel row of the rod's centre line, counted from the top of the sprite. */
  rodY: 8,
  canvas: { w: 352, h: 176 },
} as const;

const MARGIN = (BANNER.canvas.w - BANNER.clothW) / 2;
const SLEEVE = 16;
const SIDE_Y = 138;
const NOTCH_Y = 108;
const TAU = Math.PI * 2;

const cloth = PALACE.banner;
const gold = GEM.gold;
const OUTLINE: RGB = [52, 14, 44];
const rgb = (c: RGB): readonly [number, number, number] => [c[0], c[1], c[2]];

/** Pixel row of the hem at a column of the cloth, which dips into a shallow swallowtail. */
const hemY = (x: number): number =>
  SIDE_Y - (SIDE_Y - NOTCH_Y) * (1 - Math.abs(x - BANNER.clothW / 2) / (BANNER.clothW / 2));

type Pt = readonly [number, number];

/**
 * The letters, as centre lines in font units: x-height 100, capital 140, y up. Strokes are drawn as
 * round-ended tubes.
 */
interface Glyph {
  strokes: Pt[][];
  /** Centre-line extent in x. */
  width: number;
}

const arc = (cx: number, cy: number, rx: number, ry: number, from: number, to: number, n = 18): Pt[] => {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = ((from + ((to - from) * i) / n) * Math.PI) / 180;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return pts;
};

const GLYPHS: Record<string, Glyph> = {
  U: {
    width: 76,
    strokes: [
      [
        [0, 140],
        [0, 48],
      ],
      arc(38, 48, 38, 48, 180, 360, 24),
      [
        [76, 48],
        [76, 140],
      ],
    ],
  },
  n: {
    width: 60,
    strokes: [
      [
        [0, 0],
        [0, 78],
      ],
      arc(30, 70, 30, 30, 180, 0),
      [
        [60, 0],
        [60, 70],
      ],
    ],
  },
  i: {
    width: 0,
    strokes: [
      [
        [0, 0],
        [0, 98],
      ],
      [
        [0, 134],
        [0, 136],
      ],
    ],
  },
  c: { width: 66, strokes: [arc(34, 50, 34, 50, 38, 322, 30)] },
  o: { width: 68, strokes: [arc(34, 50, 34, 50, 0, 360, 36)] },
  r: {
    width: 44,
    strokes: [
      [
        [0, 0],
        [0, 78],
      ],
      arc(30, 70, 30, 30, 180, 62, 14),
    ],
  },
};

/** Stroke radius in pixels. */
const R = 5.2;
const OUT = 2.3;

interface Segment {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface Layout {
  segments: Segment[];
  /** Ink bounds of the whole word in pixels. */
  x0: number;
  x1: number;
  /** Where the first letter's top left corner is, which the crown sits on. */
  crownLeft: number;
  crownTop: number;
}

function layoutWord(): Layout {
  const gap = 18;
  const letters = [...BANNER.name];
  const inkW = (g: Glyph): number => g.width + 22;
  const units = letters.reduce((s, ch) => s + inkW(GLYPHS[ch]!) + gap, -gap);
  const sx = 272 / units;
  const sy = 0.358;
  const left = MARGIN + (BANNER.clothW - units * sx) / 2;
  const baseline = 93;
  const segments: Segment[] = [];
  let pen = 0;
  let crownLeft = 0;
  let crownTop = 0;
  for (const ch of letters) {
    const g = GLYPHS[ch]!;
    if (crownLeft === 0) {
      crownLeft = left + pen * sx;
      crownTop = baseline - 140 * sy - R;
    }
    for (const stroke of g.strokes) {
      for (let i = 0; i + 1 < stroke.length; i++) {
        const [ax, ay] = stroke[i]!;
        const [bx, by] = stroke[i + 1]!;
        segments.push({
          x0: left + (pen + 11 + ax) * sx,
          y0: baseline - ay * sy,
          x1: left + (pen + 11 + bx) * sx,
          y1: baseline - by * sy,
        });
      }
    }
    pen += inkW(g) + gap;
  }
  return { segments, x0: left, x1: left + units * sx, crownLeft, crownTop };
}

function distanceToSegments(segments: readonly Segment[], x: number, y: number): number {
  let best = Infinity;
  for (const s of segments) {
    const dx = s.x1 - s.x0,
      dy = s.y1 - s.y0;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - s.x0) * dx + (y - s.y0) * dy) / len2));
    const d = Math.hypot(x - (s.x0 + dx * t), y - (s.y0 + dy * t));
    if (d < best) best = d;
  }
  return best - R;
}

interface Layer {
  img: Rgba;
  /** Gold ramp index of each letter pixel, or -1. Lets a glint brighten the letters later. */
  letters: Int8Array;
}

let memo: Layer | undefined;

/** Everything that does not move: cloth, trim, letters, crown, fringe. Built once. */
function staticLayer(): Layer {
  if (memo) return memo;
  const { w, h } = BANNER.canvas;
  const img = createRgba(w, h, [0, 0, 0, 0]);
  const p = new Painter(img);
  const letters = new Int8Array(w * h).fill(-1);

  // Cloth body, below the sleeve, with a shallow swallowtail hem.
  const inside = new Uint8Array(w * h);
  for (let y = SLEEVE - 3; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cx = x - MARGIN;
      if (cx < 0 || cx >= BANNER.clothW) continue;
      if (y + 0.5 < hemY(cx + 0.5)) inside[y * w + x] = 1;
    }
  }
  const dist = distanceInside(inside, w, h);
  const edge = (x: number, y: number): [number, number] => {
    // Points away from the nearest edge, so the trim can be lit like a bevel.
    const gx = (dist[y * w + Math.min(w - 1, x + 1)]! - dist[y * w + Math.max(0, x - 1)]!) / 2;
    const gy = (dist[Math.min(h - 1, y + 1) * w + x]! - dist[Math.max(0, y - 1) * w + x]!) / 2;
    const m = Math.hypot(gx, gy) || 1;
    return [-gx / m, -gy / m];
  };
  const LIGHT: Pt = [-0.55, -0.83];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inside[y * w + x]) continue;
      const d = dist[y * w + x]!;
      if (d < 1.2) {
        p.px(x, y, rgb(OUTLINE));
      } else if (d < 2.6) {
        p.px(x, y, rgb(cloth[1]!));
      } else if (d < 5.6) {
        const [nx, ny] = edge(x, y);
        const lit = nx * LIGHT[0] + ny * LIGHT[1];
        p.px(x, y, rgb(gold[lit > 0.8 ? 4 : lit > 0.12 ? 3 : lit > -0.5 ? 2 : 1]!));
      } else if (d < 6.8) {
        p.px(x, y, rgb(cloth[0]!));
      } else {
        const fold = Math.sin(TAU * (x / 82 + y / 700) + 0.7 * Math.sin(y / 38 + 1.3));
        let idx = fold > 0.72 ? 4 : fold > -0.4 ? 3 : 2;
        if (y < 30) idx = Math.max(1, idx - 1);
        p.px(x, y, rgb(cloth[idx]!));
      }
    }
  }

  // Letters: a soft shadow on the cloth first, then outline, then gold tubes lit from the upper
  // left.
  const word = layoutWord();
  const field = new Float32Array(w * h).fill(99);
  for (let y = 20; y < 118; y++) {
    for (let x = Math.floor(word.x0) - 8; x < Math.ceil(word.x1) + 8; x++)
      field[y * w + x] = distanceToSegments(word.segments, x + 0.5, y + 0.5);
  }
  const at = (x: number, y: number): number =>
    field[Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))]!;
  for (let y = 20; y < 122; y++) {
    for (let x = Math.floor(word.x0) - 8; x < Math.ceil(word.x1) + 8; x++) {
      const s = field[y * w + x]!;
      if (s <= OUT) continue;
      const shadow = distanceToSegments(word.segments, x + 0.5 - 2.2, y + 0.5 - 2.4);
      if (shadow <= OUT && p.get(x, y)[3] === 255 && dist[y * w + x]! > 6.8) p.px(x, y, rgb(cloth[1]!));
    }
  }
  const L3 = (() => {
    const m = Math.hypot(0.45, 0.65, 0.62);
    return [-0.45 / m, -0.65 / m, 0.62 / m] as const;
  })();
  for (let y = 20; y < 122; y++) {
    for (let x = Math.floor(word.x0) - 8; x < Math.ceil(word.x1) + 8; x++) {
      const s = field[y * w + x]!;
      if (s > OUT) continue;
      if (s > 0) {
        p.px(x, y, rgb(OUTLINE));
        continue;
      }
      const gx = at(x + 1, y) - at(x - 1, y);
      const gy = at(x, y + 1) - at(x, y - 1);
      const gm = Math.hypot(gx, gy) || 1;
      const nx = gx / gm,
        ny = gy / gm;
      const hgt = Math.min(1, -s / R);
      const side = 1 - hgt;
      const dome = Math.sqrt(Math.max(0, 1 - side * side));
      const lighting = nx * side * L3[0] + ny * side * L3[1] + dome * L3[2] + (y < 70 ? 0.04 : 0);
      const idx = lighting > 0.86 ? 4 : lighting > 0.45 ? 3 : lighting > 0.18 ? 2 : lighting > -0.1 ? 1 : 0;
      p.px(x, y, rgb(gold[idx]!));
      letters[y * w + x] = idx;
    }
  }

  drawCrown(p, word.crownLeft + 17, word.crownTop + 3, -12);

  // Sleeve over the rod: a rounded tube, with a line of gold stitching under it.
  const rows: RGB[] = [
    OUTLINE,
    cloth[3]!,
    cloth[4]!,
    cloth[4]!,
    cloth[4]!,
    cloth[3]!,
    cloth[3]!,
    cloth[3]!,
    cloth[3]!,
    cloth[2]!,
    cloth[2]!,
    cloth[2]!,
    cloth[1]!,
    cloth[1]!,
    gold[3]!,
    gold[2]!,
    OUTLINE,
  ];
  for (let y = 0; y <= SLEEVE; y++) {
    for (let x = MARGIN - 3; x < MARGIN + BANNER.clothW + 3; x++) {
      const end = Math.min(x - (MARGIN - 3), MARGIN + BANNER.clothW + 2 - x);
      const r = SLEEVE / 2;
      if (end < r) {
        const dy = y - r;
        if (Math.hypot(r - end - 0.5, dy) > r + 0.4) continue;
      }
      const edgeCol = x === MARGIN - 3 || x === MARGIN + BANNER.clothW + 2;
      p.px(x, y, rgb(edgeCol ? OUTLINE : rows[y]!));
    }
  }

  // Fringe along the hem, and tassels at both corners and the notch.
  for (let cx = 12; cx < BANNER.clothW - 12; cx += 4) {
    if (Math.abs(cx - BANNER.clothW / 2) < 8 || cx < 18 || cx > BANNER.clothW - 18) continue;
    const y0 = Math.floor(hemY(cx + 0.5));
    for (let k = 0; k < 6; k++) p.px(MARGIN + cx, y0 + k, rgb(k === 5 ? gold[1]! : gold[cx % 8 === 0 ? 3 : 2]!));
    p.px(MARGIN + cx + 1, y0, rgb(OUTLINE));
  }
  tassel(p, MARGIN + 7, Math.floor(hemY(7.5)) - 1);
  tassel(p, MARGIN + BANNER.clothW - 8, Math.floor(hemY(BANNER.clothW - 7.5)) - 1);
  tassel(p, MARGIN + BANNER.clothW / 2, NOTCH_Y - 3);

  memo = { img, letters };
  return memo;
}

/**
 * A small gold crown, tilted, with three gems. Drawn by testing each pixel against the outline in
 * the crown's own frame.
 */
function drawCrown(p: Painter, cx: number, cy: number, tilt: number): void {
  const poly: Pt[] = [
    [-13, 0],
    [13, 0],
    [13, 11],
    [7, 6],
    [0, 16],
    [-7, 6],
    [-13, 11],
  ];
  const balls: [number, number, number][] = [
    [-13, 12.4, 1.8],
    [0, 17.8, 2.2],
    [13, 12.4, 1.8],
  ];
  const gems: [number, number, RGB][] = [
    [-7.5, 2.6, [240, 90, 140]],
    [0, 2.6, [110, 190, 255]],
    [7.5, 2.6, [240, 90, 140]],
  ];
  const a = (tilt * Math.PI) / 180;
  const cos = Math.cos(a),
    sin = Math.sin(a);
  const k = 1.2;
  const toLocal = (x: number, y: number): Pt => {
    const dx = x - cx,
      dy = cy - y;
    return [(dx * cos + dy * sin) / k, (-dx * sin + dy * cos) / k];
  };
  const inPoly = (u: number, v: number): boolean => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i]!,
        [xj, yj] = poly[j]!;
      if (yi > v !== yj > v && u < ((xj - xi) * (v - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  const segDist = (u: number, v: number): number => {
    let best = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const [x0, y0] = poly[i]!,
        [x1, y1] = poly[(i + 1) % poly.length]!;
      const dx = x1 - x0,
        dy = y1 - y0;
      const t = Math.max(0, Math.min(1, ((u - x0) * dx + (v - y0) * dy) / (dx * dx + dy * dy)));
      best = Math.min(best, Math.hypot(u - x0 - dx * t, v - y0 - dy * t));
    }
    return best;
  };
  const inside = (u: number, v: number): boolean =>
    inPoly(u, v) || balls.some(([bx, by, br]) => Math.hypot(u - bx, v - by) <= br);
  for (let y = Math.floor(cy - 28); y <= Math.ceil(cy + 8); y++) {
    for (let x = Math.floor(cx - 24); x <= Math.ceil(cx + 24); x++) {
      const [u, v] = toLocal(x + 0.5, y + 0.5);
      if (inside(u, v)) {
        const band = v < 5.2;
        const gem = gems.find(([gx, gy]) => Math.hypot(u - gx, v - gy) <= 1.6);
        if (gem) p.px(x, y, rgb(gem[2]));
        else p.px(x, y, rgb(band ? gold[2]! : u < -4 ? gold[4]! : u < 6 ? gold[3]! : gold[2]!));
      } else {
        const nearest = Math.min(segDist(u, v), ...balls.map(([bx, by, br]) => Math.hypot(u - bx, v - by) - br));
        if (nearest * k <= 1.3) p.px(x, y, rgb(OUTLINE));
      }
    }
  }
}

/** A gold tassel: cord, ball, knot and a skirt of strands, hanging from (cx, cy). */
function tassel(p: Painter, cx: number, cy: number): void {
  for (let k = 0; k < 4; k++) {
    p.px(cx, cy + k, rgb(OUTLINE));
    p.px(cx + 1, cy + k, rgb(OUTLINE));
    p.px(cx, cy + k, rgb(gold[3]!));
  }
  const by = cy + 7;
  for (let y = -3; y <= 3; y++) {
    for (let x = -3; x <= 3; x++) {
      const d = Math.hypot(x, y);
      if (d > 3.4) continue;
      p.px(cx + x, by + y, rgb(d > 2.5 ? OUTLINE : gold[x + y < -1 ? 4 : x + y < 2 ? 3 : 2]!));
    }
  }
  for (let x = -3; x <= 3; x++) p.px(cx + x, by + 4, rgb(x < 0 ? gold[2]! : gold[1]!));
  for (let y = 0; y < 13; y++) {
    const half = 2 + Math.floor(y / 3);
    for (let x = -half; x <= half; x++) {
      const outline = x === -half || x === half || y === 12;
      p.px(cx + x, by + 5 + y, rgb(outline ? OUTLINE : gold[Math.abs(x) % 2 === 0 ? (x < 0 ? 4 : 3) : 2]!));
    }
  }
}

/**
 * Sway of one row of the cloth, in whole pixels. The top is pinned to the rod, the hem moves most.
 */
function sway(y: number, frame: number): number {
  const t = frame / BANNER.frames;
  const k = Math.max(0, Math.min(1, (y - SLEEVE) / (SIDE_Y + 14 - SLEEVE)));
  const amp = 6.5 * k ** 1.15;
  return Math.round(amp * Math.sin(TAU * (t - y / 190)) + amp * 0.28 * Math.sin(TAU * (2 * t - y / 95)));
}

/** One frame of the banner, with the shadow it throws on the wall behind. */
export function renderBanner(frame: number): Rgba {
  const { w, h } = BANNER.canvas;
  const base = staticLayer();
  const lit = createRgba(w, h, [0, 0, 0, 0]);
  const glintFrames = 7;
  const glint = frame < glintFrames ? -30 + (frame / (glintFrames - 1)) * (BANNER.clothW + 60) : -999;
  for (let y = 0; y < h; y++) {
    const dx = y <= SLEEVE ? 0 : sway(y, frame);
    for (let x = 0; x < w; x++) {
      const tx = x + dx;
      if (tx < 0 || tx >= w) continue;
      const i = (y * w + x) * 4;
      if (base.img.data[i + 3] === 0) continue;
      const o = (y * w + tx) * 4;
      let r = base.img.data[i]!,
        g = base.img.data[i + 1]!,
        b = base.img.data[i + 2]!;
      const idx = base.letters[y * w + x]!;
      if (idx >= 0) {
        const band = Math.abs(x - MARGIN + 0.7 * (y - 80) - glint);
        if (band < 6) {
          const c = gold[Math.min(5, idx + (band < 3 ? 2 : 1))]!;
          r = c[0];
          g = c[1];
          b = c[2];
        }
      }
      lit.data[o] = r;
      lit.data[o + 1] = g;
      lit.data[o + 2] = b;
      lit.data[o + 3] = 255;
    }
  }
  // The shadow on the wall: the cloth's outline pushed down and right, softer on its far side.
  const out = createRgba(w, h, [0, 0, 0, 0]);
  const shadow: [number, number, number][] = [
    [8, 7, 0.14],
    [5, 4, 0.3],
  ];
  for (const [sx, sy, alpha] of shadow) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const px = x - sx,
          py = y - sy;
        if (px < 0 || py < 0 || px >= w || py >= h || py <= SLEEVE) continue;
        if (lit.data[(py * w + px) * 4 + 3] === 0) continue;
        const o = (y * w + x) * 4;
        const a = alpha + (out.data[o + 3]! / 255) * (1 - alpha);
        out.data[o] = 58;
        out.data[o + 1] = 28;
        out.data[o + 2] = 66;
        out.data[o + 3] = Math.round(a * 255);
      }
    }
  }
  for (let i = 0; i < w * h; i++) {
    if (lit.data[i * 4 + 3] === 0) continue;
    out.data[i * 4] = lit.data[i * 4]!;
    out.data[i * 4 + 1] = lit.data[i * 4 + 1]!;
    out.data[i * 4 + 2] = lit.data[i * 4 + 2]!;
    out.data[i * 4 + 3] = 255;
  }
  return out;
}
