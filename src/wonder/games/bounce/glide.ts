/**
 * The way up and over and down: a thing that leaves one height, goes up to a top, and comes down to
 * another height, under a steady pull. It is how the herd comes out of the door and lands on the
 * moon, where the pull is slight and the way takes seconds. The heights are on a screen, so down is
 * more. `top` is the highest the thing gets, and is above both ends.
 */

/** How long the whole way takes, in seconds. */
export function glideSeconds(from: number, to: number, top: number, gravity: number): number {
  const up = Math.sqrt(2 * gravity * Math.max(0, from - top));
  return (up + Math.sqrt(up * up + 2 * gravity * (to - from))) / gravity;
}

/**
 * The height `t` seconds along a way of `seconds`. It is `from` at 0 and `to` at `seconds` whatever
 * the pull is, so a screen that has changed size under it does not leave it short.
 */
export function glideAt(from: number, to: number, seconds: number, gravity: number, t: number): number {
  const u = Math.min(Math.max(t, 0), seconds);
  return from + ((to - from) * u) / seconds - 0.5 * gravity * u * (seconds - u);
}

/** How fast it is going down at `t`, which is below 0 on the way up. */
export function glideSpeed(from: number, to: number, seconds: number, gravity: number, t: number): number {
  const u = Math.min(Math.max(t, 0), seconds);
  return (to - from) / seconds - 0.5 * gravity * (seconds - 2 * u);
}
