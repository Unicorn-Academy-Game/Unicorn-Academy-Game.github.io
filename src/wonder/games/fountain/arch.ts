/**
 * The rainbow over the fountain. It has seven bands, one for each jet, and a band lights up when
 * its jet is played and fades a few seconds after, so that the player paints the rainbow with the
 * jets. When all seven are lit at once the rainbow is whole, which they are told, and it takes all
 * of them to fade before they can be told again.
 */

export const BANDS = 7;
/** Seconds a band keeps its full light, and then the seconds it takes to go out. */
const HOLD = 3.4;
const FADE = 2.2;
/** The least a band shines for the rainbow to count as whole. */
const WHOLE = 0.35;

export class Arch {
  readonly level: number[] = Array.from({ length: BANDS }, () => 0);
  private readonly lit: number[] = Array.from({ length: BANDS }, () => -99);
  private armed = true;
  /** Held up by the game, for the finale and after it. */
  private floor = 0;

  reset(): void {
    this.level.fill(0);
    this.lit.fill(-99);
    this.armed = true;
    this.floor = 0;
  }

  /** The band of a jet is lit at a time. */
  light(band: number, now: number): void {
    this.lit[band] = now;
    this.level[band] = 1;
  }

  /** The game holds every band at least this bright, 0 to let go. */
  hold(least: number): void {
    this.floor = least;
  }

  /** Works out how bright each band is at a time. */
  step(now: number): void {
    for (let i = 0; i < BANDS; i++) {
      const since = now - this.lit[i]!;
      const own = since < HOLD ? 1 : Math.max(0, 1 - (since - HOLD) / FADE);
      this.level[i] = Math.max(own, this.floor);
    }
  }

  /** Whether every band is shining. */
  get whole(): boolean {
    return this.level.every((l) => l >= WHOLE);
  }

  /** True once when the rainbow becomes whole, and not again until it has gone out. */
  completed(): boolean {
    if (this.armed && this.level.every((l) => l >= WHOLE && l > this.floor - 1e-9) && this.floor === 0) {
      this.armed = false;
      return true;
    }
    if (!this.armed && this.level.every((l) => l < 0.05)) this.armed = true;
    return false;
  }

  /** How many bands are shining. */
  get shining(): number {
    return this.level.filter((l) => l >= WHOLE).length;
  }
}
