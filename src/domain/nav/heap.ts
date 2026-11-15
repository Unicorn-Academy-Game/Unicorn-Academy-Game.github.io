/**
 * Binary min-heap of integer items ordered by a float key. Reused between searches to avoid
 * allocation.
 */
export class MinHeap {
  private items = new Int32Array(1024);
  private keys = new Float64Array(1024);
  private n = 0;

  get size(): number {
    return this.n;
  }

  clear(): void {
    this.n = 0;
  }

  push(item: number, key: number): void {
    if (this.n === this.items.length) {
      const items = new Int32Array(this.n * 2);
      const keys = new Float64Array(this.n * 2);
      items.set(this.items);
      keys.set(this.keys);
      this.items = items;
      this.keys = keys;
    }
    let i = this.n++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p]! <= key) break;
      this.items[i] = this.items[p]!;
      this.keys[i] = this.keys[p]!;
      i = p;
    }
    this.items[i] = item;
    this.keys[i] = key;
  }

  /** Removes and returns the item with the smallest key. The heap must not be empty. */
  pop(): number {
    const top = this.items[0]!;
    const last = --this.n;
    if (last > 0) {
      const item = this.items[last]!;
      const key = this.keys[last]!;
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= last) break;
        if (c + 1 < last && this.keys[c + 1]! < this.keys[c]!) c++;
        if (this.keys[c]! >= key) break;
        this.items[i] = this.items[c]!;
        this.keys[i] = this.keys[c]!;
        i = c;
      }
      this.items[i] = item;
      this.keys[i] = key;
    }
    return top;
  }
}
