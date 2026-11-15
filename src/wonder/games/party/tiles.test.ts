import { describe, expect, it } from 'vitest';
import { Rng } from '../../../domain/rng';
import { planOf } from './layout';
import { SHOWS, TILE_COLORS, Tiles } from './tiles';

const floorOf = (w = 863, h = 360): Tiles => new Tiles(planOf(w, h), new Rng(2));

const lit = (t: Tiles): number => t.list.filter((tile) => tile.glow > 0.2).length;

describe('the dance floor tiles', () => {
  it('are found by a touch on them, and each tile is found at its own middle', () => {
    for (const [w, h] of [
      [863, 360],
      [360, 780],
    ] as const) {
      const t = floorOf(w, h);
      for (let row = 0; row < t.rows; row++) {
        for (let col = 0; col < t.cols; col++) {
          const c = t.corners(col, row);
          const x = c.reduce((s, p) => s + p[0], 0) / 4;
          const y = c.reduce((s, p) => s + p[1], 0) / 4;
          expect(t.find(x, y), `${col},${row} in ${w}x${h}`).toEqual({ col, row });
        }
      }
    }
  });

  it('are not found off the floor', () => {
    const t = floorOf();
    const plan = planOf(863, 360);
    expect(t.find(5, plan.floor.top + 10)).toBeNull();
    expect(t.find(430, plan.floor.top - 5)).toBeNull();
    expect(t.find(430, plan.floor.bottom + 5)).toBeNull();
    expect(t.tread(5, 10, 0)).toBe(false);
  });

  it('fit together: the front of one row is the back of the next, and the rows widen toward the front', () => {
    const t = floorOf();
    for (let row = 0; row + 1 < t.rows; row++) {
      const here = t.corners(3, row);
      const next = t.corners(3, row + 1);
      expect(here[3]![1]).toBeCloseTo(next[0]![1], 6);
      expect(here[2]![0]).toBeCloseTo(next[1]![0], 6);
    }
    const back = t.corners(0, 0);
    const front = t.corners(0, t.rows - 1);
    expect(front[1]![0] - front[0]![0]).toBeGreaterThan(back[1]![0] - back[0]![0]);
  });

  it('light up and fade away, never beyond full and never below none', () => {
    const t = floorOf();
    t.light(2, 1, 1.7, 3);
    expect(t.at(2, 1).glow).toBe(1);
    t.light(2, 1, 0.4, 5);
    expect(t.at(2, 1).glow).toBe(1);
    expect(t.at(2, 1).color).toBe(3);
    t.update(1);
    expect(t.at(2, 1).glow).toBeLessThan(0.1);
    expect(t.at(2, 1).glow).toBeGreaterThan(0);
    for (let i = 0; i < 300; i++) t.update(1 / 60);
    expect(t.at(2, 1).glow).toBeLessThan(0.0001);
    t.light(-1, 0, 1, 0);
    t.light(0, 99, 1, 0);
    expect(lit(t)).toBe(0);
  });

  it('keeps every colour one of the palette, even when a pattern counts past its end or backward', () => {
    const t = floorOf();
    for (const show of SHOWS) {
      t.show = show;
      for (let beat = -3; beat < 30; beat++) {
        t.beat(beat, 1);
        for (const tile of t.list) {
          expect(Number.isInteger(tile.color)).toBe(true);
          expect(tile.color).toBeGreaterThanOrEqual(0);
          expect(tile.color).toBeLessThan(TILE_COLORS.length);
          expect(tile.glow).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('light some of the floor at every beat in every show, and more of it the livelier the party', () => {
    for (const show of SHOWS) {
      const quiet = floorOf();
      const lively = floorOf();
      quiet.show = show;
      lively.show = show;
      let a = 0;
      let b = 0;
      for (let beat = 0; beat < 12; beat++) {
        quiet.reset();
        lively.reset();
        quiet.show = show;
        lively.show = show;
        quiet.beat(beat, 0);
        lively.beat(beat, 1);
        expect(lit(lively), `${show} beat ${beat}`).toBeGreaterThan(0);
        expect(lit(quiet), `${show} beat ${beat}`).toBeGreaterThan(0);
        a += lit(quiet);
        b += lit(lively);
      }
      if (show !== 'checker' && show !== 'rings') expect(b, show).toBeGreaterThan(a);
    }
  });

  it('goes through the shows, one after another and round', () => {
    const t = floorOf();
    const seen: string[] = [t.show];
    for (let i = 0; i < SHOWS.length; i++) seen.push(t.next());
    expect(seen.slice(0, SHOWS.length)).toEqual([...SHOWS]);
    expect(seen[SHOWS.length]).toBe(SHOWS[0]);
  });

  it('send a ripple out from a touch, one ring of tiles after another', () => {
    const t = floorOf();
    const plan = planOf(863, 360);
    const at = t.corners(6, 2);
    const x = (at[0]![0] + at[1]![0]) / 2;
    const y = (at[0]![1] + at[3]![1]) / 2;
    expect(t.tread(x, y, 2)).toBe(true);
    expect(t.at(6, 2).glow).toBe(1);
    expect(t.at(8, 2).glow).toBe(0);
    for (let i = 0; i < 24; i++) t.update(1 / 60);
    // After a third of a second it has reached some way out, and the middle has faded.
    expect(t.at(8, 2).glow).toBeGreaterThan(0.05);
    expect(t.at(6, 2).glow).toBeLessThan(0.5);
    expect(plan.floor.cols).toBe(t.cols);
  });
});
