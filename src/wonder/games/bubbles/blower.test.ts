import { describe, expect, it } from 'vitest';
import { Blower, type Blowing, EVERY_SECONDS, FULL_AFTER, TAP_SECONDS } from './blower';
import { PRIZES_MOST } from './field';

/**
 * Holds a finger on the machine from time 0, stepping the way a game does, and tells everything
 * that was told and when.
 */
function hold(
  blower: Blower,
  seconds: number,
  dt = 1 / 60,
): { readonly is: string; readonly at: number; readonly n?: number }[] {
  const told: { is: string; at: number; n?: number }[] = [];
  for (let t = dt; t <= seconds + 1e-9; t += dt) {
    for (const e of blower.step(t)) told.push({ ...e, at: t });
  }
  return told;
}

describe('a touch on the machine', () => {
  it('is a tap when it is let go at once, and nothing began', () => {
    const b = new Blower();
    expect(b.press(1, 0)).toBe(true);
    expect(hold(b, TAP_SECONDS * 0.8)).toEqual([]);
    expect(b.lift(1, TAP_SECONDS * 0.8)).toEqual({ is: 'tap' });
    expect(b.holding).toBe(false);
  });

  it('becomes a bubble when it is held, with one prize in it', () => {
    const b = new Blower();
    b.press(1, 0);
    const told = hold(b, TAP_SECONDS + 0.1);
    expect(told.map((e) => e.is)).toEqual(['begin']);
    expect(told[0]!.at).toBeGreaterThanOrEqual(TAP_SECONDS);
    expect(told[0]!.at).toBeLessThan(TAP_SECONDS + 0.05);
    expect(b.prizes).toBe(1);
  });

  it('gets one more prize in it each beat it is held, up to what a bubble may hold, and then is full', () => {
    const b = new Blower();
    b.press(1, 0);
    const told = hold(b, 6);
    expect(told.map((e) => e.is)).toEqual(['begin', 'more', 'more', 'full']);
    expect(told.filter((e) => e.is === 'more').map((e) => e.n)).toEqual([2, 3]);
    expect(b.prizes).toBe(PRIZES_MOST);
    const beats = told.slice(0, 3).map((e) => e.at);
    expect(beats[1]! - beats[0]!).toBeCloseTo(EVERY_SECONDS, 1);
    expect(beats[2]! - beats[1]!).toBeCloseTo(EVERY_SECONDS, 1);
    expect(told[3]!.at - beats[2]!).toBeCloseTo(FULL_AFTER, 1);
  });

  it('tells each thing once however it is stepped, and a long frame tells all that it passed', () => {
    const fine = new Blower();
    fine.press(1, 0);
    const coarse = new Blower();
    coarse.press(1, 0);
    expect(hold(fine, 5, 1 / 120).map((e) => e.is)).toEqual(['begin', 'more', 'more', 'full']);
    expect(coarse.step(5).map((e) => e.is)).toEqual(['begin', 'more', 'more', 'full']);
    expect(coarse.step(6)).toEqual([]);
  });

  it('ends as a blown bubble with what it held, and how long it was held', () => {
    const b = new Blower();
    b.press(1, 10);
    for (let t = 10; t < 12.2; t += 1 / 60) b.step(t);
    const ended = b.lift(1, 12.2);
    expect(ended).toEqual({ is: 'blown', n: 3, seconds: expect.closeTo(2.2, 5) });
    expect(b.prizes).toBe(0);
  });

  it('is not started by a second finger, and is not ended by it', () => {
    const b = new Blower();
    expect(b.press(1, 0)).toBe(true);
    expect(b.press(2, 0.1)).toBe(false);
    expect(b.lift(2, 0.2)).toBeNull();
    expect(b.holding).toBe(true);
    expect(b.lift(1, 0.3)).not.toBeNull();
    expect(b.press(2, 0.4)).toBe(true);
  });

  it('can be held again after it was let go, from the start', () => {
    const b = new Blower();
    b.press(1, 0);
    hold(b, 2);
    b.lift(1, 2);
    expect(b.press(1, 5)).toBe(true);
    expect(b.prizes).toBe(0);
    const told: Blowing[] = [];
    for (let t = 5; t < 5.5; t += 1 / 60) told.push(...b.step(t));
    expect(told.map((e) => e.is)).toEqual(['begin']);
  });

  it('tells nothing when nothing is held, and nothing after it is dropped', () => {
    const b = new Blower();
    expect(b.step(3)).toEqual([]);
    expect(b.lift(1, 3)).toBeNull();
    b.press(1, 0);
    hold(b, 2);
    b.cancel();
    expect(b.holding).toBe(false);
    expect(b.prizes).toBe(0);
    expect(b.step(9)).toEqual([]);
    expect(b.lift(1, 9)).toBeNull();
  });
});
