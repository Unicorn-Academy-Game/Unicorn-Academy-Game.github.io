import { clamp } from '../../engine/ease';

/**
 * How a heap of treasure sits in the chest. Each piece that has landed has a place on a mound, and
 * the mound grows as there are more of them, so the pieces already in it are lifted a little with
 * each one that lands, as they would be. The same piece is always in the same place for the same
 * count, so a heap never shuffles when nothing has been added.
 */

/**
 * The most pieces drawn in a heap. Past it the heap keeps growing taller, with the same pieces, and
 * no more are drawn.
 */
export const HEAP_CAP = 30;

export interface Spot {
  /** Across the bay, from -1 to 1. */
  readonly u: number;
  /** Up from the rim, as a share of the tallest the heap gets, 0 to 1. */
  readonly rise: number;
  /** How it lies, in turns, so that no two pieces are alike. */
  readonly turn: number;
  /** Larger is nearer the front, so that it is drawn after the pieces behind it. */
  readonly depth: number;
}

const GOLDEN = 0.6180339887;
const frac = (x: number): number => x - Math.floor(x);

/** How full the heap looks for this many pieces, 0 to 1: quick at first, and then slowly. */
export const fullness = (total: number): number => 1 - Math.exp(-total / 15);

/** How many pieces are drawn in a heap of this many. */
export const drawn = (total: number): number => Math.min(HEAP_CAP, Math.max(0, Math.floor(total)));

/**
 * Where the `n`th piece of a heap is, when it has `shown` pieces in it. `shown` may be a fraction
 * while one is landing.
 */
export function spotOf(n: number, shown: number): Spot {
  // Spread over the width a little more thickly in the middle, where a mound is.
  const raw = frac(n * GOLDEN + 0.31) * 2 - 1;
  const u = Math.sign(raw) * Math.abs(raw) ** 1.25;
  const dome = 1 - u * u;
  // Each piece lies somewhere between the bottom of the mound and its surface, the later ones
  // nearer the surface.
  const depth = frac(n * 0.7548776662 + 0.12);
  const lie = 0.35 + 0.65 * (0.4 * depth + 0.6 * clamp(n / Math.max(1, shown - 1)));
  const rise = clamp(dome * lie * (0.18 + 0.82 * fullness(shown)));
  return { u, rise, turn: frac(n * 0.381966 + 0.77) - 0.5, depth };
}

/** The pieces of a heap in the order to draw them, from the back of it to the front. */
export function heapOf(shown: number): Spot[] {
  const n = drawn(shown);
  const spots: Spot[] = [];
  for (let i = 0; i < n; i++) spots.push(spotOf(i, shown));
  return spots.sort((a, b) => a.rise - b.rise || a.depth - b.depth);
}
