import type { RGB } from '../../engine/color';
import { clamp, easeOutBack, easeOutCubic } from '../../engine/ease';
import { PITCHES } from './notes';

/**
 * The balloon rainbow the finale builds: half-ellipses of small balloons, red on the outside to
 * purple on the inside, each balloon with a place on it. Where the places are is worked out here
 * once, so the game only has to fly balloons to them.
 */

/**
 * Red, orange, yellow, green, blue, purple. Five of the six are the colours of the notes, so the
 * rainbow is made of them.
 */
export const RING_COLORS: readonly RGB[] = [
  PITCHES[0].color,
  PITCHES[1].color,
  PITCHES[2].color,
  [74, 205, 110],
  PITCHES[3].color,
  PITCHES[4].color,
];

export interface Slot {
  /** 0 for the outside ring. */
  readonly ring: number;
  readonly x: number;
  readonly y: number;
  /**
   * From 0 at the left foot of the rainbow to 1 at the right foot, which is also the order the
   * balloons of a ring are let go.
   */
  readonly u: number;
}

export interface Arch {
  readonly slots: readonly Slot[];
  readonly rings: number;
  /** The radius of one small balloon. */
  readonly r: number;
  readonly cx: number;
  readonly baseY: number;
  /** The radius across and up of the empty space inside the innermost ring. */
  readonly openRx: number;
  readonly openRy: number;
}

/**
 * How many columns the rainbow is cut into, so that a song can be played across it, and which one a
 * place is in.
 */
export const columnOf = (u: number, columns: number): number =>
  Math.min(columns - 1, Math.max(0, Math.floor(u * columns)));

const RINGS = RING_COLORS.length;

/**
 * Places the rainbow on a screen `w` units wide, with its feet on the line `baseY` and its top no
 * higher than `top`. The balloons are as big as the screen allows, between 9 and 15 units, and
 * small enough that the six rings leave an opening inside them for the golden heart to rise into.
 */
export function archOf(w: number, baseY: number, top: number): Arch {
  const r = clamp(Math.floor(Math.min(w / 56, (baseY - top) * 0.055)), 9, 15);
  const pitch = r * 1.82;
  const rx0 = Math.min(w * 0.46, (baseY - top) * 1.25);
  const ry0 = baseY - top - r;
  const slots: Slot[] = [];
  for (let ring = 0; ring < RINGS; ring++) {
    const rx = rx0 - ring * pitch;
    const ry = ry0 - ring * pitch;
    // Walk the ring in small steps to find its length, so the balloons can be set an even distance
    // apart along it.
    const steps = 240;
    const lengths: number[] = [0];
    for (let i = 1; i <= steps; i++) {
      const a0 = Math.PI * (1 - (i - 1) / steps);
      const a1 = Math.PI * (1 - i / steps);
      lengths.push(
        lengths[i - 1]! + Math.hypot(rx * (Math.cos(a1) - Math.cos(a0)), ry * (Math.sin(a1) - Math.sin(a0))),
      );
    }
    const total = lengths[steps]!;
    const count = Math.max(4, Math.floor(total / pitch));
    for (let k = 0; k < count; k++) {
      const want = ((k + 0.5) / count) * total;
      let i = 1;
      while (i < steps && lengths[i]! < want) i++;
      const span = lengths[i]! - lengths[i - 1]!;
      const f = span > 0 ? (want - lengths[i - 1]!) / span : 0;
      const a = Math.PI * (1 - (i - 1 + f) / steps);
      slots.push({ ring, x: w / 2 + rx * Math.cos(a), y: baseY - ry * Math.sin(a), u: (k + 0.5) / count });
    }
  }
  const last = RINGS - 1;
  return {
    slots,
    rings: RINGS,
    r,
    cx: w / 2,
    baseY,
    openRx: rx0 - last * pitch - r * 1.6,
    openRy: ry0 - last * pitch - r * 1.6,
  };
}

/**
 * When a balloon of the rainbow is let go and when it arrives, in seconds from the start of the
 * build.
 */
export interface Trip {
  readonly leaves: number;
  readonly arrives: number;
}

const FLIGHT = 1.35;

/** The outside rings are let go first, and each ring from its left foot to its right. */
export function tripOf(s: Slot, jitter: number): Trip {
  const arrives = FLIGHT + s.ring * 0.42 + s.u * 0.9 + jitter * 0.18;
  return { leaves: arrives - FLIGHT, arrives };
}

/**
 * How long the whole rainbow takes to be put up, from the first balloon leaving to the last
 * arriving.
 */
export const BUILD_SECONDS = FLIGHT + (RINGS - 1) * 0.42 + 0.9 + 0.2;

/**
 * Where a balloon is on its way from the gift to its place. It climbs in a curve, passes a little
 * above its place, and settles back down on it, so the rainbow fills in with a bounce rather than
 * appearing.
 */
export function flight(
  from: { x: number; y: number },
  to: Slot,
  time: number,
  trip: Trip,
): { x: number; y: number; flying: boolean } {
  const f = clamp((time - trip.leaves) / (trip.arrives - trip.leaves));
  if (f <= 0) return { x: from.x, y: from.y, flying: true };
  if (f >= 1) return { x: to.x, y: to.y, flying: false };
  // The straight way there, and a swell to the side of it that is biggest in the middle of the
  // trip.
  const along = easeOutCubic(f);
  const settle = easeOutBack(f, 1.1);
  const swell = Math.sin(Math.PI * f) * 0.16 * (to.x - from.x);
  return {
    x: from.x + (to.x - from.x) * along + swell,
    y: from.y + (to.y - from.y) * settle,
    flying: true,
  };
}
