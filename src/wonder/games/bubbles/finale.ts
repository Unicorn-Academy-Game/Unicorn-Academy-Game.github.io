/**
 * The timing of the finale, and nothing else. The garden sings, the great bubble opens and the
 * bubbles in the air are called to it, it is blown up and shivers and bursts, and the friends are
 * lifted into the storm it leaves and burst out of their own bubbles one after another. This says
 * when each of those begins, in order and once each, so the game can do them and the timing can be
 * tested on its own. The only thing it asks the game is how many bubbles are still on their way to
 * the great one.
 */

export type Stage = 'gather' | 'swell' | 'burst' | 'done';

export type Cue =
  | { readonly is: 'sing' }
  | { readonly is: 'open' }
  | { readonly is: 'gather' }
  | { readonly is: 'swell' }
  | { readonly is: 'shiver' }
  | { readonly is: 'burst' }
  | { readonly is: 'lift'; readonly friend: number }
  | { readonly is: 'pop'; readonly friend: number }
  | { readonly is: 'done' };

/**
 * When the great bubble opens, and when the bubbles are called to it, in seconds from the start.
 */
export const OPEN_AT = 0.7;
export const GATHER_AT = 1;
/**
 * The least and the most time the gathering takes. A bubble that has not got there by then is taken
 * in anyway.
 */
export const GATHER_LEAST = 0.9;
export const GATHER_MOST = 3.8;
/** How long after it is blown up it begins to shiver, and how long until it bursts. */
export const SHIVER_AFTER = 0.6;
export const SWELL_SECONDS = 1.7;
/**
 * After the burst: when the first friend is lifted and how far apart they are, and when the first
 * bursts out of her bubble and how far apart.
 */
export const LIFT_FIRST = 0.35;
export const LIFT_EVERY = 0.22;
export const POP_FIRST = 3.3;
export const POP_EVERY = 0.27;
/**
 * How long after the last friend's bubble bursts it is over: time for her to float down and for the
 * last sparkle to go out.
 */
export const LAND_AFTER = 1.8;

export class Finale {
  private age = 0;
  private now: Stage = 'gather';
  private since = 0;
  private told = 0;
  private opened = false;
  private called = false;
  private shivered = false;
  private lifted = 0;
  private popped = 0;

  constructor(private readonly friends: number) {}

  get stage(): Stage {
    return this.now;
  }

  /** Seconds since it began. */
  get seconds(): number {
    return this.age;
  }

  /**
   * Moves it on by `dt` seconds and says what begins. `left` is how many bubbles are still on their
   * way to the great one.
   */
  step(dt: number, left: number): Cue[] {
    const out: Cue[] = [];
    if (this.now === 'done') return out;
    this.age += dt;
    if (this.told === 0) {
      this.told = 1;
      out.push({ is: 'sing' });
    }
    if (!this.opened && this.age >= OPEN_AT) {
      this.opened = true;
      out.push({ is: 'open' });
    }
    if (!this.called && this.age >= GATHER_AT) {
      this.called = true;
      this.since = this.age - GATHER_AT;
      out.push({ is: 'gather' });
      return this.carry(out, 0, left);
    }
    if (!this.called) return out;
    return this.carry(out, dt, left);
  }

  /** Whatever the stage is, time goes on in it. */
  private carry(out: Cue[], dt: number, left: number): Cue[] {
    this.since += dt;
    if (this.now === 'gather') {
      if (this.since >= GATHER_MOST || (this.since >= GATHER_LEAST && left === 0)) {
        this.now = 'swell';
        this.since = 0;
        out.push({ is: 'swell' });
      }
    }
    if (this.now === 'swell') {
      if (!this.shivered && this.since >= SHIVER_AFTER) {
        this.shivered = true;
        out.push({ is: 'shiver' });
      }
      if (this.since >= SWELL_SECONDS) {
        this.now = 'burst';
        this.since = 0;
        out.push({ is: 'burst' });
      }
    }
    if (this.now === 'burst') {
      while (this.lifted < this.friends && this.since >= LIFT_FIRST + this.lifted * LIFT_EVERY)
        out.push({ is: 'lift', friend: this.lifted++ });
      while (this.popped < this.friends && this.since >= POP_FIRST + this.popped * POP_EVERY)
        out.push({ is: 'pop', friend: this.popped++ });
      if (this.since >= POP_FIRST + Math.max(0, this.friends - 1) * POP_EVERY + LAND_AFTER) {
        this.now = 'done';
        out.push({ is: 'done' });
      }
    }
    return out;
  }
}
