/**
 * What went wrong in a frame or an event and was carried past, so that one failure does not take
 * the game with it. The engine draws the next frame only if the last one came back, so a sound that
 * throws for one event would stop the picture, the herd and every tap for good. Each failure is
 * counted by where it happened. It is told to the console the first few times and then at each
 * power of ten, so one that happens every frame does not fill the log.
 *
 * It also counts what the game noticed was wrong and put right by itself, where nothing was thrown:
 * the two ways Wildstar can stop answering that a parent has no way to see. A parent who says
 * Wildstar got stuck can then be told whether the game saw it.
 */
export class Faults {
  readonly counts = new Map<string, number>();

  /**
   * A touch that the game was still holding after it had ended, found out and let go; and times
   * Wildstar was freed after she was meant to move and did not.
   */
  readonly repaired = { touch: 0, freed: 0 };

  repair(what: keyof Faults['repaired']): void {
    this.repaired[what] += 1;
  }

  get total(): number {
    let all = 0;
    for (const n of this.counts.values()) all += n;
    return all;
  }

  report(where: string, error: unknown): void {
    const n = (this.counts.get(where) ?? 0) + 1;
    this.counts.set(where, n);
    if (n <= 3 || Number.isInteger(Math.log10(n))) console.error(`${where}: ${n} so far`, error);
  }

  /** Runs one part of a frame, and when it fails counts that and goes on. */
  carry(where: string, run: () => void): void {
    try {
      run();
    } catch (error) {
      this.report(where, error);
    }
  }

  /**
   * Keeps a frame that the engine cannot finish from ending the loop. The engine asks the browser
   * for its next frame only after this one has come back, so one failure anywhere in its step (the
   * picture, an event, a plugin) would stop the world and every tap for good, and a page that goes
   * dark and comes back does not start it again. The parts of a frame that the game owns are
   * carried past one by one, and this is for what it does not own.
   */
  guard(loop: { callback: (time: number, delta: number) => void }): void {
    const frame = loop.callback;
    loop.callback = (time, delta) => {
      try {
        frame(time, delta);
      } catch (error) {
        this.report('engine', error);
      }
    };
  }
}

/**
 * The one count for the page, which is also what a test reads to see that something was carried
 * past.
 */
export const faults = new Faults();
