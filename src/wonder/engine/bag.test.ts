import { describe, expect, it } from 'vitest';
import { Rng } from '../../domain/rng';
import { Bag } from './bag';

describe('Bag', () => {
  it('gives every item once before any comes round again', () => {
    const bag = new Bag(['a', 'b', 'c', 'd', 'e'], new Rng(4));
    for (let round = 0; round < 6; round++) {
      const drawn = Array.from({ length: 5 }, () => bag.next());
      expect([...drawn].sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    }
  });

  it('never gives the one just given again, even as a bag is refilled, for any seed', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const bag = new Bag([1, 2, 3], new Rng(seed));
      let last = -1;
      for (let i = 0; i < 60; i++) {
        const next = bag.next();
        expect(next, `seed ${seed} draw ${i}`).not.toBe(last);
        last = next;
      }
    }
  });

  it('shows what comes next without taking it', () => {
    const bag = new Bag(['x', 'y', 'z'], new Rng(9));
    const seen = bag.peek();
    expect(bag.peek()).toBe(seen);
    expect(bag.next()).toBe(seen);
  });

  it('mixes the order differently for different seeds, and the same for the same', () => {
    const order = (seed: number): string => {
      const bag = new Bag([1, 2, 3, 4, 5, 6, 7, 8], new Rng(seed));
      return Array.from({ length: 8 }, () => bag.next()).join('');
    };
    expect(order(3)).toBe(order(3));
    const all = new Set(Array.from({ length: 20 }, (_, i) => order(i + 1)));
    expect(all.size).toBeGreaterThan(15);
  });

  it('can hold one thing, which is then all it gives, and cannot hold none', () => {
    const bag = new Bag(['only'], new Rng(1));
    expect([bag.next(), bag.next(), bag.next()]).toEqual(['only', 'only', 'only']);
    expect(() => new Bag([], new Rng(1))).toThrow();
  });
});
