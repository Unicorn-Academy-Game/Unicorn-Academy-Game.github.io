import { clamp } from '../../engine/ease';

/**
 * Where everything in the pond is, for the size of the screen. Eight lily pads wind across the
 * water: the first is the frog's home and the other seven each carry a lotus bud, one for each
 * colour of the rainbow, in the order of the scale. Held sideways the path runs from the left of
 * the screen to the right, and upright it runs from the bottom to the top, so that going along it
 * is always going up in sound.
 */

export const LOTUS_COUNT = 7;
export const PAD_COUNT = LOTUS_COUNT + 1;
/** The pad the frog lives on, and starts on. It has no lotus. */
export const HOME = 0;

export interface Pad {
  readonly x: number;
  readonly y: number;
  /** Half the width of the pad, and half its height as the eye has it, seen from a little above. */
  readonly rx: number;
  readonly ry: number;
  /** Which lotus it carries, 0 to 6, or -1 for the home pad. */
  readonly lotus: number;
}

interface Seat {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

export interface Stand {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

export interface Plan {
  readonly w: number;
  readonly h: number;
  readonly portrait: boolean;
  /** Where the far bank meets the water. */
  readonly horizon: number;
  /** Where the water meets the near bank, along the whole front. */
  readonly shore: number;
  readonly pads: readonly Pad[];
  /** Where the two other frogs sit, on little pads of their own, until the pond sings. */
  readonly seats: readonly Seat[];
  /** How big a frog is drawn. */
  readonly frog: number;
  /** How tall an open lotus stands over its pad. */
  readonly lotusHeight: number;
  readonly sun: { readonly x: number; readonly y: number; readonly r: number };
  readonly friendScale: number;
  readonly friendStep: number;
  readonly friendY: number;
}

/**
 * The path of the pads, along the pond (`s`, 0 to 1) and across it (`t`, 0 the far side and 1 the
 * near), for a screen held sideways.
 */
const PATH: readonly (readonly [number, number])[] = [
  [0.07, 0.85],
  [0.2, 0.12],
  [0.33, 0.78],
  [0.45, 0.2],
  [0.57, 0.9],
  [0.69, 0.08],
  [0.81, 0.72],
  [0.93, 0.22],
];

/**
 * The path upright. Pads are further apart across the narrow screen, so it zigzags less near the
 * bottom and more near the top.
 */
const UPRIGHT: readonly (readonly [number, number])[] = [
  [0.0, 0.5],
  [0.14, 0.8],
  [0.28, 0.24],
  [0.42, 0.78],
  [0.56, 0.26],
  [0.7, 0.76],
  [0.84, 0.3],
  [1.0, 0.62],
];

export function planOf(w: number, h: number, _unit: number): Plan {
  const portrait = h > w;
  const rx = portrait ? clamp(w * 0.088, 28, 38) : clamp(w * 0.042, 26, 36);
  const ry = rx * 0.6;
  const horizon = portrait ? h * 0.24 : h * 0.29;
  const shore = portrait ? h * 0.8 : h * 0.835;
  const pads: Pad[] = [];
  if (portrait) {
    const left = rx + 18;
    const right = w - rx - 18;
    const top = horizon + 70;
    const bottom = shore - ry - 30;
    UPRIGHT.forEach(([s, t], i) => {
      pads.push({ x: left + t * (right - left), y: bottom - s * (bottom - top), rx, ry, lotus: i - 1 });
    });
  } else {
    const left = rx + 22;
    const right = w - rx - 22;
    const top = h * 0.4;
    const bottom = h * 0.72;
    PATH.forEach(([s, t], i) => {
      pads.push({ x: left + s * (right - left), y: top + t * (bottom - top), rx, ry, lotus: i - 1 });
    });
  }
  const seats: Seat[] = portrait
    ? [
        { x: w * 0.13, y: horizon + 44, scale: 0.9 },
        { x: w * 0.87, y: horizon + 44, scale: 0.9 },
      ]
    : [
        { x: pads[2]!.x, y: horizon + 28, scale: 0.9 },
        { x: pads[6]!.x, y: horizon + 28, scale: 0.9 },
      ];
  const friendScale = portrait ? 0.84 : 0.78;
  return {
    w,
    h,
    portrait,
    horizon,
    shore,
    pads,
    seats,
    frog: rx / 26,
    lotusHeight: rx * 1.7,
    sun: portrait ? { x: w * 0.68, y: horizon - 10, r: 54 } : { x: w * 0.74, y: horizon - 6, r: 62 },
    friendScale,
    friendStep: portrait ? 62 : 66,
    friendY: portrait ? h - 56 : h - 16,
  };
}

/**
 * Where `n` friends stand on the near bank. Sideways they stand in a row from the left, the first
 * at the left end, leaving the right for the buttons that come when the game is over. Upright they
 * stand in a row along the middle, the first in the middle.
 */
export function standsOf(n: number, plan: Plan): Stand[] {
  const out: Stand[] = [];
  const step = Math.min(plan.friendStep, (plan.w - 40) / Math.max(1, n));
  if (plan.portrait) {
    for (let i = 0; i < n; i++) {
      const slot = i === 0 ? 0 : i % 2 ? -Math.ceil(i / 2) : Math.ceil(i / 2);
      out.push({
        x: plan.w / 2 + slot * step + (n % 2 === 0 ? step / 2 : 0),
        y: plan.friendY + (i % 2) * 5,
        scale: plan.friendScale,
      });
    }
    return out;
  }
  const left = 52;
  for (let i = 0; i < n; i++) out.push({ x: left + i * step, y: plan.friendY + (i % 2) * 5, scale: plan.friendScale });
  return out;
}

/** How far a point is from a pad, in half widths of it: 1 at its edge, and less inside. */
function reach(pad: Pad, x: number, y: number, lotusHeight: number): number {
  const dx = Math.abs(x - pad.x);
  const dy = y - pad.y;
  // The pad itself, a little generously, as a thumb is wide.
  const onPad = Math.hypot(dx / (pad.rx * 1.25), dy / (pad.ry * 1.9));
  if (pad.lotus < 0 || dy >= 0) return onPad;
  // The lotus on it: a tall narrow place over the pad, up to the top of the flower.
  const overLotus = dy > -(lotusHeight + 10) ? dx / (pad.rx * 0.85) : Infinity;
  return Math.min(onPad, overLotus);
}

/**
 * Which pad a touch at a place is on, or -1 for water. The nearest to the touch wins where two are
 * close.
 */
export function padAt(plan: Plan, x: number, y: number): number {
  let best = -1;
  let least = 1;
  plan.pads.forEach((pad, i) => {
    const r = reach(pad, x, y, plan.lotusHeight);
    if (r < least) {
      least = r;
      best = i;
    }
  });
  return best;
}

/** The place a frog stands on a pad: a little above the middle of it, toward the front. */
export const standingOn = (pad: Pad): { x: number; y: number } => ({ x: pad.x, y: pad.y + pad.ry * 0.12 });
