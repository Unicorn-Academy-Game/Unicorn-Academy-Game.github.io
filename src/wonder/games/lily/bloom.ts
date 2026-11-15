import { LOTUS_COUNT } from './layout';

/**
 * The seven lotuses. Each begins as a bud and opens when the frog lands on its pad, slowly and with
 * a little spring at the end, and stays open. When all seven are open the pond is whole, which the
 * player is told once; then the pond goes quiet and the lotuses close one after another down the
 * row, so that the player can open them all again.
 */

/** How fast a lotus opens and closes, as the part of its way it goes in a second. */
const OPEN_RATE = 2.6;
const CLOSE_RATE = 1.3;
/** The seconds between one lotus closing and the next. */
const LULL_GAP = 0.34;

export class Lotuses {
  /** How open each one is, 0 a bud and 1 a flower, moving toward what it should be. */
  readonly open: number[] = Array.from({ length: LOTUS_COUNT }, () => 0);
  private readonly wants: boolean[] = Array.from({ length: LOTUS_COUNT }, () => false);
  private readonly closeAt: number[] = Array.from({ length: LOTUS_COUNT }, () => Infinity);
  private armed = true;

  reset(): void {
    this.open.fill(0);
    this.wants.fill(false);
    this.closeAt.fill(Infinity);
    this.armed = true;
  }

  /** Opens a lotus. Says whether it was a bud: one that is open already stays as it is. */
  bloom(lotus: number): boolean {
    if (this.wants[lotus]) return false;
    this.wants[lotus] = true;
    this.closeAt[lotus] = Infinity;
    return true;
  }

  isOpen(lotus: number): boolean {
    return this.wants[lotus]!;
  }

  /** How many are open, or opening. */
  get count(): number {
    return this.wants.filter(Boolean).length;
  }

  /** Whether every lotus is open or opening. */
  get whole(): boolean {
    return this.count === LOTUS_COUNT;
  }

  /**
   * True once when the pond becomes whole, and not again until a lotus has closed and all have
   * opened again.
   */
  completed(): boolean {
    if (this.armed && this.whole) {
      this.armed = false;
      return true;
    }
    return false;
  }

  /** Sends the pond to sleep: from a time, the lotuses close one after another along the row. */
  lull(from: number): void {
    for (let i = 0; i < LOTUS_COUNT; i++) if (this.wants[i]) this.closeAt[i] = from + i * LULL_GAP;
  }

  /** How long a lull takes from its beginning to the last lotus beginning to close. */
  static readonly LULL_SECONDS = (LOTUS_COUNT - 1) * LULL_GAP;

  /** Opens all of them at once, for the finale, and does not tell the player the pond is whole. */
  openAll(): void {
    this.wants.fill(true);
    this.closeAt.fill(Infinity);
    this.armed = false;
  }

  step(dt: number, now: number): void {
    for (let i = 0; i < LOTUS_COUNT; i++) {
      if (this.closeAt[i]! <= now) {
        this.wants[i] = false;
        this.closeAt[i] = Infinity;
      }
      const rate = this.wants[i] ? OPEN_RATE : CLOSE_RATE;
      const to = this.wants[i] ? 1 : 0;
      const o = this.open[i]!;
      this.open[i] = o < to ? Math.min(to, o + rate * dt) : Math.max(to, o - rate * dt);
    }
    if (!this.armed && this.count === 0) this.armed = true;
  }
}
