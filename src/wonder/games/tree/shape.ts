/**
 * The fir the player dresses, in its own units: 100 from the tip to the lowest bough, and the
 * middle of it at x = 0. The art draws it, and the layout puts the places for the ornaments and the
 * lights on it, so both read the one answer.
 */

/** A bough: a tier of the tree, narrow at the top and wide at its scalloped lower edge. */
export interface Tier {
  readonly apex: number;
  readonly bottom: number;
  readonly half: number;
}

export const TIERS: readonly Tier[] = [
  { apex: -3, bottom: 31, half: 18 },
  { apex: 16, bottom: 53, half: 28 },
  { apex: 36, bottom: 77, half: 38 },
  { apex: 57, bottom: 101, half: 48 },
];

/** The trunk, below the lowest bough. */
export const TRUNK = { half: 7, top: 92, bottom: 113 } as const;

/** The tip of the tree to the foot of its trunk. */
export const TREE_HEIGHT = TRUNK.bottom;
/** How far above the tip the star on top reaches. */
export const CROWN = 17;

/** The size of the picture of a present, in units, and how far down it its base is. */
export const GIFT = { w: 46, h: 46, base: 42 } as const;
/** The widest the tree is, which is the lowest bough. */
export const TREE_WIDTH = TIERS[TIERS.length - 1]!.half * 2;

export interface Spot {
  readonly x: number;
  readonly y: number;
}

/**
 * Where an ornament can hang: on the foliage of each bough, where its hem tucks over the bough
 * below, and far enough in from the edge that the ornament hangs on the tree and not in the air.
 * Twenty-four, which is more than it takes to fill the five stars.
 */
export const HOOKS: readonly Spot[] = [
  // The top bough.
  { x: 0, y: 11 },
  { x: -6, y: 21 },
  { x: 6, y: 22 },
  { x: -11, y: 29 },
  { x: 11, y: 29 },
  // The second.
  { x: -8, y: 38 },
  { x: 8, y: 39 },
  { x: 0, y: 46 },
  { x: -18, y: 49 },
  { x: 18, y: 50 },
  // The third.
  { x: -9, y: 60 },
  { x: 9, y: 61 },
  { x: 0, y: 68 },
  { x: -22, y: 69 },
  { x: 22, y: 70 },
  { x: -31, y: 75 },
  { x: 31, y: 75 },
  // The lowest.
  { x: -12, y: 85 },
  { x: 12, y: 86 },
  { x: -25, y: 89 },
  { x: 0, y: 90 },
  { x: 25, y: 90 },
  { x: -34, y: 92 },
  { x: 34, y: 92 },
];

/**
 * How a bough is drawn, as shares of its own size: the side is one curve from the tip that bows in
 * toward the middle, and the lower edge is a row of scallops that begins `LIP` above the bottom.
 */
export const BOUGH = { bend: 0.3, drop: 0.46, lip: 3 } as const;

/** The point `u` of the way down the curve of the right side of a bough, from 0 at its tip. */
export function edgeOf(t: Tier, u: number): Spot {
  const span = t.bottom - t.apex;
  const cx = t.half * BOUGH.bend;
  const cy = t.apex + span * BOUGH.drop;
  const v = 1 - u;
  return {
    x: 2 * v * u * cx + u * u * t.half,
    y: v * v * t.apex + 2 * v * u * cy + u * u * (t.bottom - BOUGH.lip),
  };
}

/** How far out the silhouette reaches at a height, from the middle. */
export function halfWidthAt(y: number): number {
  let half = 0;
  for (const t of TIERS) {
    if (y < t.apex || y > t.bottom + 4) continue;
    if (y >= t.bottom - BOUGH.lip) {
      half = Math.max(half, t.half);
      continue;
    }
    // The curve only goes down, so the share of it at this height is found by halving.
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      if (edgeOf(t, mid).y < y) lo = mid;
      else hi = mid;
    }
    half = Math.max(half, edgeOf(t, (lo + hi) / 2).x);
  }
  return half;
}

/**
 * A string of little lights swagged down the tree from the top, each on the other side of the last
 * and further out as the tree widens, and always inside it.
 */
export const LIGHTS: readonly Spot[] = Array.from({ length: 20 }, (_, i): Spot => {
  const y = 8 + i * 4.5;
  return { x: Math.round(Math.sin(i * 3.1 + 1.2) * halfWidthAt(y) * 0.62 * 10) / 10, y };
});
