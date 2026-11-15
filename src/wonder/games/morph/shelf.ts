import type { FruitId } from './recipes';

/**
 * The shelf the new things stand on. It is a few rows of cells, filled from the top left, and what
 * is on it stays. When it is full the oldest thing is taken off to make room for the newest, so
 * there is always a place for what the machine has just made, and the shelf is always the last
 * stretch of what she made and not the first.
 */

export interface Shelved {
  readonly fruit: FruitId;
  /** When it landed, in seconds of the game's own clock. */
  readonly born: number;
  /** A number of its own, for the small ways one flower or one stone differs from another. */
  readonly seed: number;
}

export class Shelf {
  private readonly items: (Shelved | null)[];
  private readonly held: boolean[];

  constructor(readonly size: number) {
    this.items = Array.from({ length: size }, () => null);
    this.held = Array.from({ length: size }, () => false);
  }

  reset(): void {
    this.items.fill(null);
    this.held.fill(false);
  }

  /** What is in a cell, or nothing. */
  at(cell: number): Shelved | null {
    return this.items[cell] ?? null;
  }

  /** How many things are on the shelf. */
  get count(): number {
    return this.items.reduce((n, item) => n + (item ? 1 : 0), 0);
  }

  /** How many different fruit the things on it came from. */
  get kinds(): number {
    return new Set(this.items.filter((i): i is Shelved => i !== null).map((i) => i.fruit)).size;
  }

  /**
   * Keeps a cell for something that is on its way, and says which. An empty cell is kept if there
   * is one, in order, and if there is none it is the oldest thing's, which stays where it is until
   * the new one lands.
   */
  reserve(): number {
    for (let i = 0; i < this.size; i++) {
      if (this.items[i] === null && !this.held[i]) {
        this.held[i] = true;
        return i;
      }
    }
    let oldest = -1;
    for (let i = 0; i < this.size; i++) {
      if (this.held[i]) continue;
      if (oldest < 0 || this.items[i]!.born < this.items[oldest]!.born) oldest = i;
    }
    // Everything is on its way: share the oldest cell, and the later one lands over the earlier.
    if (oldest < 0) oldest = 0;
    this.held[oldest] = true;
    return oldest;
  }

  /**
   * A thing lands in the cell that was kept for it, and what was there goes. Says what it replaced.
   */
  land(cell: number, item: Shelved): Shelved | null {
    const was = this.items[cell] ?? null;
    this.items[cell] = item;
    this.held[cell] = false;
    return was;
  }

  /**
   * The cell that something is at, from the cells it is nearest to, for the one the player touched.
   * `cells` is the centre of each.
   */
  static nearest(
    cells: readonly { x: number; y: number }[],
    items: Shelf,
    x: number,
    y: number,
    reach: number,
  ): number {
    let best = -1;
    let bestD = reach * reach;
    for (let i = 0; i < cells.length; i++) {
      if (!items.at(i)) continue;
      const d = (cells[i]!.x - x) ** 2 + (cells[i]!.y - y) ** 2;
      if (d <= bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }
}
