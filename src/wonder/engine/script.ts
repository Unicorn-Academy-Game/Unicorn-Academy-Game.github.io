interface Cue {
  at: number;
  run: () => void;
  done: boolean;
}

/**
 * A list of things to do at moments in time, for choreographing a finale: "at 0.4 seconds a shell,
 * at 0.9 another". It only has a clock that the game moves, so the same finale plays the same way
 * every time and a test can step through it.
 */
export class Script {
  private cues: Cue[] = [];
  private time = 0;

  get now(): number {
    return this.time;
  }

  /** How many cues have not yet run. */
  get pending(): number {
    return this.cues.reduce((n, c) => n + (c.done ? 0 : 1), 0);
  }

  get finished(): boolean {
    return this.pending === 0;
  }

  /**
   * Runs `run` when the script reaches `seconds`. A cue added in the past runs at the next step.
   */
  at(seconds: number, run: () => void): this {
    this.cues.push({ at: seconds, run, done: false });
    this.cues.sort((a, b) => a.at - b.at);
    return this;
  }

  /** Runs `run(i)` for each of `count` moments spread from `from` to `to` seconds. */
  spread(from: number, to: number, count: number, run: (i: number, of: number) => void): this {
    for (let i = 0; i < count; i++)
      this.at(count <= 1 ? from : from + ((to - from) * i) / (count - 1), () => run(i, count));
    return this;
  }

  /**
   * Moves time on and runs what has come due, in order. A cue added by a running cue, if it is
   * already due, runs at the next step at the latest.
   */
  update(dt: number): void {
    this.time += dt;
    for (let i = 0; i < this.cues.length; i++) {
      const cue = this.cues[i]!;
      if (cue.done || cue.at > this.time) continue;
      cue.done = true;
      cue.run();
    }
    if (this.cues.length > 64 && this.cues.every((c) => c.done)) this.cues = [];
  }

  clear(): void {
    this.cues = [];
    this.time = 0;
  }
}
