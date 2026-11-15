import type { Vec2 } from '../shared/ids';

/**
 * Where the rainbow stands over the palace garden's fountain. The host of the rainbow is a prop at
 * the middle of the line between the tips of the two statues' horns, and everything here is
 * measured from it, in world units, with y growing downward.
 *
 * `tools/art/world/fountain-horns.ts` finds the tips in the statues' art, and a test keeps these
 * numbers equal to what it finds and to where the map puts the statues and the host, so the arch is
 * drawn and sparkled where the horns are.
 */
export const HORN_TIPS = {
  left: { x: -232, y: 0 },
  right: { x: 232, y: 0 },
} as const satisfies Record<string, Vec2>;

/**
 * The middle of the arch's bands stands `rise` above the line between the horns. It is made of
 * `bands` bands, each `band` thick.
 */
export const ARCH = { rise: 166, bands: 7, band: 6 } as const;

/**
 * How far above the line between the horns the arch reaches over its apex: the outermost band and
 * the pixel of outline round it.
 */
export const ARCH_TOP = ARCH.rise + (ARCH.bands * ARCH.band) / 2 + 1;

const HALF_SPAN = (HORN_TIPS.right.x - HORN_TIPS.left.x) / 2;

/**
 * A point on the arch, as an offset from the host. `along` runs from the left horn (0) over the top
 * (0.5) to the right horn (1), and `across` is how far out from the middle of the bands the point
 * lies, with outward and upward positive. The painted bands and the sparkles that ride them are
 * both found with this, which keeps them on the same curve.
 */
export function archPoint(along: number, across = 0): Vec2 {
  const angle = Math.PI * along;
  const x = -HALF_SPAN * Math.cos(angle);
  const y = -ARCH.rise * Math.sin(angle);
  const normalX = x / (HALF_SPAN * HALF_SPAN);
  const normalY = y / (ARCH.rise * ARCH.rise);
  const length = Math.hypot(normalX, normalY);
  return { x: x + (across * normalX) / length, y: y + (across * normalY) / length };
}

/**
 * How far out from the middle of the bands the middle of band `index` lies, counting from the
 * outermost, which is red.
 */
export const bandOffset = (index: number): number => ((ARCH.bands - 1) / 2 - index) * ARCH.band;

/**
 * The water of the fountain's basin as the ellipse it is drawn as, measured from the host. The
 * glitter that drifts down from the arch lands on it. A test keeps these numbers equal to the
 * basin's art and to where the map puts the basin.
 */
export const WATER = { x: 0, y: 110, rx: 149, ry: 68 } as const;

/**
 * A point on the water. `angle` goes round it from the right, which is 0, by way of the front, a
 * quarter turn, to the left, and `share` is how far out from the middle it lies, from 0 to 1.
 */
export function waterPoint(angle: number, share: number): Vec2 {
  return { x: WATER.x + Math.cos(angle) * WATER.rx * share, y: WATER.y + Math.sin(angle) * WATER.ry * share };
}

/**
 * The part of the water the glitter comes down on: the front, which nothing stands in front of, and
 * clear of the bowls in the middle.
 */
export const LANDING = { angle: [0.12 * Math.PI, 0.88 * Math.PI], share: [0.5, 0.82] } as const;
