import { hex, type RGB, ramp } from '../core/color';
import type { Rgba } from '../core/image';
import type { Mesh } from '../core/mesh';
import { mulberry32 } from '../core/rng';
import { TAU, v3 } from '../core/vec';
import { lathe } from './arch';
import { twinkles } from './magic-hall';
import { GEM, type Ramp } from './palette';
import { blob, box, tube } from './prims';
import { renderScene, SceneBuilder } from './scene';

/**
 * What stands and floats inside the Magic Hall: spell books that hover over their lecterns with
 * their pages stirring, star globes whose rings turn, candles that float and flicker, and a spell
 * circle on the floor whose runes go round. Each is drawn in a handful of frames that loop.
 */

export interface Canvas {
  w: number;
  h: number;
  ox: number;
  oy: number;
}

const r6 = (base: string, shadowHue: number, lightHue: number, lightness?: readonly number[]): Ramp =>
  ramp(hex(base), {
    steps: 6,
    shadowHue,
    lightHue,
    lean: 0.95,
    lightness: lightness ?? [-0.3, -0.2, -0.1, 0, 0.08, 0.16],
  });

const PAGE = r6('#fff6e0', 30, 85, [-0.22, -0.14, -0.07, -0.01, 0.04, 0.08]);
const WAX = r6('#fff0f6', 330, 70, [-0.22, -0.14, -0.07, -0.01, 0.04, 0.08]);
const FLAME = r6('#fff0a0', 20, 95, [-0.12, -0.06, 0, 0.06, 0.12, 0.18]);
const STAND = r6('#7c5ac0', 275, 320);
const COVERS = {
  rose: r6('#e45f8f', 325, 40),
  sky: r6('#4aa0e8', 240, 160),
  gold: r6('#f2b53a', 20, 90),
  mint: r6('#3fc99a', 200, 130),
} as const;
export type BookCover = keyof typeof COVERS;
export const BOOK_COVERS = Object.keys(COVERS) as readonly BookCover[];

const sprite = (scene: SceneBuilder, canvas: Canvas, ss = 4): Rgba =>
  renderScene(scene, { width: canvas.w, height: canvas.h, originX: canvas.ox, originY: canvas.oy, ss }).rgba;

/** Turns a mesh about the y axis through (cx, cz), so a flat page can lean to the side. */
function rollY(m: Mesh, phi: number, cx: number, cz: number): void {
  const c = Math.cos(phi),
    s = Math.sin(phi);
  for (let i = 0; i < m.pos.length; i += 3) {
    for (const arr of [m.pos, m.rest]) {
      const x = arr[i]! - cx,
        z = arr[i + 2]! - cz;
      arr[i] = x * c + z * s + cx;
      arr[i + 2] = -x * s + z * c + cz;
    }
    const nx = m.nor[i]!,
      nz = m.nor[i + 2]!;
    m.nor[i] = nx * c + nz * s;
    m.nor[i + 2] = -nx * s + nz * c;
  }
}

export const BOOK = { w: 168, h: 210, ox: 84, oy: 176 } as const;
export const BOOK_FRAMES = 8;

/** A spell book open over its lectern, hovering and breathing, with a page that lifts and falls. */
function bookScene(cover: BookCover, frame: number): SceneBuilder {
  const t = frame / BOOK_FRAMES;
  const bob = Math.sin(t * TAU) * 4;
  const b = new SceneBuilder();
  const wood = b.variant('stand', STAND, { bands: [0.2, 0.42, 0.62, 0.84] });
  const gold = b.variant('gold', GEM.gold, { bands: [0.2, 0.42, 0.62, 0.84] });
  const page = b.variant('page', PAGE, { bands: [0.2, 0.42, 0.62, 0.84] });
  const hide = b.variant('cover', COVERS[cover], { bands: [0.2, 0.42, 0.62, 0.84] });
  lathe(b.mesh(b.solid('stand', wood)), {
    c: v3(0, 0, 0),
    profile: [
      [30, 0],
      [28, 7],
      [16, 14],
      [11, 22],
      [11, 58],
      [17, 64],
      [24, 70],
      [0, 70],
    ],
    segs: 16,
    smooth: true,
  });
  lathe(b.mesh(b.solid('gold', gold)), {
    c: v3(0, 0, 0),
    profile: [
      [32, 0],
      [32, 4],
      [28, 6],
    ],
    segs: 16,
  });
  lathe(b.mesh(b.solid('gold', gold)), {
    c: v3(0, 0, 56),
    profile: [
      [14, 0],
      [14, 3],
      [10, 5],
    ],
    segs: 14,
  });
  const z = 94 + bob;
  const flutter = Math.sin(t * TAU) * 0.18;
  // The cover under the pages, then a left page and a right page, and a page that is turning
  box(b.mesh(b.solid('cover', hide)), v3(0, 0, z - 4), v3(66, 42, 5), 0);
  const left = b.mesh(b.solid('page', page));
  box(left, v3(-16, 0, z + 1), v3(29, 36, 3), 0);
  rollY(left, 0.2, -2, z);
  const right = b.mesh(b.solid('page', page));
  box(right, v3(16, 0, z + 1), v3(29, 36, 3), 0);
  rollY(right, -0.2, 2, z);
  const turning = b.mesh(b.solid('page', page));
  box(turning, v3(15, 0, z + 3.4), v3(27, 34, 1.2), 0);
  rollY(turning, -0.2 - 0.5 - flutter * 2.4, 2, z + 2);
  return b;
}

export function renderBook(cover: BookCover, frame: number): Rgba {
  const out = sprite(bookScene(cover, frame), BOOK);
  return twinkles(out, frame, BOOK_FRAMES, {
    seed: 11 + BOOK_COVERS.indexOf(cover) * 7,
    count: 10,
    size: 3,
    colors: [
      [255, 255, 255],
      [255, 226, 248],
      [220, 246, 255],
      [255, 246, 200],
    ],
  });
}

export const GLOBE = { w: 220, h: 280, ox: 110, oy: 244 } as const;
export const GLOBE_FRAMES = 12;

/** A star globe: a crystal heart held by gold rings that turn about it. */
function globeScene(frame: number): SceneBuilder {
  const t = frame / GLOBE_FRAMES;
  const b = new SceneBuilder();
  const gold = b.variant('gold', GEM.gold, { bands: [0.2, 0.42, 0.62, 0.84] });
  const rose = b.variant('ring', r6('#f0a0e8', 300, 340), { bands: [0.2, 0.42, 0.62, 0.84] });
  const wood = b.variant('stand', STAND, { bands: [0.2, 0.42, 0.62, 0.84] });
  const core = b.variant('core', r6('#9ff2ff', 250, 150, [-0.1, -0.04, 0.02, 0.08, 0.14, 0.2]), {
    emissive: 0.7,
    protect: true,
    noLines: true,
    priority: 2,
  });
  lathe(b.mesh(b.solid('stand', wood)), {
    c: v3(0, 0, 0),
    profile: [
      [44, 0],
      [42, 10],
      [26, 20],
      [14, 30],
      [11, 48],
      [18, 56],
      [0, 56],
    ],
    segs: 18,
    smooth: true,
  });
  lathe(b.mesh(b.solid('gold', gold)), {
    c: v3(0, 0, 0),
    profile: [
      [46, 0],
      [46, 5],
      [42, 8],
    ],
    segs: 18,
  });
  const cz = 122;
  blob(b.mesh(b.solid('core', core), { noLines: true }), v3(0, 0, cz), v3(18, 18, 18), 0, { rings: 8, segs: 14 });
  const ring = (R: number, tiltX: number, spin: number, mat: ReturnType<typeof b.solid>, w: number): void => {
    const pts = Array.from({ length: 29 }, (_, i) => {
      const a = (i / 28) * TAU;
      // A circle in a plane tipped about the x axis, then turned about the vertical.
      const px = Math.cos(a) * R,
        py0 = Math.sin(a) * R;
      const py = py0 * Math.cos(tiltX),
        pz = py0 * Math.sin(tiltX);
      const x = px * Math.cos(spin) - py * Math.sin(spin),
        y = px * Math.sin(spin) + py * Math.cos(spin);
      return { p: v3(x, y, cz + pz), r: w };
    });
    tube(b.mesh(mat), pts, { segs: 6, n: 29 });
  };
  const goldMat = b.solid('gold', gold);
  const roseMat = b.solid('ring', rose);
  ring(62, 1.15, t * TAU, goldMat, 2.6);
  ring(50, 0.62, -t * TAU, roseMat, 2.2);
  ring(38, 1.5, t * TAU * 2, goldMat, 2);
  return b;
}

export function renderGlobe(frame: number): Rgba {
  return twinkles(sprite(globeScene(frame), GLOBE), frame, GLOBE_FRAMES, { seed: 23, count: 14, size: 3 });
}

export const CANDLES = { w: 176, h: 230, ox: 88, oy: 196 } as const;
export const CANDLE_FRAMES = 8;

/** Five candles floating at different heights in a bunch, bobbing and flickering. */
function candleScene(frame: number): SceneBuilder {
  const t = frame / CANDLE_FRAMES;
  const b = new SceneBuilder();
  const wax = b.variant('wax', WAX, { bands: [0.2, 0.42, 0.62, 0.84] });
  const flameV = b.variant('flame', FLAME, { emissive: 0.8, protect: true, noLines: true, priority: 2 });
  const wick = b.variant('wick', r6('#5a4a58', 300, 60), { noLines: true });
  const waxMat = b.solid('wax', wax);
  const flameMat = b.solid('flame', flameV);
  const wickMat = b.solid('wick', wick);
  const rows: readonly (readonly [number, number, number, number])[] = [
    // x, y, height, phase
    [-44, 8, 52, 0.0],
    [-20, -10, 70, 0.3],
    [6, 14, 60, 0.6],
    [32, -6, 76, 0.15],
    [54, 12, 48, 0.8],
  ];
  for (const [x, y, h, phase] of rows) {
    const bob = Math.sin((t + phase) * TAU) * 4;
    const base = 44 + phase * 30 + bob;
    lathe(b.mesh(waxMat), {
      c: v3(x, y, base),
      profile: [
        [7, 0],
        [7, h],
        [5.5, h + 2],
        [0, h + 2],
      ],
      segs: 12,
      smooth: true,
    });
    blob(b.mesh(wickMat, { noLines: true }), v3(x, y, base + h + 3), v3(0.9, 0.9, 2), 0, { rings: 3, segs: 5 });
    const flick = 1 + 0.2 * Math.sin((t * 2 + phase * 3) * TAU);
    const sway = Math.sin((t + phase) * TAU) * 1.4;
    blob(b.mesh(flameMat, { noLines: true }), v3(x + sway, y, base + h + 10 * flick), v3(4.4, 4.4, 8.5 * flick), 0, {
      rings: 5,
      segs: 8,
    });
  }
  return b;
}

export function renderCandles(frame: number): Rgba {
  return twinkles(sprite(candleScene(frame), CANDLES), frame, CANDLE_FRAMES, {
    seed: 31,
    count: 8,
    size: 2,
    colors: [
      [255, 246, 200],
      [255, 226, 160],
      [255, 255, 255],
    ],
  });
}

export const CIRCLE = { w: 420, h: 220, ox: 210, oy: 110 } as const;
export const CIRCLE_FRAMES = 12;

const RUNE: readonly RGB[] = [
  [255, 140, 240],
  [150, 230, 255],
  [255, 232, 150],
  [200, 160, 255],
];

/**
 * A spell circle on the floor: rings, a star that turns one way and runes that go round the other,
 * all glowing and pale at the edge, drawn on the floor's slant.
 */
export function renderCircle(frame: number): Rgba {
  const { w, h, ox, oy } = CIRCLE;
  const out: Rgba = { width: w, height: h, data: new Uint8Array(w * h * 4) };
  const rx = 188,
    ry = 188 * 0.454;
  const spin = (frame / CIRCLE_FRAMES) * TAU;
  const rng = mulberry32(5);
  const runes = Array.from({ length: 16 }, (_, k) => ({
    a: (k / 16) * TAU,
    kind: Math.floor(rng() * 4),
    color: RUNE[k % RUNE.length]!,
  }));
  const star: [number, number][] = Array.from({ length: 5 }, (_, k) => {
    const a = spin + (k / 5) * TAU * 2;
    return [Math.cos(a) * 0.72, Math.sin(a) * 0.72];
  });
  const segDist = (px: number, py: number, a: [number, number], c: [number, number]): number => {
    const ex = c[0] - a[0],
      ey = c[1] - a[1];
    const t = Math.max(0, Math.min(1, ((px - a[0]) * ex + (py - a[1]) * ey) / (ex * ex + ey * ey)));
    return Math.hypot(px - (a[0] + ex * t), py - (a[1] + ey * t));
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = (x - ox + 0.5) / rx,
        v = (y - oy + 0.5) / ry;
      const r = Math.hypot(u, v);
      if (r > 1.06) continue;
      const th = Math.atan2(v, u);
      // Width of a line of 2 pixels, in the circle's own units
      const px = 1.9 / rx;
      let glow = 0;
      let color: RGB = [255, 190, 250];
      const ring = (R: number, wd: number, c: RGB): void => {
        const d = Math.abs(r - R);
        if (d < wd * px) {
          glow = Math.max(glow, 1 - (d / (wd * px)) * 0.4);
          color = c;
        }
      };
      ring(1, 1.4, [255, 220, 250]);
      ring(0.84, 1, [190, 160, 255]);
      ring(0.2, 1.2, [255, 240, 200]);
      for (let k = 0; k < 5; k++) {
        const d = segDist(u, v, star[k]!, star[(k + 1) % 5]!);
        if (d < 1.2 * px) {
          glow = Math.max(glow, 1 - (d / (1.2 * px)) * 0.4);
          color = [150, 230, 255];
        }
      }
      for (const rune of runes) {
        const a = rune.a - spin * 0.5;
        const rr = 0.92;
        const cx = Math.cos(a) * rr,
          cy = Math.sin(a) * rr;
        const d = Math.hypot(u - cx, v - cy);
        const size = 7 * px;
        if (d < size) {
          const inside =
            rune.kind === 0
              ? d > size * 0.5
              : rune.kind === 1
                ? Math.abs(u - cx) < size * 0.3 || Math.abs(v - cy) < size * 0.3
                : rune.kind === 2
                  ? Math.abs(Math.hypot(u - cx, v - cy) - size * 0.6) < size * 0.25
                  : Math.abs(Math.abs(u - cx) - Math.abs(v - cy)) < size * 0.3;
          if (inside) {
            glow = Math.max(glow, 0.95);
            color = rune.color;
          }
        }
      }
      // A soft wash of light across the whole disc
      const wash = (1 - r) * 0.18 + (r > 0.84 && r < 1.0 ? 0.08 : 0);
      const a = Math.max(glow * 0.92, wash);
      if (a <= 0.01) continue;
      const tw = 0.9 + 0.1 * Math.sin(th * 3 + spin);
      const i = (y * w + x) * 4;
      const c: RGB = glow > 0 ? color : [210, 190, 255];
      out.data[i] = Math.min(255, c[0] * tw);
      out.data[i + 1] = Math.min(255, c[1] * tw);
      out.data[i + 2] = Math.min(255, c[2] * tw);
      out.data[i + 3] = Math.round(Math.min(1, a) * 215);
    }
  }
  return out;
}
