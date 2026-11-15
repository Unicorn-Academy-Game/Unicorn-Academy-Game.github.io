import { describe, expect, it } from 'vitest';
import { Shelf, type Shelved } from './shelf';

const item = (born: number, fruit: Shelved['fruit'] = 'apple'): Shelved => ({ fruit, born, seed: born * 7 });

describe('the shelf', () => {
  it('fills from the first cell, one after another, and keeps what is on it', () => {
    const s = new Shelf(4);
    for (let i = 0; i < 4; i++) {
      const cell = s.reserve();
      expect(cell).toBe(i);
      expect(s.land(cell, item(i))).toBeNull();
    }
    expect(s.count).toBe(4);
    expect(s.at(2)?.born).toBe(2);
  });

  it('does not give two things in flight the same empty cell', () => {
    const s = new Shelf(4);
    const a = s.reserve();
    const b = s.reserve();
    const c = s.reserve();
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('gives the oldest cell to what comes next once it is full, and the old thing stays until the new one lands', () => {
    const s = new Shelf(3);
    for (let i = 0; i < 3; i++) s.land(s.reserve(), item(10 + i));
    const cell = s.reserve();
    expect(cell).toBe(0);
    expect(s.at(0)?.born).toBe(10);
    const was = s.land(cell, item(20));
    expect(was?.born).toBe(10);
    expect(s.at(0)?.born).toBe(20);
    // The next oldest is next.
    expect(s.reserve()).toBe(1);
  });

  it('does not take a cell that is already kept for a thing that has not landed, when there is another', () => {
    const s = new Shelf(3);
    for (let i = 0; i < 3; i++) s.land(s.reserve(), item(i));
    const first = s.reserve();
    const second = s.reserve();
    expect(second).not.toBe(first);
  });

  it('still gives a cell when every one is kept for something on its way', () => {
    const s = new Shelf(2);
    s.reserve();
    s.reserve();
    const third = s.reserve();
    expect(third).toBeGreaterThanOrEqual(0);
    expect(third).toBeLessThan(2);
  });

  it('counts how many kinds of fruit are on it', () => {
    const s = new Shelf(6);
    s.land(s.reserve(), item(1, 'apple'));
    s.land(s.reserve(), item(2, 'apple'));
    s.land(s.reserve(), item(3, 'carrot'));
    expect(s.kinds).toBe(2);
    expect(s.count).toBe(3);
  });

  it('finds the thing that is nearest to a finger, and nothing on an empty cell', () => {
    const s = new Shelf(3);
    s.land(s.reserve(), item(1));
    s.land(s.reserve(), item(2));
    const cells = [
      { x: 10, y: 10 },
      { x: 50, y: 10 },
      { x: 90, y: 10 },
    ];
    expect(Shelf.nearest(cells, s, 14, 12, 30)).toBe(0);
    expect(Shelf.nearest(cells, s, 46, 8, 30)).toBe(1);
    expect(Shelf.nearest(cells, s, 90, 10, 30)).toBe(-1);
    expect(Shelf.nearest(cells, s, 300, 300, 30)).toBe(-1);
  });

  it('starts empty again when it is reset', () => {
    const s = new Shelf(3);
    s.land(s.reserve(), item(1));
    s.reset();
    expect(s.count).toBe(0);
    expect(s.reserve()).toBe(0);
  });
});
