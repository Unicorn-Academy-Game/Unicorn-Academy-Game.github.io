import type { RGB } from '../core/color';
import type { SampleInfo } from '../core/render';
import { hash2 } from '../core/rng';
import type { Ramp } from './palette';

const PITCH = (27 * Math.PI) / 180;

/**
 * Wall and roof surfaces for buildings. Courses and tiles are sized in final pixels, so a building
 * drawn at a different scale from the camera's unit still gets whole rows of stone and one-pixel
 * mortar.
 */
export interface WallScale {
  /** Units of height that make `px` rows on screen. */
  rowUnits: (px: number) => number;
  /** Units along a wall that make `px` columns on screen. */
  colUnits: (px: number) => number;
}

export const wallScale = (scale: number): WallScale => ({
  rowUnits: (px) => px / (scale * Math.cos(PITCH)),
  colUnits: (px) => px / scale,
});

/** Stone blocks: rows by height, columns along the wall, every other row shifted half a block. */
export function masonry(
  o: { rowH: number; blockW: number; round?: { cx: number; cy: number; r: number }; seed: number },
  s: WallScale,
) {
  return (sample: SampleInfo): { mortar: boolean; tone: number } => {
    if (Math.abs(sample.n[2]) > 0.72) return { mortar: false, tone: 0 };
    const [x, y, z] = sample.rest;
    const along = o.round
      ? Math.atan2(y - o.round.cy, x - o.round.cx) * o.round.r
      : Math.abs(sample.n[0]) > 0.6
        ? y
        : x;
    const row = Math.floor(z / o.rowH);
    const shifted = along + (row % 2 === 0 ? 0 : o.blockW / 2);
    const col = Math.floor(shifted / o.blockW);
    const inRow = z - row * o.rowH;
    const inCol = shifted - col * o.blockW;
    return { mortar: inRow < s.rowUnits(1.1) || inCol < s.colUnits(1.4), tone: (hash2(row, col, o.seed) - 0.5) * 0.04 };
  };
}

/** Roof tiles: staggered rows, each with a dark lower lip. */
export function tiles(o: {
  rowH: number;
  tileW: number;
  round?: { cx: number; cy: number; r: number; z0: number };
  seed: number /** The direction a row of tiles runs. Default x. */;
  along?: 'x' | 'y';
}) {
  return (sample: SampleInfo): { lip: boolean; tone: number } => {
    const [x, y, z] = sample.rest;
    const down = o.round ? z - o.round.z0 : z;
    const along = o.round
      ? Math.atan2(y - o.round.cy, x - o.round.cx) * o.round.r * (1 - Math.min(0.8, down / 900))
      : o.along === 'y'
        ? y
        : x;
    const row = Math.floor(down / o.rowH);
    const shifted = along + (row % 2 === 0 ? 0 : o.tileW / 2);
    const col = Math.floor(shifted / o.tileW);
    const inRow = (down - row * o.rowH) / o.rowH;
    const inCol = (shifted - col * o.tileW) / o.tileW;
    const lip = inRow < 0.2 + 0.16 * (Math.abs(inCol - 0.5) * 2) ** 2;
    return { lip, tone: (hash2(row, col, o.seed) - 0.5) * 0.05 };
  };
}

/** A ramp darkened and tinted, for mortar lines and roof lips. */
export const shade = (ramp: Ramp, m: number, tint?: RGB): RGB[] =>
  ramp.map((c) => [
    Math.round(c[0] * m * (tint ? tint[0] / 255 : 1)),
    Math.round(c[1] * m * (tint ? tint[1] / 255 : 1)),
    Math.round(c[2] * m * (tint ? tint[2] / 255 : 1)),
  ]);
