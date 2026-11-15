import { clamp } from '../../engine/ease';

/**
 * The shell's way from the cannon to the sky: how the barrel points to send it somewhere, and the
 * path it flies.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * A curve with one bend: it leaves where it starts heading toward the bend, and arrives where it
 * ends heading away from it.
 */
export interface Arc {
  readonly x0: number;
  readonly y0: number;
  readonly cx: number;
  readonly cy: number;
  readonly x1: number;
  readonly y1: number;
}

/**
 * How much higher than straight at its target the barrel points, in radians. A shell goes up and
 * over to where it is going, so the barrel points a little above it, a little more the farther it
 * has to go.
 */
export const lofting = (distance: number): number => clamp(0.08 + distance / 1900, 0.08, 0.3);

/**
 * The angle to point the barrel, from where it pivots, to send a shell to a place. Negative is up.
 */
export function aimAt(pivot: Point, target: Point): number {
  return (
    Math.atan2(target.y - pivot.y, target.x - pivot.x) - lofting(Math.hypot(target.x - pivot.x, target.y - pivot.y))
  );
}

/**
 * The path of a shell that leaves the muzzle the way the barrel points and lands on the target. The
 * bend is on the line of the barrel, as far along it as puts the bend over the middle of the way to
 * the target, so the path is a smooth arch.
 */
export function arcFrom(muzzle: Point & { readonly angle: number }, target: Point): Arc {
  const dx = target.x - muzzle.x;
  const dy = target.y - muzzle.y;
  const distance = Math.hypot(dx, dy);
  const off = clamp(muzzle.angle - Math.atan2(dy, dx), -1.2, 1.2);
  const reach = (0.5 * distance) / Math.max(0.35, Math.cos(off));
  return {
    x0: muzzle.x,
    y0: muzzle.y,
    cx: muzzle.x + Math.cos(muzzle.angle) * reach,
    cy: muzzle.y + Math.sin(muzzle.angle) * reach,
    x1: target.x,
    y1: target.y,
  };
}

/**
 * A path from a friend's horn, bowing up over the way, since a spell does not leave from a barrel.
 */
export function loop(from: Point, target: Point, bow: number): Arc {
  return {
    x0: from.x,
    y0: from.y,
    cx: (from.x + target.x) / 2 + bow,
    cy: Math.min(from.y, target.y) - 50 - Math.abs(bow) * 0.4,
    x1: target.x,
    y1: target.y,
  };
}

/** How long a shell takes to go this far, in seconds. */
export const flightSeconds = (distance: number): number => 0.4 + Math.min(0.42, distance / 1000);

/** Where it is, `u` of the way along, from 0 to 1. */
export function at(arc: Arc, u: number, out: { x: number; y: number } = { x: 0, y: 0 }): { x: number; y: number } {
  const v = 1 - u;
  out.x = v * v * arc.x0 + 2 * v * u * arc.cx + u * u * arc.x1;
  out.y = v * v * arc.y0 + 2 * v * u * arc.cy + u * u * arc.y1;
  return out;
}

/** The way it is heading, `u` of the way along, in radians. */
export function heading(arc: Arc, u: number): number {
  const v = 1 - u;
  return Math.atan2(
    2 * v * (arc.cy - arc.y0) + 2 * u * (arc.y1 - arc.cy),
    2 * v * (arc.cx - arc.x0) + 2 * u * (arc.x1 - arc.cx),
  );
}
