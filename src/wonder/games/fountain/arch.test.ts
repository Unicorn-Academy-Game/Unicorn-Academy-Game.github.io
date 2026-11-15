import { describe, expect, it } from 'vitest';
import { Arch, BANDS } from './arch';

describe('the rainbow over the fountain', () => {
  it('is dark until a jet is played, lights the band of that jet only, and holds it a few seconds', () => {
    const a = new Arch();
    a.step(0);
    expect(a.level.every((l) => l === 0)).toBe(true);
    a.light(2, 1);
    a.step(1.5);
    expect(a.level[2]).toBe(1);
    expect(a.level[3]).toBe(0);
    a.step(4);
    expect(a.level[2], 'still bright after three seconds').toBe(1);
    a.step(6.4);
    expect(a.level[2], 'fading').toBeLessThan(0.7);
    expect(a.level[2]).toBeGreaterThan(0);
    a.step(9);
    expect(a.level[2], 'gone').toBe(0);
  });

  it('is whole when every band is shining at once, and says so once, until it has gone out', () => {
    const a = new Arch();
    for (let i = 0; i < BANDS - 1; i++) a.light(i, i * 0.4);
    a.step(2.6);
    expect(a.whole).toBe(false);
    expect(a.shining).toBe(BANDS - 1);
    expect(a.completed()).toBe(false);
    a.light(BANDS - 1, 2.8);
    a.step(2.8);
    expect(a.whole).toBe(true);
    expect(a.completed(), 'told').toBe(true);
    a.step(3);
    expect(a.completed(), 'only once').toBe(false);
    // Played again straight away, it is not new.
    for (let i = 0; i < BANDS; i++) a.light(i, 3.2);
    a.step(3.2);
    expect(a.completed(), 'it never went out').toBe(false);
    a.step(30);
    expect(a.completed(), 'it has gone out now').toBe(false);
    for (let i = 0; i < BANDS; i++) a.light(i, 31);
    a.step(31);
    expect(a.completed(), 'and is whole again').toBe(true);
  });

  it('can be held up by the game, for the finale, at the least it is told, and let go', () => {
    const a = new Arch();
    a.hold(0.6);
    a.step(100);
    expect(a.level.every((l) => l === 0.6)).toBe(true);
    expect(a.completed(), 'a rainbow the game holds up is not one she made').toBe(false);
    a.light(1, 100);
    a.step(100);
    expect(a.level[1]).toBe(1);
    a.hold(0);
    a.step(200);
    expect(a.level.every((l) => l === 0)).toBe(true);
  });

  it('is dark again after a reset', () => {
    const a = new Arch();
    for (let i = 0; i < BANDS; i++) a.light(i, 1);
    a.reset();
    a.step(1);
    expect(a.whole).toBe(false);
    expect(a.shining).toBe(0);
  });
});
