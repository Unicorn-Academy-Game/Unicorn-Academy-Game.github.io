import { JET_COUNT } from './layout';

/**
 * What the jewels do when they fall: they land in the pool of the jet that threw them and stay
 * there, in a heap that grows the more that jet is played. Here is the heap of each pool, a few at
 * a time, and the line of jewels that are still in the air and where each will come down.
 */

/** The jewels in a full heap: a row of five, then four, three, two and one on the top. */
export const ROWS = [5, 4, 3, 2, 1] as const;
export const MOST = ROWS.reduce((a, b) => a + b, 0);
/** How many jewels that come down make one that is added to the heap. */
const PER_STONE = 3;

/**
 * Where the jewel of a heap that is the `k`th goes, in jewels across from the middle and up from
 * the water.
 */
export function slotOf(k: number): { across: number; up: number } {
  let rest = Math.max(0, Math.min(MOST - 1, k));
  for (let row = 0; row < ROWS.length; row++) {
    const n = ROWS[row]!;
    if (rest < n) return { across: rest - (n - 1) / 2, up: row * 0.78 };
    rest -= n;
  }
  return { across: 0, up: (ROWS.length - 1) * 0.78 };
}

interface Flying {
  readonly at: number;
  readonly jet: number;
}

export class Piles {
  /** How many jewels stand in each heap. */
  readonly count: number[] = Array.from({ length: JET_COUNT }, () => 0);
  /** The time the heap last had one added, for its hop. */
  readonly added: number[] = Array.from({ length: JET_COUNT }, () => -99);
  private readonly stones: number[] = Array.from({ length: JET_COUNT }, () => 0);
  private flying: Flying[] = [];

  reset(): void {
    this.count.fill(0);
    this.added.fill(-99);
    this.stones.fill(0);
    this.flying = [];
  }

  /** A jewel has left a jet and will be back in the pool at `at`. */
  launch(jet: number, at: number): void {
    this.flying.push({ at, jet });
  }

  /** How many are in the air. */
  get inAir(): number {
    return this.flying.length;
  }

  /**
   * The jewels that have come down by `now`. Calls `landed` with the jet of each, and says how many
   * there were.
   */
  land(now: number, landed: (jet: number, heapGrew: boolean) => void): number {
    let n = 0;
    const keep: Flying[] = [];
    for (const f of this.flying) {
      if (f.at > now) {
        keep.push(f);
        continue;
      }
      n++;
      this.stones[f.jet] = this.stones[f.jet]! + 1;
      let grew = false;
      if (this.stones[f.jet]! >= PER_STONE) {
        this.stones[f.jet] = 0;
        if (this.count[f.jet]! < MOST) {
          this.count[f.jet] = this.count[f.jet]! + 1;
          grew = true;
        }
        this.added[f.jet] = now;
      }
      landed(f.jet, grew);
    }
    this.flying = keep;
    return n;
  }

  /** Fills a heap, for the finale, where every pool runs over. */
  fill(jet: number, now: number): void {
    this.count[jet] = MOST;
    this.added[jet] = now;
  }

  /**
   * The heap that is touched at a place, or -1. `jets` are the pools, and the touch has to be on
   * the pool or the heap on it.
   */
  static at(
    jets: readonly { x: number; y: number; rx: number; ry: number }[],
    x: number,
    y: number,
    reach: number,
  ): number {
    let best = -1;
    let bestD = Infinity;
    jets.forEach((j, i) => {
      const dx = (x - j.x) / (j.rx + reach);
      const dy = (y - (j.y - j.rx * 0.45)) / (j.rx * 0.9 + reach);
      const d = dx * dx + dy * dy;
      if (d < 1 && d < bestD) {
        best = i;
        bestD = d;
      }
    });
    return best;
  }
}
