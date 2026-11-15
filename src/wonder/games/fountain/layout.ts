import { chromeOf } from '../../engine/chrome';
import { clamp } from '../../engine/ease';

/**
 * Where everything in the moonlit square is, from the size of the screen. The great fountain stands
 * at the back in the middle, with the seven jets in a ring of little round pools in front of it,
 * red at one end and pink at the other, so that along the ring they are a rainbow and a scale. The
 * friends stand at the sides of the fountain on a screen held sideways and in a row along the front
 * on one held upright. Every place is in the game's own units.
 */

interface Spot {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

/** A place a friend stands: where her hooves are, and how big she is drawn. */
export interface Stand {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

/** A jet: the nozzle in the middle of its pool, and the pool. */
interface Jet {
  readonly x: number;
  /** Where the water of the pool is, which is where the jewels leave and come back. */
  readonly y: number;
  /** How big it is drawn next to a jet at the front of the ring. */
  readonly scale: number;
  /** Half the width and half the height of the pool. */
  readonly rx: number;
  readonly ry: number;
  /** How wide the strip of the screen is that plays it, from the left to the right of it. */
  readonly left: number;
  readonly right: number;
}

export const JET_COUNT = 7;

/**
 * The fountain's own picture, in the units of the playground's `pg-gem-fountain`. The foot of the
 * basin is the origin and up is negative. The water is an ellipse and the big gem stands on the
 * pillar over the middle of it.
 */
export const GREAT = {
  halfWidth: 95,
  top: -101,
  water: { x: 0, y: -24, rx: 74, ry: 32 },
  gem: { x: 0, y: -84, r: 26 },
} as const;

export interface Plan {
  readonly w: number;
  readonly h: number;
  readonly portrait: boolean;
  /** The line where the grass of the square begins, at the back. */
  readonly horizon: number;
  /** The great fountain: where the foot of its basin is, and how big it is drawn. */
  readonly fountain: { readonly x: number; readonly y: number; readonly s: number };
  /** The big gem on top of it. */
  readonly gem: Spot;
  readonly jets: readonly Jet[];
  /** The square the fountain and the pools stand on, as an ellipse. */
  readonly square: { readonly x: number; readonly y: number; readonly rx: number; readonly ry: number };
  /**
   * The rainbow over the fountain: where its feet are and how wide and tall the outside of it is.
   */
  readonly arch: {
    readonly x: number;
    readonly y: number;
    readonly rx: number;
    readonly ry: number;
    readonly band: number;
  };
  /** The row of friends, or the middle of the sides, and how big each is drawn. */
  readonly friendScale: number;
  /** The width of a friend, so that the ones next to each other are not drawn on one another. */
  readonly friendStep: number;
  readonly friendY: number;
  /** How far apart the jets are. */
  readonly spacing: number;
  /** The wide band the page covers at the top: no jewel is thrown up into it. */
  readonly ceiling: (x: number) => number;
}

/** How much taller than a friend is wide at full size, in units. */
const FRIEND_HEIGHT = 120;

export function planOf(w: number, h: number, unit = 1): Plan {
  const portrait = h > w;
  const over = chromeOf({ w, h, unit });
  const ceiling = (x: number): number => {
    let y = 18;
    for (const r of [over.wayOut, over.corner, over.meter])
      if (x > r.x0 - 24 && x < r.x1 + 24) y = Math.max(y, r.y1 + 10);
    return y;
  };
  const centre = w / 2;

  if (portrait) {
    const spacing = clamp((w - 44) / (JET_COUNT - 1), 38, 66);
    const topOfAll = over.meter.y1 + 14;
    const friendScale = clamp(0.5 * (w / 360), 0.4, 0.58);
    const friendY = Math.min(h - 112, h * 0.86);
    const midY = Math.min(h * 0.7, friendY - FRIEND_HEIGHT * friendScale - 22);
    const endY = midY - clamp(h * 0.07, 34, 60);
    const s = clamp((w / 360) * 1.12, 0.85, 1.4);
    const fountainY = endY - 22 * s;
    return finish({
      w,
      h,
      portrait,
      centre,
      spacing,
      midY,
      endY,
      s,
      fountainY,
      friendScale,
      friendY,
      topOfAll,
      ceiling,
      pool: clamp(spacing * 0.42, 18, 30),
      horizon: Math.max(topOfAll + 40, fountainY - 150 * s),
    });
  }

  const spacing = clamp((w - 130) / (JET_COUNT - 1), 60, 104);
  const friendScale = 0.5;
  const s = clamp(1.25 * (h / 360), 1, 1.5);
  const endY = h * 0.645;
  const midY = h * 0.805;
  const fountainY = endY - 28;
  return finish({
    w,
    h,
    portrait,
    centre,
    spacing,
    midY,
    endY,
    s,
    fountainY,
    friendScale,
    friendY: fountainY - 10,
    topOfAll: over.meter.y1 + 14,
    ceiling,
    pool: clamp(spacing * 0.4, 24, 42),
    horizon: h * 0.43,
  });
}

interface Bits {
  readonly w: number;
  readonly h: number;
  readonly portrait: boolean;
  readonly centre: number;
  readonly spacing: number;
  readonly midY: number;
  readonly endY: number;
  readonly s: number;
  readonly fountainY: number;
  readonly friendScale: number;
  readonly friendY: number;
  readonly topOfAll: number;
  readonly ceiling: (x: number) => number;
  readonly pool: number;
  readonly horizon: number;
}

function finish(b: Bits): Plan {
  const half = (JET_COUNT - 1) / 2;
  const jets: Jet[] = Array.from({ length: JET_COUNT }, (_, i) => {
    const u = (i - half) / half;
    // The ring bows toward the front in the middle, and the pools at the front are a little bigger
    // than the ones at the ends.
    const bow = 1 - u * u;
    const y = b.endY + (b.midY - b.endY) * bow;
    const scale = 0.84 + 0.16 * bow;
    const x = b.centre + (i - half) * b.spacing;
    return {
      x,
      y,
      scale,
      rx: b.pool * scale,
      ry: b.pool * scale * 0.38,
      left: i === 0 ? -Infinity : x - b.spacing / 2,
      right: i === JET_COUNT - 1 ? Infinity : x + b.spacing / 2,
    };
  });
  const ring = (b.spacing * (JET_COUNT - 1)) / 2;
  const archFoot = b.endY - 2;
  const rx = Math.min(ring + b.pool * 0.9, b.w / 2 - 6);
  const ry = Math.max(60, Math.min(rx * (b.portrait ? 1.05 : 0.55), archFoot - b.topOfAll));
  return {
    w: b.w,
    h: b.h,
    portrait: b.portrait,
    horizon: b.horizon,
    fountain: { x: b.centre, y: b.fountainY, s: b.s },
    gem: { x: b.centre, y: b.fountainY + GREAT.gem.y * b.s, r: GREAT.gem.r * b.s },
    jets,
    square: {
      x: b.centre,
      y: (b.fountainY + b.midY) / 2 + 6,
      rx: Math.min(b.w / 2 - 4, ring + b.pool * 2.2),
      ry: (b.midY - b.fountainY) / 2 + b.pool * 1.1,
    },
    arch: { x: b.centre, y: archFoot, rx, ry, band: Math.max(5, Math.min(11, ry * 0.075)) },
    friendScale: b.friendScale,
    friendStep: 124 * b.friendScale * (b.portrait ? 0.7 : 0.62) + (b.portrait ? 0 : 4),
    friendY: b.friendY,
    spacing: b.spacing,
    ceiling: b.ceiling,
  };
}

/**
 * The places `n` friends stand. On a screen held sideways they stand on both sides of the fountain,
 * the first nearest the middle on the left and the second on the right, and so on outward. Upright
 * they stand in a row along the front, the first in the middle.
 */
export function standsOf(n: number, plan: Plan): Stand[] {
  const out: Stand[] = [];
  if (plan.portrait) {
    const step = Math.min(plan.friendStep * 1.05, (plan.w - 20) / Math.max(1, n));
    for (let i = 0; i < n; i++) {
      const slot = i === 0 ? 0 : i % 2 ? -Math.ceil(i / 2) : Math.ceil(i / 2);
      out.push({
        x: plan.fountain.x + slot * step + (n % 2 === 0 ? step / 2 : 0),
        y: plan.friendY + (i % 2) * 4,
        scale: plan.friendScale,
      });
    }
    return out;
  }
  const gap = GREAT.halfWidth * plan.fountain.s + 34;
  for (let i = 0; i < n; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const rank = Math.floor(i / 2);
    out.push({
      x: plan.fountain.x + side * (gap + rank * plan.friendStep * 1.06),
      y: plan.friendY + (rank % 2) * 5,
      scale: plan.friendScale * (1 + rank * 0.0),
    });
  }
  return out;
}

/**
 * Which jet a touch at a place plays, or -1 for none: the nearest jet along the width of the
 * screen, for a touch in the strip of the screen over the ring of pools, from the top of the screen
 * down to a little under the front of the pools.
 */
export function jetAt(plan: Plan, x: number, y: number): number {
  const first = plan.jets[0]!;
  const last = plan.jets[JET_COUNT - 1]!;
  const under = Math.max(...plan.jets.map((j) => j.y + j.ry)) + 30;
  if (y > under || y < 0) return -1;
  if (x < first.x - plan.spacing * 0.6 || x > last.x + plan.spacing * 0.6) return -1;
  for (let i = 0; i < JET_COUNT; i++) if (x >= plan.jets[i]!.left && x < plan.jets[i]!.right) return i;
  return -1;
}
