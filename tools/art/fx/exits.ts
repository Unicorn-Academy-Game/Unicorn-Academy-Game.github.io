import { EXIT_SPRITE } from '../../../src/content/exits';
import { hex, type RGB, ramp } from '../core/color';
import { createRgba, type Rgba } from '../core/image';
import { Canvas2D, ellipse, polygon, ring } from './kit';
import type { FxSprite } from './sprites';

/**
 * What marks a way out. A grown-up finds a door by reading; a small child finds it by seeing a
 * place that glows and a big arrow that hops above it, so all three pictures are drawn in light
 * neutral tones and the game tints them for where the exit leads: green for the forest, pink for
 * the garden and so on.
 */

const PEARL = ramp(hex('#fffdfa'), {
  steps: 5,
  shadowHue: 275,
  lightHue: 80,
  lightness: [-0.34, -0.2, -0.08, 0, 0.04],
});
const dim = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const threshold = (x: number, y: number): number => (BAYER[(y & 3) * 4 + (x & 3)]! + 0.5) / 16;

/**
 * A fat arrow pointing down, with a rounded bevel, a bright edge down its left and an outline dark
 * enough to read on grass or stone.
 */
export function exitArrow(): Rgba {
  const c = new Canvas2D(60, 72);
  const arrow = polygon([
    [20, 5],
    [40, 5],
    [40, 32],
    [54, 32],
    [30, 66],
    [6, 32],
    [20, 32],
  ]);
  c.fill(arrow, PEARL, { bevel: 6, gain: 1.15, base: 0.78 });
  c.line(25, 11, 25, 29, [255, 255, 255], 2);
  c.line(14, 36, 29, 57, [255, 255, 255], 1.6);
  c.outline((n) => dim(n, 0.46));
  c.outline((n) => dim(n, 0.3), true);
  return c.rgba();
}

/**
 * A column of light standing on the exit, brightest at its foot and gone at its top, in five
 * dithered bands so it keeps to the pixel look. Drawn white; the game adds it to the picture,
 * tinted.
 */
export function exitBeam(): Rgba {
  const w = 64,
    h = 224;
  const img = createRgba(w, h);
  const bands = 5;
  for (let y = 0; y < h; y++) {
    const up = 1 - y / (h - 1);
    // Strongest in the bottom quarter, then thinning toward the sky.
    const along = (1 - up) ** 1.7;
    // The beam also narrows a little as it climbs.
    const half = (w / 2) * (0.55 + 0.45 * (1 - up));
    for (let x = 0; x < w; x++) {
      const across = 1 - Math.abs(x + 0.5 - w / 2) / half;
      if (across <= 0) continue;
      const f = across ** 1.15 * along * bands;
      const level = Math.floor(f);
      const step = level + (f - level > threshold(x, y) ? 1 : 0);
      const a = Math.min(1, step / bands) * 0.85;
      if (a <= 0) continue;
      const i = (y * w + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  return img;
}

/**
 * The glowing place on the ground an exit stands on: a soft disc in the ground's tilt, with a
 * bright ring near its edge.
 */
export function exitPad(): Rgba {
  const w = 192,
    h = 96;
  const c = new Canvas2D(w, h);
  const cx = w / 2,
    cy = h / 2;
  const bands = 5;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot((x + 0.5 - cx) / (w / 2), (y + 0.5 - cy) / (h / 2));
      if (d >= 1) continue;
      const f = (1 - d) ** 0.9 * bands;
      const level = Math.floor(f);
      const step = level + (f - level > threshold(x, y) ? 1 : 0);
      const a = Math.min(1, step / bands) * 0.62;
      if (a > 0) c.pixel(x, y, [255, 255, 255], Math.round(a * 255));
    }
  }
  c.flat(ring(cx, cy, w * 0.43, 5, 0.5), [255, 255, 255], 235);
  c.flat(ring(cx, cy, w * 0.43 - 5.5, 2, 0.5), [255, 255, 255], 150);
  // A small bright heart of light in the middle, where the herd steps.
  c.flat(ellipse(cx, cy, 16, 8), [255, 255, 255], 190);
  c.flat(ellipse(cx, cy, 8, 4), [255, 255, 255], 255);
  return c.rgba();
}

export const EXIT_SPRITES: readonly FxSprite[] = [
  { id: EXIT_SPRITE.arrow, w: 60, h: 72, ox: 30, oy: 68, render: exitArrow },
  { id: EXIT_SPRITE.beam, w: 64, h: 224, ox: 32, oy: 220, render: exitBeam },
  { id: EXIT_SPRITE.pad, w: 192, h: 96, ox: 96, oy: 48, render: exitPad },
];
