import type { SaveClock } from '../../src/persistence/save-service';
import type { WorldSaveV1 } from '../../src/shared/save';
import { initialWorld } from '../../src/shared/start';

/** A clock the test winds by hand. Timers run only when it is advanced. */
export class ManualClock implements SaveClock {
  private timers: { at: number; fn: () => void }[] = [];
  constructor(public t: number) {}
  now(): number {
    return this.t;
  }
  later(ms: number, fn: () => void): () => void {
    const entry = { at: this.t + ms, fn };
    this.timers.push(entry);
    return () => {
      this.timers = this.timers.filter((x) => x !== entry);
    };
  }
  advance(ms: number): void {
    this.t += ms;
    const due = this.timers.filter((x) => x.at <= this.t).sort((a, b) => a.at - b.at);
    this.timers = this.timers.filter((x) => x.at > this.t);
    for (const x of due) x.fn();
  }
  get pending(): number {
    return this.timers.length;
  }
}

/** An id of the shape the save format asks for, counting up from `n`. */
const uuid = (n: number): string => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

let sequence = 0;

/** A valid save. Each call gets its own snapshot id unless one is given. */
export function snap(over: Partial<WorldSaveV1> & { generation?: string } = {}): WorldSaveV1 {
  const { generation, ...rest } = over;
  const base = initialWorld({ worldGeneration: generation ?? uuid(0xaa), snapshotId: uuid(++sequence), rngState: 7 });
  return { ...base, ...rest };
}
