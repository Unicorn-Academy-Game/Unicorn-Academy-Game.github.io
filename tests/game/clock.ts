import { T0 } from '../learning/helpers';

/**
 * A clock that only moves when the test says so, and runs what was waiting for it in the order it
 * was due.
 */
export class Clock {
  now = T0;
  private readonly queue: { at: number; seq: number; run: () => void; live: boolean }[] = [];
  private seq = 0;

  readonly later = (ms: number, run: () => void): (() => void) => {
    const item = { at: this.now + ms, seq: this.seq++, run, live: true };
    this.queue.push(item);
    return () => {
      item.live = false;
    };
  };

  advance(ms: number): void {
    const end = this.now + ms;
    for (;;) {
      const next = this.queue.filter((i) => i.live && i.at <= end).sort((a, b) => a.at - b.at || a.seq - b.seq)[0];
      if (!next) break;
      next.live = false;
      this.now = Math.max(this.now, next.at);
      next.run();
    }
    this.now = end;
  }

  get waiting(): number {
    return this.queue.filter((i) => i.live).length;
  }
}
