import { describe, expect, it } from 'vitest';
import { MOST, Piles, ROWS, slotOf } from './piles';

describe('the heap of jewels in a pool', () => {
  it('has a place for each of the fifteen jewels, in rows that narrow toward the top, and none of them stand on one another', () => {
    expect(MOST).toBe(15);
    const seen = new Set<string>();
    let row = -1;
    let upBefore = -1;
    for (let k = 0; k < MOST; k++) {
      const s = slotOf(k);
      expect(seen.has(`${s.across}|${s.up}`), `place ${k} is its own`).toBe(false);
      seen.add(`${s.across}|${s.up}`);
      expect(s.up, 'never lower than the one before').toBeGreaterThanOrEqual(upBefore);
      upBefore = s.up;
      if (s.up !== row) row = s.up;
    }
    expect(slotOf(0).up).toBe(0);
    expect(slotOf(MOST - 1).across, 'the last is on the top in the middle').toBe(0);
    expect(slotOf(MOST - 1).up).toBeCloseTo((ROWS.length - 1) * 0.78, 6);
    expect(slotOf(-3)).toEqual(slotOf(0));
    expect(slotOf(99)).toEqual(slotOf(MOST - 1));
  });

  it('grows by one for every few jewels that come down into it, and stops at a full heap', () => {
    const p = new Piles();
    for (let i = 0; i < 30; i++) p.launch(2, 1 + i * 0.01);
    expect(p.inAir).toBe(30);
    const grew: boolean[] = [];
    expect(
      p.land(0.5, () => grew.push(true)),
      'nothing has come down yet',
    ).toBe(0);
    expect(p.land(2, (jet, g) => grew.push(g && jet === 2))).toBe(30);
    expect(p.inAir).toBe(0);
    expect(p.count[2], 'ten whole stones from thirty jewels').toBe(10);
    expect(p.count[1], 'the others have none').toBe(0);
    for (let i = 0; i < 400; i++) p.launch(2, 3);
    p.land(4, () => undefined);
    expect(p.count[2], 'a full heap does not run over').toBe(MOST);
  });

  it('takes only the jewels that are down by the time asked, and keeps the rest in the air', () => {
    const p = new Piles();
    p.launch(0, 1);
    p.launch(1, 2);
    p.launch(3, 3);
    const jets: number[] = [];
    expect(p.land(2, (j) => jets.push(j))).toBe(2);
    expect(jets.sort()).toEqual([0, 1]);
    expect(p.inAir).toBe(1);
  });

  it('empties on a reset, and can be filled for the finale', () => {
    const p = new Piles();
    p.fill(4, 7);
    expect(p.count[4]).toBe(MOST);
    expect(p.added[4]).toBe(7);
    p.launch(1, 1);
    p.reset();
    expect(p.count.every((c) => c === 0)).toBe(true);
    expect(p.inAir).toBe(0);
  });

  it('finds the heap that a touch is on, the nearest of them, and none for a touch in the sky', () => {
    const pools = [60, 160, 260].map((x) => ({ x, y: 300, rx: 36, ry: 14 }));
    expect(Piles.at(pools, 160, 296, 6)).toBe(1);
    expect(Piles.at(pools, 70, 290, 6)).toBe(0);
    expect(Piles.at(pools, 160, 120, 6), 'high up').toBe(-1);
    expect(Piles.at(pools, 110, 296, 0), 'between two').toBe(-1);
  });
});
