import type { SeasonId } from '../../shared/seasons';
import { type Hsv, hash, luma, put, type Rgb, sample, smooth, toHsv } from './color';
import { BLOSSOM_SPECKS, GROUND_SNOW, ICE, LEAF_LITTER, MEADOW_AUTUMN, MEADOW_SPRING, PATH_SNOW } from './palettes';
import type { Pixels } from './pixels';

type Ground = 'grass' | 'dirt' | 'water' | 'other';

/**
 * What a pixel of a ground tile is, by its colour: the grass is green, the paths and the sand are
 * brown and tan, the water is blue.
 */
function groundOf(c: Hsv): Ground {
  if (c.h >= 58 && c.h < 172 && c.s >= 0.16 && c.v >= 0.15) return 'grass';
  if (c.h >= 172 && c.h < 250 && c.s >= 0.18) return 'water';
  if (c.h >= 8 && c.h < 58 && c.s >= 0.15) return 'dirt';
  return 'other';
}

/**
 * A place in the ground that is a speck of something, for the autumn leaves lying about and the
 * spring blossom. Two pixels square, so that it shows.
 */
const speck = (x: number, y: number, seed: number, chance: number): boolean => hash(x >> 1, y >> 1, seed) < chance;

/**
 * Recolours the ground tiles for a season, in place. It goes by colour and not by tile, so the edge
 * where grass meets sand or water comes out right whichever tile it is drawn on. Summer is the
 * tiles as they were drawn, and the alpha of every pixel is left alone.
 */
export function dressTiles(px: Pixels, season: SeasonId): void {
  if (season === 'summer') return;
  const { width, height, data } = px;
  const c: Hsv = { h: 0, s: 0, v: 0 };
  const o: Rgb = { r: 0, g: 0, b: 0 };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      if (data[p + 3] === 0) continue;
      const r = data[p]!;
      const g = data[p + 1]!;
      const b = data[p + 2]!;
      toHsv(r, g, b, c);
      const kind = groundOf(c);
      if (kind === 'other' && !(season === 'winter' && c.s >= 0.3)) continue;
      if (season === 'winter') winter(data, p, kind, c, r, g, b, o);
      else if (season === 'autumn') autumn(data, p, kind, c, x, y, r, g, b, o);
      else spring(data, p, kind, c, x, y, o);
    }
  }
}

function winter(data: Pixels['data'], p: number, kind: Ground, c: Hsv, r: number, g: number, b: number, o: Rgb): void {
  switch (kind) {
    case 'grass':
      sample(GROUND_SNOW, smooth(0.28, 0.86, c.v), o);
      break;
    case 'dirt':
      sample(PATH_SNOW, smooth(0.3, 0.98, c.v), o);
      break;
    case 'water':
      sample(ICE, smooth(0.4, 1, c.v), o);
      break;
    case 'other': {
      // Flowers and the like in the ground are under a dusting of snow, with a little of their
      // colour showing through.
      sample(GROUND_SNOW, smooth(0.28, 0.9, luma(r, g, b)), o);
      o.r = o.r * 0.78 + r * 0.22;
      o.g = o.g * 0.78 + g * 0.22;
      o.b = o.b * 0.78 + b * 0.22;
      break;
    }
  }
  put(data, p, o.r, o.g, o.b);
}

function autumn(
  data: Pixels['data'],
  p: number,
  kind: Ground,
  c: Hsv,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  o: Rgb,
): void {
  if (kind === 'grass') {
    const t = smooth(0.25, 0.85, c.v);
    sample(MEADOW_AUTUMN, t, o);
    if (t > 0.3 && speck(x, y, 11, 0.011)) {
      const litter = LEAF_LITTER[Math.floor(hash(x >> 1, y >> 1, 12) * LEAF_LITTER.length)]!;
      const shade = y & 1 ? 0.82 : 1;
      o.r = litter[0] * shade;
      o.g = litter[1] * shade;
      o.b = litter[2] * shade;
    }
    put(data, p, o.r, o.g, o.b);
  } else if (kind === 'water') {
    // The pond cools and darkens a little, with less colour in it.
    const grey = luma(r, g, b) * 255;
    put(data, p, (grey + (r - grey) * 0.8) * 0.93, (grey + (g - grey) * 0.8) * 0.93, (grey + (b - grey) * 0.8) * 0.93);
  }
}

function spring(data: Pixels['data'], p: number, kind: Ground, c: Hsv, x: number, y: number, o: Rgb): void {
  if (kind !== 'grass') return;
  const t = smooth(0.25, 0.85, c.v);
  sample(MEADOW_SPRING, t, o);
  if (t > 0.35 && speck(x, y, 21, 0.006)) {
    const bloom = BLOSSOM_SPECKS[Math.floor(hash(x >> 1, y >> 1, 22) * BLOSSOM_SPECKS.length)]!;
    const shade = y & 1 ? 0.9 : 1;
    o.r = bloom[0] * shade;
    o.g = bloom[1] * shade;
    o.b = bloom[2] * shade;
  }
  put(data, p, o.r, o.g, o.b);
}
