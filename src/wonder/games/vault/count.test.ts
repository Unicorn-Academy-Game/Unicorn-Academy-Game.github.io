import { describe, expect, it } from 'vitest';
import { countUp, LEAD, secondsFor, shownAt, ticksOf } from './count';

describe('the count at the end of the round', () => {
  it('counts the gems, then the gold, then the money, each after the last', () => {
    const c = countUp({ gem: 12, gold: 5, money: 8 });
    expect(c.tallies.map((t) => t.kind)).toEqual(['gem', 'gold', 'money']);
    expect(c.tallies[0]!.start).toBe(LEAD);
    for (let i = 1; i < 3; i++) expect(c.tallies[i]!.start).toBeGreaterThan(c.tallies[i - 1]!.end);
    expect(c.headlineAt).toBeGreaterThan(c.tallies[2]!.end);
    expect(c.end).toBeGreaterThan(c.headlineAt);
  });

  it('takes a little longer for more, but never very long, and a moment for none', () => {
    expect(secondsFor(0)).toBeLessThan(secondsFor(1));
    expect(secondsFor(10)).toBeLessThan(secondsFor(30));
    expect(secondsFor(500)).toBeLessThanOrEqual(1.8);
    expect(countUp({ gem: 90, gold: 90, money: 90 }).end).toBeLessThan(10);
    expect(countUp({ gem: 0, gold: 0, money: 0 }).end).toBeLessThan(6);
  });

  it('shows 0 before it starts, the whole number when it is done, and goes up in between', () => {
    const t = countUp({ gem: 20, gold: 0, money: 0 }).tallies[0]!;
    expect(shownAt(t, 0)).toBe(0);
    expect(shownAt(t, t.start)).toBe(0);
    expect(shownAt(t, t.end)).toBe(20);
    expect(shownAt(t, t.end + 5)).toBe(20);
    let last = 0;
    for (let now = t.start; now <= t.end; now += 0.02) {
      const n = shownAt(t, now);
      expect(n).toBeGreaterThanOrEqual(last);
      expect(n).toBeLessThanOrEqual(20);
      last = n;
    }
  });

  it('ticks once for each piece, in time, and never faster than an ear follows', () => {
    const small = countUp({ gem: 6, gold: 0, money: 0 }).tallies[0]!;
    expect(ticksOf(small)).toHaveLength(6);
    const big = countUp({ gem: 90, gold: 0, money: 0 }).tallies[0]!;
    const ticks = ticksOf(big);
    expect(ticks.length).toBeLessThan(90);
    for (let i = 1; i < ticks.length; i++) expect(ticks[i]!).toBeGreaterThanOrEqual(ticks[i - 1]!);
    for (const at of ticks) {
      expect(at).toBeGreaterThanOrEqual(big.start);
      expect(at).toBeLessThanOrEqual(big.end + 1e-9);
    }
    expect(ticksOf(countUp({ gem: 0, gold: 0, money: 0 }).tallies[0]!)).toHaveLength(0);
  });
});
