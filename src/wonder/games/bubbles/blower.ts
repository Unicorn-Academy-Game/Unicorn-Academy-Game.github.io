import { PRIZES_MOST } from './field';

/**
 * Blowing a bubble of the player's own. A touch on the machine that is let go at once is a tap. One
 * that is held becomes a bubble that forms at the ring and grows, one more prize in it every moment
 * they hold on, until it holds as many as a bubble may. Letting go sends it up. This is only the
 * timing of that: what a bubble looks like and sounds like as it grows is the game's.
 */

/** How long a touch must be held before it is a blow and not a tap, in seconds. */
export const TAP_SECONDS = 0.28;
/** How long from one prize in a growing bubble to the next. */
export const EVERY_SECONDS = 0.8;
/**
 * How long after the last prize has gone in the bubble is called full, which is when it shivers to
 * say it can hold no more.
 */
export const FULL_AFTER = 0.7;

export type Blowing = { readonly is: 'begin' } | { readonly is: 'more'; readonly n: number } | { readonly is: 'full' };

/** What a touch that has ended was. */
export type Ended = { readonly is: 'tap' } | { readonly is: 'blown'; readonly n: number; readonly seconds: number };

export class Blower {
  private finger: number | null = null;
  private since = 0;
  /**
   * How many prizes the bubble holds so far, and how many of this touch's events have been told.
   */
  private held = 0;
  private told = 0;
  private fullTold = false;

  /** Whether a touch is on the machine now. */
  get holding(): boolean {
    return this.finger !== null;
  }

  /**
   * The prizes in the bubble the player is blowing: none until a touch has lasted as long as a tap.
   */
  get prizes(): number {
    return this.held;
  }

  /** How long this touch has lasted at `now`, in seconds. */
  seconds(now: number): number {
    return this.finger === null ? 0 : Math.max(0, now - this.since);
  }

  /**
   * A finger went down on the machine. A second finger while one is down does not start another
   * blow.
   */
  press(finger: number, now: number): boolean {
    if (this.finger !== null) return false;
    this.finger = finger;
    this.since = now;
    this.held = 0;
    this.told = 0;
    this.fullTold = false;
    return true;
  }

  /**
   * What has happened up to `now` that has not been told yet, in the order it happened. A long
   * frame may tell more than one.
   */
  step(now: number): Blowing[] {
    if (this.finger === null) return [];
    const out: Blowing[] = [];
    const at = this.seconds(now);
    // The first prize comes when the touch is no longer a tap, and each after it one beat later.
    const due = at < TAP_SECONDS ? 0 : Math.min(PRIZES_MOST, 1 + Math.floor((at - TAP_SECONDS) / EVERY_SECONDS));
    while (this.told < due) {
      this.told++;
      this.held = this.told;
      out.push(this.told === 1 ? { is: 'begin' } : { is: 'more', n: this.told });
    }
    const fullAt = TAP_SECONDS + (PRIZES_MOST - 1) * EVERY_SECONDS + FULL_AFTER;
    if (!this.fullTold && at >= fullAt) {
      this.fullTold = true;
      out.push({ is: 'full' });
    }
    return out;
  }

  /** A finger came up. If it is the one that was holding, the touch is over. */
  lift(finger: number, now: number): Ended | null {
    if (this.finger !== finger) return null;
    const seconds = this.seconds(now);
    const n = this.held;
    this.finger = null;
    this.held = 0;
    this.told = 0;
    return n === 0 ? { is: 'tap' } : { is: 'blown', n, seconds };
  }

  /**
   * The touch is dropped without being let go, because the game has been put back to its start or
   * is being shown again.
   */
  cancel(): void {
    this.finger = null;
    this.held = 0;
    this.told = 0;
  }
}
