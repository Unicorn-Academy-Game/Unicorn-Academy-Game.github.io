import type { RGB } from '../core/color';
import { hash2 } from '../core/rng';
import type { Painter } from './paint';

/**
 * The twilight over the forest, as seen through the manor's windows and in its paintings: a plum
 * sky that warms toward the trees, a round moon, a few stars, two rows of tree tops and a handful
 * of fireflies. Painted on exact pixels, and a pure function of position, so neighbouring windows
 * show one continuous view.
 */
const SKY: readonly RGB[] = [
  [22, 16, 62],
  [38, 26, 92],
  [64, 38, 118],
  [112, 54, 138],
  [176, 78, 140],
  [240, 128, 112],
];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number): number => (BAYER[(y & 3) * 4 + (x & 3)]! + 0.5) / 16;

export interface Twilight {
  /** The view's rectangle in the sprite's pixels. */
  x0: number;
  y0: number;
  w: number;
  h: number;
  /** Moon centre in pixels, in the same space, and its radius. */
  moon: { x: number; y: number; r: number };
  seed?: number;
}

/** The colour of the view at a pixel. */
export function twilightAt(x: number, y: number, v: Twilight): RGB {
  const seed = v.seed ?? 1;
  const t = (y - v.y0) / v.h;
  const horizon = v.y0 + v.h * 0.72;
  // Trees: a far row of pines and a near row of round crowns, both tied to absolute x so windows
  // agree.
  const pine = (X: number, size: number, k: number): number => {
    const cell = Math.floor(X / size),
      f = (X - cell * size) / size;
    return (0.4 + hash2(cell, k, seed) * 0.6) * (1 - Math.abs(f * 2 - 1)) * size * 2.3;
  };
  const far = horizon - 4 - pine(x, 9, 3);
  const nearTop =
    horizon +
    v.h * 0.07 -
    Math.sqrt(Math.max(0, 1 - (((((x % 17) + 17) % 17) / 17) * 2 - 1) ** 2)) *
      (5 + hash2(Math.floor(x / 17), 5, seed) * 7);
  if (y >= nearTop) return hash2(x, y, seed + 2) > 0.985 ? [52, 34, 88] : [24, 14, 48];
  if (y >= far) return hash2(x >> 1, y >> 1, seed + 4) > 0.9 ? [78, 46, 118] : [52, 30, 92];
  // Moon, with a soft halo.
  const dm = Math.hypot(x + 0.5 - v.moon.x, y + 0.5 - v.moon.y);
  if (dm <= v.moon.r) {
    const crater =
      Math.hypot(x + 0.5 - (v.moon.x + v.moon.r * 0.3), y + 0.5 - (v.moon.y + v.moon.r * 0.15)) < v.moon.r * 0.28 ||
      Math.hypot(x + 0.5 - (v.moon.x - v.moon.r * 0.35), y + 0.5 - (v.moon.y - v.moon.r * 0.3)) < v.moon.r * 0.16;
    const shaded = (x + 0.5 - v.moon.x) * 0.6 + (y + 0.5 - v.moon.y) * 0.8 > v.moon.r * 0.35;
    return crater ? [226, 210, 178] : shaded ? [248, 236, 196] : [255, 250, 226];
  }
  // Sky bands, dithered so the steps do not read as stripes.
  let c =
    SKY[Math.max(0, Math.min(SKY.length - 1, Math.floor(t * 1.4 * (SKY.length - 1) + (bayer(x, y) - 0.5) * 1.1)))]!;
  if (dm < v.moon.r * 2.1) {
    const k = (1 - (dm - v.moon.r) / (v.moon.r * 1.1)) * 0.28;
    c = [c[0] + (255 - c[0]) * k, c[1] + (236 - c[1]) * k, c[2] + (190 - c[2]) * k].map(Math.round) as unknown as RGB;
  }
  if (t < 0.5 && hash2(x, y, seed + 6) < 0.011) return [255, 248, 214];
  if (
    t < 0.4 &&
    hash2(x >> 2, y >> 2, seed + 8) < 0.012 &&
    ((x & 3) === 1 || (y & 3) === 1) &&
    hash2(x, y, seed + 9) < 0.7
  )
    return [226, 214, 255];
  return c;
}

/** Fills the pixels `isGlass` accepts with the view, then lays fireflies over them. */
export function paintTwilight(p: Painter, v: Twilight, isGlass: (x: number, y: number) => boolean): void {
  for (let y = v.y0; y < v.y0 + v.h; y++)
    for (let x = v.x0; x < v.x0 + v.w; x++) if (isGlass(x, y)) p.px(x, y, twilightAt(x, y, v));
  const n = Math.max(2, Math.round((v.w * v.h) / 2600));
  for (let i = 0; i < n; i++) {
    const fx = v.x0 + 4 + Math.floor(hash2(i, 1, v.seed ?? 1) * (v.w - 8));
    const fy = v.y0 + Math.floor(v.h * (0.5 + hash2(i, 2, v.seed ?? 1) * 0.42));
    if (!isGlass(fx, fy)) continue;
    for (const [dx, dy, a] of [
      [-1, 0, 0.45],
      [1, 0, 0.45],
      [0, -1, 0.45],
      [0, 1, 0.45],
    ] as const)
      if (isGlass(fx + dx, fy + dy)) p.over(fx + dx, fy + dy, [255, 236, 120], a);
    p.px(fx, fy, [255, 252, 190]);
  }
}
