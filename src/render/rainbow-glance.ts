import { ARCH_TOP } from '../content/fountain-horns';
import { RAINBOW } from '../content/fountain-rainbow';
import type { World } from '../domain';
import { clamp } from '../shared/math';
import { type Glance, reach } from './vista';

/**
 * What the rainbow over the palace garden's fountain asks of the camera, so that the whole arch is
 * in view from anywhere the herd can cast it from, and is let go as it fades. The framing is
 * `vista.ts`'s; this is only how much of it is asked for, and when.
 */

/**
 * Seconds the rainbow takes to ask for all of its room, so the camera is there when the arch has
 * been painted on.
 */
const COMES_IN = 1;
/**
 * The herd is asked to be no farther from the fountain than this for all of the room, which is
 * every place a cast can be made from.
 */
const NEAR = 540;
/**
 * By this far the rainbow asks for nothing, so a herd that has run off is not held at the foot of
 * the screen for an arch it cannot see.
 */
const FAR = 740;

const smooth = (t: number): number => {
  const s = clamp(t);
  return s * s * (3 - 2 * s);
};

/**
 * How much of its room a rainbow that has stood for `age` seconds of the `total` it was given asks
 * for: it comes in with the paint and goes with the fade.
 */
export const roomAsked = (age: number, total: number): number =>
  Math.min(smooth(age / COMES_IN), smooth((total - age) / RAINBOW.fade));

/**
 * The rainbow that stands in this world at `seconds`, as the camera is asked to see it, or nothing.
 */
export function rainbowGlance(world: World, seconds: number): Glance | undefined {
  const herd = world.unicorns.wildstar?.pos;
  if (!herd) return undefined;
  for (const [id, up] of world.transient) {
    const host = up.kind === 'light-rainbow' ? world.interactables.get(id) : undefined;
    if (!host) continue;
    const near = reach({ stand: host.pos, radius: FAR }, herd, NEAR / FAR);
    return { top: host.pos.y - ARCH_TOP, weight: roomAsked(seconds - up.since, up.until - up.since) * near };
  }
  return undefined;
}
