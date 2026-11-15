import type { Vec2 } from '../shared/ids';

/** The little hop a piece makes when it lands, and how long it takes. */
const HOP_SECONDS = 0.28;
const HOP_HEIGHT = 9;
/**
 * How far a piece that is lying there bobs, and how fast, so it looks like something to pick up.
 */
const BOB_HEIGHT = 1.6;
const BOB_RATE = 3.2;

export interface Flight {
  from: Vec2;
  lift: number;
  to: Vec2;
  born: number;
}

export interface Pose {
  /** Where it is on the ground, under itself. */
  at: Vec2;
  /** How high above that it is. */
  z: number;
  /** Whether it has left yet. A piece waits its turn to fall, so one that has not is not drawn. */
  shown: boolean;
  /** Whether it has landed and is lying there. */
  landed: boolean;
}

const ease = (t: number): number => 1 - (1 - t) * (1 - t);

/**
 * Where a piece of fruit or a vegetable is `seconds` into the world, `fall` seconds after it was
 * born. It drops from the height it grew at, sideways to where it lands, with a small hop at the
 * end and then a gentle bob. A pure function of time, so the same moment looks the same however the
 * frames came.
 */
export function poseAt(p: Flight, seconds: number, fall: number, phase: number): Pose {
  const t = (seconds - p.born) / fall;
  if (t < 0) return { at: p.from, z: p.lift, shown: false, landed: false };
  if (t < 1) {
    const slide = ease(t);
    return {
      at: { x: p.from.x + (p.to.x - p.from.x) * slide, y: p.from.y + (p.to.y - p.from.y) * slide },
      z: p.lift * (1 - t * t),
      shown: true,
      landed: false,
    };
  }
  const since = (t - 1) * fall;
  const hop =
    since < HOP_SECONDS ? Math.sin((since / HOP_SECONDS) * Math.PI) * HOP_HEIGHT * (1 - since / HOP_SECONDS) : 0;
  const bob = since >= HOP_SECONDS ? (0.5 + 0.5 * Math.sin(seconds * BOB_RATE + phase)) * BOB_HEIGHT : 0;
  return { at: p.to, z: hop + bob, shown: true, landed: true };
}
