import { type Hsv, hash, put, type Rgb, sample, toHsv } from './color';
import { CAP } from './palettes';
import type { Cell, Pixels } from './pixels';

/**
 * A pixel that is at least this opaque is part of the picture, and the rest is the air around it.
 */
export const OPAQUE = 128;

/**
 * A light that glows, such as a lit window, a flame or a bit of gold, which snow does not cover.
 */
export const glows = (c: Hsv): boolean => c.v > 0.88 && c.s > 0.45 && c.h >= 20 && c.h <= 65;

/**
 * Lays a cap of snow along every edge of a picture that faces up: where the pixel above is air,
 * snow settles down from it, a few pixels deep and a little uneven, white on top and cold blue at
 * its lower edge. `scale` makes it deeper, for things that hold more.
 */
export function capSnow(px: Pixels, cell: Cell, scale = 1): void {
  const { width, data } = px;
  const base = Math.max(2, Math.min(9, Math.round(Math.min(cell.w, cell.h) * 0.04) + 1)) * scale;
  const seed = (cell.x * 31 + cell.y) | 0;
  const c: Hsv = { h: 0, s: 0, v: 0 };
  const o: Rgb = { r: 0, g: 0, b: 0 };
  const bottom = cell.y + cell.h;
  for (let x = cell.x; x < cell.x + cell.w; x++) {
    for (let y = cell.y; y < bottom; y++) {
      const p = (y * width + x) * 4;
      if (data[p + 3]! < OPAQUE) continue;
      if (y > cell.y && data[p - width * 4 + 3]! >= OPAQUE) continue;
      const depth = Math.max(1, Math.round(base * (0.7 + hash(x >> 1, y >> 3, seed) * 0.6)));
      for (let k = 0; k < depth && y + k < bottom; k++) {
        const q = p + k * width * 4;
        if (data[q + 3]! < OPAQUE) break;
        toHsv(data[q]!, data[q + 1]!, data[q + 2]!, c);
        if (glows(c)) continue;
        // The last row of a deep cap is broken, so its lower edge is not a ruled line.
        if (k === depth - 1 && depth > 2 && hash(x, y + k, 7) < 0.5) continue;
        sample(CAP, depth <= 1 ? 0 : k / (depth - 1), o);
        put(data, q, o.r, o.g, o.b);
      }
    }
  }
}
