import { hex, type RGB, ramp } from '../core/color';
import type { Rgba } from '../core/image';
import { hash2 } from '../core/rng';
import { type V3, v3 } from '../core/vec';
import { extrude, FRONT, lathe, type P2 } from './arch';
import { barnMaterials } from './barn';
import { APPLES, BERRIES, feedCrate, heap, ORCHARD } from './feed';
import type { Canvas } from './hall';
import { Painter } from './paint';
import { PAL, type Ramp } from './palette';
import { blob, box, tube } from './prims';
import { renderScene, SceneBuilder } from './scene';

/**
 * Everything that stands about the stable: fruit, tools, buckets, the brushing post. Same camera
 * and light as the rest of the world.
 */
const rgb = (c: RGB): readonly [number, number, number] => [c[0], c[1], c[2]];

function draw(
  b: SceneBuilder,
  c: Canvas,
  extra: Partial<Parameters<typeof renderScene>[1]> = {},
): { rgba: Rgba; at: (p: V3) => [number, number] } {
  const r = renderScene(b, {
    width: c.w,
    height: c.h,
    originX: c.ox,
    originY: c.oy,
    ss: 4,
    aoRadius: 8,
    lineDepth: 5,
    shadowFit: true,
    ...extra,
  });
  return { rgba: r.rgba, at: r.at };
}

const r6 = (base: string, shadowHue: number, lightHue: number): Ramp =>
  ramp(hex(base), { steps: 6, shadowHue, lightHue, lean: 0.95, lightness: [-0.32, -0.21, -0.1, 0, 0.09, 0.17] });
const STEEL = r6('#aab4c8', 255, 100);
const OATS = r6('#d6b062', 330, 85);
const LEATHER = r6('#9a5a3c', 320, 60);
const BLANKET = r6('#e0608f', 325, 50);
const WATER = PAL.water;

const circle = (r: number, n = 20): P2[] =>
  Array.from({ length: n }, (_, i): P2 => [Math.cos((i / n) * Math.PI * 2) * r, Math.sin((i / n) * Math.PI * 2) * r]);

export const FEED_PILE: Canvas = { w: 270, h: 190, ox: 135, oy: 124 };

/** A plank bin heaped with apples, sky berries and carrots, with a wooden scoop leaning in it. */
export function renderFeedPile(): Rgba {
  const b = new SceneBuilder();
  const m = barnMaterials(b);
  const [w, d, h] = [196, 124, 38];
  const wall = (x: number, y: number, sx: number, sy: number): void =>
    box(b.mesh(m.plank), v3(x, y, h / 2), v3(sx, sy, h), 0, 1.4);
  wall(0, -d / 2 + 4, w, 8);
  wall(0, d / 2 - 4, w, 8);
  for (const sx of [-1, 1]) wall(sx * (w / 2 - 4), 0, 8, d);
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      box(b.mesh(m.beam), v3(sx * (w / 2 - 4), sy * (d / 2 - 4), h / 2 + 2), v3(12, 12, h + 4), 0, 1);
  box(b.mesh(m.plank), v3(0, 0, 3), v3(w - 8, d - 8, 6));
  heap(b, { at: v3(0, 4, h - 6), rx: w / 2 - 14, ry: d / 2 - 16, h: 56, count: 150, mix: ORCHARD, seed: 31 });
  // The scoop: a shaft and a flat blade, leaning in the front corner.
  const fx = 66,
    fy = -52;
  tube(
    b.mesh(m.plank),
    [
      { p: v3(fx, fy, 56), r: 2.6 },
      { p: v3(fx + 12, fy + 6, 134), r: 2.6 },
    ],
    { n: 6, segs: 6 },
  );
  box(b.mesh(m.iron), v3(fx - 1, fy - 1, 50), v3(22, 4, 18), 0.3, 1);
  return draw(b, FEED_PILE, { shadowBias: 3 }).rgba;
}

export const CRATES_CANVAS: Canvas = { w: 230, h: 190, ox: 115, oy: 130 };

/**
 * Crates of fruit: two side by side with a third on top, or two with a few pieces spilled beside
 * them.
 */
export function renderFeedCrates(variant: 0 | 1): Rgba {
  const b = new SceneBuilder();
  if (variant === 0) {
    feedCrate(b, { at: v3(-44, 0, 0), kind: 'apple', yaw: 0.05, seed: 3 });
    feedCrate(b, { at: v3(46, 4, 0), kind: 'berry', yaw: -0.06, seed: 4 });
    feedCrate(b, { at: v3(0, 2, 40), kind: 'carrot', yaw: 0.1, seed: 5 });
  } else {
    feedCrate(b, { at: v3(-28, 0, 0), kind: 'berry', yaw: -0.08, seed: 6 });
    feedCrate(b, { at: v3(52, -6, 0), kind: 'apple', yaw: 0.5, seed: 7 });
    heap(b, { at: v3(-74, -36, 0), rx: 22, ry: 12, h: 2, count: 5, mix: APPLES, seed: 8 });
    heap(b, { at: v3(8, -42, 0), rx: 28, ry: 10, h: 2, count: 6, mix: BERRIES, seed: 9 });
  }
  return draw(b, CRATES_CANVAS, { shadowBias: 3 }).rgba;
}

export const BRUSH_CANVAS: Canvas = { w: 230, h: 230, ox: 115, oy: 176 };

/**
 * A hitching rail where a unicorn is brushed: two posts, rails, a bucket and sponge, brushes on
 * hooks, a heart on a board.
 */
export function renderBrushStation(): Rgba {
  const b = new SceneBuilder();
  const m = barnMaterials(b);
  for (const sx of [-1, 1]) {
    box(b.mesh(m.beam), v3(sx * 62, 0, 62), v3(11, 11, 124), 0, 1.2);
    box(b.mesh(m.beam), v3(sx * 62, 0, 4), v3(20, 20, 8), 0, 1);
    box(b.mesh(m.iron), v3(sx * 62, -6.4, 100), v3(13, 2, 5));
  }
  box(b.mesh(m.beam), v3(0, -1, 112), v3(138, 9, 11), 0, 1.4);
  box(b.mesh(m.beam), v3(0, -1, 58), v3(124, 7, 8), 0, 1);
  // A ring on the rail to tie to.
  tube(
    b.mesh(m.iron),
    Array.from({ length: 13 }, (_, i) => ({
      p: v3(24 + Math.cos((i / 12) * Math.PI * 2) * 7, -8, 92 + Math.sin((i / 12) * Math.PI * 2) * 7),
      r: 1.4,
    })),
    { n: 12, segs: 5 },
  );
  // Two brushes hung from the lower rail: a handle, a block, bristles.
  for (const [x, tall] of [
    [-34, 1],
    [-14, 0.8],
  ] as const) {
    box(b.mesh(m.iron), v3(x, -6, 62), v3(2.4, 3, 8));
    box(b.mesh(m.plank), v3(x, -7, 46), v3(7, 5, 22 * tall));
    box(b.mesh(m.plank), v3(x, -7, 30), v3(18, 6, 8), 0, 1.4);
    box(b.mesh(m.straw), v3(x, -7, 24), v3(16, 6, 5));
  }
  // A board with a heart on it.
  box(b.mesh(m.plank), v3(-10, -3, 150), v3(44, 5, 34), 0, 1.4);
  for (const dx of [-22, 2])
    tube(
      b.mesh(m.rope),
      [
        { p: v3(-10 + dx * 0.5 - 4, -3, 167), r: 0.9 },
        { p: v3(dx - 2, -3, 112), r: 0.9 },
      ],
      { n: 2, segs: 4 },
    );
  // A bucket with a sponge in it, on the ground in front.
  const steel = b.solid('steel', b.variant('steel', STEEL));
  lathe(b.mesh(steel), {
    c: v3(54, -34, 0),
    segs: 16,
    smooth: true,
    profile: [
      [11, 0],
      [13.5, 0],
      [16, 22],
      [16.6, 25],
      [15, 25],
      [0, 20],
    ],
  });
  lathe(b.mesh(b.solid('water', b.variant('water', WATER, { flat: 3 }))), {
    c: v3(54, -34, 18),
    segs: 16,
    profile: [
      [15, 0],
      [0, 0.4],
    ],
  });
  blob(b.mesh(b.solid('sponge', b.variant('sponge', r6('#f0c850', 330, 90)))), v3(54, -34, 24), v3(9, 7, 6), 0.4);
  tube(
    b.mesh(m.iron),
    Array.from({ length: 9 }, (_, i) => ({
      p: v3(54 + Math.cos(Math.PI - (i / 8) * Math.PI) * 15, -34, 22 + Math.sin((i / 8) * Math.PI) * 14),
      r: 0.9,
    })),
    { n: 8, segs: 4 },
  );
  const out = draw(b, BRUSH_CANVAS, { shadowBias: 3 });
  const p = new Painter(out.rgba);
  // The heart on the board.
  const [hx0, hy0] = out.at(v3(-10, -6, 151));
  const hx = Math.round(hx0),
    hy = Math.round(hy0);
  for (let y = -8; y <= 9; y++) {
    for (let x = -10; x <= 10; x++) {
      const inLobes = Math.hypot(Math.abs(x) - 4.4, y + 2.4) <= 5.2;
      const inPoint = y >= -1 && Math.abs(x) <= 9.4 - (y + 1) * 1.0;
      if (!inLobes && !inPoint) continue;
      p.px(hx + x, hy + y, rgb(BLANKET[x + y < -3 ? 5 : y > 3 ? 2 : 4]!));
    }
  }
  p.px(hx - 5, hy - 5, [255, 236, 244]);
  return out.rgba;
}

export const BUCKET_CANVAS: Canvas = { w: 80, h: 80, ox: 40, oy: 56 };

export function renderBucket(fill: 'water' | 'oats'): Rgba {
  const b = new SceneBuilder();
  const steel = b.solid('steel', b.variant('steel', STEEL));
  lathe(b.mesh(steel), {
    c: v3(0, 0, 0),
    segs: 16,
    smooth: true,
    profile: [
      [11, 0],
      [13.5, 0],
      [16, 22],
      [16.6, 25],
      [15, 25],
      [0, 20],
    ],
  });
  lathe(
    b.mesh(
      fill === 'water'
        ? b.solid('water', b.variant('water', WATER, { flat: 3 }))
        : b.solid('oats', b.variant('oats', OATS)),
    ),
    {
      c: v3(0, 0, fill === 'water' ? 18 : 22),
      segs: 16,
      profile: [
        [15, 0],
        [fill === 'water' ? 0 : 8, fill === 'water' ? 0.4 : 5],
        [0, fill === 'water' ? 0.4 : 7],
      ],
    },
  );
  const rope = b.solid('wire', b.variant('wire', STEEL));
  tube(
    b.mesh(rope),
    Array.from({ length: 9 }, (_, i) => ({
      p: v3(Math.cos(Math.PI - (i / 8) * Math.PI) * 15, 0, 24 + Math.sin((i / 8) * Math.PI) * 15),
      r: 0.9,
    })),
    { n: 8, segs: 4 },
  );
  return draw(b, BUCKET_CANVAS, { shadowBias: 2.4 }).rgba;
}

export const TROUGH_CANVAS: Canvas = { w: 230, h: 120, ox: 115, oy: 82 };

/** A long wooden water trough on trestles. */
export function renderTrough(): Rgba {
  const b = new SceneBuilder();
  const m = barnMaterials(b);
  const W = 156,
    D = 52,
    H = 28;
  box(b.mesh(m.plank), v3(0, 0, 24 + H / 2), v3(W, D, H), 0, 1.6);
  box(b.mesh(m.beam), v3(0, D / 2 - 1.5, 24 + H + 1), v3(W, 4, 4), 0, 0.6);
  box(b.mesh(m.beam), v3(0, -D / 2 + 1.5, 24 + H + 1), v3(W, 4, 4), 0, 0.6);
  for (const sx of [-1, 1]) box(b.mesh(m.beam), v3(sx * (W / 2 - 1.5), 0, 24 + H + 1), v3(4, D, 4), 0, 0.6);
  box(
    b.mesh(b.solid('water', b.variant('water', WATER, { flat: 3 }))),
    v3(0, 0, 24 + H + 0.8),
    v3(W - 12, D - 12, 1.6),
  );
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) box(b.mesh(m.beam), v3(sx * (W / 2 - 14), sy * (D / 2 - 8), 12), v3(9, 9, 24), 0, 1);
    box(b.mesh(m.beam), v3(sx * (W / 2 - 14), 0, 8), v3(7, D - 6, 6), 0, 1);
  }
  const out = draw(b, TROUGH_CANVAS, { shadowBias: 3 });
  const p = new Painter(out.rgba);
  // Glints on the water.
  const [wx, wy] = out.at(v3(-30, -4, 24 + H + 1.6));
  for (let i = 0; i < 4; i++)
    for (let k = 0; k < 6; k++)
      p.px(Math.round(wx) + i * 22 + k + (i % 2) * 7, Math.round(wy) + (i % 2) * 3, [214, 242, 255]);
  return out.rgba;
}

export const BARROW_CANVAS: Canvas = { w: 280, h: 170, ox: 140, oy: 108 };

/** A wheelbarrow loaded with fruit, seen from the side. */
export function renderWheelbarrow(): Rgba {
  const b = new SceneBuilder();
  const m = barnMaterials(b);
  const paint = b.solid('paint', b.variant('paint', r6('#3f9aa8', 250, 120)));
  // The tray: a trapezoid in side view, pushed along y.
  extrude(
    b.mesh(paint),
    [
      [-92, 34],
      [34, 56],
      [52, 24],
      [-66, 16],
    ],
    FRONT(0, 18, 0),
    0,
    52,
    { smooth: 20 },
  );
  for (const sy of [-1, 1]) box(b.mesh(m.beam), v3(-62, 18 + sy * -22, 8), v3(7, 6, 32));
  // The wheel: a tyre and a hub, in the x-z plane, at the front.
  const wx = 66;
  extrude(b.mesh(m.iron), circle(23), FRONT(wx, 2, 24), 0, 9);
  extrude(b.mesh(m.plank), circle(15), FRONT(wx, 3, 24), 0, 10.6);
  extrude(b.mesh(m.iron), circle(4.4), FRONT(wx, 4, 24), 0, 12);
  for (const sy of [-1, 1]) box(b.mesh(m.iron), v3(wx - 4, 4 + sy * -10, 40), v3(5, 3, 36));
  // Handles run back from the tray.
  for (const sy of [-1, 1])
    tube(
      b.mesh(m.beam),
      [
        { p: v3(-60, 18 + sy * 22, 28), r: 3 },
        { p: v3(-128, 18 + sy * 26, 58), r: 3.4 },
      ],
      { n: 6, segs: 6 },
    );
  // The load.
  heap(b, { at: v3(-14, -8, 38), rx: 52, ry: 20, h: 26, count: 34, mix: { apple: 5, berry: 2, carrot: 1 }, seed: 17 });
  const out = draw(b, BARROW_CANVAS, { shadowBias: 3 });
  return out.rgba;
}

export const BIN_CANVAS: Canvas = { w: 170, h: 150, ox: 85, oy: 96 };

/**
 * A wooden feed bin with an iron-strapped lid ajar, a scoop, and a sack of oats slumped beside it.
 */
export function renderFeedBin(): Rgba {
  const b = new SceneBuilder();
  const m = barnMaterials(b);
  const oats = b.solid('oats', b.variant('oats', OATS), (s) => (hash2(s.px, s.py, 31) - 0.5) * 0.1);
  box(b.mesh(m.plank), v3(-14, 0, 25), v3(84, 52, 50), 0, 1.6);
  box(b.mesh(oats), v3(-14, 0, 49), v3(76, 44, 3));
  for (const dx of [-38, 10]) box(b.mesh(m.iron), v3(-14 + dx, -26.4, 25), v3(7, 2.4, 52));
  for (const dz of [8, 42]) box(b.mesh(m.beam), v3(-14, -26.6, dz), v3(86, 3, 6), 0, 0.8);
  // The lid, propped open at the back.
  extrude(
    b.mesh(m.plank),
    [
      [-40, 0],
      [40, 0],
      [40, 5],
      [-40, 5],
    ],
    FRONT(-14, 26, 50),
    0,
    54,
    { smooth: 10 },
  );
  // A scoop in the oats.
  lathe(b.mesh(b.solid('scoop', b.variant('scoop', STEEL))), {
    c: v3(-24, -4, 49),
    segs: 10,
    profile: [
      [7, 0],
      [8, 6],
      [0, 7],
    ],
  });
  box(b.mesh(m.plank), v3(-6, -4, 56), v3(26, 3, 3));
  // The sack.
  const sack = b.solid(
    'sack',
    b.variant('sack', r6('#c9a470', 330, 85)),
    (s) => (hash2(s.px >> 1, s.py, 33) - 0.5) * 0.1,
  );
  blob(b.mesh(sack), v3(54, -12, 22), v3(24, 20, 24), 0.2);
  blob(b.mesh(sack), v3(54, -12, 46), v3(14, 12, 12), 0.2);
  lathe(b.mesh(m.rope), {
    c: v3(54, -12, 56),
    segs: 8,
    profile: [
      [5, 0],
      [6, 2],
      [5, 4],
      [0, 4],
    ],
  });
  return draw(b, BIN_CANVAS, { shadowBias: 3 }).rgba;
}

export const RACK_CANVAS: Canvas = { w: 190, h: 200, ox: 95, oy: 150 };

/**
 * A saddle rack: two posts and two arms, a saddle over the lower, a rose blanket over the upper, a
 * bridle on a peg.
 */
export function renderSaddleRack(): Rgba {
  const b = new SceneBuilder();
  const m = barnMaterials(b);
  const leather = b.solid('leather', b.variant('leather', LEATHER), (s) => (hash2(s.px, s.py, 41) - 0.5) * 0.06);
  const blanket = b.solid('blanket', b.variant('blanket', BLANKET), (s) =>
    Math.floor(s.rest[0] / 8) % 2 === 0 ? 0.02 : -0.02,
  );
  for (const sx of [-1, 1]) {
    box(b.mesh(m.beam), v3(sx * 62, 0, 62), v3(10, 10, 124), 0, 1);
    box(b.mesh(m.beam), v3(sx * 62, 0, 3), v3(18, 18, 6), 0, 0.8);
  }
  box(b.mesh(m.beam), v3(0, 4, 112), v3(134, 8, 8), 0, 1);
  box(b.mesh(m.beam), v3(0, -10, 74), v3(134, 14, 8), 0, 1);
  // The blanket is folded over the top rail.
  box(b.mesh(blanket), v3(-20, 4, 118), v3(56, 18, 18), 0, 2.6);
  box(b.mesh(b.solid('trim', b.variant('trim', r6('#f2d27a', 35, 90)))), v3(-20, 4, 109.5), v3(57, 19, 2.6));
  // The saddle in side view: a seat dipping between a high cantle and a pommel, flaps hanging each
  // side, a stirrup.
  const seat: P2[] = [
    [-30, 0],
    [30, 0],
    [33, 5],
    [32, 15],
    [27, 20],
    [22, 14],
    [14, 7],
    [-8, 5],
    [-18, 10],
    [-24, 22],
    [-31, 17],
    [-33, 6],
  ];
  extrude(b.mesh(leather), seat, FRONT(14, -4, 94), 0, 26, { smooth: 40 });
  const flap: P2[] = [
    [-16, 0],
    [16, 0],
    [18, -10],
    [15, -26],
    [0, -30],
    [-15, -26],
    [-18, -10],
  ];
  for (const y of [-6, 20])
    extrude(
      b.mesh(b.solid(`flap${y}`, b.variant(`flap${y}`, LEATHER, { bands: [0.15, 0.3, 0.5, 0.7, 0.9] }))),
      flap,
      FRONT(14, y, 92),
      0,
      3.4,
      { smooth: 40 },
    );
  tube(
    b.mesh(m.iron),
    Array.from({ length: 11 }, (_, i) => ({
      p: v3(14 + Math.cos((i / 10) * Math.PI * 2) * 6, -9, 58 + Math.sin((i / 10) * Math.PI * 2) * 7),
      r: 1.1,
    })),
    { n: 10, segs: 5 },
  );
  tube(
    b.mesh(leather),
    [
      { p: v3(14, -9, 90), r: 1.1 },
      { p: v3(14, -9, 66), r: 1.1 },
    ],
    { n: 3, segs: 4 },
  );
  // A bridle on a peg.
  box(b.mesh(m.iron), v3(48, -3, 136), v3(3, 6, 3));
  tube(
    b.mesh(leather),
    Array.from({ length: 12 }, (_, i) => ({
      p: v3(48 + Math.sin((i / 11) * 3.14) * 9, -4, 134 - (i / 11) * 30),
      r: 0.9,
    })),
    { n: 11, segs: 4 },
  );
  return draw(b, RACK_CANVAS, { shadowBias: 3 }).rgba;
}

export const BARREL_CANVAS: Canvas = { w: 110, h: 130, ox: 55, oy: 90 };

/** A plain stave barrel with iron hoops, a lid, a dipper hanging on its side. */
export function renderBarnBarrel(): Rgba {
  const b = new SceneBuilder();
  const m = barnMaterials(b);
  lathe(b.mesh(m.plank), {
    c: v3(0, 0, 0),
    segs: 18,
    smooth: true,
    profile: [
      [17, 0],
      [21, 6],
      [24, 22],
      [25, 34],
      [24, 46],
      [21, 58],
      [17, 62],
      [0, 62],
    ],
  });
  for (const z of [6, 22, 42, 56])
    lathe(b.mesh(m.iron), {
      c: v3(0, 0, z - 1.5),
      segs: 18,
      profile: [
        [z === 22 || z === 42 ? 25.4 : 22, 0],
        [z === 22 || z === 42 ? 25.4 : 22, 3],
        [0, 3],
      ],
    });
  lathe(b.mesh(m.beam), {
    c: v3(0, 0, 62),
    segs: 18,
    profile: [
      [16, 0],
      [16, 1.6],
      [0, 1.6],
    ],
  });
  return draw(b, BARREL_CANVAS, { shadowBias: 3 }).rgba;
}
