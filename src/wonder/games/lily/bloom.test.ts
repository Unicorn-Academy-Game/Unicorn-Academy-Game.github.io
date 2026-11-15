import { describe, expect, it } from 'vitest';
import { Lotuses } from './bloom';
import { LOTUS_COUNT } from './layout';

/** Steps the lotuses to a time in small steps. */
function to(l: Lotuses, from: number, until: number): void {
  for (let t = from; t <= until + 1e-9; t += 1 / 60) l.step(1 / 60, t);
}

describe('the lotuses', () => {
  it('begin as buds and open slowly, all the way, when told, and stay open', () => {
    const l = new Lotuses();
    expect(l.open.every((o) => o === 0)).toBe(true);
    expect(l.bloom(2)).toBe(true);
    l.step(0.1, 0.1);
    expect(l.open[2]).toBeGreaterThan(0);
    expect(l.open[2]).toBeLessThan(1);
    expect(l.open[3]).toBe(0);
    to(l, 0.1, 3);
    expect(l.open[2]).toBe(1);
    expect(l.isOpen(2)).toBe(true);
    to(l, 3, 60);
    expect(l.open[2], 'nothing closes it by itself').toBe(1);
  });

  it('says a lotus is new only the first time it is opened', () => {
    const l = new Lotuses();
    expect(l.bloom(1)).toBe(true);
    expect(l.bloom(1)).toBe(false);
    expect(l.count).toBe(1);
  });

  it('is whole when every lotus is open, and says so once', () => {
    const l = new Lotuses();
    for (let i = 0; i < LOTUS_COUNT - 1; i++) l.bloom(i);
    expect(l.whole).toBe(false);
    expect(l.completed()).toBe(false);
    l.bloom(LOTUS_COUNT - 1);
    expect(l.whole).toBe(true);
    expect(l.completed()).toBe(true);
    expect(l.completed(), 'only once').toBe(false);
  });

  it('closes one after another down the row when the pond is sent to sleep, and can then be told it is whole again', () => {
    const l = new Lotuses();
    for (let i = 0; i < LOTUS_COUNT; i++) l.bloom(i);
    to(l, 0, 3);
    expect(l.completed()).toBe(true);
    l.lull(4);
    to(l, 3, 4.1);
    expect(l.isOpen(0), 'the first lotus has begun to close').toBe(false);
    expect(l.isOpen(LOTUS_COUNT - 1), 'and the last has not').toBe(true);
    to(l, 4.1, 4 + Lotuses.LULL_SECONDS + 0.2);
    expect(l.count).toBe(0);
    to(l, 4 + Lotuses.LULL_SECONDS, 12);
    expect(l.open.every((o) => o === 0)).toBe(true);
    for (let i = 0; i < LOTUS_COUNT; i++) l.bloom(i);
    expect(l.completed(), 'a second time').toBe(true);
  });

  it('keeps open one that is opened again before its time to close comes', () => {
    const l = new Lotuses();
    l.bloom(0);
    l.bloom(5);
    l.lull(1);
    expect(l.bloom(5), 'still open, so not new').toBe(false);
    to(l, 0, 1 + 5 * 0.34 + 1);
    expect(l.isOpen(5), 'it was closed by the lull as it was open').toBe(false);
    expect(l.bloom(5), 'and can open once more').toBe(true);
    to(l, 0, 0);
    expect(l.isOpen(5)).toBe(true);
  });

  it('opens all of them at once for the finale, without telling her the pond is whole', () => {
    const l = new Lotuses();
    l.openAll();
    expect(l.whole).toBe(true);
    expect(l.completed()).toBe(false);
    to(l, 0, 3);
    expect(l.open.every((o) => o === 1)).toBe(true);
  });

  it('forgets everything on a reset', () => {
    const l = new Lotuses();
    l.openAll();
    to(l, 0, 3);
    l.reset();
    expect(l.count).toBe(0);
    expect(l.open.every((o) => o === 0)).toBe(true);
    for (let i = 0; i < LOTUS_COUNT; i++) l.bloom(i);
    expect(l.completed()).toBe(true);
  });
});
