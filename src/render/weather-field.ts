import type { Fall } from '../content/seasons';
import { lerp } from '../shared/math';
import { hash } from './season/color';

/** The part of the world the camera shows, in world units. */
export interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * How one kind of fall moves, and how much of the screen it fills. Speeds are world units a second.
 */
export interface FallFeel {
  /** The pictures a kind has: shapes or colours. */
  variants: number;
  /** How fast the smallest falls and how fast the biggest does. */
  speed: readonly [number, number];
  /** How far one swings from side to side, the least and the most. */
  sway: readonly [number, number];
  /** How quickly it swings, in radians a second, the least and the most. */
  swing: readonly [number, number];
  /** The wind that carries all of it sideways. */
  wind: number;
  /** How far it tips as it swings, in radians. */
  tip: number;
  /** How fast it turns as it falls, in radians a second, at the most. */
  spin: number;
  /** How many of it are in the air for every thousand square units of the view. */
  density: number;
  /** The most there ever are, at full quality. */
  most: number;
  /** How see-through the smallest is and how solid the biggest. */
  alpha: readonly [number, number];
}

const FEEL: Readonly<Record<Fall, FallFeel>> = {
  snow: {
    variants: 4,
    speed: [26, 62],
    sway: [3, 12],
    swing: [0.7, 1.7],
    wind: 7,
    tip: 0,
    spin: 0,
    density: 1,
    most: 160,
    alpha: [0.7, 1],
  },
  leaves: {
    variants: 4,
    speed: [20, 40],
    sway: [16, 34],
    swing: [0.9, 1.9],
    wind: 15,
    tip: 0.9,
    spin: 1.1,
    density: 0.28,
    most: 60,
    alpha: [0.9, 1],
  },
  petals: {
    variants: 3,
    speed: [16, 30],
    sway: [10, 26],
    swing: [0.7, 1.5],
    wind: 13,
    tip: 0.7,
    spin: 0.9,
    density: 0.34,
    most: 76,
    alpha: [0.85, 1],
  },
};

export const feelOf = (fall: Fall): FallFeel => FEEL[fall];

/** A little beyond the edge of the view, so that what wraps round is out of sight when it does. */
export const MARGIN = 24;

/**
 * One of what falls: all of its numbers are fixed, and where it is at any moment follows from them
 * and the time.
 */
export interface Flake {
  /** Where it starts across and down the view, from 0 up to 1. */
  u: number;
  v: number;
  /** How big and how near it is, from 0 to 1. The bigger it is the faster it falls. */
  size: number;
  /** Which picture it is. */
  variant: number;
  phase: number;
  /** How hard it swings, how fast, and which way and how much it turns, each from 0 to 1. */
  reach: number;
  rate: number;
  turn: number;
}

/** What to draw for a flake at a moment. */
export interface Placed {
  x: number;
  y: number;
  angle: number;
  alpha: number;
  variant: number;
}

/** The same `count` flakes every time, for a kind, spread so that no two share a place. */
export function makeFlakes(fall: Fall, count: number): Flake[] {
  const kind = fall === 'snow' ? 1 : fall === 'leaves' ? 2 : 3;
  const variants = FEEL[fall].variants;
  return Array.from({ length: count }, (_, i) => ({
    u: hash(i, 1, kind),
    v: hash(i, 2, kind),
    size: hash(i, 3, kind),
    variant: Math.min(variants - 1, Math.floor(hash(i, 4, kind) * variants)),
    phase: hash(i, 5, kind) * Math.PI * 2,
    reach: hash(i, 6, kind),
    rate: hash(i, 7, kind),
    turn: hash(i, 8, kind) * 2 - 1,
  }));
}

/**
 * How many of a kind to show for a view, at a quality from 0 up to 1. A view that is bigger shows
 * more, up to the most.
 */
export function countFor(fall: Fall, view: View, quality: number): number {
  const feel = FEEL[fall];
  const wanted = Math.round(((view.w * view.h) / 1000) * feel.density * quality);
  return Math.max(0, Math.min(Math.round(feel.most * quality), wanted));
}

/** `value` brought into the stretch from 0 up to `span`, going round. */
const around = (value: number, span: number): number => {
  const m = value % span;
  return m < 0 ? m + span : m;
};

/**
 * Where a flake is, `seconds` after it began, over a view. It falls and swings as it goes, and when
 * it leaves the bottom of the view it comes in again at the top. It stays where the world is and
 * not where the screen is: as the camera moves the flakes go by, the big ones a little faster than
 * the ground and the small ones a little slower, which is the nearer and the farther.
 */
export function place(flake: Flake, fall: Fall, seconds: number, view: View, out: Placed): void {
  const feel = FEEL[fall];
  const spanX = view.w + 2 * MARGIN;
  const spanY = view.h + 2 * MARGIN;
  const left = view.x - MARGIN;
  const top = view.y - MARGIN;
  const near = lerp(0.88, 1.12, flake.size);
  const swing = lerp(feel.swing[0], feel.swing[1], flake.rate) * seconds + flake.phase;
  const sway = Math.sin(swing) * lerp(feel.sway[0], feel.sway[1], flake.reach);
  const across = flake.u * spanX + feel.wind * lerp(0.6, 1, flake.size) * seconds + sway;
  const down = flake.v * spanY + lerp(feel.speed[0], feel.speed[1], flake.size) * seconds;
  out.x = left + around(across - left * near, spanX);
  out.y = top + around(down - top * near, spanY);
  out.angle = feel.tip * Math.cos(swing) + feel.spin * flake.turn * seconds;
  out.alpha = lerp(feel.alpha[0], feel.alpha[1], flake.size);
  out.variant = flake.variant;
}
