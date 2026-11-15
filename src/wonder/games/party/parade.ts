import { clamp, easeInOutSine } from '../../engine/ease';
import type { Slot } from './layout';

/**
 * The parade that ends the party. The friends cheer where they stand, then set off along the road
 * in a line led by the first of them, and go all the way round to the same dance floor, which
 * stands again at the end of the road, and take their places on it as the music finishes. The world
 * goes by for as long as they are walking and not for a moment longer, and when they have arrived
 * the picture is the one it was when they set off, so the party can go straight on.
 */

/** Seconds the friends cheer, before the leader sets off. */
export const LINEUP = 1.7;
/** Seconds between one friend setting off and the next. */
export const STAGGER = 0.3;
/** Seconds from the start of the parade until the last friend is in her place again. */
export const DURATION = 15;

/**
 * How far round the road is: the dance floor is drawn again this far on, so that the friends can
 * arrive at it.
 */
export const loopOf = (w: number): number => Math.max(w * 1.9, 1600);

/** Where she is on the road and whether she is walking, for friend number `rank` of `count`. */
export interface Step {
  readonly x: number;
  readonly y: number;
  /** How far along the road she has come, in units, which is what her legs go by. */
  readonly dist: number;
  /** 0 while she stands and 1 when she is walking. */
  readonly walking: number;
  /** How fast she is going, in units a second. */
  readonly speed: number;
  /** She has set off and has not yet got there. */
  readonly on: boolean;
}

/** When friend `rank` sets off. */
export const startOf = (rank: number): number => LINEUP + rank * STAGGER;

export function stepOf(slot: Slot, rank: number, t: number, loop: number): Step {
  const t0 = startOf(rank);
  const span = DURATION - t0;
  const u = clamp((t - t0) / span);
  const along = easeInOutSine(u) * loop;
  const speed = u <= 0 || u >= 1 ? 0 : (loop * (Math.PI / 2) * Math.sin(Math.PI * u)) / span;
  return {
    x: slot.x + along,
    y: slot.y,
    dist: along,
    walking: u > 0 && u < 1 ? clamp(speed / 30) : 0,
    speed,
    on: u > 0 && u < 1,
  };
}

/**
 * Where the middle of the screen is in the world: the middle of the party as it goes round, and the
 * middle of the party where it began.
 */
export function middleOf(slots: readonly Slot[], t: number, loop: number, w: number): number {
  if (slots.length === 0) return w / 2;
  let sum = 0;
  let start = 0;
  slots.forEach((slot, rank) => {
    sum += stepOf(slot, rank, t, loop).x;
    start += slot.x;
  });
  return w / 2 + (sum - start) / slots.length;
}
