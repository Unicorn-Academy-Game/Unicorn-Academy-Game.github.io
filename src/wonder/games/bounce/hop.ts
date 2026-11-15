import { clamp } from '../../engine/ease';

/**
 * A leap along a curve of the kind a thrown ball makes, from one place to another, that takes
 * exactly the time it is asked to take. However far the two places are, and whether the second is
 * higher or lower, she arrives at the moment she should, which is what lets every landing fall on
 * the beat of the music. Up is smaller `y`, as it is on the screen.
 */
export interface Arc {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly seconds: number;
  /**
   * How hard she is pulled down, which is set so that the curve comes back on time. Units a second,
   * squared.
   */
  readonly gravity: number;
  /** How fast she leaves, upward, in units a second. */
  readonly rise: number;
  /** Seconds from leaving to the top of the curve. */
  readonly top: number;
  /** How far above where she left the top of the curve is. */
  readonly apex: number;
}

/** Where she is on an arc, and how fast she is going. Down and to the right are positive. */
export interface Pose {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export const newPose = (): Pose => ({ x: 0, y: 0, vx: 0, vy: 0 });

/**
 * The leap from (x0, y0) to (x1, y1) that takes `seconds` and goes `lift` units above the higher of
 * the two places, so it is always a leap and never a slide, even between two places at the same
 * height.
 */
export function arcBetween(x0: number, y0: number, x1: number, y1: number, seconds: number, lift: number): Arc {
  if (!(seconds > 0)) throw new Error('a leap takes some time');
  if (!(lift > 0)) throw new Error('a leap goes up before it comes down');
  const up = y0 - y1;
  const apex = Math.max(0, up) + lift;
  // The way up and the way down are two falls from the top, and they have to add up to the time
  // asked for.
  const climb = Math.sqrt(apex);
  const fall = Math.sqrt(apex - up);
  const top = (seconds * climb) / (climb + fall);
  const gravity = (2 * apex) / (top * top);
  return { x0, y0, x1, y1, seconds, gravity, rise: gravity * top, top, apex };
}

/**
 * Where she is `t` seconds into the arc. Before it she is at the start, and after it at the end.
 */
export function arcAt(arc: Arc, t: number, out: Pose = newPose()): Pose {
  const u = clamp(t, 0, arc.seconds);
  const across = (arc.x1 - arc.x0) / arc.seconds;
  out.x = arc.x0 + across * u;
  out.vx = t < 0 || t > arc.seconds ? 0 : across;
  out.y = arc.y0 - (arc.rise * u - 0.5 * arc.gravity * u * u);
  out.vy = t < 0 || t > arc.seconds ? 0 : -(arc.rise - arc.gravity * u);
  return out;
}

/**
 * The place a leap passes `fraction` of the way across, from 0 to 1. The shape of the curve does
 * not depend on how long the leap takes, only on where it starts and ends and how high it goes, so
 * this is where she will be whatever the time.
 */
export function arcPoint(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  lift: number,
  fraction: number,
  out: { x: number; y: number } = { x: 0, y: 0 },
): { x: number; y: number } {
  const arc = arcBetween(x0, y0, x1, y1, 1, lift);
  const pose = arcAt(arc, fraction);
  out.x = pose.x;
  out.y = pose.y;
  return out;
}
