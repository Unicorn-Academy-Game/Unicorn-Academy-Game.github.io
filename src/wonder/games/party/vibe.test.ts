import { describe, expect, it } from 'vitest';
import { Meter } from '../../engine/meter';
import { starCosts, type Thing, Vibe, WORTH } from './vibe';

describe('how good the party is', () => {
  it('pays the full price for a thing the first time, and less for the same thing again', () => {
    const v = new Vibe();
    const first = v.worth('cannon', -1, 0);
    expect(first).toBeCloseTo(WORTH.cannon, 6);
    let last = first;
    for (let i = 1; i <= 6; i++) {
      const next = v.worth('cannon', -1, i * 0.9);
      expect(next).toBeLessThan(last);
      last = next;
    }
  });

  it('never pays nothing, so a child who does one thing only still gets somewhere', () => {
    const v = new Vibe();
    let total = 0;
    for (let i = 0; i < 400; i++) total += v.worth('cannon', 1, i * 0.2);
    const late = v.worth('cannon', 1, 400 * 0.2);
    expect(late).toBeGreaterThanOrEqual(WORTH.cannon * 0.2 * 0.55 - 1e-9);
    expect(total).toBeGreaterThan(30);
  });

  it('pays full again for another one of the same kind, nearly, and for a different kind in full', () => {
    const v = new Vibe();
    v.worth('cannon', -1, 0);
    v.worth('cannon', -1, 0.9);
    const other = v.worth('cannon', 1, 1.8);
    const same = v.worth('cannon', -1, 2.7);
    expect(other).toBeGreaterThan(same);
    expect(other).toBeGreaterThan(WORTH.cannon * 0.7);
    const different = new Vibe();
    different.worth('cannon', -1, 0);
    expect(different.worth('ball', 'it', 0.5)).toBeGreaterThan(WORTH.ball * 0.95);
  });

  it('forgets: the same thing after a good while is worth nearly its price again', () => {
    const v = new Vibe();
    for (let i = 0; i < 6; i++) v.worth('join', 'leaf', i * 0.5);
    const soon = v.worth('join', 'leaf', 3);
    const later = v.worth('join', 'leaf', 60);
    expect(later).toBeGreaterThan(soon * 2);
    expect(later).toBeGreaterThan(WORTH.join * 0.9);
  });

  it('pays more for a party of many different things than for one of a single thing, for the same number of touches', () => {
    const things: [Thing, string][] = [
      ['join', 'a'],
      ['cannon', '-1'],
      ['knock', 'p'],
      ['ball', 'b'],
      ['floor', '3'],
      ['speaker', 'l'],
      ['guest', 'frog'],
    ];
    const varied = new Vibe();
    const single = new Vibe();
    let a = 0;
    let b = 0;
    for (let i = 0; i < 20; i++) {
      const [thing, which] = things[i % things.length]!;
      a += varied.worth(thing, which, i * 0.7) / WORTH[thing];
      b += single.worth('floor', '3', i * 0.7) / WORTH.floor;
    }
    expect(a).toBeGreaterThan(b * 1.5);
  });

  it('is worth more as more different things have been done lately', () => {
    const v = new Vibe();
    expect(v.variety(0)).toBe(0);
    v.worth('join', 'a', 0);
    v.worth('cannon', 'x', 1);
    v.worth('ball', 'y', 2);
    expect(v.variety(3)).toBe(3);
    expect(v.variety(40)).toBe(0);
  });

  it('brings a little from each friend who is dancing, and nothing from none', () => {
    expect(Vibe.byThemselves(0, 10)).toBe(0);
    expect(Vibe.byThemselves(6, 1)).toBeCloseTo(6 * Vibe.byThemselves(1, 1), 9);
    expect(Vibe.byThemselves(-2, 1)).toBe(0);
    // A floor that is full pays a little, but it does not fill the stars alone in a reasonable
    // time.
    expect(Vibe.byThemselves(6, 30)).toBeLessThan(20);
  });

  it('starts over when it is reset', () => {
    const v = new Vibe();
    for (let i = 0; i < 5; i++) v.worth('burst', 'p', i);
    v.reset();
    expect(v.worth('burst', 'p', 5)).toBeCloseTo(WORTH.burst, 6);
  });

  it('makes the party shorter for a herd of one than for a herd of six, and keeps the six as they are written', () => {
    const full = [10, 30, 56, 88, 128];
    expect(starCosts(full, 6)).toEqual(full);
    expect(starCosts(full, 9), 'a herd cannot be bigger than six').toEqual(full);
    expect(starCosts(full, 0), 'nor smaller than one').toEqual(starCosts(full, 1));
    for (let n = 1; n < 6; n++) {
      const small = starCosts(full, n);
      const big = starCosts(full, n + 1);
      expect(
        small.every((c, i) => c <= big[i]!),
        `no star costs more with ${n} friends than with ${n + 1}`,
      ).toBe(true);
      expect(small[4]!, `the last star is cheaper with ${n} friends than with ${n + 1}`).toBeLessThan(big[4]!);
      expect(() => new Meter(small), 'still a meter that can be played').not.toThrow();
    }
  });
});
