/** The most a big flash may light the screen, as a share of full white. */
export const FLASH_CAP = 0.22;
/** A flash weaker than this is just a glow, and is not counted. */
const NOTICEABLE = 0.1;
/**
 * How many noticeable flashes may land in one second. Three a second is the line photosensitivity
 * guidance draws.
 */
const PER_SECOND = 3;

/**
 * Keeps the screen from flickering. Every flash a game wants to make is passed through here first:
 * a few a second are let through as asked, and the rest are thinned down to a soft glow. A game
 * that fires fifty shells at once is therefore still safe to look at.
 */
export class FlashBudget {
  private readonly times: number[] = [];

  /** The strength to flash with, given what the game wanted (0 to 1) at time `now` in seconds. */
  allow(wanted: number, now: number): number {
    const strength = Math.min(FLASH_CAP, Math.max(0, wanted) * FLASH_CAP);
    if (strength < NOTICEABLE) return strength;
    while (this.times.length > 0 && this.times[0]! <= now - 1) this.times.shift();
    if (this.times.length >= PER_SECOND) return NOTICEABLE * 0.6;
    this.times.push(now);
    return strength;
  }

  reset(): void {
    this.times.length = 0;
  }
}
