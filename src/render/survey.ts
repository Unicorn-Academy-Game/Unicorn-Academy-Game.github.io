import type { Vec2 } from '../shared/ids';
import type { Extent } from './camera';

/**
 * Standing back to see the whole of something. A button near a big place, the palace, asks the
 * camera to rise and pull back until all of it is in view, and the same button, or any touch of the
 * ground, brings the camera home to the herd. This blends over the camera that follows the herd and
 * never replaces it, so letting go has somewhere to return to.
 */

export interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Fraction of the screen kept clear on every side of what is surveyed. */
const MARGIN = 0.06;
/** The most the camera will pull back, as a fraction of the player's own zoom. */
export const MIN_SURVEY_SCALE = 0.2;
/**
 * Seconds to go all the way in or out. Slow enough to enjoy, quick enough that she is not left
 * waiting.
 */
const GLIDE_SECONDS = 0.9;

/**
 * The zoom, as a fraction of the player's own, at which all of `area` fits in a view `extent` world
 * units across.
 */
export function fitScale(area: Area, extent: Extent): number {
  const room = 1 + MARGIN * 2;
  const fit = Math.min(extent.w / (area.w * room), extent.h / (area.h * room));
  return Math.max(MIN_SURVEY_SCALE, Math.min(1, fit));
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

export class Survey {
  private area: Area | null = null;
  private goal: 0 | 1 = 0;
  private progress = 0;

  /** Starts looking at the whole of `area`. */
  begin(area: Area): void {
    this.area = area;
    this.goal = 1;
  }

  /** Heads home. The area is kept until the camera is all the way back. */
  end(): void {
    this.goal = 0;
  }

  /** Forgets everything at once, for a new map. */
  reset(): void {
    this.area = null;
    this.goal = 0;
    this.progress = 0;
  }

  /** Whether the camera is, or is going, to the survey. A camera on its way home is not. */
  get wanted(): boolean {
    return this.goal === 1;
  }

  /** How far the camera has gone: 0 at home, 1 on the whole of the area, eased between. */
  get blend(): number {
    return this.area ? smooth(this.progress) : 0;
  }

  /**
   * `calm` cuts from one view to the other with no glide, for a parent who asked for less movement.
   */
  update(dtSeconds: number, calm: boolean): void {
    if (!this.area) return;
    if (calm) this.progress = this.goal;
    else {
      const step = Math.min(dtSeconds, 0.1) / GLIDE_SECONDS;
      this.progress = this.goal === 1 ? Math.min(1, this.progress + step) : Math.max(0, this.progress - step);
    }
    if (this.goal === 0 && this.progress === 0) this.area = null;
  }

  /**
   * The zoom to use now: `home` while at home, the one that fits the area on it, and the same ratio
   * per step between.
   */
  scale(home: number, extent: Extent): number {
    const b = this.blend;
    if (b === 0 || !this.area) return home;
    const there = Math.min(home, fitScale(this.area, extent));
    return home * (there / home) ** b;
  }

  /** The point the camera looks at now, given where it would look if it were at home. */
  centre(home: Vec2): Vec2 {
    const b = this.blend;
    if (b === 0 || !this.area) return home;
    const x = this.area.x + this.area.w / 2;
    const y = this.area.y + this.area.h / 2;
    return { x: home.x + (x - home.x) * b, y: home.y + (y - home.y) * b };
  }
}
