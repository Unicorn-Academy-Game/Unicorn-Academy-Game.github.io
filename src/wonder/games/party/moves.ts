import { easeInOutCubic, TAU, wrap } from '../../engine/ease';

/**
 * How a friend dances. Every move is a function of where the music is, in beats, so a dancer is
 * always on the beat, at any tempo, and all of them are together whatever each began. A move says
 * which of her pictures to draw, which way she faces, and how she is held. The game draws it.
 */

export const MOVES = ['bounce', 'sway', 'twirl', 'prance', 'shine', 'flip'] as const;
export type Move = (typeof MOVES)[number];

/**
 * Every move comes round again in this many beats, so a dance can be looped and tested over one.
 */
export const BARS_BEATS = 4;

/** The pictures a move is made from. */
export type Clip = 'idle' | 'walk' | 'signature-idle';

/** How one friend looks at one moment. */
export interface Look {
  clip: Clip;
  /** How far through one pass of the clip, from 0 to 1. */
  phase: number;
  /**
   * Which way she faces, counting round from her own way: 0 her own, 1 toward you, 2 the other way,
   * 3 away from you.
   */
  turn: 0 | 1 | 2 | 3;
  /** Units off the floor, at full size. */
  lift: number;
  /** How wide and how tall she is held, around 1. */
  sx: number;
  sy: number;
  /** How far she leans, in radians, clockwise being positive. */
  tilt: number;
  /** How far over she has gone, about the middle of her body, in radians, for a flip. */
  spin: number;
  /** Units to the side, at full size. */
  shift: number;
}

export const newLook = (): Look => ({
  clip: 'idle',
  phase: 0,
  turn: 0,
  lift: 0,
  sx: 1,
  sy: 1,
  tilt: 0,
  spin: 0,
  shift: 0,
});

const frac = (x: number): number => x - Math.floor(x);

/**
 * A hop that is on the ground at each beat and highest between: 0 at u = 0 and u = 1, and 1 at the
 * middle.
 */
const hop = (u: number): number => Math.sin(Math.PI * u) ** 0.85;

/**
 * How squashed she is as she lands on a beat, from 1 at the beat falling away to 0, and how
 * stretched she is on the way up.
 */
const squashOf = (u: number, up: number): number => 1 + 0.07 * up - 0.1 * Math.exp(-u * 16);

/**
 * How she stands and listens to music nobody has yet danced to: she is still, and nods very
 * slightly on the beat.
 */
export function listen(beats: number, out: Look = newLook()): Look {
  const u = frac(beats);
  out.clip = 'idle';
  out.phase = frac(beats / BARS_BEATS);
  out.turn = 0;
  out.lift = 0;
  out.sy = 1 + 0.012 * Math.exp(-u * 8);
  out.sx = 1 - (out.sy - 1) * 0.5;
  out.tilt = 0;
  out.spin = 0;
  out.shift = 0;
  return out;
}

/**
 * How she looks `beats` into the music, doing a move. `home` is which way she faces, so that a lean
 * is toward where she looks and a flip goes backward for her, and `parity` (1 or -1) lets
 * neighbours do the same move the opposite way round.
 */
export function lookOf(move: Move, beats: number, home: 1 | -1, parity: 1 | -1, out: Look = newLook()): Look {
  const b = wrap(beats, BARS_BEATS);
  const u = frac(b);
  out.clip = 'idle';
  out.phase = 0;
  out.turn = 0;
  out.lift = 0;
  out.sx = 1;
  out.sy = 1;
  out.tilt = 0;
  out.spin = 0;
  out.shift = 0;
  switch (move) {
    case 'bounce': {
      const up = hop(u);
      out.lift = 18 * up;
      out.sy = squashOf(u, up);
      out.tilt = 0.05 * home * parity * Math.sin(Math.PI * b);
      break;
    }
    case 'sway': {
      const swing = Math.sin(Math.PI * b);
      out.shift = 13 * parity * swing;
      out.tilt = 0.15 * parity * swing;
      out.lift = 4 * Math.abs(Math.cos(Math.PI * b));
      out.sy = 1 + 0.02 * Math.abs(swing);
      break;
    }
    case 'twirl': {
      // Round once in the first beat of every two, through her four views, and a hop in the second.
      const c = b % 2;
      if (c < 1) {
        out.turn = Math.min(3, Math.floor(c * 4)) as 0 | 1 | 2 | 3;
        out.lift = 18 * hop(c);
        out.sy = 1 + 0.06 * hop(c);
      } else {
        const v = c - 1;
        out.lift = 8 * hop(v);
        out.sy = squashOf(v, hop(v));
      }
      break;
    }
    case 'prance': {
      // The walk, on the spot, two steps to every two beats.
      out.clip = 'walk';
      out.phase = frac(b / 2);
      out.lift = 4 * Math.abs(Math.sin(Math.PI * b));
      out.tilt = 0.025 * home * Math.sin(Math.PI * b);
      break;
    }
    case 'shine': {
      // Her own move, which every friend has, once through in two beats.
      out.clip = 'signature-idle';
      out.phase = frac(b / 2);
      out.lift = 2 * Math.exp(-u * 6);
      break;
    }
    case 'flip': {
      // Four beats: gather, over, land, and a bounce to finish.
      if (b < 1) {
        out.sy = 1 - 0.1 * Math.sin(Math.PI * b);
      } else if (b < 2) {
        const v = b - 1;
        out.lift = 48 * Math.sin(Math.PI * v);
        out.spin = -home * TAU * easeInOutCubic(v);
        out.sy = 1 + 0.05 * Math.sin(Math.PI * v);
      } else if (b < 3) {
        const v = b - 2;
        out.sy = 1 - 0.12 * Math.exp(-v * 9);
        out.lift = 6 * hop(v);
      } else {
        const v = b - 3;
        out.lift = 14 * hop(v);
        out.sy = squashOf(v, hop(v));
      }
      break;
    }
  }
  if (out.sy !== 1) out.sx = 1 - (out.sy - 1) * 0.6;
  return out;
}

/** The move she does next when she is touched again, going round all of them. */
export function nextMove(move: Move | null): Move {
  if (move === null) return MOVES[0];
  return MOVES[(MOVES.indexOf(move) + 1) % MOVES.length]!;
}
