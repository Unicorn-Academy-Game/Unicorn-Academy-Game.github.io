import type { Vista } from '../shared/compiled-map';
import type { Vec2 } from '../shared/ids';
import { clamp } from '../shared/math';
import { BODY_RISE, type Extent } from './camera';

/**
 * Making room to look up. A map can have one vista: a banner high on a wall, say, that the herd can
 * never stand close enough to see on a screen held sideways. While the herd is near it the camera
 * pulls back and rises, only as far as it takes to bring the vista and the leader's feet into view
 * together. A screen tall enough to hold both is left alone. The camera makes no dramatic moves, so
 * the pull is small, eased, and never loses the leader.
 *
 * Something that stands for a little while, like the rainbow Wildstar's light makes over the palace
 * garden's fountain, can ask for the same room with a `Glance`. It is framed by the same math, and
 * the camera takes the larger pull of the two on each side.
 */

/**
 * What the camera does: how far it has pulled back, as a fraction of the zoom it started at, and
 * how far its view has risen.
 */
export interface Frame {
  zoomScale: number;
  /** World units the centre of the view is above where it would be on the herd. */
  lift: number;
}

export const NO_FRAME: Frame = { zoomScale: 1, lift: 0 };

/** World units kept clear above what must show. */
const TOP_MARGIN = 8;
/**
 * The same for a glance, which is looked at for its own sake, and whose sparkles above its top need
 * air to be seen against.
 */
const GLANCE_MARGIN = 24;
/**
 * World units kept below the leader's feet, so hooves and shadow are not at the edge of the screen.
 */
const FEET_MARGIN = 40;
/** The least of that margin the camera will ever leave, whatever it was asked for. */
const FEET_MIN = 24;
/**
 * The most the camera pulls back. A unicorn's body is 114 px tall at full zoom, and this keeps it
 * above 80.
 */
export const MIN_ZOOM_SCALE = 0.7;
/**
 * Within this fraction of a vista's radius from where the herd stands, the camera has made all the
 * room it will.
 */
const FULL_WITHIN = 0.25;
/**
 * Seconds for the camera to cover most of the way to where the herd's place asks it to be. Slow on
 * purpose.
 */
const SETTLE = 1.1;

/**
 * How much the herd's place asks of the camera: 0 beyond the vista's reach, 1 at its heart, easing
 * between. The heart is the `within` fraction of the radius.
 */
export function reach(vista: Pick<Vista, 'stand' | 'radius'>, herd: Vec2, within = FULL_WITHIN): number {
  const distance = Math.hypot(herd.x - vista.stand.x, herd.y - vista.stand.y);
  const t = clamp((vista.radius - distance) / (vista.radius * (1 - within)));
  return t * t * (3 - 2 * t);
}

/**
 * Something that stands for a time and is worth seeing whole while it does. `top` is the highest of
 * it, a world y, and `weight` is how much of the room it asks for at the moment, from nothing to
 * all of it.
 */
export interface Glance {
  top: number;
  weight: number;
}

/**
 * Where the camera is when it has made all the room it will, for a view `extent` world units across
 * at the player's own zoom. The view reaches up to the top of what must show if it can, and always
 * down past the leader's feet.
 */
export function fullFrame(vista: Vista, extent: Extent): Frame {
  return room(vista.show.y - TOP_MARGIN, vista.stand.y, vista.stand.y - BODY_RISE, extent, vista.below ?? FEET_MARGIN);
}

/**
 * The frame that brings `top` into view with a leader whose feet are at `feetY`, for a view whose
 * centre would otherwise be at `centreY`. A glance is framed from where the camera is, and not from
 * where the herd would stand, because the camera sits off the herd by as much as its dead zone, and
 * the room that is made must not depend on that.
 */
function room(top: number, feetY: number, centreY: number, extent: Extent, below = FEET_MARGIN): Frame {
  const bottom = feetY + below;
  const need = bottom - top;
  const zoomScale = need <= extent.h ? 1 : Math.max(MIN_ZOOM_SCALE, extent.h / need);
  const visible = extent.h / zoomScale;
  // As high as the top allows, but never so high that the bottom edge rises past the feet.
  const viewTop = Math.min(centreY - visible / 2, Math.max(top, bottom - visible));
  return { zoomScale, lift: centreY - (viewTop + visible / 2) };
}

/**
 * Whichever of two frames pulls the camera further, a side at a time. A smaller zoom only lowers
 * the bottom edge, so the feet that either frame kept in view stay in view.
 */
const stronger = (a: Frame, b: Frame): Frame => ({
  zoomScale: Math.min(a.zoomScale, b.zoomScale),
  lift: Math.max(a.lift, b.lift),
});

/**
 * Part of the way to `full`. The leader's feet stay in view whatever the weight, so a herd standing
 * south of the place the camera was framed for gets less lift, not a cut-off leader. `centreY` is
 * where the view is centred before any lift.
 */
export function partway(full: Frame, weight: number, extent: Extent, centreY: number, feetY: number): Frame {
  if (weight <= 0) return NO_FRAME;
  const zoomScale = 1 + (full.zoomScale - 1) * weight;
  const visible = extent.h / zoomScale;
  const mostLift = centreY + visible / 2 - (feetY + FEET_MIN);
  return { zoomScale, lift: Math.max(0, Math.min(full.lift * weight, mostLift)) };
}

/**
 * Eases the camera into and out of a map's vista as the herd comes and goes, and makes room for
 * whatever a glance asks.
 */
export class VistaLens {
  private vista: Vista | undefined;
  private weight = 0;
  /**
   * How willing the camera is to make room for a glance: all the way, and not at all while reduced
   * effects are on.
   */
  private willing = 1;
  private calm = false;

  /** Starts watching for a map's vista, or for none, with the camera already where the herd is. */
  reset(vista: Vista | undefined, herd: Vec2): void {
    this.vista = vista;
    this.snap(herd);
  }

  /**
   * Reduced effects keep the camera on the herd, never pulled back or raised. The camera eases out
   * of any pull it was in.
   */
  setCalm(calm: boolean): void {
    this.calm = calm;
  }

  /** Jumps to what the herd's place asks, for a new map or a jump across the map. */
  snap(herd: Vec2): void {
    this.weight = this.wanted(herd);
    this.willing = this.calm ? 0 : 1;
  }

  update(dtSeconds: number, herd: Vec2): void {
    const dt = Math.min(Math.max(dtSeconds, 0), 0.1);
    const ease = 1 - Math.exp(-dt / SETTLE);
    this.weight += (this.wanted(herd) - this.weight) * ease;
    this.willing += ((this.calm ? 0 : 1) - this.willing) * ease;
  }

  /**
   * The camera's pull now, for a view `extent` world units across at the player's zoom, and for
   * whatever glance is asking.
   */
  frame(extent: Extent, centreY: number, feetY: number, glance?: Glance): Frame {
    const banner =
      this.vista && this.weight >= 1e-3
        ? partway(fullFrame(this.vista, extent), this.weight, extent, centreY, feetY)
        : NO_FRAME;
    const weight = glance ? glance.weight * this.willing : 0;
    if (!glance || weight < 1e-3) return banner;
    return stronger(
      banner,
      partway(room(glance.top - GLANCE_MARGIN, feetY, centreY, extent), weight, extent, centreY, feetY),
    );
  }

  private wanted(herd: Vec2): number {
    return this.vista && !this.calm ? reach(this.vista, herd) : 0;
  }
}
