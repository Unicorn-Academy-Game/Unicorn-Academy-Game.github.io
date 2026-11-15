import type { V3 } from '../core/vec';
import { COAT_PARTS, PART } from './parts';
import type { Decal } from './spec';

/** +1 is the unicorn's left (model +Y), -1 its right. */
export type Side = 1 | -1;

const astroid = (dx: number, dz: number, size: number, sharp: number): boolean =>
  (Math.abs(dx) / size) ** sharp + (Math.abs(dz) / size) ** sharp < 1;

/** Four-point sparkle painted on a flank, measured in the x/z plane of the unposed model. */
export function sparkle(
  paint: string,
  side: Side,
  x: number,
  z: number,
  size: number,
  rot = 0,
  parts: readonly number[] = COAT_PARTS,
): Decal {
  const c = Math.cos(rot),
    s = Math.sin(rot);
  return {
    paint,
    test: (r: V3, part: number) => {
      if (!parts.includes(part) || Math.sign(r[1]) !== side || Math.abs(r[1]) < 4) return false;
      const dx = r[0] - x,
        dz = r[2] - z;
      return astroid(dx * c + dz * s, -dx * s + dz * c, size, 0.5);
    },
  };
}

/** Round spot on a flank. */
export function spot(
  paint: string,
  side: Side,
  x: number,
  z: number,
  radius: number,
  parts: readonly number[] = COAT_PARTS,
): Decal {
  return {
    paint,
    test: (r: V3, part: number) =>
      parts.includes(part) && Math.sign(r[1]) === side && Math.abs(r[1]) > 4 && Math.hypot(r[0] - x, r[2] - z) < radius,
  };
}

/** Five-petal flower painted on a flank. */
export function flower(paint: string, centerPaint: string, side: Side, x: number, z: number, radius: number): Decal[] {
  return [
    spot(centerPaint, side, x, z, radius * 0.28),
    {
      paint,
      test: (r: V3, part: number) => {
        if (!COAT_PARTS.includes(part) || Math.sign(r[1]) !== side || Math.abs(r[1]) < 4) return false;
        const dx = r[0] - x,
          dz = r[2] - z;
        const d = Math.hypot(dx, dz);
        const a = Math.atan2(dz, dx);
        return d < radius * (0.62 + 0.38 * Math.max(0, Math.cos(a * 5)));
      },
    },
  ];
}

const triangle = (t: number): number => Math.abs((((t % 4) + 4) % 4) - 2) - 1;

/** A jagged white blaze from the forehead down the nose bridge, in head-local space. */
export function lightningBlaze(paint: string, from = 6, to = 29): Decal {
  return {
    paint,
    test: (_r: V3, part: number, h: V3 | null) => {
      if (!h || part !== PART.head || h[0] < from || h[0] > to) return false;
      const f = (h[0] - from) / (to - from);
      const center = 2.1 * triangle((h[0] - from) / 3.4) * (1 - 0.35 * f);
      const half = 2.5 - 1.5 * f;
      return h[2] > (h[0] > 12 ? 0.4 : 2) && Math.abs(h[1] - center) < half;
    },
  };
}
