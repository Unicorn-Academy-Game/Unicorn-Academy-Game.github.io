import { clamp, lerp } from '../../engine/ease';

/**
 * A frog that hops from place to place. She crouches, springs, spends a time in the air that is
 * longer the further she goes, and lands, and the game is told where she landed. Hops that are
 * asked for while she is in the air wait their turn, so a child who taps along the pads sees her go
 * along them. Places are numbers; where a place is on the screen is the game's to say, so the frog
 * follows the screen when it turns.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** The seconds she crouches before she springs. */
export const CROUCH = 0.13;
/** The seconds after a landing in which she is still low. */
export const SETTLE = 0.22;
/** How many hops can wait their turn. */
export const MOST_WAITING = 3;

/** The seconds a hop of a distance takes in the air. */
export const flightOf = (distance: number): number => clamp(0.34 + distance / 560, 0.4, 0.82);
/** How high a hop of a distance goes, in units. */
export const heightOf = (distance: number): number => clamp(20 + distance * 0.24, 24, 82);

interface Hop {
  readonly from: number;
  readonly to: number;
  readonly start: number;
  readonly flight: number;
  readonly height: number;
  /** Which way she faces, -1 west and 1 east. */
  readonly face: number;
}

type Pose = 'sit' | 'crouch' | 'air';

/** Where she is, and how she is shaped, at a moment. */
export interface Body {
  readonly x: number;
  readonly y: number;
  /** How far off the pad she is, in units. */
  readonly lift: number;
  readonly pose: Pose;
  /** Stretch up and squash down, as a pair of scales, 1 for neither. */
  readonly sx: number;
  readonly sy: number;
  /** A lean in the way she is going, in radians. */
  readonly tilt: number;
  readonly face: number;
  /** How far through the air she is, 0 to 1, and 0 when she is not in it. */
  readonly through: number;
}

export type Spots = (place: number) => Point;

export class Hopper {
  /** The place she is on, or has just left. */
  at: number;
  private readonly waiting: number[] = [];
  private hop: Hop | null = null;
  private landed = -99;
  private face = 1;

  constructor(at: number) {
    this.at = at;
  }

  reset(at: number): void {
    this.at = at;
    this.waiting.length = 0;
    this.hop = null;
    this.landed = -99;
  }

  /** Whether she is crouching, in the air, or has hops to make. */
  get busy(): boolean {
    return this.hop !== null || this.waiting.length > 0;
  }

  /** The place she will be at when her hops are done. */
  get target(): number {
    return this.waiting.length > 0 ? this.waiting[this.waiting.length - 1]! : this.hop ? this.hop.to : this.at;
  }

  /** The place she is going to next, or the one she is on. */
  get heading(): number {
    return this.hop ? this.hop.to : this.waiting.length > 0 ? this.waiting[0]! : this.at;
  }

  /**
   * Asks her to hop to a place when she can. Says whether she will: not to where she is going, and
   * not if too many wait.
   */
  go(place: number, limit = MOST_WAITING): boolean {
    if (place === this.target) return false;
    if (this.waiting.length >= limit) return false;
    this.waiting.push(place);
    return true;
  }

  /**
   * Moves her on to a time. `landed` is told where she came down, and `left` where she springs from
   * and to. A hop that has been asked for starts at once if she is on a pad, and the moment she
   * lands if she is not.
   */
  step(
    now: number,
    spots: Spots,
    hooks: {
      left?: (from: number, to: number, hop: { flight: number; height: number }) => void;
      landed: (place: number) => void;
    },
  ): void {
    for (let guard = 0; guard < 4; guard++) {
      const hop = this.hop;
      if (hop && now >= hop.start + CROUCH + hop.flight) {
        this.at = hop.to;
        this.landed = hop.start + CROUCH + hop.flight;
        this.hop = null;
        hooks.landed(hop.to);
        continue;
      }
      if (!hop && this.waiting.length > 0) {
        const to = this.waiting.shift()!;
        const a = spots(this.at);
        const b = spots(to);
        const distance = Math.hypot(b.x - a.x, b.y - a.y);
        const face = Math.abs(b.x - a.x) > 4 ? Math.sign(b.x - a.x) : this.face;
        this.face = face;
        const start = Math.max(now, this.landed + 0.02);
        this.hop = { from: this.at, to, start, flight: flightOf(distance), height: heightOf(distance), face };
        hooks.left?.(this.at, to, this.hop);
        continue;
      }
      break;
    }
  }

  /** How she is placed and shaped at a time. */
  body(now: number, spots: Spots): Body {
    const hop = this.hop;
    if (!hop) {
      const p = spots(this.at);
      const since = now - this.landed;
      const low = since >= 0 && since < SETTLE ? 1 - since / SETTLE : 0;
      // After a landing she is squashed and springs back, with a little overshoot.
      const wobble = low > 0 ? Math.sin((1 - low) * Math.PI * 2.6) * 0.07 * low : 0;
      const squash = low * 0.2;
      return {
        x: p.x,
        y: p.y,
        lift: 0,
        pose: low > 0.45 ? 'crouch' : 'sit',
        sx: 1 + squash * 0.7 - wobble * 0.5,
        sy: 1 - squash + wobble,
        tilt: 0,
        face: this.face,
        through: 0,
      };
    }
    const a = spots(hop.from);
    const b = spots(hop.to);
    const t = now - hop.start;
    if (t < CROUCH) {
      const u = clamp(t / CROUCH);
      return {
        x: a.x,
        y: a.y,
        lift: 0,
        pose: 'crouch',
        sx: 1 + 0.14 * u,
        sy: 1 - 0.2 * u,
        tilt: 0,
        face: hop.face,
        through: 0,
      };
    }
    const u = clamp((t - CROUCH) / hop.flight);
    const lift = 4 * hop.height * u * (1 - u);
    // Stretched going up and coming down, and a little round at the top.
    const stretch = 0.1 * Math.cos(u * Math.PI * 2) * 0.5 + 0.05;
    return {
      x: lerp(a.x, b.x, u),
      y: lerp(a.y, b.y, u),
      lift,
      pose: 'air',
      sx: 1 - stretch * 0.6,
      sy: 1 + stretch,
      tilt: hop.face * 0.2 * Math.sin(u * Math.PI),
      face: hop.face,
      through: u,
    };
  }
}
