import { hex, type RGB, ramp } from '../core/color';
import type { Rgba } from '../core/image';
import type { SampleInfo } from '../core/render';
import { hash2, mulberry32 } from '../core/rng';
import { TAU, type V3, v3 } from '../core/vec';
import { extrude, lathe, SIDE } from './arch';
import { coinHeap, gem } from './gems';
import { underGlow } from './glow';
import { Painter } from './paint';
import { GEM, INTERIOR, PAL, type Ramp } from './palette';
import { blob, box, tube } from './prims';
import { renderScene, SceneBuilder } from './scene';

/**
 * The treasure house's own things: chests, heaps of coin, trays of gems, a diamond on a cushion,
 * banknotes, and the furniture around them. Everything is drawn with the same camera and light as
 * the rest of the world.
 */

export interface Canvas {
  w: number;
  h: number;
  ox: number;
  oy: number;
}

export function render(
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
    ...extra,
  });
  return { rgba: r.rgba, at: r.at };
}

export const r6 = (base: string, shadowHue: number, lightHue: number): Ramp =>
  ramp(hex(base), { steps: 6, shadowHue, lightHue, lean: 1.0, lightness: [-0.32, -0.21, -0.1, 0, 0.09, 0.17] });
export const MAHOGANY = r6('#8c4a3c', 320, 55);
const VELVET = r6('#7a3fb0', 285, 330);
const BURLAP = r6('#c9a470', 330, 85);
const BRASS = r6('#d9a93a', 25, 95);
const TEAL = r6('#2fa6a0', 240, 130);
const ROSE = r6('#e0608f', 325, 50);
const PLUM = r6('#8f5cd0', 268, 330);
const NOTE = {
  mint: r6('#9fe3b8', 190, 110),
  lilac: r6('#c7aaf5', 270, 330),
  peach: r6('#ffc79a', 340, 70),
  dollar: r6('#7cc487', 175, 110),
} as const;
/** Clear stone: blue-violet shadows to white, so every facet reads as its own plane. */
export const DIAMOND: Ramp = [
  [96, 118, 196],
  [142, 170, 228],
  [186, 212, 248],
  [222, 238, 255],
  [255, 255, 255],
];
export const GOLD_BANDS = [0.2, 0.4, 0.6, 0.8, 0.92] as const;
export const noise =
  (seed: number) =>
  (s: SampleInfo): number =>
    (hash2(s.px, s.py, seed) - 0.5) * 0.05;

/** Draws a small four-point glint, the one-pixel-wide kind that makes a gem look cut. */
export function glint(img: Rgba, x: number, y: number, size: number): void {
  const p = new Painter(img);
  const w: readonly [number, number, number] = [255, 255, 255];
  p.px(x, y, w);
  for (let k = 1; k <= size; k++)
    for (const [dx, dy] of [
      [k, 0],
      [-k, 0],
      [0, k],
      [0, -k],
    ] as const)
      p.over(x + dx, y + dy, w, k === size ? 0.45 : 0.9);
}

export const CHEST_CANVAS: Canvas = { w: 240, h: 230, ox: 120, oy: 170 };

/** The treasure chest. `open` runs from 0, shut, to 1, the lid thrown back. */
export function chest(open: number, spill = open > 0.5): SceneBuilder {
  const b = new SceneBuilder();
  const W = 136,
    D = 84,
    H = 48,
    LID = 34;
  const wood = b.solid(
    'wood',
    b.variant('wood', MAHOGANY),
    (s) =>
      (Math.floor(s.rest[2] / 12) !== Math.floor((s.rest[2] - 1.3) / 12) ? -0.1 : 0) +
      Math.sin(s.rest[0] * 0.2 + Math.floor(s.rest[2] / 12) * 2.3) * 0.025 +
      noise(3)(s),
  );
  const gold = b.solid('gold', b.variant('gold', GEM.gold, { bands: GOLD_BANDS }), noise(5));
  const velvet = b.solid('velvet', b.variant('velvet', VELVET), noise(9));
  const dark = b.solid('dark', b.variant('dark', INTERIOR.night, { flat: 0, noLines: true }));
  box(b.mesh(wood), v3(0, 0, H / 2), v3(W, D, H));
  const trim = b.mesh(gold);
  box(trim, v3(0, 0, 3), v3(W + 3, D + 3, 6));
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) box(trim, v3(sx * (W / 2 - 3), sy * (D / 2 - 3), H / 2), v3(7, 7, H + 2));
  for (const x of [-40, 40]) box(trim, v3(x, -D / 2 - 1, H / 2), v3(11, 3, H + 1));

  // The lid is a half-ellipse in section, hinged along the back edge. Points turn about the hinge
  // by `theta`.
  const theta = open * (Math.PI * 0.6);
  const turn = (y: number, z: number): [number, number] => {
    const dy = y - D / 2;
    return [D / 2 + dy * Math.cos(theta) + z * Math.sin(theta), -dy * Math.sin(theta) + z * Math.cos(theta)];
  };
  const arc = (k: number, n = 18): [number, number][] =>
    Array.from({ length: n + 1 }, (_, i) =>
      turn(-Math.cos((i / n) * Math.PI) * (D / 2) * k, Math.sin((i / n) * Math.PI) * LID * k),
    );
  const lidPoly: [number, number][] = [...arc(1), turn(-D / 2, 0)].filter(
    (p, i, a) => i === 0 || p[0] !== a[i - 1]![0] || p[1] !== a[i - 1]![1],
  );
  extrude(b.mesh(wood), lidPoly, SIDE(0, 0, H), -W / 2, W / 2, { smooth: 40 });
  for (const x of [-40, 40]) {
    const outer = arc(1.04),
      inner = arc(0.96).reverse();
    extrude(b.mesh(gold), [...outer, ...inner], SIDE(0, 0, H), x - 5.5, x + 5.5, { smooth: 40 });
  }
  // The lining of the lid shows once it is open.
  if (open > 0.15) {
    const a = turn(-D / 2 + 3, 0.4),
      c = turn(D / 2 - 3, 0.4),
      a2 = turn(-D / 2 + 3, -1.4),
      c2 = turn(D / 2 - 3, -1.4);
    extrude(b.mesh(velvet), [a, c, c2, a2], SIDE(0, 0, H), -W / 2 + 6, W / 2 - 6);
  }
  box(trim, v3(0, -D / 2 - 1.6, H - 7), v3(17, 3, 20));
  box(b.mesh(dark), v3(0, -D / 2 - 3.4, H - 9), v3(4, 1.5, 7));

  if (open > 0.15) {
    box(b.mesh(velvet), v3(0, 0, H + 0.5), v3(W - 14, D - 14, 1.2));
    const rng = mulberry32(41);
    const coins = b.mesh(gold);
    coinHeap(coins, v3(-30, 4, H), 38, spill ? 20 : 8, spill ? 90 : 36, rng, 7);
    coinHeap(coins, v3(32, -2, H), 36, spill ? 17 : 7, spill ? 76 : 30, rng, 7);
    if (spill) {
      const colors = [GEM.ruby, GEM.sapphire, GEM.emerald, GEM.amethyst, GEM.topaz];
      colors.forEach((ramp, i) => {
        const m = b.mesh(b.solid(`g${i}`, b.variant(`g${i}`, ramp, { bands: [0.15, 0.4, 0.65, 0.85] })));
        const a = (i / colors.length) * TAU + 0.4;
        gem(m, v3(Math.cos(a) * 34, Math.sin(a) * 16 - 2, H + 20 + (i % 2) * 3), 9, { yaw: i });
      });
    }
  }
  return b;
}

export function renderChest(open: number): Rgba {
  const c = CHEST_CANVAS;
  const r = render(chest(open), c, { aoRadius: 8 });
  let img = r.rgba;
  if (open > 0.5) {
    const [gx, gy] = r.at(v3(0, 0, 66));
    img = underGlow(img, gx, gy - 8, 118, 74, [255, 226, 120], 0.34);
    glint(img, ...r.at(v3(-6, 2, 74)), 4);
    glint(img, ...r.at(v3(40, -2, 52)), 3);
    glint(img, ...r.at(v3(-48, 6, 56)), 3);
  }
  return img;
}

export const PILE_CANVAS: Canvas = { w: 190, h: 150, ox: 95, oy: 112 };

export function goldPile(variant: 0 | 1 | 2): SceneBuilder {
  const b = new SceneBuilder();
  const rng = mulberry32(100 + variant);
  const gold = b.solid('gold', b.variant('gold', GEM.gold, { bands: GOLD_BANDS }), noise(6));
  const coins = b.mesh(gold);
  if (variant === 0) {
    coinHeap(coins, v3(0, 0, 0), 58, 52, 300, rng, 8.4);
    for (const [x, y, z, yaw] of [
      [58, -30, 0, 0.3],
      [70, -14, 0, 0.5],
      [64, -22, 9.4, 0.4],
    ] as const)
      box(b.mesh(gold), v3(x, y, z + 5), v3(29, 14, 9), yaw);
  } else if (variant === 1) {
    // A pyramid of bars with coins scattered at its foot.
    const rows = [5, 4, 3, 2, 1];
    rows.forEach((n, r) => {
      for (let i = 0; i < n; i++)
        box(b.mesh(gold), v3((i - (n - 1) / 2) * 31, 0, 5.2 + r * 10.2), v3(29.4, 15, 9.4), 0);
    });
    coinHeap(coins, v3(-48, -26, 0), 36, 11, 50, rng, 7);
    coinHeap(coins, v3(54, -22, 0), 30, 9, 36, rng, 7);
  } else {
    // Two sacks with their mouths open and coin spilling out.
    const sack = b.solid('sack', b.variant('sack', BURLAP), (s) => (hash2(s.px >> 1, s.py >> 1, 4) - 0.5) * 0.12);
    const rope = b.solid('rope', b.variant('rope', BRASS));
    for (const [x, y, s, tilt] of [
      [-34, 6, 1, 0.12],
      [30, -4, 0.86, -0.16],
    ] as const) {
      const m = b.mesh(sack);
      blob(m, v3(x, y, 22 * s), v3(30 * s, 28 * s, 24 * s), tilt, { rings: 8, segs: 12 });
      blob(m, v3(x, y, 44 * s), v3(15 * s, 14 * s, 11 * s), tilt, { rings: 6, segs: 10 });
      lathe(b.mesh(rope), {
        c: v3(x, y, 34 * s),
        segs: 14,
        profile: [
          [14 * s, 0],
          [14 * s, 3],
          [11 * s, 4],
          [11 * s, 0],
        ],
      });
      coinHeap(coins, v3(x, y, 46 * s), 17 * s, 9 * s, 40, rng, 6.5);
    }
    coinHeap(coins, v3(0, -34, 0), 54, 10, 100, rng, 7);
  }
  return b;
}

export function renderGoldPile(variant: 0 | 1 | 2): Rgba {
  const r = render(goldPile(variant), PILE_CANVAS, { aoRadius: 9 });
  glint(r.rgba, ...r.at(v3(-8, 4, variant === 0 ? 46 : 52)), 4);
  glint(r.rgba, ...r.at(v3(26, -10, variant === 0 ? 34 : 30)), 3);
  glint(r.rgba, ...r.at(v3(-40, -20, 14)), 3);
  return r.rgba;
}

/** The canvas of every gem's table. The tables themselves are drawn in gem-tables.ts. */
export const TABLE_CANVAS: Canvas = { w: 150, h: 170, ox: 75, oy: 130 };
const GEM_COLORS = [GEM.ruby, GEM.sapphire, GEM.emerald, GEM.amethyst, GEM.topaz] as const;
export const gemBands = [0.15, 0.4, 0.65, 0.85] as const;

export const DIAMOND_CANVAS: Canvas = { w: 160, h: 190, ox: 80, oy: 150 };

export function diamondStand(): SceneBuilder {
  const b = new SceneBuilder();
  const marble = b.solid('marble', b.variant('marble', PAL.marble), noise(2));
  const gold = b.solid('gold', b.variant('gold', GEM.gold, { bands: GOLD_BANDS }), noise(7));
  const velvet = b.solid('velvet', b.variant('velvet', ROSE), noise(4));
  lathe(b.mesh(marble), {
    c: v3(0, 0, 0),
    segs: 24,
    smooth: true,
    profile: [
      [40, 0],
      [40, 8],
      [30, 12],
      [22, 18],
      [22, 50],
      [30, 55],
      [42, 60],
      [42, 66],
      [0, 66],
    ],
  });
  lathe(b.mesh(gold), {
    c: v3(0, 0, 66),
    segs: 24,
    profile: [
      [44, 0],
      [44, 5],
      [41, 5],
      [41, 1.5],
      [0, 1.5],
    ],
  });
  lathe(b.mesh(velvet), {
    c: v3(0, 0, 67),
    segs: 22,
    smooth: true,
    profile: [
      [37, 0],
      [35, 6],
      [24, 10],
      [0, 11],
    ],
  });
  const clear = (i: number) =>
    b.mesh(
      b.solid(
        `d${i}`,
        b.variant(`d${i}`, DIAMOND, {
          bands: [0.12, 0.3, 0.55, 0.82],
          outline: [64, 84, 150],
          outlineLit: [96, 126, 196],
        }),
      ),
    );
  gem(clear(0), v3(0, 2, 84), 18, { sides: 8, table: 0.62, crown: 0.42, pavilion: 0.78, yaw: 0.2 });
  gem(clear(1), v3(-27, 10, 79), 11.5, { yaw: 0.6, sides: 6 });
  gem(clear(2), v3(27, 10, 79), 12, { yaw: 0.1 });
  gem(clear(3), v3(-17, -17, 77), 10, { yaw: 0.4, sides: 6 });
  gem(clear(4), v3(18, -18, 77), 10.5, { yaw: 0.9 });
  return b;
}

export function renderDiamondStand(): Rgba {
  const r = render(diamondStand(), DIAMOND_CANVAS, { aoRadius: 8 });
  for (const [p, s] of [
    [v3(0, 2, 96), 5],
    [v3(-27, 10, 88), 3],
    [v3(27, 10, 88), 3],
    [v3(18, -18, 85), 3],
  ] as const)
    glint(r.rgba, ...r.at(p), s);
  return r.rgba;
}

export const NOTES_CANVAS: Canvas = { w: 230, h: 170, ox: 115, oy: 128 };

/**
 * A small writing desk with three bound bundles of paper, and a few loose notes fanned out. The
 * desk for "money" holds the kingdom's notes in three colours. The desk for "cash" holds green
 * notes only, and a heap of gold coin beside them.
 */
export function banknoteDesk(kind: 'money' | 'cash' = 'money'): SceneBuilder {
  const b = new SceneBuilder();
  const wood = b.solid('wood', b.variant('wood', MAHOGANY), noise(3));
  const gold = b.solid('gold', b.variant('gold', GEM.gold, { bands: GOLD_BANDS }), noise(7));
  const top = b.mesh(wood);
  box(top, v3(0, 0, 38), v3(150, 76, 7));
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) box(b.mesh(wood), v3(sx * 66, sy * 30, 17), v3(9, 9, 34));
  box(b.mesh(gold), v3(0, -38.6, 38), v3(152, 1.8, 8));
  // A note's face: a pale ground, an inked border, an inner frame and a gold seal in the middle.
  const bundle = (
    name: keyof typeof NOTE,
    cx: number,
    cy: number,
    layers: number,
    yaw: number,
    w = 52,
    d = 26,
  ): void => {
    const paper = b.variant(`${name}-p`, NOTE[name]);
    const ink = b.variant(`${name}-i`, ramp(NOTE[name][1]!, { steps: 4 }));
    const seal = b.variant(`${name}-s`, GEM.gold, { bands: GOLD_BANDS });
    const cos = Math.cos(-yaw),
      sin = Math.sin(-yaw);
    const m = b.mesh(
      b.material({
        name: `note-${name}`,
        shade: (s) => {
          if (s.n[2] < 0.7) return Math.floor(s.rest[2] / 1.6) % 2 === 0 ? paper : ink;
          const dx = s.rest[0] - cx,
            dy = s.rest[1] - cy;
          const u = dx * cos - dy * sin,
            v = dx * sin + dy * cos;
          if (Math.abs(u) > w / 2 - 2 || Math.abs(v) > d / 2 - 2) return ink;
          if (Math.abs(u) > w / 2 - 5 || Math.abs(v) > d / 2 - 5) return paper;
          if (Math.hypot(u, v * 1.7) < 6.5) return seal;
          if (Math.abs(v) < 1.2 && Math.abs(u) > 12) return ink;
          return paper;
        },
      }),
    );
    box(m, v3(cx, cy, 41.5 + (layers * 1.6) / 2), v3(w, d, layers * 1.6 + 0.2), yaw);
    box(b.mesh(gold), v3(cx, cy, 41.5 + (layers * 1.6) / 2 + 0.2), v3(w * 0.2, d + 1.2, layers * 1.6 + 1.2), yaw);
  };
  const colours = kind === 'money' ? (['mint', 'lilac', 'peach'] as const) : (['dollar', 'dollar', 'dollar'] as const);
  bundle(colours[0], -36, -6, 9, 0.06, 62, 32);
  bundle(colours[1], 32, 8, 7, -0.1, kind === 'money' ? 62 : 44, 32);
  bundle(colours[2], -2, 20, 6, 0.22, 54, 28);
  if (kind === 'cash') coinHeap(b.mesh(gold), v3(60, -14, 41.5), 12, 8, 26, mulberry32(11), 5.6);
  // A few loose notes lying over the front edge.
  const loose = (cx: number, cy: number, yaw: number, name: keyof typeof NOTE): void => {
    const paper = b.variant(`l-${name}-${cx}`, NOTE[name]);
    box(b.mesh(b.solid(`loose-${name}-${cx}`, paper, noise(2))), v3(cx, cy, 41.9), v3(36, 17, 0.8), yaw);
  };
  loose(40, -26, 0.5, colours[0]);
  loose(6, -28, -0.2, colours[2]);
  return b;
}

export function renderBanknoteDesk(kind: 'money' | 'cash' = 'money'): Rgba {
  const r = render(banknoteDesk(kind), NOTES_CANVAS, { aoRadius: 7 });
  glint(r.rgba, ...r.at(v3(-4, 20, 58)), 3);
  glint(r.rgba, ...r.at(v3(30, 8, 62)), 3);
  return r.rgba;
}

export const FLOAT_FRAMES = 8;
export const FLOAT_CANVAS: Canvas = { w: 72, h: 80, ox: 36, oy: 46 };

/**
 * One of eight turns of a cut gem, for the stone that rises from its tray and spins when tapped.
 */
export function renderFloatGem(
  color: 'ruby' | 'sapphire' | 'emerald' | 'amethyst' | 'topaz' | 'diamond',
  frame: number,
): Rgba {
  const b = new SceneBuilder();
  const ramp = GEM[color];
  const bands = color === 'diamond' ? [0.12, 0.3, 0.55, 0.82] : gemBands;
  const m = b.mesh(
    b.solid(
      'gem',
      b.variant('gem', color === 'diamond' ? DIAMOND : ramp, {
        bands,
        ...(color === 'diamond' ? { outline: [64, 84, 150] as RGB, outlineLit: [96, 126, 196] as RGB } : {}),
      }),
    ),
  );
  gem(m, v3(0, 0, 22), 22, {
    sides: 8,
    yaw: (frame / FLOAT_FRAMES) * (TAU / 8),
    table: 0.58,
    crown: 0.4,
    pavilion: 0.85,
  });
  const r = render(b, FLOAT_CANVAS, { aoRadius: 6, ss: 4 });
  glint(r.rgba, ...r.at(v3(-6 + Math.cos(frame) * 3, 0, 40)), 4);
  return r.rgba;
}

export const URN_CANVAS: Canvas = { w: 140, h: 190, ox: 70, oy: 150 };

/** A tall glazed urn with gold bands and handles. */
export function urn(glaze: Ramp, seed: number): SceneBuilder {
  const b = new SceneBuilder();
  const g = b.solid('glaze', b.variant('glaze', glaze), (s) => (hash2(s.px, s.py, seed) - 0.5) * 0.04);
  const gold = b.solid('gold', b.variant('gold', GEM.gold, { bands: GOLD_BANDS }), noise(7));
  lathe(b.mesh(g), {
    c: v3(0, 0, 0),
    segs: 26,
    smooth: true,
    profile: [
      [20, 0],
      [24, 3],
      [30, 14],
      [36, 34],
      [34, 54],
      [24, 72],
      [16, 84],
      [18, 92],
      [26, 100],
      [26, 104],
      [20, 104],
    ],
  });
  const bands = b.mesh(gold);
  lathe(bands, {
    c: v3(0, 0, 8),
    segs: 26,
    profile: [
      [26.5, 0],
      [26.5, 3],
      [24, 3.5],
      [24, 0],
    ],
  });
  lathe(bands, {
    c: v3(0, 0, 56),
    segs: 26,
    smooth: true,
    profile: [
      [34.2, 0],
      [34.6, 3],
      [34.2, 6],
      [32.6, 6],
      [32.6, 0],
    ],
  });
  lathe(bands, {
    c: v3(0, 0, 100),
    segs: 26,
    profile: [
      [27.5, 0],
      [27.5, 4],
      [25, 4],
      [25, 0],
    ],
  });
  for (const s of [-1, 1])
    tube(
      b.mesh(gold),
      [
        { p: v3(s * 16, 0, 90), r: 2.4 },
        { p: v3(s * 30, 0, 94), r: 2.4 },
        { p: v3(s * 38, 0, 80), r: 2.4 },
        { p: v3(s * 33, 0, 64), r: 2.6 },
      ],
      { segs: 8 },
    );
  return b;
}
export const renderUrn = (glaze: Ramp, seed: number): Rgba =>
  render(urn(glaze, seed), URN_CANVAS, { aoRadius: 8 }).rgba;
export const URN_GLAZES = { teal: TEAL, rose: ROSE, plum: PLUM } as const;

export const LAMP_CANVAS: Canvas = { w: 120, h: 270, ox: 60, oy: 232 };

/** A tall brass floor lamp with a glowing glass globe. */
export function lamp(): { b: SceneBuilder; glowAt: V3 } {
  const b = new SceneBuilder();
  const brass = b.solid('brass', b.variant('brass', BRASS, { bands: GOLD_BANDS }), noise(11));
  const glass = b.solid('glow', b.variant('glow', ramp(hex('#fff0a8'), { steps: 5 }), { emissive: 3 }));
  lathe(b.mesh(brass), {
    c: v3(0, 0, 0),
    segs: 18,
    smooth: true,
    profile: [
      [24, 0],
      [24, 5],
      [14, 10],
      [6, 16],
      [4, 30],
      [5, 120],
      [4, 150],
      [16, 156],
      [24, 164],
      [20, 166],
      [0, 166],
    ],
  });
  blob(b.mesh(glass), v3(0, 0, 186), v3(20, 20, 24), 0, { rings: 9, segs: 14 });
  lathe(b.mesh(brass), {
    c: v3(0, 0, 206),
    segs: 14,
    profile: [
      [10, 0],
      [8, 5],
      [3, 8],
      [0, 8],
    ],
  });
  return { b, glowAt: v3(0, 0, 186) };
}
export function renderLamp(): Rgba {
  const { b, glowAt } = lamp();
  const r = render(b, LAMP_CANVAS, { aoRadius: 8 });
  const [gx, gy] = r.at(glowAt);
  return underGlow(r.rgba, gx, gy, 62, 56, [255, 226, 130], 0.4);
}

export const BARREL_CANVAS: Canvas = { w: 150, h: 170, ox: 75, oy: 132 };

/** A barrel heaped with coin. */
export function barrel(): SceneBuilder {
  const b = new SceneBuilder();
  const wood = b.solid(
    'wood',
    b.variant('wood', MAHOGANY),
    (s) => (Math.floor((Math.atan2(s.rest[1], s.rest[0]) + Math.PI) * 9) % 2 === 0 ? 0.03 : -0.03) + noise(4)(s),
  );
  const gold = b.solid('gold', b.variant('gold', GEM.gold, { bands: GOLD_BANDS }), noise(7));
  const iron = b.solid('iron', b.variant('iron', BRASS, { bands: GOLD_BANDS }));
  lathe(b.mesh(wood), {
    c: v3(0, 0, 0),
    segs: 20,
    smooth: true,
    profile: [
      [26, 0],
      [30, 6],
      [34, 22],
      [35, 34],
      [34, 46],
      [30, 62],
      [26, 68],
      [22, 68],
      [0, 68],
    ],
  });
  for (const z of [7, 22, 50, 63])
    lathe(b.mesh(iron), {
      c: v3(0, 0, z),
      segs: 20,
      profile: [
        [35.6 - Math.abs(z - 35) * 0.075, 0],
        [36 - Math.abs(z - 35) * 0.075, 3],
        [32, 3],
        [32, 0],
      ],
    });
  coinHeap(b.mesh(gold), v3(0, 0, 66), 24, 18, 80, mulberry32(9), 7.5);
  return b;
}
export const renderBarrel = (): Rgba => {
  const r = render(barrel(), BARREL_CANVAS, { aoRadius: 8 });
  glint(r.rgba, ...r.at(v3(-4, 0, 88)), 4);
  return r.rgba;
};

export const CRATE_CANVAS: Canvas = { w: 170, h: 160, ox: 85, oy: 120 };

/** An open crate packed with jewels and strings of pearls. */
export function crate(): SceneBuilder {
  const b = new SceneBuilder();
  const wood = b.solid(
    'wood',
    b.variant('wood', PAL.wood),
    (s) => (Math.floor(s.rest[2] / 14) !== Math.floor((s.rest[2] - 1.3) / 14) ? -0.1 : 0) + noise(4)(s),
  );
  const velvet = b.solid('velvet', b.variant('velvet', TEAL), noise(9));
  const pearl = b.solid('pearl', b.variant('pearl', PAL.marble, { bands: [0.2, 0.45, 0.7, 0.9] }));
  const W = 92,
    D = 58,
    H = 40;
  for (const [cx, cy, sx, sy] of [
    [0, -D / 2 + 2, W, 4],
    [0, D / 2 - 2, W, 4],
    [-W / 2 + 2, 0, 4, D],
    [W / 2 - 2, 0, 4, D],
  ] as const)
    box(b.mesh(wood), v3(cx, cy, H / 2), v3(sx, sy, H));
  box(b.mesh(wood), v3(0, 0, 3), v3(W - 4, D - 4, 6));
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) box(b.mesh(wood), v3(sx * (W / 2 - 3), sy * (D / 2 - 3), H / 2 + 2), v3(7, 7, H + 4));
  box(b.mesh(velvet), v3(0, 0, H - 6), v3(W - 10, D - 10, 14));
  GEM_COLORS.forEach((color, i) => {
    const m = b.mesh(b.solid(`g${i}`, b.variant(`g${i}`, color, { bands: gemBands })));
    for (let k = 0; k < 3; k++)
      gem(m, v3(-30 + i * 15 + (k % 2) * 4, -14 + k * 14, H + 3 + ((i + k) % 2) * 2), 7.6, { yaw: i * 2 + k });
  });
  const pm = b.mesh(pearl);
  for (let i = 0; i < 16; i++) {
    const t = i / 15;
    blob(
      pm,
      v3(-34 + t * 70, -(D / 2) - 2 - Math.sin(t * Math.PI) * 12, H - 2 - Math.sin(t * Math.PI) * 14),
      v3(3.6, 3.6, 3.6),
      0,
      { rings: 5, segs: 8 },
    );
  }
  return b;
}
export const renderCrate = (): Rgba => {
  const r = render(crate(), CRATE_CANVAS, { aoRadius: 8 });
  glint(r.rgba, ...r.at(v3(-18, -2, 54)), 3);
  glint(r.rgba, ...r.at(v3(24, 6, 52)), 3);
  return r.rgba;
};

export const MAKER_CANVAS: Canvas = { w: 230, h: 340, ox: 115, oy: 266 };

const CLOUD = ramp(hex('#f3eeff'), {
  steps: 5,
  shadowHue: 270,
  lightHue: 60,
  lean: 1,
  lightness: [-0.2, -0.1, -0.03, 0.03, 0.08],
});

/**
 * The thing to tap for the treasure game: a golden bowl on a marble stand, with a soft cloud over
 * it that is letting gems fall into it. It says what it does without a word.
 */
export function rainMaker(): SceneBuilder {
  const b = new SceneBuilder();
  const marble = b.solid('marble', b.variant('marble', PAL.marble), noise(2));
  const gold = b.solid('gold', b.variant('gold', GEM.gold, { bands: GOLD_BANDS }), noise(7));
  const cloud = b.solid(
    'cloud',
    b.variant('cloud', CLOUD, { bands: [0.2, 0.45, 0.7, 0.9], outline: [150, 130, 200], outlineLit: [190, 176, 230] }),
    noise(12),
  );
  lathe(b.mesh(marble), {
    c: v3(0, 0, 0),
    segs: 26,
    smooth: true,
    profile: [
      [46, 0],
      [46, 8],
      [34, 14],
      [26, 22],
      [26, 52],
      [34, 58],
      [44, 62],
      [0, 62],
    ],
  });
  // The bowl: a thick golden lip over a belly that narrows to the stem, open at the top.
  const bowl = b.mesh(gold);
  lathe(bowl, {
    c: v3(0, 0, 62),
    segs: 28,
    smooth: true,
    profile: [
      [12, 0],
      [14, 8],
      [26, 14],
      [48, 30],
      [62, 50],
      [64, 56],
      [60, 58],
      [56, 52],
      [42, 36],
      [22, 24],
      [0, 20],
    ],
  });
  lathe(bowl, {
    c: v3(0, 0, 62),
    segs: 28,
    profile: [
      [34, 0],
      [34, 6],
      [28, 6],
      [28, 0],
    ],
  });
  coinHeap(bowl, v3(0, 0, 92), 40, 12, 70, mulberry32(21), 8);
  const stones = [
    ['ruby', -22, -10, 104, 13, 0.3],
    ['sapphire', 22, -8, 106, 14, 0.7],
    ['emerald', 2, -26, 100, 12, 0.1],
    ['topaz', 6, 8, 112, 13, 0.5],
    ['amethyst', -34, 6, 100, 11, 0.9],
  ] as const;
  for (const [k, x, y, z, r, yaw] of stones)
    gem(b.mesh(b.solid(`s${k}`, b.variant(`s${k}`, GEM[k], { bands: gemBands }))), v3(x, y, z), r, { yaw, sides: 7 });
  // A cloud of overlapping puffs, flat underneath.
  const puffs = [
    [0, 0, 230, 38, 20, 26],
    [-34, 4, 226, 28, 18, 22],
    [34, 2, 226, 30, 18, 22],
    [-16, -6, 242, 26, 18, 24],
    [18, -4, 244, 24, 17, 22],
    [-52, 2, 220, 20, 14, 17],
    [52, 2, 220, 20, 14, 17],
  ] as const;
  for (const [x, y, z, rx, ry, rz] of puffs)
    blob(b.mesh(cloud), v3(x, y, z), v3(rx, ry, rz), 0, { rings: 9, segs: 16 });
  // Gems on their way down.
  const falling = [
    ['diamond', -20, -6, 196, 12, 0.2],
    ['ruby', 16, -10, 170, 11, 0.6],
    ['sapphire', -6, -4, 144, 10, 0.1],
  ] as const;
  for (const [k, x, y, z, r, yaw] of falling) {
    const ramp6 = k === 'diamond' ? DIAMOND : GEM[k];
    gem(
      b.mesh(
        b.solid(
          `f${k}`,
          b.variant(`f${k}`, ramp6, {
            bands: k === 'diamond' ? [0.12, 0.3, 0.55, 0.82] : gemBands,
            ...(k === 'diamond' ? { outline: [64, 84, 150] as RGB, outlineLit: [96, 126, 196] as RGB } : {}),
          }),
        ),
      ),
      v3(x, y, z),
      r,
      { yaw, sides: 7 },
    );
  }
  return b;
}

export function renderRainMaker(): Rgba {
  const r = render(rainMaker(), MAKER_CANVAS, { aoRadius: 8 });
  for (const [p, s] of [
    [v3(-20, -6, 212), 4],
    [v3(16, -10, 184), 4],
    [v3(40, -10, 250), 3],
    [v3(22, -8, 124), 3],
  ] as const)
    glint(r.rgba, ...r.at(p), s);
  return r.rgba;
}
