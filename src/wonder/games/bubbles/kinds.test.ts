import { describe, expect, it } from 'vitest';
import { Rng } from '../../../domain/rng';
import { PRIZE, PRIZES, type Prize, PrizeBag } from './kinds';

const draw = (seed: number, n: number, crowded?: (p: Prize) => boolean): Prize[] => {
  const bag = new PrizeBag(new Rng(seed));
  return Array.from({ length: n }, () => bag.next(crowded));
};

describe('what is in a bubble', () => {
  it('has a definition for every prize, and the ones that stay have room for some', () => {
    for (const p of PRIZES) {
      const def = PRIZE[p];
      expect(def.weight).toBeGreaterThan(0);
      expect(def.points).toBeGreaterThan(0);
      expect(def.home === 'none' ? def.cap === 0 : def.cap >= 1).toBe(true);
    }
  });

  it('never gives the same prize twice in a row', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const got = draw(seed, 400);
      for (let i = 1; i < got.length; i++) expect(got[i]).not.toBe(got[i - 1]);
    }
  });

  it('keeps the rare ones back until the player has played a little, and then gives them now and then', () => {
    for (let seed = 1; seed <= 30; seed++) {
      for (const p of draw(seed, 5)) expect(PRIZE[p].rare).toBe(false);
    }
    const later = draw(3, 600);
    const rare = later.filter((p) => PRIZE[p].rare).length;
    expect(rare).toBeGreaterThan(10);
    expect(rare).toBeLessThan(later.length * 0.12);
  });

  it('shows the player every kind of prize in the first few minutes of play', () => {
    const seen = new Set(draw(11, 120));
    for (const p of PRIZES) expect(seen.has(p)).toBe(true);
  });

  it('shows the player almost nothing twice in the first handful of bubbles, so the first minute is a surprise each time', () => {
    const counts: number[] = [];
    for (let seed = 1; seed <= 60; seed++) counts.push(new Set(draw(seed, 8)).size);
    counts.sort((a, b) => a - b);
    expect(counts[Math.floor(counts.length / 2)]).toBe(8);
    expect(counts[0]).toBeGreaterThanOrEqual(6);
  });

  it('gives a kind the garden is full of a good deal less often', () => {
    const plain = draw(5, 1500).filter((p) => p === 'butterfly').length;
    const full = draw(5, 1500, (p) => p === 'butterfly').filter((p) => p === 'butterfly').length;
    expect(full).toBeLessThan(plain * 0.6);
    expect(full).toBeGreaterThan(0);
  });

  it('remembers what it has given, and starts over', () => {
    const bag = new PrizeBag(new Rng(2));
    const first = bag.next();
    expect(bag.hasGiven(first)).toBe(true);
    bag.reset();
    expect(bag.hasGiven(first)).toBe(false);
  });
});
