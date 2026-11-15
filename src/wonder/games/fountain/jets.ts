import { clamp, damp } from '../../engine/ease';
import { JET_COUNT } from './layout';

/**
 * The seven jets, as a clock. A jet is on while a finger is held on it, and for a short burst after
 * a finger has only touched it, so a tap is a puff and a held finger is a column that climbs. This
 * is only the state of the jets and the numbers of a column. Where the jewels go and how they look
 * is for the game.
 */

/** Units per second squared, down, for a jewel in the air. */
export const GRAVITY = 560;
/** How long a jet keeps going after a touch that was only a tap, in seconds. */
export const BURST = 0.5;
/**
 * The strength a column begins with. A tap makes a column of this much, and a finger held on it
 * makes it climb to full.
 */
export const FIRST = 0.55;
/** The seconds a held jet takes to go from the strength of a tap to full. */
const CLIMB = 0.7;
/** The most jewels a second one jet throws, at full strength, and the fewest at the least. */
const RATE_MOST = 26;
const RATE_LEAST = 12;
/** The share of the room above a jet that the weakest column and the strongest use. */
const HEIGHT_LEAST = 0.5;
const HEIGHT_MOST = 0.98;

/** How high a column of this strength goes, in units, from a jet with `room` units above it. */
export const heightOf = (level: number, room: number): number =>
  room * (HEIGHT_LEAST + (HEIGHT_MOST - HEIGHT_LEAST) * clamp(level));

/** How fast a jewel must leave the nozzle to go up `height` units and no further. */
export const speedFor = (height: number): number => Math.sqrt(2 * GRAVITY * Math.max(0, height));

/** How long a jewel that goes up `height` units is in the air before it is back at the nozzle. */
export const flightOf = (height: number): number => (2 * speedFor(height)) / GRAVITY;

export class Jets {
  /** How strong each column is now, from 0 (off) to 1. */
  readonly level: number[] = Array.from({ length: JET_COUNT }, () => 0);
  /** The time each jet was last pressed, for the drawing of its nozzle. */
  readonly pressed: number[] = Array.from({ length: JET_COUNT }, () => -99);
  private readonly holders = new Map<number, number>();
  private readonly until: number[] = Array.from({ length: JET_COUNT }, () => -99);
  private readonly owed: number[] = Array.from({ length: JET_COUNT }, () => 0);
  /** Whether a jet is being kept at full by the game itself, for the finale. */
  private readonly kept: boolean[] = Array.from({ length: JET_COUNT }, () => false);

  reset(): void {
    this.level.fill(0);
    this.pressed.fill(-99);
    this.holders.clear();
    this.until.fill(-99);
    this.owed.fill(0);
    this.kept.fill(false);
  }

  /**
   * A finger goes down on a jet, or slides onto it. The jet it was on before, if any, is let go.
   */
  press(jet: number, finger: number, now: number): void {
    this.holders.set(finger, jet);
    this.pressed[jet] = now;
    this.until[jet] = Math.max(this.until[jet]!, now + BURST);
    if (this.level[jet]! < FIRST) this.level[jet] = FIRST;
  }

  /**
   * A jet is made to go for `seconds`, with no finger on it: by a friend, or by the game. It begins
   * as strong as it can be.
   */
  kick(jet: number, now: number, seconds: number): void {
    this.pressed[jet] = now;
    this.until[jet] = Math.max(this.until[jet]!, now + seconds);
    this.level[jet] = Math.max(this.level[jet]!, 0.9);
  }

  /** A finger leaves the screen. Says which jet it was holding, or -1. */
  release(finger: number): number {
    const jet = this.holders.get(finger) ?? -1;
    this.holders.delete(finger);
    return jet;
  }

  /** Which jet a finger is on, or -1. */
  heldBy(finger: number): number {
    return this.holders.get(finger) ?? -1;
  }

  held(jet: number): boolean {
    for (const j of this.holders.values()) if (j === jet) return true;
    return false;
  }

  /** The game keeps a jet going, or lets it go. */
  keep(jet: number, on: boolean): void {
    this.kept[jet] = on;
  }

  /** Whether the jet is throwing jewels at a time. */
  on(jet: number, now: number): boolean {
    return this.kept[jet]! || this.held(jet) || now < this.until[jet]!;
  }

  /** Moves the clock on. A jet that is on climbs toward full and one that is off sinks. */
  step(dt: number, now: number): void {
    for (let i = 0; i < JET_COUNT; i++) {
      const lvl = this.level[i]!;
      if (this.on(i, now)) {
        this.level[i] = this.kept[i]! ? damp(lvl, 1, 5, dt) : Math.min(1, lvl + dt / CLIMB);
      } else this.level[i] = Math.max(0, lvl - dt * 3.2);
    }
  }

  /**
   * How many jewels a jet throws in `dt` seconds, a whole number, and what is left over is carried
   * to the next step.
   */
  throwing(jet: number, dt: number, now: number): number {
    if (!this.on(jet, now)) {
      this.owed[jet] = 0;
      return 0;
    }
    const rate = RATE_LEAST + (RATE_MOST - RATE_LEAST) * this.level[jet]!;
    this.owed[jet] = this.owed[jet]! + rate * dt;
    const whole = Math.floor(this.owed[jet]!);
    this.owed[jet] = this.owed[jet]! - whole;
    return whole;
  }

  /** How many jets are throwing jewels. */
  count(now: number): number {
    let n = 0;
    for (let i = 0; i < JET_COUNT; i++) if (this.on(i, now)) n++;
    return n;
  }
}
