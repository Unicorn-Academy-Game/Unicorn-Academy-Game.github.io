/** How long the basket's numbers stay on the screen once they stop changing. */
export const BASKET_FADE_MS = 10_000;

/** What a `Fade` needs from the page's clock, so a test can run it without waiting. */
export interface Clock {
  after: (run: () => void, ms: number) => number;
  cancel: (id: number) => void;
}

const pageClock: Clock = { after: (run, ms) => window.setTimeout(run, ms), cancel: (id) => window.clearTimeout(id) };

/**
 * Something that sits out of the way once it has stopped changing. Each touch brings it back at
 * once and starts the wait again, so a number the player is still adding to never fades under their
 * finger.
 */
export class Fade {
  private timer: number | null = null;
  private faded = false;

  /** `show` is told true when it should be seen and false when it should fade away. */
  constructor(
    private readonly show: (seen: boolean) => void,
    private readonly ms: number = BASKET_FADE_MS,
    private readonly clock: Clock = pageClock,
  ) {}

  get resting(): boolean {
    return this.faded;
  }

  /** It changed, or the player looked at it. */
  touch(): void {
    if (this.timer !== null) this.clock.cancel(this.timer);
    if (this.faded) {
      this.faded = false;
      this.show(true);
    }
    this.timer = this.clock.after(() => {
      this.timer = null;
      this.faded = true;
      this.show(false);
    }, this.ms);
  }
}
