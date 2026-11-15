import { hex, type RGB, ramp } from '../core/color';
import { createRgba, type Rgba } from '../core/image';
import { hash2 } from '../core/rng';
import { TAU, type V3, v3 } from '../core/vec';
import { coneRoof, lathe } from './arch';
import { underGlow } from './glow';
import { Painter } from './paint';
import { GEM, type Ramp } from './palette';
import { blob, box, tube } from './prims';
import { type RenderedObject, renderScene, SceneBuilder } from './scene';

/**
 * What stands round the Spooky Manor: jack-o-lanterns with kind faces, bats, a crooked tree hung
 * with lanterns, iron fence, lamp posts and dewy cobwebs. Every face is a smile. Nothing here is
 * meant to frighten a small child.
 */
const rgb = (c: RGB): readonly [number, number, number] => [c[0], c[1], c[2]];
export interface Canvas {
  w: number;
  h: number;
  ox: number;
  oy: number;
}

const r6 = (
  base: string,
  shadowHue: number,
  lightHue: number,
  light: readonly number[] = [-0.32, -0.21, -0.1, 0, 0.09, 0.17],
): Ramp => ramp(hex(base), { steps: 6, shadowHue, lightHue, lean: 1.0, lightness: light });
const PUMPKIN = r6('#f08a24', 350, 70);
const PUMPKIN_PALE = r6('#fcb03c', 350, 80);
const STEM = r6('#6a8a3a', 200, 100);
const LEAF = r6('#3a9a54', 215, 105);
const IRON: Ramp = [
  [34, 30, 52],
  [52, 46, 74],
  [78, 70, 104],
  [112, 102, 140],
  [158, 148, 188],
];
const TWIST = r6('#6a4a62', 300, 60, [-0.34, -0.22, -0.1, 0, 0.08, 0.16]);
const PLUM_LEAF = r6('#8a54b8', 280, 320, [-0.3, -0.2, -0.1, 0, 0.09, 0.17]);
const FLAME: Ramp = [
  [255, 170, 60],
  [255, 204, 96],
  [255, 232, 150],
  [255, 246, 200],
  [255, 252, 232],
];

function render(b: SceneBuilder, c: Canvas, extra: Partial<Parameters<typeof renderScene>[1]> = {}): RenderedObject {
  return renderScene(b, {
    width: c.w,
    height: c.h,
    originX: c.ox,
    originY: c.oy,
    ss: 4,
    aoRadius: 8,
    lineDepth: 5,
    shadowFit: true,
    shadowBias: 3,
    ...extra,
  });
}

export const PUMPKIN_CANVAS: Record<'big' | 'mid' | 'small', Canvas> = {
  big: { w: 150, h: 130, ox: 75, oy: 100 },
  mid: { w: 110, h: 100, ox: 55, oy: 76 },
  small: { w: 80, h: 72, ox: 40, oy: 54 },
};
const SIZE = { big: 46, mid: 32, small: 21 } as const;

type Face = 'grin' | 'happy' | 'surprised';

/** A pumpkin: a ribbed body of overlapping lobes, a curly stem and a leaf. */
function pumpkinScene(size: keyof typeof SIZE): SceneBuilder {
  const R = SIZE[size];
  const b = new SceneBuilder();
  const body = b.mesh(b.solid('pumpkin', b.variant('pumpkin', PUMPKIN)));
  const rib = b.mesh(b.solid('pumpkin2', b.variant('pumpkin2', PUMPKIN_PALE)));
  const stem = b.mesh(b.solid('stem', b.variant('stem', STEM)));
  const leaf = b.mesh(b.solid('leaf', b.variant('leaf', LEAF)));
  const H = R * 0.82;
  blob(body, v3(0, 0, H), v3(R * 0.74, R * 0.7, H), 0, { rings: 9, segs: 14 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2;
    blob(
      i % 2 === 0 ? body : rib,
      v3(Math.cos(a) * R * 0.46, Math.sin(a) * R * 0.44, H),
      v3(R * 0.4, R * 0.38, H * 0.96),
      0,
      { rings: 7, segs: 10 },
    );
  }
  tube(
    stem,
    [
      { p: v3(0, 0, H * 1.75), r: R * 0.1 },
      { p: v3(R * 0.04, 0, H * 2.0), r: R * 0.09 },
      { p: v3(R * 0.14, 0, H * 2.16), r: R * 0.07 },
    ],
    { segs: 6 },
  );
  if (size !== 'small')
    blob(leaf, v3(-R * 0.22, R * 0.06, H * 1.84), v3(R * 0.26, R * 0.12, R * 0.07), 0, { rings: 4, segs: 8 });
  return b;
}

const GLOW: readonly RGB[] = [
  [255, 250, 214],
  [255, 226, 120],
  [255, 190, 70],
  [226, 130, 40],
];

function paintFace(img: Rgba, out: RenderedObject, R: number, face: Face): Rgba {
  const p = new Painter(img);
  const H = R * 0.82;
  const [fx0, fy0] = out.at(v3(0, -R * 0.7, H * 1.02));
  const fx = Math.round(fx0),
    fy = Math.round(fy0);
  const k = Math.max(1, Math.round(R / 17));
  const dot = (x: number, y: number, c: RGB): void => {
    for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) p.px(fx + x * k + a, fy + y * k + b, rgb(c));
  };
  const edge: RGB = [120, 52, 14];
  const fill = (cells: readonly (readonly [number, number])[]): void => {
    for (const [x, y] of cells)
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ] as const)
        dot(x + dx, y + dy, edge);
    cells.forEach(([x, y]) => {
      dot(x, y, GLOW[y < -1 ? 0 : y < 1 ? 1 : 2]!);
    });
  };
  const triangleEye = (cx: number): [number, number][] => [
    [cx, -4],
    [cx - 1, -3],
    [cx, -3],
    [cx + 1, -3],
    [cx - 2, -2],
    [cx - 1, -2],
    [cx, -2],
    [cx + 1, -2],
    [cx + 2, -2],
  ];
  const roundEye = (cx: number): [number, number][] => [
    [cx - 1, -4],
    [cx, -4],
    [cx - 1, -3],
    [cx, -3],
    [cx + 1, -3],
    [cx - 1, -2],
    [cx, -2],
  ];
  const eyes = face === 'surprised' ? roundEye : triangleEye;
  fill([...eyes(-4), ...eyes(4)]);
  // The mouth: a wide smile with two teeth for a grin, a small smile for a happy one, a round O for
  // a surprised one.
  const smile: [number, number][] =
    face === 'happy'
      ? [
          [-3, 1],
          [-2, 2],
          [-1, 2],
          [0, 2],
          [1, 2],
          [2, 2],
          [3, 1],
        ]
      : face === 'surprised'
        ? [
            [-1, 1],
            [0, 1],
            [-2, 2],
            [-1, 2],
            [0, 2],
            [1, 2],
            [-1, 3],
            [0, 3],
          ]
        : [
            [-6, 0],
            [-5, 1],
            [-4, 2],
            [-3, 3],
            [-2, 3],
            [-1, 3],
            [0, 3],
            [1, 3],
            [2, 3],
            [3, 3],
            [4, 2],
            [5, 1],
            [6, 0],
            [-4, 1],
            [-3, 2],
            [3, 2],
            [4, 1],
            [-2, 2],
            [-1, 2],
            [0, 2],
            [1, 2],
            [2, 2],
          ];
  fill(smile);
  if (face === 'grin') for (const x of [-2, 2]) for (const y of [2, 1]) dot(x, y, [255, 246, 220]);
  return underGlow(img, fx, fy + k * 2, R * 1.2, R * 0.9, [255, 200, 90], 0.16);
}

export function renderPumpkin(size: keyof typeof SIZE, face: Face): Rgba {
  const c = PUMPKIN_CANVAS[size];
  const out = render(pumpkinScene(size), c, { aoRadius: 7 });
  return paintFace(out.rgba, out, SIZE[size], face);
}

export const BAT_CANVAS: Canvas = { w: 72, h: 48, ox: 36, oy: 26 };
export const BAT_FRAMES = 4;
const BAT_BODY: readonly RGB[] = [
  [48, 30, 78],
  [72, 46, 108],
  [104, 70, 148],
  [150, 112, 190],
];

/**
 * A small round bat with big ears and bigger eyes. The wings beat through four frames. Painted,
 * because it is only 30 pixels wide.
 */
export function renderBat(frame: number): Rgba {
  const { w, h, ox, oy } = BAT_CANVAS;
  const img = createRgba(w, h);
  const p = new Painter(img);
  const beat = [-9, -3, 6, -3][frame % BAT_FRAMES]!;
  for (const side of [-1, 1] as const) {
    // A wing is three fingers joined by a scalloped membrane, tipped by the beat.
    const tips: [number, number][] = [
      [16, -6 + beat],
      [22, 2 + beat * 0.5],
      [15, 9 + beat * 0.2],
    ];
    const root: [number, number] = [4, 2];
    for (let i = 0; i < tips.length; i++) {
      const [tx, ty] = tips[i]!;
      const [nx, ny] = tips[i + 1] ?? [6, 9];
      const steps = 22;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        // Fill the triangle from the root to this finger and the next, row by row.
        const ax = root[0] + (tx - root[0]) * t,
          ay = root[1] + (ty - root[1]) * t;
        const bx = root[0] + (nx - root[0]) * t,
          by = root[1] + (ny - root[1]) * t;
        const n = Math.ceil(Math.hypot(bx - ax, by - ay)) + 1;
        for (let q = 0; q <= n; q++) {
          const u = q / Math.max(1, n);
          const x = Math.round(ax + (bx - ax) * u),
            y = Math.round(ay + (by - ay) * u);
          // A scallop: the outer edge dips between fingers.
          if (t > 0.9 && q > 0 && q < n && (x + y) % 2 === 0) continue;
          p.px(ox + side * x, oy + y, rgb(BAT_BODY[t > 0.82 ? 3 : t > 0.4 ? 2 : 1]!));
        }
      }
      const fs = 18;
      for (let s = 0; s <= fs; s++)
        p.px(
          ox + side * Math.round(root[0] + (tx - root[0]) * (s / fs)),
          oy + Math.round(root[1] + (ty - root[1]) * (s / fs)),
          rgb(BAT_BODY[0]!),
        );
    }
  }
  // Body: a round belly and a round head with two tall ears, big white eyes and a tiny smile.
  for (let y = -10; y <= 12; y++)
    for (let x = -7; x <= 7; x++) {
      const d = Math.hypot(x / 7, (y - 2) / 11);
      if (d > 1) continue;
      p.px(ox + x, oy + y, rgb(d > 0.9 ? BAT_BODY[0]! : x + y < -2 ? BAT_BODY[2]! : BAT_BODY[1]!));
    }
  for (let y = -3; y <= 9; y++)
    for (let x = -4; x <= 4; x++)
      if (Math.hypot(x / 4, (y - 3) / 6) < 1 && y > 1) p.px(ox + x, oy + y, rgb(BAT_BODY[3]!));
  for (const side of [-1, 1])
    for (let i = 0; i < 6; i++) {
      p.px(ox + side * (3 + Math.floor(i / 3)), oy - 11 - i, rgb(BAT_BODY[1]!));
      p.px(ox + side * (4 + Math.floor(i / 3)), oy - 10 - i, rgb(BAT_BODY[0]!));
      p.px(ox + side * (2 + Math.floor(i / 3)), oy - 10 - i, rgb(BAT_BODY[2]!));
    }
  for (const side of [-1, 1]) {
    for (const [dx, dy] of [
      [1, -2],
      [2, -2],
      [1, -1],
      [2, -1],
      [1, 0],
      [2, 0],
    ] as const)
      p.px(ox + side * dx + (side < 0 ? -1 : 0), oy + dy - 1, [255, 255, 255]);
    p.px(ox + side * 2 + (side < 0 ? -1 : 0), oy - 1, [40, 20, 70]);
    p.px(ox + side * 2 + (side < 0 ? -1 : 0), oy - 2, [40, 20, 70]);
  }
  for (const [dx, dy] of [
    [-2, 3],
    [-1, 4],
    [0, 4],
    [1, 4],
    [2, 3],
  ] as const)
    p.px(ox + dx, oy + dy, [255, 214, 232]);
  return img;
}

export const LAMP_POST_CANVAS: Canvas = { w: 110, h: 220, ox: 55, oy: 190 };

/** A black iron post with a curled arm, and a lantern whose candle is always lit. */
export function renderLampPost(): Rgba {
  const b = new SceneBuilder();
  const iron = b.mesh(b.solid('iron', b.variant('iron', IRON)));
  const glass = b.mesh(b.solid('glow', b.variant('glow', FLAME, { emissive: 3 })));
  const amber = b.mesh(b.solid('amber', b.variant('amber', PUMPKIN_PALE)));
  lathe(iron, {
    c: v3(0, 0, 0),
    segs: 12,
    smooth: true,
    profile: [
      [14, 0],
      [14, 6],
      [8, 12],
      [4, 22],
      [3, 130],
      [5, 136],
      [0, 138],
    ],
  });
  tube(
    iron,
    [
      { p: v3(0, 0, 128), r: 2.4 },
      { p: v3(12, 0, 148), r: 2.2 },
      { p: v3(24, 0, 150), r: 2 },
      { p: v3(30, 0, 142), r: 1.8 },
    ],
    { segs: 6 },
  );
  const L = v3(30, 0, 124);
  lathe(iron, {
    c: L,
    segs: 6,
    profile: [
      [9, 0],
      [10, 4],
      [8, 6],
      [0, 6],
    ],
  });
  blob(glass, v3(L[0], L[1], L[2] + 18), v3(6.4, 6.4, 11), 0, { rings: 6, segs: 10 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.78;
    tube(
      iron,
      [
        { p: v3(L[0] + Math.cos(a) * 9, L[1] + Math.sin(a) * 9, L[2] + 6), r: 1.3 },
        { p: v3(L[0] + Math.cos(a) * 9, L[1] + Math.sin(a) * 9, L[2] + 32), r: 1.3 },
      ],
      { segs: 5 },
    );
  }
  coneRoof(iron, v3(L[0], L[1], L[2] + 31), 11, 12, 6, 1.2);
  blob(amber, v3(L[0], L[1], L[2] + 46), v3(2.6, 2.6, 2.6), 0, { rings: 4, segs: 6 });
  const out = render(b, LAMP_POST_CANVAS, { aoRadius: 6 });
  const [gx, gy] = out.at(v3(L[0], L[1], L[2] + 18));
  return underGlow(out.rgba, gx, gy, 52, 46, [255, 190, 90], 0.34);
}

export const TWISTY_CANVAS: Canvas = { w: 300, h: 360, ox: 150, oy: 300 };

/**
 * A bare, corkscrewed tree with a few plum leaves, and little lanterns and pumpkins hanging from
 * it.
 */
export function renderTwistyTree(): Rgba {
  const b = new SceneBuilder();
  const bark = b.mesh(b.solid('bark', b.variant('bark', TWIST)));
  const leaf = b.mesh(b.solid('leaf', b.variant('leaf', PLUM_LEAF)));
  const glass = b.mesh(b.solid('glow', b.variant('glow', FLAME, { emissive: 3 })));
  const iron = b.mesh(b.solid('iron', b.variant('iron', IRON)));
  const trunk = Array.from({ length: 12 }, (_, i) => {
    const t = i / 11;
    return {
      p: v3(Math.sin(t * 7) * 18 * (1 - t * 0.3), Math.cos(t * 7) * 12 * (1 - t * 0.3), t * 190),
      r: 22 - t * 12,
    };
  });
  tube(bark, trunk, { segs: 12 });
  // Roots that grip the ground.
  for (const [dx, dy, len] of [
    [-26, 6, 34],
    [24, 8, 30],
    [2, -24, 26],
    [-14, -18, 22],
  ] as const)
    tube(
      bark,
      [
        { p: v3(0, 0, 18), r: 11 },
        { p: v3(dx * 0.6, dy * 0.6, 8), r: 8 },
        { p: v3(dx + (dx > 0 ? len * 0.2 : -len * 0.2), dy, 1), r: 5 },
      ],
      { segs: 8 },
    );
  // Branches that curl up and out, each ending in a leaf cluster.
  const ends: V3[] = [];
  const branches: [number, number, number, number][] = [
    [0.62, -1, 0.2, 80],
    [0.74, 1, -0.1, 88],
    [0.5, 1, 0.4, 72],
    [0.86, -1, -0.3, 60],
    [0.95, 1, 0.1, 52],
  ];
  for (const [t, side, lean, len] of branches) {
    const base = trunk[Math.round(t * 11)]!.p;
    const mid = v3(base[0] + side * len * 0.5, base[1] + lean * 20, base[2] + len * 0.2);
    const tip = v3(base[0] + side * len, base[1] + lean * 30, base[2] + len * 0.2 + len * 0.55);
    const curl = v3(tip[0] - side * 14, tip[1], tip[2] + 24);
    tube(
      bark,
      [
        { p: base, r: 7 },
        { p: mid, r: 5 },
        { p: tip, r: 3.6 },
        { p: curl, r: 2 },
      ],
      { segs: 8 },
    );
    ends.push(tip);
    blob(leaf, v3(tip[0], tip[1] - 2, tip[2] + 6), v3(22, 18, 14), 0, { rings: 6, segs: 10 });
    blob(leaf, v3(tip[0] + side * 12, tip[1], tip[2] - 4), v3(14, 12, 10), 0, { rings: 5, segs: 8 });
  }
  blob(leaf, v3(trunk[11]!.p[0], trunk[11]!.p[1], 206), v3(26, 22, 20), 0, { rings: 6, segs: 10 });
  // Lanterns on short cords, and one small pumpkin.
  const hangs: [number, number][] = [
    [0, 26],
    [2, 34],
    [3, 22],
  ];
  for (const [i, drop] of hangs) {
    const e = ends[i]!;
    const hx = e[0] - (i === 2 ? 20 : 0),
      hz = e[2] - 14;
    tube(
      iron,
      [
        { p: v3(hx, e[1] - 2, hz), r: 0.9 },
        { p: v3(hx, e[1] - 2, hz - drop), r: 0.9 },
      ],
      { segs: 4 },
    );
    blob(glass, v3(hx, e[1] - 2, hz - drop - 8), v3(6.4, 6.4, 8.4), 0, { rings: 6, segs: 10 });
    lathe(iron, {
      c: v3(hx, e[1] - 2, hz - drop - 18),
      segs: 6,
      profile: [
        [0, 0],
        [5, 0],
        [5, 2],
        [0, 2],
      ],
    });
  }
  const out = render(b, TWISTY_CANVAS, { aoRadius: 9 });
  let img = out.rgba;
  for (const [i, drop] of hangs) {
    const e = ends[i]!;
    const [gx, gy] = out.at(v3(e[0] - (i === 2 ? 20 : 0), e[1] - 2, e[2] - 14 - drop - 8));
    img = underGlow(img, gx, gy, 34, 30, [255, 190, 90], 0.3);
  }
  return img;
}

export const FENCE_CANVAS: Canvas = { w: 200, h: 96, ox: 100, oy: 76 };

/** Eight railings between two rails, each with a spear point, standing in a row along x. */
export function renderFence(): Rgba {
  const b = new SceneBuilder();
  const iron = b.mesh(b.solid('iron', b.variant('iron', IRON)));
  const tip = b.mesh(b.solid('tip', b.variant('tip', GEM.gold, { bands: [0.2, 0.4, 0.6, 0.8, 0.92] })));
  const base = b.mesh(b.solid('base', b.variant('base', IRON)));
  box(base, v3(0, 0, 4), v3(176, 7, 8));
  box(iron, v3(0, 0, 18), v3(176, 3.4, 4));
  box(iron, v3(0, 0, 50), v3(176, 3.4, 4));
  for (let i = 0; i < 9; i++) {
    const x = -80 + i * 20;
    box(iron, v3(x, 0, 32), v3(4, 4, 62));
    lathe(tip, {
      c: v3(x, 0, 62),
      segs: 5,
      profile: [
        [3.4, 0],
        [3.2, 3],
        [0, 14],
      ],
    });
  }
  for (const sx of [-1, 1]) {
    box(base, v3(sx * 88, 0, 30), v3(10, 10, 62));
    lathe(tip, {
      c: v3(sx * 88, 0, 60),
      segs: 6,
      smooth: true,
      profile: [
        [7, 0],
        [6, 6],
        [3, 12],
        [0, 18],
      ],
    });
  }
  return render(b, FENCE_CANVAS, { aoRadius: 5 }).rgba;
}

export const COBWEB_CANVAS: Canvas = { w: 112, h: 112, ox: 0, oy: 0 };

/**
 * A web strung across a corner, drawn with its anchor at the top-left. Pale lines and a scatter of
 * dew drops that catch the light.
 */
export function renderCobweb(flip: boolean): Rgba {
  const { w, h } = COBWEB_CANVAS;
  const img = createRgba(w, h);
  const p = new Painter(img);
  const X = (x: number): number => (flip ? w - 1 - x : x);
  const line = (x0: number, y0: number, x1: number, y1: number, a: number): void => {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
    for (let i = 0; i <= n; i++)
      p.over(X(Math.round(x0 + ((x1 - x0) * i) / n)), Math.round(y0 + ((y1 - y0) * i) / n), [238, 236, 255], a);
  };
  // Spokes fan from the corner, then each ring is a gently sagging arc from spoke to spoke.
  const spokes = 6;
  const pts = (r: number): [number, number][] =>
    Array.from({ length: spokes }, (_, i) => {
      const a = (i / (spokes - 1)) * (Math.PI / 2);
      return [Math.cos(a) * r, Math.sin(a) * r];
    });
  for (const [x, y] of pts(104)) line(0, 0, x, y, 0.8);
  for (const r of [22, 42, 62, 84, 104]) {
    const q = pts(r);
    for (let i = 0; i < q.length - 1; i++) {
      const [ax, ay] = q[i]!,
        [bx, by] = q[i + 1]!;
      const mx = (ax + bx) / 2 - 4,
        my = (ay + by) / 2 - 4;
      // Each ring sags toward the corner between its spokes.
      const n = 14;
      let px = ax,
        py = ay;
      for (let s = 1; s <= n; s++) {
        const t = s / n;
        const x = (1 - t) * (1 - t) * ax + 2 * (1 - t) * t * mx + t * t * bx,
          y = (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * my + t * t * by;
        line(px, py, x, y, 0.62);
        px = x;
        py = y;
      }
    }
  }
  // Dew: a few bright drops with a dark underside, like glass beads.
  for (let i = 0; i < 16; i++) {
    const r = 18 + hash2(i, 1, 6) * 86,
      a = hash2(i, 2, 6) * (Math.PI / 2);
    const x = X(Math.round(Math.cos(a) * r)),
      y = Math.round(Math.sin(a) * r);
    p.px(x, y, [255, 255, 255]);
    p.over(x, y + 1, [120, 140, 220], 0.7);
    p.over(x + (flip ? 1 : -1), y, [200, 230, 255], 0.6);
  }
  return img;
}
