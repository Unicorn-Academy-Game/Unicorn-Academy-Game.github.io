/** The five stars a game fills. Each game says how much play each one costs. */
export const STARS = 5;

/**
 * The costs of a meter that nothing fills, for a game that has no stars to earn. They are never
 * asked for.
 */
export const UNEARNED = [1, 2, 3, 4, 5] as const;

/**
 * Counts play toward five stars. The cost of each star is the game's own, but they are always
 * rising, so the first comes quickly and the last is a little further on. Play never takes a star
 * back.
 */
export class Meter {
  private points = 0;
  private earned = 0;

  constructor(private readonly costs: readonly number[]) {
    if (costs.length !== STARS) throw new Error(`a meter has ${STARS} costs`);
    for (let i = 0; i < costs.length; i++) {
      if (!(costs[i]! > 0) || (i > 0 && costs[i]! <= costs[i - 1]!))
        throw new Error('the costs of the stars must be positive and rising');
    }
  }

  get score(): number {
    return this.points;
  }

  /** Stars earned so far, 0 to 5. */
  get stars(): number {
    return this.earned;
  }

  /** How far the player is toward the next star, 0 to 1. Always 1 when all five are earned. */
  get fraction(): number {
    if (this.earned >= STARS) return 1;
    const from = this.earned === 0 ? 0 : this.costs[this.earned - 1]!;
    const to = this.costs[this.earned]!;
    return Math.min(1, Math.max(0, (this.points - from) / (to - from)));
  }

  get full(): boolean {
    return this.earned >= STARS;
  }

  /** Adds play. Returns how many stars it earned, which can be more than one for a big moment. */
  add(amount: number): number {
    if (!(amount > 0)) return 0;
    this.points += amount;
    let gained = 0;
    while (this.earned < STARS && this.points >= this.costs[this.earned]!) {
      this.earned++;
      gained++;
    }
    return gained;
  }

  /** Starts over. */
  reset(): void {
    this.points = 0;
    this.earned = 0;
  }
}
