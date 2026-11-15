import { describe, expect, it } from 'vitest';
import { Novelty, scaledCosts } from './novelty';

type Kind = 'feed' | 'lever' | 'whistle';
const PRICES: Record<Kind, number> = { feed: 2, lever: 6, whistle: 1 };

describe('what play is worth', () => {
  it('charges full price the first time, and less each time the same thing is done again', () => {
    const n = new Novelty<Kind>(PRICES);
    const first = n.worth('feed', 'apple', 0);
    const second = n.worth('feed', 'apple', 0.3);
    const third = n.worth('feed', 'apple', 0.6);
    expect(first).toBeCloseTo(2, 6);
    expect(second).toBeLessThan(first);
    expect(third).toBeLessThan(second);
  });

  it('never makes a thing worth nothing, so one who only does one thing gets there in the end', () => {
    const n = new Novelty<Kind>(PRICES);
    let last = 0;
    for (let i = 0; i < 60; i++) last = n.worth('feed', 'apple', i * 0.2);
    expect(last).toBeGreaterThan(PRICES.feed * 0.1);
  });

  it('gives another of the same kind more than the same one again, and another kind more again', () => {
    const a = new Novelty<Kind>(PRICES);
    a.worth('feed', 'apple', 0);
    const same = a.worth('feed', 'apple', 0.5);
    const b = new Novelty<Kind>(PRICES);
    b.worth('feed', 'apple', 0);
    const other = b.worth('feed', 'carrot', 0.5);
    expect(other).toBeGreaterThan(same);
    const c = new Novelty<Kind>(PRICES);
    c.worth('feed', 'apple', 0);
    const different = c.worth('lever', 0, 0.5);
    expect(different / PRICES.lever).toBeGreaterThan(other / PRICES.feed - 1e-9);
  });

  it('lets what was done be half forgotten after a few seconds', () => {
    const n = new Novelty<Kind>(PRICES);
    n.worth('feed', 'apple', 0);
    const soon = new Novelty<Kind>(PRICES);
    soon.worth('feed', 'apple', 0);
    expect(n.worth('feed', 'apple', 12)).toBeGreaterThan(soon.worth('feed', 'apple', 0.5));
  });

  it('counts a more varied stretch of play as livelier', () => {
    const n = new Novelty<Kind>(PRICES);
    n.worth('feed', 'apple', 0);
    n.worth('lever', 0, 1);
    n.worth('whistle', 0, 2);
    expect(n.variety(3)).toBe(3);
    expect(n.variety(40)).toBe(0);
  });

  it('starts over when it is reset', () => {
    const n = new Novelty<Kind>(PRICES);
    for (let i = 0; i < 5; i++) n.worth('feed', 'apple', i * 0.1);
    n.reset();
    expect(n.worth('feed', 'apple', 1)).toBeCloseTo(2, 6);
  });
});

describe('what the stars cost for a herd', () => {
  it('is dearer for a bigger herd, and the written price for six', () => {
    const full = [10, 30, 56, 88, 128];
    expect(scaledCosts(full, 6)).toEqual(full);
    const one = scaledCosts(full, 1);
    expect(one[4]).toBeLessThan(full[4]!);
    for (let i = 1; i < 5; i++) expect(one[i]!).toBeGreaterThan(one[i - 1]!);
  });

  it('holds a herd of nobody or of a crowd to a herd of one to six', () => {
    const full = [10, 30, 56, 88, 128];
    expect(scaledCosts(full, 0)).toEqual(scaledCosts(full, 1));
    expect(scaledCosts(full, 9)).toEqual(scaledCosts(full, 6));
  });
});
