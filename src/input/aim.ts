import type { Vec2 } from '../shared/ids';

/** How far a finger has to be from Wildstar's body, in CSS pixels, before she follows it. */
export const AIM_START = 44;
/**
 * How close it has to come, once she is following, before she stands. Less than the start, so a
 * finger at the edge does not make her stutter.
 */
export const AIM_STOP = 26;

/**
 * Which way Wildstar is being led. A finger leads her toward itself, from her body on the screen,
 * and a key leads her the way it points. The finger wins when both are down. The answer is a
 * direction and no more: she walks at one pace, so a finger far away and a finger near are not
 * different, and a finger on top of her means stand.
 *
 * Everything is on the screen, in CSS pixels. The picture is not rotated, so a direction on the
 * screen is the same direction in the world however the camera has moved since the finger came
 * down.
 */
export class Aim {
  private following = false;

  aim(finger: Vec2 | null, keys: Vec2 | null, body: Vec2): Vec2 | null {
    if (!finger) {
      this.following = false;
      return keys;
    }
    const dx = finger.x - body.x;
    const dy = finger.y - body.y;
    const d = Math.hypot(dx, dy);
    this.following = this.following ? d >= AIM_STOP : d >= AIM_START;
    return this.following ? { x: dx / d, y: dy / d } : null;
  }

  /** Forgets that she was following, for a new map or a pause. */
  reset(): void {
    this.following = false;
  }
}
