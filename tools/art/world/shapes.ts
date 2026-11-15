import type { P2 } from './arch';

/**
 * A rectangle with its top corners and its bottom corners rounded by `top` and `bottom`,
 * counter-clockwise, for the front of a cabinet.
 */
export function roundRect(x0: number, z0: number, x1: number, z1: number, top: number, bottom = 0, steps = 6): P2[] {
  const out: P2[] = [];
  const corner = (cx: number, cz: number, r: number, from: number): void => {
    if (r <= 0) {
      out.push([cx, cz]);
      return;
    }
    for (let i = 0; i <= steps; i++) {
      const a = from + (i / steps) * (Math.PI / 2);
      out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
  };
  corner(x1 - bottom, z0 + bottom, bottom, -Math.PI / 2);
  corner(x1 - top, z1 - top, top, 0);
  corner(x0 + top, z1 - top, top, Math.PI / 2);
  corner(x0 + bottom, z0 + bottom, bottom, Math.PI);
  return out;
}
