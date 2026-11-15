/**
 * A run is things of a row played one after another, along the row, with no more than a moment
 * between them: the jets of a finger that is drawn across them, the pads of a frog that hops along
 * them, or of a child who taps along them. A run of four or more is a sweep, and one that goes all
 * the way along the row is a scale.
 */

/** The seconds between two things that are part of the same run, if the game says nothing else. */
const GAP = 0.55;
export const SWEEP = 4;

export interface Run {
  /** How many in a row, with the one just played. */
  readonly length: number;
  /** 1 along the row from its first end, -1 back, 0 for a single one. */
  readonly way: number;
}

export class Runs {
  constructor(
    /** How many things there are in the row. */
    private readonly count = 7,
    /** The seconds between two that are part of one run. */
    private readonly gap = GAP,
  ) {}

  private last = -1;
  private at = -99;
  private way = 0;
  private length = 0;

  reset(): void {
    this.last = -1;
    this.at = -99;
    this.way = 0;
    this.length = 0;
  }

  /** A thing is played at a time. Says what the run is now. */
  play(jet: number, now: number): Run {
    const step = this.last < 0 ? 0 : jet - this.last;
    const near = now - this.at <= this.gap;
    if (near && Math.abs(step) === 1 && (this.way === 0 || this.way === step)) {
      this.way = step;
      this.length += 1;
    } else if (near && step === 0 && this.length > 0) {
      // The same jet again does not break a run, and does not make it longer.
    } else {
      this.way = 0;
      this.length = 1;
    }
    this.last = jet;
    this.at = now;
    return { length: this.length, way: this.way };
  }

  /** Whether a run is the whole scale, one end of the row to the other. */
  isScale(run: Run): boolean {
    return run.length >= this.count;
  }
}
