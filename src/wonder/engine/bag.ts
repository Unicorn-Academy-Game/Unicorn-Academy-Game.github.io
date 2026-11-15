import type { Rng } from '../../domain/rng';

/**
 * A bag of things drawn in a shuffled order, every one before any comes round again, and never the
 * one just drawn twice in a row. A child who taps ten times sees ten different things instead of
 * three of them and a repeat.
 */
export class Bag<T> {
  private order: T[] = [];
  private last: T | undefined;

  constructor(
    private readonly items: readonly T[],
    private readonly rng: Rng,
  ) {
    if (items.length === 0) throw new Error('a bag needs something in it');
  }

  next(): T {
    if (this.order.length === 0) this.refill();
    const item = this.order.pop()!;
    this.last = item;
    return item;
  }

  /** The item that will be drawn next, without drawing it. */
  peek(): T {
    if (this.order.length === 0) this.refill();
    return this.order[this.order.length - 1]!;
  }

  private refill(): void {
    const order = [...this.items];
    for (let i = order.length - 1; i > 0; i--) {
      const j = this.rng.int(i + 1);
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    // The next one drawn is the last of the list. It must not be the one drawn just now.
    if (order.length > 1 && order[order.length - 1] === this.last) {
      const k = this.rng.int(order.length - 1);
      [order[order.length - 1], order[k]] = [order[k]!, order[order.length - 1]!];
    }
    this.order = order;
  }
}
