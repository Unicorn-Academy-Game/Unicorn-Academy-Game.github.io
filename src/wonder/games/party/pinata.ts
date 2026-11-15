import type { Rng } from '../../../domain/rng';
import { easeOutBounce } from '../../engine/ease';

/**
 * The pinata. It hangs by a rope, swings when it is touched and cracks a little more with each
 * knock, and when it has had enough it bursts and sweets fall out. A moment later another one is
 * let down on the rope, a different one each time.
 */

export const KINDS = ['star', 'heart', 'ball'] as const;
export type Kind = (typeof KINDS)[number];

/** How fast it swings, in radians a second, and how fast the swing dies. */
const NATURAL = 3.4;
const DRAG = 0.5;
/** How hard a knock pushes it, in radians a second. */
const KNOCK = 2.7;
/**
 * The highest it can be swung, in radians from hanging straight down. A knock that would send it
 * higher gives it only what takes it there.
 */
export const LIFT = 1.05;
/**
 * The most energy a swing can have, in the units its swing is worked in: that of a swing that stops
 * at `LIFT`.
 */
const MOST_ENERGY = NATURAL * NATURAL * (1 - Math.cos(LIFT));
/** How many knocks it takes, at the fewest and the most. */
const FEWEST = 3;
const MOST = 5;
/** Seconds the rope hangs empty after a burst, and seconds the next one takes to come down. */
const EMPTY = 1.4;
const LOWERING = 1.1;
/** How high above its place a new one starts, in units. */
const FROM = 190;

export type State = 'hanging' | 'broken' | 'coming';

/** What a knock did. */
export interface Knock {
  /** Which way it was pushed: 1 to the right, -1 to the left. */
  readonly push: 1 | -1;
  readonly burst: boolean;
  readonly hits: number;
  readonly needs: number;
  readonly kind: Kind;
}

export interface Spot {
  readonly x: number;
  /** Where the rope is tied. */
  readonly top: number;
  /** Where the middle of the pinata hangs when it is still. */
  readonly y: number;
  readonly r: number;
}

export class Pinata {
  x = 0;
  top = 0;
  y = 0;
  r = 30;
  /** How far the rope is from straight down, in radians, and how fast it is swinging. */
  angle = 0;
  omega = 0;
  state: State = 'hanging';
  hits = 0;
  needs = FEWEST;
  kind: Kind = KINDS[0];
  /** How many have been burst, which is how many sweets the party has had. */
  count = 0;
  /** Seconds since it burst, while it is broken, or since it began to come down. */
  since = 0;

  constructor(private readonly rng: Rng) {
    this.needs = this.knocks();
  }

  place(spot: Spot): void {
    this.x = spot.x;
    this.top = spot.top;
    this.y = spot.y;
    this.r = spot.r;
  }

  reset(): void {
    this.angle = 0;
    this.omega = 0;
    this.state = 'hanging';
    this.hits = 0;
    this.count = 0;
    this.since = 0;
    this.kind = KINDS[0];
    this.needs = this.knocks();
  }

  private knocks(): number {
    return FEWEST + this.rng.int(MOST - FEWEST + 1);
  }

  /** How long the rope is, from where it is tied to the middle of the pinata. */
  get rope(): number {
    return Math.max(20, this.y - this.top);
  }

  /** How high above its place it is, while it is being let down. */
  get lowering(): number {
    if (this.state !== 'coming') return 0;
    return FROM * (1 - easeOutBounce(Math.min(1, this.since / LOWERING)));
  }

  /** Where the middle of the pinata is now, swinging and being let down. */
  middle(out: { x: number; y: number } = { x: 0, y: 0 }): { x: number; y: number } {
    const rope = this.rope - this.lowering;
    out.x = this.x + Math.sin(this.angle) * rope;
    out.y = this.top + Math.cos(this.angle) * rope;
    return out;
  }

  /** How cracked it is, from 0 to 1. */
  get crack(): number {
    return this.state === 'hanging' ? this.hits / this.needs : 0;
  }

  /** Whether a touch at a point is on the pinata, with room for a finger. */
  at(x: number, y: number): boolean {
    if (this.state !== 'hanging') return false;
    const m = this.middle();
    return Math.hypot(x - m.x, y - m.y) <= this.r + 12;
  }

  /** A knock at a point. It swings away from the touch, and the last one bursts it. */
  knock(x: number): Knock | null {
    if (this.state !== 'hanging') return null;
    const m = this.middle();
    const push = x <= m.x ? 1 : -1;
    // A knock against the way it is going stops it as much as it starts it, and always sends it
    // off.
    const pushed = (Math.sign(this.omega) === push ? this.omega : this.omega * 0.3) + push * KNOCK;
    // Knocks that keep step with the swing add up, and a pinata on a rope is not thrown over the
    // beam it hangs from.
    const room = MOST_ENERGY - NATURAL * NATURAL * (1 - Math.cos(this.angle));
    this.omega = Math.sign(pushed) * Math.min(Math.abs(pushed), Math.sqrt(2 * Math.max(0, room)));
    this.hits++;
    const burst = this.hits >= this.needs;
    const knock: Knock = { push, burst, hits: this.hits, needs: this.needs, kind: this.kind };
    if (burst) {
      this.state = 'broken';
      this.since = 0;
      this.count++;
    }
    return knock;
  }

  /**
   * It bursts now, whatever has been done to it, as when the party ends. Returns whether it had
   * anything to burst.
   */
  burstNow(): boolean {
    if (this.state !== 'hanging') return false;
    this.state = 'broken';
    this.since = 0;
    this.count++;
    return true;
  }

  update(dt: number): void {
    // A pendulum, in slices so a long frame cannot throw it.
    const slices = Math.max(1, Math.ceil(dt / 0.008));
    const h = dt / slices;
    for (let i = 0; i < slices; i++) {
      this.omega += (-NATURAL * NATURAL * Math.sin(this.angle) - DRAG * this.omega) * h;
      this.angle += this.omega * h;
    }
    if (this.state === 'hanging') return;
    this.since += dt;
    if (this.state === 'broken' && this.since >= EMPTY) {
      this.state = 'coming';
      this.since = 0;
      this.hits = 0;
      this.needs = this.knocks();
      this.kind = KINDS[this.count % KINDS.length]!;
      // The new one is let down on a rope that has nearly steadied.
      this.omega *= 0.3;
    } else if (this.state === 'coming' && this.since >= LOWERING) {
      this.state = 'hanging';
      this.since = 0;
    }
  }
}
