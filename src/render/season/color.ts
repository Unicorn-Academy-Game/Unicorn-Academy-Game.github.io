import { clamp } from '../../shared/math';

/**
 * The sums behind the seasons' colours. All plain numbers, so a test runs them as a browser does.
 */

export interface Hsv {
  /** Degrees, 0 up to 360. */
  h: number;
  s: number;
  v: number;
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** A place on a ramp of colours: how far along it is, from 0 to 1, and the colour there. */
export type Stop = readonly [t: number, r: number, g: number, b: number];

export function toHsv(r: number, g: number, b: number, out: Hsv): void {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  out.v = max / 255;
  out.s = max === 0 ? 0 : d / max;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  out.h = h;
}

/** How light a colour looks, from 0 to 1. */
export const luma = (r: number, g: number, b: number): number => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

/** 0 up to `a`, 1 from `b`, and a smooth rise between. */
export function smooth(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** The colour `t` of the way along a ramp. */
export function sample(stops: readonly Stop[], t: number, out: Rgb): void {
  const first = stops[0]!;
  if (t <= first[0]) {
    out.r = first[1];
    out.g = first[2];
    out.b = first[3];
    return;
  }
  for (let i = 1; i < stops.length; i++) {
    const to = stops[i]!;
    if (t <= to[0]) {
      const from = stops[i - 1]!;
      const k = (t - from[0]) / (to[0] - from[0]);
      out.r = from[1] + (to[1] - from[1]) * k;
      out.g = from[2] + (to[2] - from[2]) * k;
      out.b = from[3] + (to[3] - from[3]) * k;
      return;
    }
  }
  const last = stops[stops.length - 1]!;
  out.r = last[1];
  out.g = last[2];
  out.b = last[3];
}

/**
 * Writes a colour into a picture's bytes, rounded and held between 0 and 255 whatever the kind of
 * array.
 */
export function put(data: Uint8ClampedArray | Uint8Array, at: number, r: number, g: number, b: number): void {
  data[at] = r < 0 ? 0 : r > 255 ? 255 : (r + 0.5) | 0;
  data[at + 1] = g < 0 ? 0 : g > 255 ? 255 : (g + 0.5) | 0;
  data[at + 2] = b < 0 ? 0 : b > 255 ? 255 : (b + 0.5) | 0;
}

/**
 * A number from 0 up to 1 that depends only on where it is asked and the seed, so a recolouring
 * comes out the same every time.
 */
export function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth patches, 0 up to 1, about `size` pixels across. */
export function patches(x: number, y: number, size: number, seed: number): number {
  const gx = x / size;
  const gy = y / size;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const top = hash(x0, y0, seed) * (1 - u) + hash(x0 + 1, y0, seed) * u;
  const bottom = hash(x0, y0 + 1, seed) * (1 - u) + hash(x0 + 1, y0 + 1, seed) * u;
  return top * (1 - v) + bottom * v;
}
