import { hash2 } from '../core/rng';

/**
 * Noise that repeats exactly every `period` pixels in both directions. Tiles made from it match
 * their neighbors along every edge, so a tile can be placed anywhere without a visible seam.
 */
export function tileNoise(x: number, y: number, period: number, cell: number, seed: number): number {
  const n = period / cell;
  const gx = x / cell,
    gy = y / cell;
  const xi = Math.floor(gx),
    yi = Math.floor(gy);
  const xf = gx - xi,
    yf = gy - yi;
  const u = xf * xf * (3 - 2 * xf),
    v = yf * yf * (3 - 2 * yf);
  const wrap = (i: number): number => ((i % n) + n) % n;
  const a = hash2(wrap(xi), wrap(yi), seed);
  const b = hash2(wrap(xi + 1), wrap(yi), seed);
  const c = hash2(wrap(xi), wrap(yi + 1), seed);
  const d = hash2(wrap(xi + 1), wrap(yi + 1), seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Fractal tile noise in [0, 1] with octaves whose cells halve each time. */
export function tileFbm(x: number, y: number, period: number, topCell: number, octaves: number, seed: number): number {
  let sum = 0,
    amp = 0.5,
    norm = 0,
    cell = topCell;
  for (let i = 0; i < octaves; i++) {
    sum += amp * tileNoise(x, y, period, cell, seed + i * 977);
    norm += amp;
    amp *= 0.5;
    cell = Math.max(1, cell / 2);
  }
  return sum / norm;
}

/** 4x4 ordered-dither thresholds in (0, 1). */
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x: number, y: number): number => (BAYER4[(y & 3) * 4 + (x & 3)]! + 0.5) / 16;

/** Wraps a coordinate into [0, period). */
export const wrapTo = (v: number, period: number): number => ((v % period) + period) % period;

/**
 * Weighted tile noise: one octave per cell size, each with its own weight. Lets the large scales
 * stay faint.
 */
export function tileMix(
  x: number,
  y: number,
  period: number,
  octaves: readonly { cell: number; weight: number }[],
  seed: number,
): number {
  let sum = 0,
    norm = 0;
  octaves.forEach((o, i) => {
    sum += o.weight * tileNoise(x, y, period, o.cell, seed + i * 977);
    norm += o.weight;
  });
  return sum / norm;
}
