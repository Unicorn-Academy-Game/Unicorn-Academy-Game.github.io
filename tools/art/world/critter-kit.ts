import { hex, type RGB, ramp } from '../core/color';
import type { Rgba } from '../core/image';
import { norm, type V3 } from '../core/vec';
import type { Painter } from './paint';
import type { Ramp } from './palette';
import { renderScene, type SceneBuilder } from './scene';

/**
 * What every little creature is built from: a place to draw, a way to colour it and a few shapes
 * that keep showing up.
 */

export interface Canvas {
  w: number;
  h: number;
  /** The point on the ground under the creature's middle. */
  ox: number;
  oy: number;
}

/** A six-step ramp tuned like the rest of the world: cool shadows, warm lights. */
export const tone = (base: string, shadowHue = 285, lightHue = 85): Ramp =>
  ramp(hex(base), { steps: 6, shadowHue, lightHue, lean: 1, lightness: [-0.32, -0.21, -0.1, 0, 0.09, 0.17] });

/**
 * Draws a built scene small and crisp: a tight ambient-occlusion radius and a thin inner line, as a
 * creature this size wants.
 */
export function drawTiny(
  b: SceneBuilder,
  c: Canvas,
  o: Partial<Parameters<typeof renderScene>[1]> = {},
): { rgba: Rgba; at: (p: V3) => [number, number] } {
  const r = renderScene(b, {
    width: c.w,
    height: c.h,
    originX: c.ox,
    originY: c.oy,
    ss: 4,
    aoRadius: 4,
    lineDepth: 3,
    shadowStrength: 0.4,
    ...o,
  });
  return { rgba: r.rgba, at: r.at };
}

const LIGHT: V3 = norm([-0.5, -0.6, 0.62]);

/**
 * A shaded ellipse painted in 2D, lit from the upper left and stepped through a ramp: the way to
 * draw something too small to be worth a mesh. `colorAt` may take over a pixel (spots, a seam)
 * given where it sits on the dome, from -1 to 1.
 */
export function dome(
  p: Painter,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  colors: Ramp,
  o: {
    colorAt?: (nx: number, ny: number, lit: number) => RGB | null;
    outline?: RGB;
    skip?: (nx: number, ny: number) => boolean;
  } = {},
): void {
  const edge = (1 - 1.2 / Math.min(rx, ry)) ** 2;
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      const nx = (x + 0.5 - cx) / rx,
        ny = (y + 0.5 - cy) / ry;
      const d2 = nx * nx + ny * ny;
      if (d2 > 1 || o.skip?.(nx, ny)) continue;
      const nz = Math.sqrt(1 - d2);
      const lit = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
      // A shade of ambient light, so the side away from the light is a deeper colour and not a
      // different one.
      const band = Math.min(colors.length - 1, Math.floor((0.28 + 0.72 * lit) * colors.length));
      const own = o.colorAt?.(nx, ny, lit);
      if (own) p.px(x, y, own);
      else p.px(x, y, d2 > edge && o.outline ? o.outline : colors[band]!);
    }
  }
}

/** A step between two ramp colours by how lit a pixel is. */
export const rampAt = (colors: Ramp, lit: number): RGB =>
  colors[Math.min(colors.length - 1, Math.floor(lit * colors.length))]!;
