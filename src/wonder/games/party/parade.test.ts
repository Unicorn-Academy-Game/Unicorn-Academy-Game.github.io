import { describe, expect, it } from 'vitest';
import { planOf, slotsOf } from './layout';
import { DURATION, LINEUP, loopOf, middleOf, STAGGER, startOf, stepOf } from './parade';

const run = (w: number, h: number, n: number) => {
  const plan = planOf(w, h);
  return { plan, slots: slotsOf(n, plan), loop: loopOf(w) };
};

describe('the parade', () => {
  it('begins with every friend where she dances, and ends with her in the same place, one road on', () => {
    for (const [w, h] of [
      [863, 360],
      [480, 360],
      [360, 780],
    ] as const) {
      for (const n of [1, 3, 6]) {
        const { slots, loop } = run(w, h, n);
        slots.forEach((slot, rank) => {
          const a = stepOf(slot, rank, 0, loop);
          const z = stepOf(slot, rank, DURATION, loop);
          expect(a.x).toBe(slot.x);
          expect(a.y).toBe(slot.y);
          expect(a.on).toBe(false);
          expect(z.x).toBeCloseTo(slot.x + loop, 6);
          expect(z.y).toBe(slot.y);
          expect(z.on).toBe(false);
          expect(z.speed).toBe(0);
        });
      }
    }
  });

  it('has the friends set off one after another, the first friend first, after they have cheered', () => {
    const { slots, loop } = run(863, 360, 6);
    slots.forEach((slot, rank) => {
      expect(startOf(rank)).toBeCloseTo(LINEUP + rank * STAGGER, 9);
      expect(stepOf(slot, rank, startOf(rank) - 0.01, loop).on).toBe(false);
      expect(stepOf(slot, rank, startOf(rank) + 0.5, loop).on).toBe(true);
    });
    expect(startOf(5)).toBeLessThan(DURATION - 8);
  });

  it('only ever goes forward, and never beyond where she is going', () => {
    const { slots, loop } = run(863, 360, 6);
    slots.forEach((slot, rank) => {
      let last = slot.x;
      for (let t = 0; t <= DURATION + 1; t += 0.05) {
        const s = stepOf(slot, rank, t, loop);
        expect(s.x).toBeGreaterThanOrEqual(last - 1e-9);
        expect(s.x).toBeLessThanOrEqual(slot.x + loop + 1e-9);
        last = s.x;
      }
    });
  });

  it('walks at a pace that her legs can keep up with, on a wide screen and a narrow one', () => {
    for (const [w, h] of [
      [863, 360],
      [480, 360],
      [360, 780],
    ] as const) {
      const { slots, loop } = run(w, h, 6);
      let fastest = 0;
      slots.forEach((slot, rank) => {
        for (let t = 0; t <= DURATION; t += 0.05) fastest = Math.max(fastest, stepOf(slot, rank, t, loop).speed);
      });
      // A walk of a friend at her full size is about 150 units a stride and a bit over one stride
      // in a second at her best.
      expect(fastest, `${w}x${h}`).toBeLessThan(330);
      expect(fastest).toBeGreaterThan(80);
    }
  });

  it('keeps the screen with the friends, beginning and ending at the middle of the floor', () => {
    for (const [w, h] of [
      [863, 360],
      [360, 780],
    ] as const) {
      const { slots, loop } = run(w, h, 6);
      expect(middleOf(slots, 0, loop, w)).toBeCloseTo(w / 2, 6);
      expect(middleOf(slots, DURATION, loop, w)).toBeCloseTo(w / 2 + loop, 6);
      let last = 0;
      for (let t = 0; t <= DURATION; t += 0.1) {
        const x = middleOf(slots, t, loop, w);
        expect(x).toBeGreaterThanOrEqual(last - 1e-9);
        last = x;
        // She is never far from the middle of what is on the screen.
        for (let rank = 0; rank < slots.length; rank++) {
          const s = stepOf(slots[rank]!, rank, t, loop);
          expect(Math.abs(s.x - x), `${w}x${h} at ${t}`).toBeLessThan(w * 0.62);
        }
      }
    }
  });

  it('walks only while she is going', () => {
    const { slots, loop } = run(863, 360, 6);
    const slot = slots[0]!;
    expect(stepOf(slot, 0, 0.5, loop).walking).toBe(0);
    expect(stepOf(slot, 0, 7, loop).walking).toBe(1);
    expect(stepOf(slot, 0, DURATION + 2, loop).walking).toBe(0);
  });

  it('has a road long enough to be a journey and not so long that it is dull', () => {
    expect(loopOf(863)).toBeGreaterThan(1500);
    expect(loopOf(360)).toBeGreaterThanOrEqual(1600);
    expect(DURATION).toBeLessThan(20);
    expect(DURATION).toBeGreaterThan(8);
  });
});
