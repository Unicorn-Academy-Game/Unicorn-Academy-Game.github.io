import type { Constellation, Spot } from './constellations';

/** One star of the picture, asleep or awake. */
export interface Star {
  x: number;
  y: number;
  /** The game's time when it woke, or -1 while it sleeps. */
  woke: number;
  /**
   * How many stars were awake before it woke, so it is the first (0), the second (1) and so on. -1
   * while it sleeps.
   */
  order: number;
}

/**
 * How long a line takes to draw itself from the star that woke first to the one that woke after.
 */
export const LINE_SECONDS = 0.5;

/**
 * The stars of a picture and which of them are awake. It is only the rules: where the stars are,
 * who wakes when a burst opens somewhere, which line has been drawn. How a star looks, and what a
 * wake sounds like, are the game's.
 */
export class Sleepers {
  readonly stars: Star[];
  private awakeCount = 0;

  constructor(readonly picture: Constellation) {
    this.stars = picture.points.map((p) => ({ x: p.x, y: p.y, woke: -1, order: -1 }));
  }

  get count(): number {
    return this.stars.length;
  }

  get awake(): number {
    return this.awakeCount;
  }

  /** Every star is awake. */
  get done(): boolean {
    return this.awakeCount === this.stars.length;
  }

  /**
   * Puts each star at its place on the screen, one place for each star. Which are awake does not
   * change.
   */
  place(spots: readonly Spot[]): void {
    spots.forEach((p, i) => {
      const star = this.stars[i];
      if (!star) return;
      star.x = p.x;
      star.y = p.y;
    });
  }

  /**
   * Every star asleep, in the order it is nearest the point, and no further than `radius` from it.
   */
  asleepNear(x: number, y: number, radius: number): number[] {
    const found: { i: number; d: number }[] = [];
    this.stars.forEach((s, i) => {
      if (s.woke >= 0) return;
      const d = Math.hypot(s.x - x, s.y - y);
      if (d <= radius) found.push({ i, d });
    });
    return found.sort((a, b) => a.d - b.d).map((f) => f.i);
  }

  /** The star nearest the point, awake or not, within `radius` of it, or -1. */
  nearest(x: number, y: number, radius: number, asleep = false): number {
    let best = -1;
    let bestD = radius;
    this.stars.forEach((s, i) => {
      if (asleep && s.woke >= 0) return;
      const d = Math.hypot(s.x - x, s.y - y);
      if (d <= bestD) {
        best = i;
        bestD = d;
      }
    });
    return best;
  }

  /** Wakes a star. It does nothing, and says so, for one that is awake. */
  wake(i: number, now: number): boolean {
    const star = this.stars[i];
    if (!star || star.woke >= 0) return false;
    star.woke = now;
    star.order = this.awakeCount++;
    return true;
  }

  /** The stars from left to right, which is the order they are lit in when the picture sings. */
  leftToRight(): number[] {
    return this.stars.map((_, i) => i).sort((a, b) => this.stars[a]!.x - this.stars[b]!.x || a - b);
  }

  /**
   * How much of a line is drawn, from 0 to 1. A line starts when the second of its two stars wakes,
   * so it is not there while either sleeps, and it grows from the star that woke first.
   */
  drawn(a: number, b: number, now: number): number {
    const from = this.stars[a];
    const to = this.stars[b];
    if (!from || !to || from.woke < 0 || to.woke < 0) return 0;
    return Math.min(1, Math.max(0, (now - Math.max(from.woke, to.woke)) / LINE_SECONDS));
  }

  /** Which of a line's two ends it grows from: the one that woke first. */
  source(a: number, b: number): number {
    return this.stars[a]!.woke <= this.stars[b]!.woke ? a : b;
  }

  /** Puts every star back to sleep. */
  reset(): void {
    for (const s of this.stars) {
      s.woke = -1;
      s.order = -1;
    }
    this.awakeCount = 0;
  }
}
