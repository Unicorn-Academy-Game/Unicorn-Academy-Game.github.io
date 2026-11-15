import { hex, ramp } from '../core/color';
import { createRgba, type Rgba } from '../core/image';
import type { SampleInfo } from '../core/render';
import { hash2, mulberry32 } from '../core/rng';
import { TAU, type V3, v3 } from '../core/vec';
import { archShape, extrude, FRONT, lathe } from './arch';
import { gem } from './gems';
import { underGlow } from './glow';
import { Painter } from './paint';
import { GEM, PAL, type Ramp } from './palette';
import { blob, box, tube } from './prims';
import { renderScene, SceneBuilder } from './scene';
import { MAHOGANY } from './treasure';

/**
 * What furnishes the palace hall: the throne on its dais, a chandelier, the banquet table, a
 * bookcase, a harp, the canopy bed and the crown on its stand. Everything is drawn with the same
 * camera and light as the rest of the world. In a model, x runs east, y runs away from the viewer
 * and z runs up. Each sprite's anchor is where it meets the floor.
 */

export interface Canvas {
  w: number;
  h: number;
  ox: number;
  oy: number;
}

function render(
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

const r6 = (base: string, shadowHue: number, lightHue: number): Ramp =>
  ramp(hex(base), { steps: 6, shadowHue, lightHue, lean: 1.0, lightness: [-0.32, -0.21, -0.1, 0, 0.09, 0.17] });
const VELVET = r6('#b8325a', 325, 40);
const ROYAL = r6('#6d4bc4', 285, 330);
const ROSE = r6('#ee6f9f', 325, 55);
const LILAC = r6('#b79cf0', 270, 330);
const MINT = r6('#7fd6b0', 190, 110);
const CREAM = r6('#f6ecdf', 320, 80);
const DIAMOND: Ramp = [
  [96, 118, 196],
  [142, 170, 228],
  [186, 212, 248],
  [222, 238, 255],
  [255, 255, 255],
];
const FLAME: Ramp = ramp(hex('#fff0a8'), { steps: 5 });
const GOLD_BANDS = [0.2, 0.4, 0.6, 0.8, 0.92] as const;
const noise =
  (seed: number) =>
  (s: SampleInfo): number =>
    (hash2(s.px, s.py, seed) - 0.5) * 0.05;

/** Four-point glints, the one-pixel-wide kind that makes a stone look cut. */
function glint(img: Rgba, x: number, y: number, size: number): void {
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

interface Kit {
  gold: number;
  marble: number;
  wood: number;
  velvet: number;
  royal: number;
  rose: number;
  cream: number;
  flame: number;
}

function kit(b: SceneBuilder): Kit {
  return {
    gold: b.solid('gold', b.variant('gold', GEM.gold, { bands: GOLD_BANDS }), noise(5)),
    marble: b.solid('marble', b.variant('marble', PAL.marble), noise(2)),
    wood: b.solid(
      'wood',
      b.variant('wood', MAHOGANY),
      (s) => Math.sin(s.rest[0] * 0.2 + Math.floor(s.rest[2] / 12) * 2.3) * 0.025 + noise(3)(s),
    ),
    velvet: b.solid('velvet', b.variant('velvet', VELVET), noise(9)),
    royal: b.solid('royal', b.variant('royal', ROYAL), noise(10)),
    rose: b.solid('rose', b.variant('rose', ROSE), noise(12)),
    cream: b.solid('cream', b.variant('cream', CREAM), noise(13)),
    flame: b.solid('flame', b.variant('flame', FLAME, { emissive: 3 })),
  };
}

const jewel = (b: SceneBuilder, ramp_: Ramp, name: string): number =>
  b.solid(name, b.variant(name, ramp_, { bands: [0.15, 0.4, 0.65, 0.85] }));

/**
 * The throne is two sprites so a unicorn can stand on the dais. This one, the dais and the chair,
 * is anchored at the middle of the dais's back edge, so anyone standing on the steps is in front of
 * it. Models are built from the front edge.
 */
export const THRONE_CANVAS: Canvas = { w: 290, h: 290, ox: 145, oy: 200 };
/** How far the dais runs from its front edge to its back, in model units. */
export const DAIS_DEPTH = 150;
const ORIGIN_SHIFT = Math.round(DAIS_DEPTH * Math.sin((27 * Math.PI) / 180));

export function throne(): SceneBuilder {
  const b = new SceneBuilder();
  const k = kit(b);
  // Two low steps of marble with a gold edge.
  box(b.mesh(k.marble), v3(0, 75, 5), v3(260, 150, 10));
  box(b.mesh(k.gold), v3(0, -1, 9.5), v3(262, 3, 3));
  box(b.mesh(k.marble), v3(0, 90, 13), v3(200, 110, 6));
  box(b.mesh(k.gold), v3(0, 34, 15), v3(202, 3, 3));
  // A runner up the steps.
  box(b.mesh(k.royal), v3(0, 20, 10.4), v3(64, 44, 1));
  box(b.mesh(k.royal), v3(0, 60, 16.4), v3(64, 50, 1));
  // The high back: gold arch, then velvet set a little proud of it.
  const Z = 16;
  extrude(b.mesh(k.gold), archShape(116, 172), FRONT(0, 140, Z), 0, 6, { caps: 'front' });
  extrude(b.mesh(k.velvet), archShape(96, 156), FRONT(0, 140, Z + 5), 0, 9, { caps: 'front' });
  const rubies = b.mesh(jewel(b, GEM.ruby, 'ruby'));
  const studs = b.mesh(k.gold);
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI * (i / 8);
    blob(studs, v3(Math.cos(a) * 41, 130, Z + 5 + 156 - 48 + Math.sin(a) * 41), v3(2.6, 2.6, 2.6), 0, {
      rings: 5,
      segs: 8,
    });
  }
  gem(rubies, v3(0, 130, Z + 5 + 108), 11, { yaw: 0.4 });
  const crest = b.mesh(jewel(b, GEM.sapphire, 'sapphire'));
  gem(crest, v3(0, 133, Z + 178), 9, { yaw: 0.2 });
  for (const sx of [-1, 1]) blob(b.mesh(k.gold), v3(sx * 54, 138, Z + 96), v3(8, 8, 8), 0, { rings: 6, segs: 10 });
  // Seat, with arms that end in curls, and short gold legs.
  box(b.mesh(k.gold), v3(0, 108, Z + 8), v3(88, 60, 12));
  box(b.mesh(k.velvet), v3(0, 106, Z + 17), v3(76, 52, 12));
  for (const sx of [-1, 1]) {
    box(b.mesh(k.gold), v3(sx * 47, 108, Z + 24), v3(10, 56, 22));
    blob(b.mesh(k.gold), v3(sx * 47, 82, Z + 32), v3(8, 8, 8), 0, { rings: 6, segs: 10 });
    blob(b.mesh(k.gold), v3(sx * 40, 82, Z + 4), v3(7, 7, 7), 0, { rings: 6, segs: 10 });
  }
  return b;
}

export function renderThrone(): Rgba {
  const r = render(throne(), THRONE_CANVAS, { aoRadius: 8, originY: THRONE_CANVAS.oy + ORIGIN_SHIFT });
  glint(r.rgba, ...r.at(v3(-4, 130, 16 + 5 + 114)), 5);
  glint(r.rgba, ...r.at(v3(3, 133, 16 + 182)), 4);
  return r.rgba;
}

/**
 * The risers at the front of the dais. They are drawn after anyone on the steps, so a unicorn
 * stepping down goes behind them.
 */
export const DAIS_FRONT_CANVAS: Canvas = { w: 280, h: 48, ox: 140, oy: 34 };

export function renderDaisFront(): Rgba {
  const b = new SceneBuilder();
  const k = kit(b);
  box(b.mesh(k.marble), v3(0, 1, 5), v3(260, 2, 10));
  box(b.mesh(k.gold), v3(0, -1, 9.5), v3(262, 3, 3));
  box(b.mesh(k.marble), v3(0, 35.5, 13), v3(200, 2, 6));
  box(b.mesh(k.gold), v3(0, 34, 15), v3(202, 3, 3));
  return render(b, DAIS_FRONT_CANVAS, { aoRadius: 0 }).rgba;
}

/**
 * Anchored at its lowest crystal, 128 units above the floor, so the map holds the point it hangs
 * from and the herd standing under it is nearer the viewer than it. It hangs from z 300 down to
 * 128.
 */
export const CHANDELIER_CANVAS: Canvas = { w: 230, h: 300, ox: 115, oy: 176 };
/** How far the anchor hangs above the floor beneath, in screen pixels. */
export const CHANDELIER_HANG = Math.round(128 * Math.cos((27 * Math.PI) / 180));
const CHANDELIER_FLOOR_ROW = 290;

function ring(b: SceneBuilder, mesh: ReturnType<SceneBuilder['mesh']>, z: number, radius: number): void {
  const pts = Array.from({ length: 25 }, (_, i) => ({
    p: v3(Math.cos((i / 24) * TAU) * radius, Math.sin((i / 24) * TAU) * radius, z),
    r: 3,
  }));
  tube(mesh, pts, { segs: 8, n: 48, capEnd: false });
  void b;
}

export function chandelier(): { b: SceneBuilder; flames: V3[] } {
  const b = new SceneBuilder();
  const k = kit(b);
  const gold = b.mesh(k.gold);
  const crystal = b.mesh(jewel(b, DIAMOND, 'crystal'));
  const flames: V3[] = [];
  const top = 296;
  // The ceiling cap and the chain.
  lathe(b.mesh(k.gold), {
    c: v3(0, 0, top - 4),
    segs: 14,
    profile: [
      [14, 0],
      [14, 4],
      [6, 8],
      [0, 8],
    ],
  });
  tube(
    gold,
    [
      { p: v3(0, 0, top - 4), r: 2.6 },
      { p: v3(0, 0, 250), r: 2.6 },
    ],
    { segs: 8 },
  );
  for (const z of [276, 262, 250]) blob(gold, v3(0, 0, z), v3(5, 5, 6), 0, { rings: 6, segs: 10 });
  // The trunk, swelling at three beads, and a finial below.
  tube(
    gold,
    [
      { p: v3(0, 0, 250), r: 4 },
      { p: v3(0, 0, 182), r: 4 },
    ],
    { segs: 10 },
  );
  for (const [z, r] of [
    [236, 9],
    [208, 11],
    [186, 8],
  ] as const)
    blob(gold, v3(0, 0, z), v3(r, r, r * 1.1), 0, { rings: 8, segs: 12 });
  lathe(gold, {
    c: v3(0, 0, 150),
    segs: 10,
    smooth: true,
    profile: [
      [0, 0],
      [5, 6],
      [3, 18],
      [4, 30],
    ],
  });
  // Two tiers of arms, each ending in a ring with candles and drops of crystal.
  const tiers: { z: number; r: number; arms: number; drop: number }[] = [
    { z: 236, r: 38, arms: 6, drop: 10 },
    { z: 196, r: 74, arms: 8, drop: 14 },
  ];
  for (const t of tiers) {
    ring(b, gold, t.z - 8, t.r);
    for (let i = 0; i < t.arms; i++) {
      const a = (i / t.arms) * TAU + 0.2;
      const cx = Math.cos(a),
        cy = Math.sin(a);
      tube(
        gold,
        [
          { p: v3(0, 0, t.z - 4), r: 2.4 },
          { p: v3(cx * t.r * 0.5, cy * t.r * 0.5, t.z + 8), r: 2.4 },
          { p: v3(cx * t.r, cy * t.r, t.z - 8), r: 2.6 },
        ],
        { segs: 8 },
      );
      const base = v3(cx * t.r, cy * t.r, t.z - 8);
      lathe(gold, {
        c: base,
        segs: 10,
        profile: [
          [0, 0],
          [6, 0],
          [6, 2],
          [3, 4],
          [3, 6],
          [0, 6],
        ],
      });
      lathe(b.mesh(k.cream), {
        c: v3(base[0], base[1], base[2] + 6),
        segs: 10,
        profile: [
          [0, 0],
          [3.4, 0],
          [3.4, 15],
          [0, 15],
        ],
      });
      blob(b.mesh(k.flame), v3(base[0], base[1], base[2] + 23), v3(3.2, 3.2, 5.5), 0, { rings: 6, segs: 8 });
      flames.push(v3(base[0], base[1], base[2] + 23));
      // A drop of crystal hangs between each pair of arms, and one from each arm's ring.
      gem(crystal, v3(cx * t.r, cy * t.r, t.z - 20), 4.6, { yaw: a, stretch: [0.8, 0.8], pavilion: 1.6 });
      const a2 = a + Math.PI / t.arms;
      gem(crystal, v3(Math.cos(a2) * t.r, Math.sin(a2) * t.r, t.z - 14 - t.drop * 0.3), 3.6, {
        yaw: a2,
        stretch: [0.8, 0.8],
        pavilion: 1.5,
      });
    }
  }
  gem(crystal, v3(0, 0, 138), 7, { pavilion: 1.5, stretch: [0.8, 0.8] });
  return { b, flames };
}

export function renderChandelier(): Rgba {
  const { b, flames } = chandelier();
  const r = render(b, CHANDELIER_CANVAS, { aoRadius: 6, originY: CHANDELIER_FLOOR_ROW });
  let img = r.rgba;
  for (const f of flames) {
    const [gx, gy] = r.at(f);
    img = underGlow(img, gx, gy, 16, 14, [255, 226, 130], 0.22);
  }
  for (const f of flames.filter((_, i) => i % 3 === 0)) glint(img, ...r.at([f[0], f[1], f[2] - 18]), 3);
  return img;
}

/**
 * The soft shadow a chandelier throws on the floor beneath it, which is what shows how high it
 * hangs.
 */
export const SHADOW_POOL_CANVAS: Canvas = { w: 240, h: 90, ox: 120, oy: 45 };

export function renderShadowPool(): Rgba {
  const c = SHADOW_POOL_CANVAS;
  const img = createRgba(c.w, c.h);
  const p = new Painter(img);
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      const d = Math.hypot((x + 0.5 - c.ox) / (c.w / 2), (y + 0.5 - c.oy) / (c.h / 2));
      if (d >= 1) continue;
      const t = Math.floor((1 - d) * 5) / 5;
      p.over(x, y, [58, 28, 72], t * t * 0.34);
    }
  }
  return img;
}

export const TABLE_CANVAS: Canvas = { w: 400, h: 230, ox: 200, oy: 130 };

export function table(): SceneBuilder {
  const b = new SceneBuilder();
  const k = kit(b);
  const W = 300,
    D = 86,
    H = 40;
  // A white cloth to the floor at the front, with a rose runner down the middle and a gold fringe.
  box(b.mesh(k.cream), v3(0, 0, H / 2), v3(W, D, H));
  box(b.mesh(k.cream), v3(0, 0, H + 1.5), v3(W + 6, D + 6, 3));
  box(b.mesh(k.rose), v3(0, 0, H + 3.4), v3(W - 20, 30, 1.2));
  box(b.mesh(k.gold), v3(0, -D / 2 - 3.2, 6), v3(W + 6, 1.8, 7));
  for (const sx of [-1, 1]) box(b.mesh(k.gold), v3(sx * (W / 2 + 3), 0, 6), v3(1.8, D + 6, 7));
  // Chairs at each end, in gold with rose seats.
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 + 34);
    box(b.mesh(k.rose), v3(x, 0, 24), v3(30, 34, 6));
    box(b.mesh(k.gold), v3(x + sx * 15, 0, 50), v3(4, 34, 52));
    for (const dy of [-13, 13]) for (const dx of [-12, 12]) box(b.mesh(k.gold), v3(x + dx, dy, 10), v3(4, 4, 20));
    blob(b.mesh(k.gold), v3(x + sx * 15, 0, 78), v3(5, 9, 5), 0, { rings: 6, segs: 10 });
  }
  const z0 = H + 4;
  // Dinner plates and goblets down the front, and the same behind.
  const plate = b.mesh(k.marble);
  const gob = b.mesh(k.gold);
  for (const side of [-1, 1]) {
    for (const x of [-110, -66, 66, 110]) {
      lathe(plate, {
        c: v3(x, side * 28, z0),
        segs: 16,
        profile: [
          [0, 0],
          [14, 0],
          [16, 2],
          [14, 2],
          [0, 1.6],
        ],
      });
      lathe(gob, {
        c: v3(x + 16, side * 22, z0),
        segs: 10,
        smooth: true,
        profile: [
          [0, 0],
          [4, 0],
          [1.4, 3],
          [1.4, 9],
          [5, 14],
          [5, 17],
          [0, 17],
        ],
      });
    }
  }
  // In the middle, a tiered cake with strawberries.
  const cake = b.mesh(k.rose);
  const icing = b.mesh(k.cream);
  const strawberry = b.mesh(jewel(b, GEM.ruby, 'strawberry'));
  lathe(b.mesh(k.gold), {
    c: v3(0, 0, z0),
    segs: 18,
    profile: [
      [0, 0],
      [30, 0],
      [30, 2],
      [0, 2],
    ],
  });
  lathe(cake, {
    c: v3(0, 0, z0 + 2),
    segs: 18,
    smooth: true,
    profile: [
      [0, 0],
      [25, 0],
      [25, 14],
      [0, 14],
    ],
  });
  lathe(icing, {
    c: v3(0, 0, z0 + 16),
    segs: 18,
    smooth: true,
    profile: [
      [0, 0],
      [26, 0],
      [26, 3],
      [0, 3],
    ],
  });
  lathe(cake, {
    c: v3(0, 0, z0 + 19),
    segs: 16,
    smooth: true,
    profile: [
      [0, 0],
      [17, 0],
      [17, 12],
      [0, 12],
    ],
  });
  lathe(icing, {
    c: v3(0, 0, z0 + 31),
    segs: 16,
    smooth: true,
    profile: [
      [0, 0],
      [18, 0],
      [18, 3],
      [0, 3],
    ],
  });
  for (let i = 0; i < 9; i++)
    blob(strawberry, v3(Math.cos((i / 9) * TAU) * 14, Math.sin((i / 9) * TAU) * 14, z0 + 37), v3(4, 4, 4.6), 0, {
      rings: 6,
      segs: 8,
    });
  blob(strawberry, v3(0, 0, z0 + 38), v3(5, 5, 6), 0, { rings: 6, segs: 8 });
  // A fruit bowl on the left, and a pair of candlesticks on the right.
  lathe(b.mesh(k.gold), {
    c: v3(-74, 2, z0),
    segs: 16,
    smooth: true,
    profile: [
      [0, 0],
      [10, 0],
      [4, 4],
      [4, 9],
      [20, 16],
      [22, 16],
      [18, 8],
      [0, 8],
    ],
  });
  const fruit: [number, number, number, Ramp][] = [
    [-82, 0, 22, GEM.ruby],
    [-68, -4, 22, GEM.topaz],
    [-72, 8, 23, GEM.emerald],
    [-62, 6, 21, GEM.amethyst],
    [-78, -8, 24, GEM.ruby],
  ];
  fruit.forEach(([x, y, z, c], i) => {
    blob(b.mesh(jewel(b, c, `f${i}`)), v3(x, y, z0 + z), v3(7, 7, 7), 0, { rings: 7, segs: 10 });
  });
  for (const x of [58, 88]) {
    lathe(b.mesh(k.gold), {
      c: v3(x, 4, z0),
      segs: 10,
      smooth: true,
      profile: [
        [0, 0],
        [8, 0],
        [4, 4],
        [2.4, 14],
        [2.4, 26],
        [5, 30],
        [0, 30],
      ],
    });
    lathe(b.mesh(k.cream), {
      c: v3(x, 4, z0 + 30),
      segs: 10,
      profile: [
        [0, 0],
        [3, 0],
        [3, 12],
        [0, 12],
      ],
    });
    blob(b.mesh(k.flame), v3(x, 4, z0 + 46), v3(3, 3, 5), 0, { rings: 6, segs: 8 });
  }
  // A plate of cupcakes at the front of the runner.
  for (let i = 0; i < 4; i++) {
    const x = 24 + i * 15 - (i > 1 ? 0 : 0);
    lathe(b.mesh(k.royal), {
      c: v3(x, -24, z0),
      segs: 10,
      profile: [
        [0, 0],
        [5, 0],
        [6.4, 7],
        [0, 7],
      ],
    });
    blob(b.mesh(i % 2 ? k.rose : k.cream), v3(x, -24, z0 + 10), v3(6.4, 6.4, 5.4), 0, { rings: 6, segs: 10 });
  }
  return b;
}

export function renderTable(): Rgba {
  const r = render(table(), TABLE_CANVAS, { aoRadius: 8 });
  glint(r.rgba, ...r.at(v3(-70, -2, 40 + 4 + 24)), 3);
  glint(r.rgba, ...r.at(v3(0, 0, 40 + 4 + 40)), 3);
  return r.rgba;
}

export const BOOKCASE_CANVAS: Canvas = { w: 210, h: 280, ox: 105, oy: 205 };

const BOOK_RAMPS: Ramp[] = [VELVET, ROYAL, MINT, ROSE, LILAC, r6('#e0a93a', 25, 95), r6('#3d8fd0', 250, 150)];

export function bookcase(): SceneBuilder {
  const b = new SceneBuilder();
  const k = kit(b);
  const W = 160,
    D = 36,
    H = 206;
  const wood = b.mesh(k.wood);
  const books = BOOK_RAMPS.map((c, i) => b.solid(`book${i}`, b.variant(`book${i}`, c), noise(20 + i)));
  box(wood, v3(0, D / 2 - 3, H / 2), v3(W, 6, H));
  for (const sx of [-1, 1]) box(b.mesh(k.wood), v3(sx * (W / 2 - 4), 0, H / 2), v3(8, D, H));
  const shelves = [5, 56, 106, 156, H - 5];
  for (const z of shelves) box(b.mesh(k.wood), v3(0, 0, z), v3(W, D, 8));
  // Books standing in rows, of different heights and widths, and a few leaning.
  const rng = mulberry32(31);
  shelves.slice(0, -1).forEach((z, row) => {
    let x = -W / 2 + 12;
    while (x < W / 2 - 14) {
      const w = 5 + Math.floor(rng() * 5);
      const h = 30 + Math.floor(rng() * 16);
      if (x + w > W / 2 - 12) break;
      const c = books[Math.floor(rng() * books.length)]!;
      if (rng() < 0.12 && x < W / 2 - 40) {
        // A short stack lying flat.
        for (let s = 0; s < 3; s++)
          box(b.mesh(books[(row + s) % books.length]!), v3(x + 16, -2, z + 6 + s * 7), v3(30 - s * 2, 22, 6));
        x += 36;
        continue;
      }
      box(b.mesh(c), v3(x + w / 2, -2, z + 4 + h / 2), v3(w, 22, h));
      box(b.mesh(k.gold), v3(x + w / 2, -13.2, z + 4 + h * 0.7), v3(w - 1.4, 0.8, 2));
      x += w + 0.6;
    }
  });
  // A cornice with a gold crest.
  box(b.mesh(k.wood), v3(0, -2, H + 4), v3(W + 12, D + 6, 8));
  box(b.mesh(k.gold), v3(0, -D / 2 - 2.6, H + 5), v3(W + 14, 2, 3));
  blob(b.mesh(k.gold), v3(0, 0, H + 14), v3(10, 6, 9), 0, { rings: 7, segs: 10 });
  gem(b.mesh(jewel(b, GEM.emerald, 'emerald')), v3(0, -6, H + 14), 5.4, {});
  return b;
}
export const renderBookcase = (): Rgba => render(bookcase(), BOOKCASE_CANVAS, { aoRadius: 7 }).rgba;

export const HARP_CANVAS: Canvas = { w: 190, h: 290, ox: 95, oy: 240 };

export function harp(): SceneBuilder {
  const b = new SceneBuilder();
  const k = kit(b);
  const gold = b.mesh(k.gold);
  const wood = b.mesh(k.wood);
  box(b.mesh(k.gold), v3(4, 0, 6), v3(112, 40, 12));
  box(b.mesh(k.rose), v3(4, -20.4, 6), v3(104, 1.4, 6));
  lathe(gold, {
    c: v3(-38, 0, 12),
    segs: 14,
    smooth: true,
    profile: [
      [0, 0],
      [11, 0],
      [8, 6],
      [5, 10],
      [5, 14],
    ],
  });
  // The pillar, the curved neck, and the sound-box leaning back from the foot.
  tube(
    gold,
    [
      { p: v3(-38, 0, 24), r: 5.4 },
      { p: v3(-38, 0, 120), r: 5.4 },
      { p: v3(-38, 0, 200), r: 6 },
    ],
    { segs: 10 },
  );
  const P0 = v3(-38, 0, 200),
    P1 = v3(8, 0, 246),
    P2 = v3(46, 0, 168);
  const bez = (t: number): V3 =>
    [0, 1, 2].map((i) => (1 - t) ** 2 * P0[i]! + 2 * (1 - t) * t * P1[i]! + t * t * P2[i]!) as unknown as V3;
  tube(
    gold,
    Array.from({ length: 12 }, (_, i) => ({ p: bez(i / 11), r: 6.6 - (i / 11) * 1.2 })),
    { segs: 10, n: 40 },
  );
  // The sound-box: a tall wedge, wider at the foot, with a gold edge and a round sound-hole.
  extrude(
    gold,
    [
      [-30, 16],
      [66, 16],
      [58, 172],
      [46, 164],
    ],
    FRONT(0, 0, 0),
    -8,
    8,
    { caps: 'front' },
  );
  extrude(
    wood,
    [
      [-24, 22],
      [60, 22],
      [54, 164],
      [47, 160],
    ],
    FRONT(0, 0, 0),
    -10,
    9,
    { caps: 'front' },
  );
  for (const [x, z] of [
    [40, 52],
    [38, 86],
    [34, 118],
  ] as const)
    blob(b.mesh(k.gold), v3(x, -10.6, z), v3(5, 1.6, 5), 0, { rings: 5, segs: 8 });
  // Rose-coloured tuning pegs along the neck.
  for (let i = 1; i < 10; i++) blob(b.mesh(k.rose), bez(i / 11), v3(2.8, 2.8, 2.8), 0, { rings: 5, segs: 8 });
  const strings = b.solid('string', b.variant('string', CREAM, { noLines: true, bands: [0.5, 0.9] }));
  // Strings run from the neck to the slanting front of the sound-box, long at the pillar and short
  // toward the end.
  const arc = Array.from({ length: 241 }, (_, i) => bez(i / 240));
  for (let i = 0; i < 12; i++) {
    const x = -30 + i * 6.1;
    const top = arc.reduce((best, p) => (Math.abs(p[0] - x) < Math.abs(best[0] - x) ? p : best));
    const bottom = 22 + ((x + 24) / 70) * 142 * 0.9;
    tube(
      b.mesh(strings),
      [
        { p: v3(x, -9.6, bottom), r: 0.9 },
        { p: v3(x, 0, top[2] - 3), r: 0.9 },
      ],
      { segs: 5 },
    );
  }
  gem(b.mesh(jewel(b, GEM.amethyst, 'amethyst')), v3(52, -12, 138), 5.4, {});
  return b;
}

export function renderHarp(): Rgba {
  const r = render(harp(), HARP_CANVAS, { aoRadius: 7 });
  glint(r.rgba, ...r.at(v3(52, -12, 144)), 3);
  return r.rgba;
}

export const BED_CANVAS: Canvas = { w: 270, h: 340, ox: 135, oy: 240 };

export function bed(): SceneBuilder {
  const b = new SceneBuilder();
  const k = kit(b);
  const W = 170,
    D = 196;
  // The frame and a deep mattress.
  box(b.mesh(k.wood), v3(0, 0, 14), v3(W + 8, D + 8, 16));
  box(b.mesh(k.cream), v3(0, 0, 32), v3(W, D, 22));
  // A rose quilt over the lower two thirds, folded back at the top, and two pillows.
  box(b.mesh(k.rose), v3(0, -20, 45), v3(W + 4, 140, 7));
  box(b.mesh(k.royal), v3(0, 48, 44.5), v3(W + 5, 18, 8));
  for (const sx of [-1, 1]) {
    blob(b.mesh(k.cream), v3(sx * 40, 76, 54), v3(34, 20, 12), 0, { rings: 8, segs: 14 });
    blob(b.mesh(k.rose), v3(sx * 40, 76, 62), v3(18, 9, 3), 0, { rings: 5, segs: 10 });
  }
  // Headboard and footboard.
  box(b.mesh(k.wood), v3(0, D / 2 + 2, 62), v3(W + 10, 8, 100));
  box(b.mesh(k.gold), v3(0, D / 2 - 2.6, 112), v3(W + 12, 2, 4));
  box(b.mesh(k.wood), v3(0, -D / 2 - 2, 34), v3(W + 10, 8, 46));
  box(b.mesh(k.gold), v3(0, -D / 2 - 6.2, 56), v3(W + 12, 2, 4));
  // Four tall posts with a gold ball on each, carrying a canopy of rose cloth with a scalloped
  // valance.
  const top = 186;
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) {
      const x = sx * (W / 2 + 4),
        y = sy * (D / 2 + 2);
      lathe(b.mesh(k.gold), {
        c: v3(x, y, 0),
        segs: 12,
        smooth: true,
        profile: [
          [7, 0],
          [7, 10],
          [4.4, 14],
          [4.4, top],
          [7, top],
          [7, top + 4],
          [0, top + 4],
        ],
      });
      blob(b.mesh(k.gold), v3(x, y, top + 10), v3(6.6, 6.6, 6.6), 0, { rings: 7, segs: 12 });
    }
  // The canopy is a gold frame with a swag of rose cloth along the front and long curtains tied
  // back at the head posts.
  const frame = b.mesh(k.gold);
  for (const sy of [-1, 1]) box(frame, v3(0, sy * (D / 2 + 2), top + 1), v3(W + 16, 5, 6));
  for (const sx of [-1, 1]) box(frame, v3(sx * (W / 2 + 4), 0, top + 1), v3(5, D + 9, 6));
  box(frame, v3(0, 0, top), v3(W + 8, 3, 3));
  const front = -D / 2 - 6;
  for (let i = 0; i < 6; i++) {
    const x = -W / 2 - 4 + (i + 0.5) * ((W + 8) / 6);
    blob(b.mesh(i % 2 ? k.royal : k.rose), v3(x, front, top - 12), v3((W + 8) / 12 + 1.5, 3, 16), 0, {
      rings: 6,
      segs: 10,
    });
  }
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 + 6),
      y = D / 2 - 14;
    blob(b.mesh(k.rose), v3(x - sx * 6, y, top - 62), v3(13, 14, 62), 0, { rings: 10, segs: 12 });
    blob(b.mesh(k.royal), v3(x - sx * 12, y - 8, top - 62), v3(7, 8, 50), 0, { rings: 10, segs: 12 });
    blob(b.mesh(k.gold), v3(x - sx * 6, y - 12, top - 70), v3(7, 4, 4), 0, { rings: 5, segs: 8 });
  }
  return b;
}
export const renderBed = (): Rgba => render(bed(), BED_CANVAS, { aoRadius: 8 }).rgba;

export const CROWN_CANVAS: Canvas = { w: 160, h: 240, ox: 80, oy: 190 };

/**
 * The crown: a band, five points each topped by a gem, and a dome of arches, standing on height `z`
 * with every size scaled by `S`, which is 1.3 for the one on its stand. It is built about the
 * vertical axis with its front gem facing east. Returns where the stone at the top of the dome is.
 * A crown too small to show the arches is built without them.
 */
export function addCrown(b: SceneBuilder, gold: number, z: number, S: number, o: { dome?: boolean } = {}): V3 {
  const g = S / 1.3;
  lathe(b.mesh(gold), {
    c: v3(0, 0, z),
    segs: 20,
    profile: [
      [19 * S, 0],
      [19 * S, 14 * S],
      [17.4 * S, 14 * S],
      [17.4 * S, 0],
    ],
  });
  lathe(b.mesh(gold), {
    c: v3(0, 0, z),
    segs: 20,
    profile: [
      [0, 0],
      [19 * S, 0],
      [19 * S, 2 * g],
      [0, 2 * g],
    ],
  });
  const stones = [GEM.ruby, GEM.sapphire, GEM.emerald, GEM.amethyst, GEM.topaz].map((c, i) =>
    b.mesh(jewel(b, c, `s${i}`)),
  );
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.3;
    const x = Math.cos(a) * 18 * S,
      y = Math.sin(a) * 18 * S;
    lathe(b.mesh(gold), {
      c: v3(x, y, z + 12 * S),
      segs: 8,
      profile: [
        [0, 0],
        [6 * S, 0],
        [4.4 * S, 8 * S],
        [1.6 * S, 17 * S],
        [0, 17 * S],
      ],
    });
    blob(b.mesh(gold), v3(x, y, z + 12 * S + 18 * S), v3(3.4 * g, 3.4 * g, 3.4 * g), 0, { rings: 5, segs: 8 });
    gem(stones[i]!, v3(Math.cos(a) * 19.4 * S, Math.sin(a) * 19.4 * S, z + 7 * S), 5.2 * g, { yaw: a });
  }
  if (o.dome !== false) {
    for (const a of [0, Math.PI / 2]) {
      const pts = Array.from({ length: 9 }, (_, i) => {
        const t = (i / 8) * Math.PI;
        return {
          p: v3(
            Math.cos(t) * 17 * S * Math.cos(a),
            Math.cos(t) * 17 * S * Math.sin(a),
            z + 14 * S + Math.sin(t) * 14 * S,
          ),
          r: 2 * g,
        };
      });
      tube(b.mesh(gold), pts, { segs: 6 });
    }
  }
  const top = v3(0, 0, z + 14 * S + 14 * S + 4 * g);
  gem(b.mesh(jewel(b, GEM.ruby, 'topstone')), top, 6 * g, {});
  return top;
}

/**
 * The crown by itself, standing on the floor of a scene of its own, for the one she wears on her
 * head.
 */
export function crownScene(S: number): SceneBuilder {
  const b = new SceneBuilder();
  addCrown(b, kit(b).gold, 0, S, { dome: false });
  return b;
}

/**
 * The stand and its velvet cushion, with the crown on it unless she has taken it. `jewelAt` is the
 * top stone of the crown.
 */
export function crownStand(withCrown = true): { b: SceneBuilder; jewelAt: V3 | null } {
  const b = new SceneBuilder();
  const k = kit(b);
  lathe(b.mesh(k.marble), {
    c: v3(0, 0, 0),
    segs: 22,
    smooth: true,
    profile: [
      [34, 0],
      [34, 8],
      [26, 14],
      [22, 30],
      [22, 70],
      [28, 78],
      [30, 84],
      [0, 84],
    ],
  });
  lathe(b.mesh(k.gold), {
    c: v3(0, 0, 3),
    segs: 22,
    profile: [
      [34.4, 0],
      [34.4, 3],
      [32, 3],
      [32, 0],
    ],
  });
  lathe(b.mesh(k.gold), {
    c: v3(0, 0, 80),
    segs: 22,
    profile: [
      [30.4, 0],
      [30.4, 4],
      [28, 4],
      [28, 0],
    ],
  });
  blob(b.mesh(k.velvet), v3(0, 0, 90), v3(26, 26, 10), 0, { rings: 8, segs: 16 });
  return { b, jewelAt: withCrown ? addCrown(b, k.gold, 96, 1.3) : null };
}

/** The stand when she has taken the crown: the cushion, bare. */
export function renderEmptyCrownStand(): Rgba {
  return render(crownStand(false).b, CROWN_CANVAS, { aoRadius: 7 }).rgba;
}

export function renderCrownStand(): Rgba {
  const { b, jewelAt } = crownStand();
  const r = render(b, CROWN_CANVAS, { aoRadius: 7 });
  const [gx, gy] = r.at(jewelAt!);
  const img = underGlow(r.rgba, gx, gy + 6, 34, 30, [255, 240, 190], 0.16);
  glint(img, gx - 1, gy, 5);
  glint(img, ...r.at(v3(-16, -8, 108)), 3);
  glint(img, ...r.at(v3(12, -14, 104)), 3);
  return img;
}
