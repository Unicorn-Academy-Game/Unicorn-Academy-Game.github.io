import { hex, mix, type RGB, ramp } from '../core/color';
import type { Rgba } from '../core/image';
import { mulberry32 } from '../core/rng';
import { EXIT_SPRITES } from './exits';
import {
  Canvas2D,
  capsule,
  ellipse,
  glowDisc,
  heart,
  type Pt,
  polygon,
  ring,
  type Shape,
  starPoints,
  union,
} from './kit';

/**
 * Every effect picture the game draws. Each is a small hand-described shape pushed through the
 * cel-shading kit, so the hearts, leaves and flames look like they belong to the same world as the
 * unicorns. The game tints and scales them, so most are drawn in light, neutral tones.
 */
export interface FxSprite {
  id: string;
  w: number;
  h: number;
  ox: number;
  oy: number;
  frames?: number;
  fps?: number;
  loop?: boolean;
  render: (frame: number) => Rgba;
}

const R = (base: string, o: Parameters<typeof ramp>[1] = {}): RGB[] => ramp(hex(base), { steps: 5, ...o });

const PINK = R('#ff7a9c', { shadowHue: 330, lightHue: 60, lightness: [-0.26, -0.14, 0, 0.1, 0.2] });
const ROSE = R('#f2527f', { shadowHue: 335, lightHue: 50, lightness: [-0.26, -0.14, 0, 0.1, 0.2] });
const LEAF = R('#78c850', { shadowHue: 190, lightHue: 105, lightness: [-0.3, -0.18, 0, 0.1, 0.19] });
const LEAF_DEEP = R('#3f9f56', { shadowHue: 205, lightHue: 110, lightness: [-0.3, -0.18, 0, 0.1, 0.19] });
const FROST = R('#bfe3f7', { shadowHue: 245, lightHue: 190, lightness: [-0.3, -0.18, -0.06, 0.04, 0.1] });
const WATER = R('#58b6e8', { shadowHue: 265, lightHue: 160, lightness: [-0.3, -0.18, 0, 0.1, 0.22] });
const CLOUD = R('#f1eefc', { shadowHue: 275, lightHue: 85, lightness: [-0.3, -0.19, -0.1, -0.03, 0.03] });
const STORM = R('#8d86b8', { shadowHue: 270, lightHue: 250, lightness: [-0.3, -0.18, 0, 0.1, 0.18] });
const BLOSSOM = R('#ffb3d1', { shadowHue: 320, lightHue: 70, lightness: [-0.26, -0.14, 0, 0.07, 0.13] });
const DAISY = R('#fff6ec', { shadowHue: 290, lightHue: 80, lightness: [-0.26, -0.15, -0.07, 0, 0.04] });
const GOLDY = R('#ffd24a', { shadowHue: 25, lightHue: 95, lightness: [-0.3, -0.18, 0, 0.08, 0.17] });
const CORE: RGB = [255, 252, 232];

const dim = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

/** A four-point twinkle, drawn in a given tone, growing and shrinking over `frames`. */
function spark(tone: readonly RGB[], frame: number, frames = 4): Rgba {
  const c = new Canvas2D(24, 24);
  const s = [0.5, 0.82, 1, 0.66][frame % frames] ?? 1;
  const outer = 10.5 * s,
    inner = 1.9 * s + 0.4;
  c.flat(polygon(starPoints(12, 12, 4, outer, inner)), tone[1]!);
  c.flat(polygon(starPoints(12, 12, 4, outer * 0.78, inner * 0.8)), tone[3]!);
  c.flat(polygon(starPoints(12, 12, 4, outer * 0.46, inner * 0.7)), CORE);
  c.outline((n) => dim(n, 0.62));
  return c.rgba();
}

const SPARK_TONES = {
  spark: R('#fff0a8', { shadowHue: 40, lightHue: 90 }),
  'spark-gold': GOLDY,
  'spark-mint': R('#aef0c4', { shadowHue: 200, lightHue: 110 }),
  'spark-ice': R('#cdeeff', { shadowHue: 240, lightHue: 190 }),
  'spark-pink': R('#ffc0d8', { shadowHue: 320, lightHue: 60 }),
};

function heartSprite(tone: readonly RGB[], size: number): Rgba {
  const w = size * 2 + 6,
    h = size * 2 + 4;
  const c = new Canvas2D(w, h);
  c.fill(heart(w / 2, h / 2 - 0.5, size), tone, { bevel: Math.max(2, size * 0.42) });
  const hx = w / 2 - size * 0.5,
    hy = h / 2 - size * 0.55;
  c.flat(capsule(hx, hy, hx + size * 0.15, hy + size * 0.12, 0.8), [255, 246, 250]);
  c.pixel(hx + size * 0.5, hy - 0.5, [255, 246, 250]);
  c.outline();
  return c.rgba();
}

function leafShape(len: number, wid: number, angle: number, cx: number, cy: number): Shape {
  const pts: Pt[] = [];
  const n = 14;
  const a = Math.cos(angle),
    b = Math.sin(angle);
  const edge = (t: number): number => wid * Math.sin(Math.PI * t ** 0.8) ** 0.9 * (1 - 0.18 * t);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = (t - 0.5) * len,
      y = -edge(t);
    pts.push([cx + x * a - y * b, cy + x * b + y * a]);
  }
  for (let i = n; i >= 0; i--) {
    const t = i / n;
    const x = (t - 0.5) * len,
      y = edge(t);
    pts.push([cx + x * a - y * b, cy + x * b + y * a]);
  }
  return polygon(pts);
}

function leafSprite(tone: readonly RGB[], vein: RGB, angle: number): Rgba {
  const c = new Canvas2D(24, 24);
  c.fill(leafShape(20, 5.2, angle, 12, 12), tone, { bevel: 3 });
  const a = Math.cos(angle),
    b = Math.sin(angle);
  c.line(12 - a * 8, 12 - b * 8, 12 + a * 8.5, 12 + b * 8.5, vein, 1);
  c.outline();
  return c.rgba();
}

function petalSprite(tone: readonly RGB[], angle: number): Rgba {
  const c = new Canvas2D(16, 16);
  c.fill(ellipse(8, 8, 6, 3.8, angle), tone, { bevel: 2.2 });
  c.outline();
  return c.rgba();
}

function snowflake(branches: boolean): Rgba {
  const c = new Canvas2D(28, 28);
  const arms: Shape[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 - Math.PI / 2;
    const ex = 14 + Math.cos(a) * 12,
      ey = 14 + Math.sin(a) * 12;
    arms.push(capsule(14, 14, ex, ey, 1.35));
    if (branches) {
      for (const f of [0.5, 0.78]) {
        const bx = 14 + Math.cos(a) * 12 * f,
          by = 14 + Math.sin(a) * 12 * f;
        for (const side of [-1, 1]) {
          const ba = a + side * 0.9;
          arms.push(
            capsule(bx, by, bx + Math.cos(ba) * 4.2 * (1.2 - f * 0.5), by + Math.sin(ba) * 4.2 * (1.2 - f * 0.5), 0.9),
          );
        }
      }
    }
  }
  arms.push(ellipse(14, 14, 2.6, 2.6));
  c.fill(union(...arms), FROST, { bevel: 1.6, base: 0.8 });
  c.outline((n) => dim(n, 0.55));
  return c.rgba();
}

function crystalDiamond(): Rgba {
  const c = new Canvas2D(20, 20);
  c.fill(
    polygon([
      [10, 1],
      [17, 10],
      [10, 19],
      [3, 10],
    ]),
    FROST,
    { bevel: 4, gain: 1.2 },
  );
  c.line(10, 3, 10, 17, FROST[4]!, 1);
  c.outline((n) => dim(n, 0.55));
  return c.rgba();
}

function shard(): Rgba {
  const c = new Canvas2D(16, 28);
  c.fill(
    polygon([
      [8, 1],
      [14, 11],
      [9, 27],
      [4, 12],
    ]),
    FROST,
    { bevel: 4, gain: 1.25 },
  );
  c.line(8, 5, 8, 22, FROST[4]!, 1);
  c.outline((n) => dim(n, 0.55));
  return c.rgba();
}

function drop(): Rgba {
  const c = new Canvas2D(14, 18);
  c.fill(
    union(
      ellipse(7, 11.2, 5, 5),
      polygon([
        [7, 1],
        [2.6, 9.6],
        [11.4, 9.6],
      ]),
    ),
    WATER,
    { bevel: 3.2 },
  );
  c.flat(capsule(4.6, 10, 4.6, 12.4, 0.75), [236, 250, 255]);
  c.outline();
  return c.rgba();
}

function bubble(): Rgba {
  const c = new Canvas2D(18, 18);
  c.flat(ellipse(9, 9, 7.2, 7.2), [182, 232, 250], 70);
  c.flat(ring(9, 9, 6.4, 1.3), [210, 244, 255]);
  c.flat(
    both(ring(9, 9, 6.4, 1.3), (x, y) => x + y > 17),
    [96, 170, 214],
  );
  c.flat(capsule(5.2, 6.2, 6.4, 4.8, 0.8), [255, 255, 255]);
  c.pixel(10, 5, [255, 255, 255]);
  return c.rgba();
}

function both(a: Shape, b: Shape): Shape {
  return (x, y) => a(x, y) && b(x, y);
}

const FLAME: RGB[] = [hex('#c2382f'), hex('#f26a2e'), hex('#ffa530'), hex('#ffd54a'), hex('#fff4b8')];

function flameShape(cx: number, base: number, height: number, width: number, lean: number): Shape {
  return (x, y) => {
    const t = (base - y) / height;
    if (t < 0 || t > 1) return false;
    const bulge = Math.sin(Math.PI * t ** 0.62) * width;
    const center = cx + lean * t * t;
    // The tip tapers and flicks, the belly is round.
    return Math.abs(x - center) <= bulge * (1 - t ** 2.2 * 0.55);
  };
}

function flame(frame: number): Rgba {
  const c = new Canvas2D(40, 56);
  const ph = (frame / 6) * Math.PI * 2;
  const lean = Math.sin(ph) * 6.5 + Math.sin(ph * 3 + 1) * 1.8;
  const h = 42 + Math.sin(ph * 2) * 4.5 + Math.cos(ph * 3) * 1.5;
  c.flat(flameShape(20, 52, h, 13, lean), FLAME[0]!);
  c.flat(flameShape(20 + lean * 0.1, 51, h * 0.82, 10.2, lean * 0.85), FLAME[1]!);
  c.flat(flameShape(20 + lean * 0.05, 50, h * 0.6, 7, lean * 0.6), FLAME[2]!);
  c.flat(flameShape(20, 49, h * 0.38, 4.2, lean * 0.3), FLAME[3]!);
  c.flat(flameShape(20, 48, h * 0.2, 2.2, 0), FLAME[4]!);
  // Two small tongues that peel off and fall back.
  const tongue = (dx: number, dy: number, s: number): Shape =>
    flameShape(20 + dx, 52 - dy, 12 * s, 3.2 * s, lean * 0.6);
  c.flat(tongue(-9.5, 5 + Math.sin(ph + 1) * 3, 1.05), FLAME[1]!);
  c.flat(tongue(10, 8 + Math.sin(ph + 2.4) * 3, 0.9), FLAME[1]!);
  c.flat(tongue(-3 + Math.sin(ph * 2) * 3, 20 + Math.sin(ph + 4) * 4, 0.65), FLAME[2]!);
  return c.rgba();
}

function ember(frame: number): Rgba {
  const c = new Canvas2D(12, 12);
  c.flat(ellipse(6, 6, 3.4 - frame * 0.3, 3.4 - frame * 0.3), FLAME[1]!);
  c.flat(ellipse(6, 6, 2.2, 2.2), FLAME[2]!);
  c.flat(ellipse(6, 6, 1.2, 1.2), FLAME[4]!);
  return c.rgba();
}

function bolt(seed: number): Rgba {
  const c = new Canvas2D(64, 232);
  const rnd = mulberry32(seed * 977 + 11);
  // Short straight runs with hard turns, drifting back toward the middle so the strike lands where
  // it was aimed.
  const pts: Pt[] = [[32 + (rnd() - 0.5) * 8, 2]];
  let x = pts[0]![0];
  let y = 2;
  while (y < 214) {
    y += 13 + rnd() * 13;
    const swing = (rnd() > 0.5 ? 1 : -1) * (9 + rnd() * 13);
    x = Math.max(14, Math.min(50, x + swing + (32 - x) * 0.3));
    pts.push([x, Math.min(y, 216)]);
  }
  pts.push([32 + (rnd() - 0.5) * 6, 224]);
  const width = (i: number): number => 5.4 - (i / pts.length) * 2.2;
  const outer: Shape[] = [],
    mid: Shape[] = [],
    inner: Shape[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i]!,
      [x1, y1] = pts[i + 1]!;
    outer.push(capsule(x0, y0, x1, y1, width(i)));
    mid.push(capsule(x0, y0, x1, y1, width(i) * 0.62));
    inner.push(capsule(x0, y0, x1, y1, width(i) * 0.3));
  }
  // Two forks that split off and fade out.
  for (const idx of [Math.floor(pts.length * 0.35), Math.floor(pts.length * 0.62)]) {
    const m = pts[idx]!;
    const dir = rnd() > 0.5 ? 1 : -1;
    const mx = Math.max(6, Math.min(58, m[0] + dir * (10 + rnd() * 6)));
    outer.push(
      capsule(m[0], m[1], mx, m[1] + 16, 2.8, 1.6),
      capsule(mx, m[1] + 16, Math.max(6, Math.min(58, mx + dir * 7)), m[1] + 38, 1.6, 0.9),
    );
    mid.push(capsule(m[0], m[1], mx, m[1] + 16, 1.7, 0.9));
  }
  c.flat(union(...outer), hex('#ffd54a'));
  c.flat(union(...mid), hex('#fff0a0'));
  c.flat(union(...inner), [255, 255, 255]);
  c.outline(hex('#5a4aa0'));
  return c.rgba();
}

function puff(frame: number, frames: number): Rgba {
  const c = new Canvas2D(36, 28);
  const s = 0.55 + (frame / Math.max(1, frames - 1)) * 0.5;
  const cx = 18,
    cy = 17;
  c.fill(
    union(
      ellipse(cx - 7 * s, cy + 1, 7.5 * s, 6.5 * s),
      ellipse(cx + 7 * s, cy + 1.5, 7 * s, 6 * s),
      ellipse(cx, cy - 3 * s, 9 * s, 8 * s),
    ),
    CLOUD,
    { bevel: 4.2, base: 0.7 },
  );
  c.outline((n) => dim(n, 0.7));
  return c.rgba();
}

function stormCloud(): Rgba {
  const c = new Canvas2D(80, 44);
  const shape = union(
    ellipse(20, 28, 14, 10),
    ellipse(36, 20, 16, 14),
    ellipse(54, 22, 15, 13),
    ellipse(64, 30, 12, 9),
    (x, y) => x > 12 && x < 70 && y > 26 && y < 38,
  );
  c.fill(shape, STORM, { bevel: 5.5, base: 0.5, gain: 1.1 });
  c.outline((n) => dim(n, 0.55));
  return c.rgba();
}

function mote(frame: number): Rgba {
  const c = new Canvas2D(24, 24);
  const r = [3.2, 3.8, 3.4][frame % 3]!;
  const halo = glowDisc(24, [255, 240, 170], 4, 0.8);
  for (let i = 0; i < halo.data.length; i++) c.px[i] = halo.data[i]!;
  c.flat(ellipse(12, 12, r + 1.4, r + 1.4), [255, 233, 140]);
  c.flat(ellipse(12, 12, r, r), CORE);
  return c.rgba();
}

function tapRing(frame: number): Rgba {
  const c = new Canvas2D(96, 56);
  const f = frame / 7;
  const r = 7 + f * 34;
  const w = 3.2 - f * 1.6;
  const a = [255, 255, 245, 220, 180, 130, 80, 40][frame]!;
  c.flat(ring(48, 30, r, w + 1, 0.56), [88, 104, 168], Math.round(a * 0.55));
  c.flat(ring(48, 28.5, r, w, 0.56), [255, 255, 255], a);
  return c.rgba();
}

function wave(frame: number): Rgba {
  const c = new Canvas2D(240, 128);
  const f = frame / 9;
  const r = 14 + f * 96;
  const w = 8.5 - f * 6.2;
  const a = [255, 255, 255, 245, 225, 195, 160, 120, 80, 40][frame]!;
  const disc = ellipse(120, 66, r, r * 0.5);
  const m = c.mask(disc);
  // A faint filled disc under the ring, dithered so it stays pixel art.
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      if (m[y * c.w + x] && ((x + y) & 1) === 0 && Math.hypot(x - 120, (y - 66) / 0.5) < r - w)
        c.pixel(x, y, [255, 255, 255], Math.round(a * 0.3));
    }
  }
  c.flat(ring(120, 66, r, w, 0.5), [255, 255, 255], a);
  c.flat(ring(120, 66, r - w * 0.8, w * 0.5, 0.5), [255, 255, 255], Math.round(a * 0.5));
  return c.rgba();
}

function dustPuff(frame: number): Rgba {
  const c = new Canvas2D(32, 22);
  const s = 0.5 + frame * 0.2;
  const a = [255, 235, 190, 120][frame]!;
  const cx = 16,
    cy = 12;
  c.fill(
    union(
      ellipse(cx - 6 * s, cy + 1, 5 * s, 4.4 * s),
      ellipse(cx + 6 * s, cy + 1, 5 * s, 4.4 * s),
      ellipse(cx, cy - 2 * s, 6 * s, 5 * s),
    ),
    CLOUD,
    { bevel: 3, base: 0.7 },
  );
  c.outline((n) => dim(n, 0.72));
  for (let i = 3; i < c.px.length; i += 4) c.px[i] = Math.round((c.px[i]! * a) / 255);
  return c.rgba();
}

function bloomFlower(petals: readonly RGB[], center: RGB, frame: number, frames: number, big: boolean): Rgba {
  const w = big ? 56 : 40,
    h = big ? 64 : 56;
  const c = new Canvas2D(w, h);
  const t = (frame + 1) / frames;
  const grow = Math.min(1, t * 1.25);
  const open = Math.max(0, (t - 0.45) / 0.55);
  const base: Pt = [w / 2, h - 4];
  const stemH = (big ? 34 : 28) * grow;
  const tip: Pt = [base[0] + Math.sin(grow * 2) * 1.5, base[1] - stemH];
  const shadow = [hex('#2c6e48'), hex('#3f9f56'), hex('#5cbf55')];
  c.flat(capsule(base[0], base[1], tip[0], tip[1], 1.7, 1.4), shadow[1]!);
  c.line(base[0] - 0.6, base[1], tip[0] - 0.6, tip[1], shadow[2]!, 1);
  if (grow > 0.35) {
    const ly = base[1] - stemH * 0.4;
    c.fill(leafShape(11 * Math.min(1, grow), 3.3, -0.5, base[0] + 6 * grow, ly), LEAF, { bevel: 2 });
    c.fill(leafShape(10 * Math.min(1, grow), 3.1, Math.PI + 0.55, base[0] - 6 * grow, ly + 4), LEAF, { bevel: 2 });
  }
  const rad = (big ? 11 : 8.5) * (0.25 + 0.75 * open) + 1.5;
  const n = big ? 7 : 6;
  if (open > 0) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      const px = tip[0] + Math.cos(a) * rad * 0.62,
        py = tip[1] + Math.sin(a) * rad * 0.5;
      c.fill(ellipse(px, py, rad * 0.5, rad * 0.4, a), petals, { bevel: 2.2 });
    }
  } else {
    c.fill(ellipse(tip[0], tip[1] - 1, 2.6 + grow, 3.4 + grow), petals, { bevel: 2 });
  }
  if (open > 0)
    c.fill(ellipse(tip[0], tip[1], rad * 0.28, rad * 0.24), [center, mix(center, [255, 255, 255], 0.4)] as RGB[], {
      bevel: 1.4,
    });
  c.outline();
  return c.rgba();
}

function iceFlower(frame: number, frames: number): Rgba {
  const w = 56,
    h = 64;
  const c = new Canvas2D(w, h);
  const t = (frame + 1) / frames;
  const grow = Math.min(1, t * 1.3);
  const open = Math.max(0, (t - 0.4) / 0.6);
  const base: Pt = [28, 60];
  const stemH = 26 * grow;
  const tip: Pt = [28, base[1] - stemH];
  c.flat(capsule(base[0], base[1], tip[0], tip[1], 1.5, 1.2), FROST[2]!);
  c.line(base[0] - 0.6, base[1], tip[0] - 0.6, tip[1], FROST[4]!, 1);
  const n = 8;
  const rad = 15 * (0.2 + 0.8 * open) + 1.5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const tipx = tip[0] + Math.cos(a) * rad * 1.1,
      tipy = tip[1] + Math.sin(a) * rad * 0.78;
    const side = rad * 0.34;
    const px = tip[0] + Math.cos(a) * rad * 0.5,
      py = tip[1] + Math.sin(a) * rad * 0.4;
    const nx = -Math.sin(a),
      ny = Math.cos(a);
    c.fill(
      polygon([
        [tip[0], tip[1]],
        [px + nx * side, py + ny * side * 0.7],
        [tipx, tipy],
        [px - nx * side, py - ny * side * 0.7],
      ]),
      FROST,
      { bevel: 2.6, gain: 1.2 },
    );
  }
  c.fill(
    ellipse(tip[0], tip[1], 2.6 + open * 1.2, 2.2 + open),
    [hex('#5aa8e6'), hex('#8fd0ff'), hex('#e6f8ff')] as RGB[],
    { bevel: 1.5 },
  );
  c.outline((n) => dim(n, 0.55));
  return c.rgba();
}

function rainbow(): Rgba {
  const c = new Canvas2D(192, 104);
  const bands: RGB[] = [
    hex('#ff6f7d'),
    hex('#ffa65c'),
    hex('#ffe066'),
    hex('#7fdc7a'),
    hex('#5ec7f2'),
    hex('#7d8cf0'),
    hex('#c58cf0'),
  ];
  const top = 90,
    cx = 96,
    cy = 98,
    t = 5;
  bands.forEach((color, i) => {
    const r = top - i * t;
    c.flat((x, y) => y <= cy && Math.hypot(x - cx, (y - cy) * 1.0) <= r && Math.hypot(x - cx, y - cy) > r - t, color);
  });
  c.flat(
    (x, y) => y <= cy && Math.hypot(x - cx, y - cy) <= top && Math.hypot(x - cx, y - cy) > top - 1.1,
    [255, 255, 255],
    120,
  );
  c.outline(hex('#6d5aa8'));
  // Clouds at both feet, so the arc seems to grow out of them.
  for (const [px, py] of [
    [12, 94],
    [180, 94],
  ] as const) {
    c.fill(union(ellipse(px - 6, py, 9, 7), ellipse(px + 6, py + 0.5, 9, 6.6), ellipse(px, py - 4, 10, 8)), CLOUD, {
      bevel: 4,
      base: 0.7,
    });
  }
  c.outline((n) => dim(n, 0.7));
  return c.rgba();
}

/**
 * Light and nearly neutral, so the game can tint one picture any colour and the shading still
 * shows.
 */
const NOTE = R('#f6f1ff', { shadowHue: 280, lightHue: 80, lightness: [-0.34, -0.2, -0.08, 0, 0.05] });

/** An eighth note with a flag, or a pair of them joined by a beam. */
function noteSprite(pair: boolean): Rgba {
  const w = pair ? 34 : 22,
    h = 30;
  const c = new Canvas2D(w, h);
  const heads: Pt[] = pair
    ? [
        [8, 24],
        [26, 21],
      ]
    : [[8, 24]];
  const shapes: Shape[] = [];
  for (const [x, y] of heads) {
    shapes.push(ellipse(x, y, 5.6, 4.1, -0.42), capsule(x + 4.4, y - 1, x + 4.4, y - 19, 1.15));
  }
  if (pair)
    shapes.push(
      polygon([
        [12.8, 4.2],
        [30.8, 1.2],
        [30.8, 6.6],
        [12.8, 9.6],
      ]),
    );
  else
    shapes.push(
      polygon([
        [12.8, 4.4],
        [16.4, 6.2],
        [19, 9.8],
        [19.4, 14.2],
        [17.2, 18.4],
        [17.2, 13.6],
        [16.2, 10.8],
        [14.6, 9],
        [12.8, 8.4],
      ]),
    );
  c.fill(union(...shapes), NOTE, { bevel: 2.4, base: 0.72 });
  c.outline((n) => dim(n, 0.6));
  return c.rgba();
}

/**
 * A letter z with thick, soft strokes, as a sleeper breathes it out. `scale` is how many times the
 * small one it is.
 */
function zSprite(scale: number): Rgba {
  const w = Math.round(20 * scale),
    h = Math.round(22 * scale);
  const c = new Canvas2D(w, h);
  const pts: Pt[] = [
    [2, 2],
    [18, 2],
    [18, 5.2],
    [8.6, 16.6],
    [18, 16.6],
    [18, 20],
    [2, 20],
    [2, 16.8],
    [11.4, 5.4],
    [2, 5.4],
  ];
  c.fill(polygon(pts.map(([x, y]): Pt => [x * scale, y * scale])), NOTE, { bevel: 2.2 * scale, base: 0.72 });
  c.outline((n) => dim(n, 0.6));
  return c.rgba();
}

const still = (id: string, w: number, h: number, ox: number, oy: number, render: () => Rgba): FxSprite => ({
  id,
  w,
  h,
  ox,
  oy,
  render,
});

export const FX_SPRITES: readonly FxSprite[] = [
  ...(Object.entries(SPARK_TONES) as [string, RGB[]][]).map(
    ([id, tone]): FxSprite => ({
      id: `fx-${id}`,
      w: 24,
      h: 24,
      ox: 12,
      oy: 12,
      frames: 4,
      fps: 12,
      loop: true,
      render: (f) => spark(tone, f),
    }),
  ),
  {
    id: 'fx-dot',
    w: 8,
    h: 8,
    ox: 4,
    oy: 4,
    render: () =>
      new Canvas2D(8, 8)
        .flat(ellipse(4, 4, 2.6, 2.6), [255, 255, 255])
        .flat(ellipse(4, 4, 1.4, 1.4), CORE)
        .rgba(),
  },
  still('fx-heart-1', 24, 22, 12, 11, () => heartSprite(PINK, 9)),
  still('fx-heart-2', 18, 16, 9, 8, () => heartSprite(ROSE, 6)),
  still('fx-leaf-1', 24, 24, 12, 12, () => leafSprite(LEAF, LEAF_DEEP[1]!, -0.6)),
  still('fx-leaf-2', 24, 24, 12, 12, () => leafSprite(LEAF_DEEP, LEAF_DEEP[0]!, 0.5)),
  still('fx-leaf-3', 24, 24, 12, 12, () => leafSprite(LEAF, LEAF_DEEP[1]!, 1.25)),
  still('fx-petal-1', 16, 16, 8, 8, () => petalSprite(BLOSSOM, -0.5)),
  still('fx-petal-2', 16, 16, 8, 8, () => petalSprite(DAISY, 0.6)),
  still('fx-flake-1', 28, 28, 14, 14, () => snowflake(true)),
  still('fx-flake-2', 20, 20, 10, 10, crystalDiamond),
  still('fx-shard', 16, 28, 8, 26, shard),
  still('fx-drop', 14, 18, 7, 12, drop),
  still('fx-bubble', 18, 18, 9, 9, bubble),
  { id: 'fx-ember', w: 12, h: 12, ox: 6, oy: 6, frames: 2, fps: 10, loop: true, render: ember },
  { id: 'fx-flame', w: 40, h: 56, ox: 20, oy: 52, frames: 6, fps: 11, loop: true, render: flame },
  ...[1, 2, 3].map((n) => still(`fx-bolt-${n}`, 64, 232, 32, 224, () => bolt(n))),
  { id: 'fx-puff', w: 36, h: 28, ox: 18, oy: 14, frames: 4, fps: 6, loop: false, render: (f) => puff(f, 4) },
  still('fx-cloud', 80, 44, 40, 22, stormCloud),
  { id: 'fx-mote', w: 24, h: 24, ox: 12, oy: 12, frames: 3, fps: 6, loop: true, render: mote },
  { id: 'fx-ring', w: 96, h: 56, ox: 48, oy: 30, frames: 8, fps: 24, loop: false, render: tapRing },
  { id: 'fx-wave', w: 240, h: 128, ox: 120, oy: 66, frames: 10, fps: 20, loop: false, render: wave },
  { id: 'fx-dust', w: 32, h: 22, ox: 16, oy: 12, frames: 4, fps: 10, loop: false, render: dustPuff },
  { id: 'fx-glow', w: 128, h: 128, ox: 64, oy: 64, render: () => glowDisc(128, [255, 255, 255], 7, 0.95) },
  { id: 'fx-glow-small', w: 48, h: 48, ox: 24, oy: 24, render: () => glowDisc(48, [255, 255, 255], 5, 0.95) },
  {
    id: 'fx-grow-flower',
    w: 40,
    h: 56,
    ox: 20,
    oy: 52,
    frames: 8,
    fps: 9,
    loop: false,
    render: (f) => bloomFlower(PINK, hex('#ffd24a'), f, 8, false),
  },
  {
    id: 'fx-grow-flower-lilac',
    w: 40,
    h: 56,
    ox: 20,
    oy: 52,
    frames: 8,
    fps: 9,
    loop: false,
    render: (f) => bloomFlower(R('#c3a0ff', { shadowHue: 280, lightHue: 330 }), hex('#fff0a8'), f, 8, false),
  },
  {
    id: 'fx-grow-flower-white',
    w: 40,
    h: 56,
    ox: 20,
    oy: 52,
    frames: 8,
    fps: 9,
    loop: false,
    render: (f) => bloomFlower(DAISY, hex('#ffd24a'), f, 8, false),
  },
  { id: 'fx-ice-flower', w: 56, h: 64, ox: 28, oy: 60, frames: 8, fps: 9, loop: false, render: (f) => iceFlower(f, 8) },
  still('fx-rainbow', 192, 104, 96, 98, rainbow),
  still('fx-note-1', 22, 30, 11, 15, () => noteSprite(false)),
  still('fx-note-2', 34, 30, 17, 15, () => noteSprite(true)),
  still('fx-z-1', 20, 22, 10, 11, () => zSprite(1)),
  still('fx-z-2', 29, 32, 14, 16, () => zSprite(1.45)),
  ...EXIT_SPRITES,
];
