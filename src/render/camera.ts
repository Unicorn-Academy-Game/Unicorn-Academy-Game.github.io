import type { Vec2 } from '../shared/ids';
import { clamp } from '../shared/math';

export interface Extent {
  w: number;
  h: number;
}

/** Fractions of the visible area. */
const DEAD_X = 0.07;
const DEAD_Y = 0.1;
const LEAD_X = 0.16;
const LEAD_Y = 0.18;
/** While walking the dead zone shrinks, so it does not eat the room left ahead. */
const MOVING_DEAD = 0.35;
/** Time constants in seconds. The camera settles in a few of these. */
const FOLLOW_TAU = 0.28;
const LEAD_TAU = 0.9;

/** How far above a unicorn's feet the camera looks: at her body, not her hooves. */
export const BODY_RISE = 52;

/**
 * Keeps a view centred on `centre` inside the map, and centres the map on an axis where the view is
 * larger than the map.
 */
export function clampCentre(centre: Vec2, view: Extent, bounds: Extent): Vec2 {
  return {
    x: view.w >= bounds.w ? bounds.w / 2 : clamp(centre.x, view.w / 2, bounds.w - view.w / 2),
    y: view.h >= bounds.h ? bounds.h / 2 : clamp(centre.y, view.h / 2, bounds.h - view.h / 2),
  };
}

/**
 * The camera follows Wildstar with a small dead zone, a little room ahead of where she is heading,
 * and no sudden moves. The rig works in world units and knows nothing about the engine, so its
 * behavior is testable.
 */
export class CameraRig {
  x = 0;
  y = 0;
  private leadX = 0;
  private leadY = 0;

  /** Jumps to a place with no easing, for a new map or a resize that changed the view. */
  snap(target: Vec2, view: Extent, bounds: Extent): void {
    this.leadX = 0;
    this.leadY = 0;
    this.x = target.x;
    this.y = target.y;
    this.clampTo(view, bounds);
  }

  /**
   * Moves toward the target. `heading` is a unit vector while the target is walking and null while
   * it stands, which lets the lead relax back to centre.
   */
  update(dtSeconds: number, target: Vec2, heading: Vec2 | null, view: Extent, bounds: Extent): void {
    const dt = Math.min(dtSeconds, 0.1);
    const lead = 1 - Math.exp(-dt / LEAD_TAU);
    this.leadX += ((heading ? heading.x * view.w * LEAD_X : 0) - this.leadX) * lead;
    this.leadY += ((heading ? heading.y * view.h * LEAD_Y : 0) - this.leadY) * lead;

    const focusX = target.x + this.leadX;
    const focusY = target.y + this.leadY;
    const deadScale = heading ? MOVING_DEAD : 1;
    const deadX = view.w * DEAD_X * deadScale;
    const deadY = view.h * DEAD_Y * deadScale;
    const goalX = focusX - clamp(focusX - this.x, -deadX, deadX);
    const goalY = focusY - clamp(focusY - this.y, -deadY, deadY);

    const follow = 1 - Math.exp(-dt / FOLLOW_TAU);
    this.x += (goalX - this.x) * follow;
    this.y += (goalY - this.y) * follow;
    this.clampTo(view, bounds);
  }

  /**
   * Keeps the view inside the map, and centres the map on an axis where the view is larger than the
   * map.
   */
  clampTo(view: Extent, bounds: Extent): void {
    const c = clampCentre(this, view, bounds);
    this.x = c.x;
    this.y = c.y;
  }
}
