import { describe, expect, it } from 'vitest';
import { Rng } from '../../../domain/rng';
import { newLit } from '../sky/light';
import { floorEdges, planOf } from './layout';
import { Lights } from './lights';
import { Tiles } from './tiles';

const set = (w = 863, h = 360) => {
  const plan = planOf(w, h);
  const tiles = new Tiles(plan, new Rng(1));
  const lights = new Lights();
  lights.place(plan, tiles);
  return { plan, tiles, lights };
};

describe('the light on the floor', () => {
  it('is none where nothing is lit', () => {
    const { tiles, lights, plan } = set();
    const lit = lights.at(plan.w / 2, plan.floor.bottom - 20, tiles, newLit());
    expect(lit.level).toBe(0);
  });

  it('is brightest on a lit tile, and less the further from it', () => {
    const { tiles, lights } = set();
    tiles.light(6, 2, 1, 2);
    const c = tiles.corners(6, 2);
    const x = (c[0]![0] + c[1]![0]) / 2;
    const y = (c[0]![1] + c[3]![1]) / 2;
    const near = lights.at(x, y, tiles, newLit());
    const far = lights.at(x + 260, y, tiles, newLit());
    expect(near.level).toBeGreaterThan(0.3);
    expect(far.level).toBeLessThan(near.level / 2);
    // It is the tile's colour: gold is mostly red and green.
    expect(near.r).toBeGreaterThan(near.b);
  });

  it('mixes the colours of tiles near each other, and never goes over full', () => {
    const { tiles, lights } = set();
    for (let c = 0; c < tiles.cols; c++) for (let r = 0; r < tiles.rows; r++) tiles.light(c, r, 1, c);
    const lit = lights.at(430, 300, tiles, newLit());
    expect(lit.level).toBeLessThanOrEqual(1);
    for (const v of [lit.r, lit.g, lit.b]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
  });

  it('keeps the spots of the mirror ball on the floor, always, in landscape and portrait', () => {
    for (const [w, h] of [
      [863, 360],
      [480, 360],
      [360, 780],
    ] as const) {
      const { plan, lights } = set(w, h);
      lights.lively = 1;
      for (let t = 0; t < 60; t += 0.25) {
        lights.update(t, t * 1.9, plan, 0.25);
        for (const s of lights.spots) {
          const e = floorEdges(plan.floor, (s.y - plan.floor.top) / (plan.floor.bottom - plan.floor.top));
          expect(s.y).toBeGreaterThanOrEqual(plan.floor.top - 1);
          expect(s.y).toBeLessThanOrEqual(plan.floor.bottom + 1);
          expect(s.x).toBeGreaterThanOrEqual(e.left - 1);
          expect(s.x).toBeLessThanOrEqual(e.right + 1);
          expect(s.level).toBeGreaterThanOrEqual(0);
          expect(s.level).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('has no spots for a party that has not started, and spots when it is lively', () => {
    const { plan, lights, tiles } = set();
    lights.lively = 0;
    lights.update(5, 8, plan, 0.1);
    expect(lights.spots.every((s) => s.level === 0)).toBe(true);
    expect(lights.at(430, 280, tiles, newLit()).level).toBe(0);
    lights.lively = 1;
    lights.update(5, 8, plan, 0.1);
    expect(lights.spots.some((s) => s.level > 0.3)).toBe(true);
  });

  it('flashes white for a moment and then fades', () => {
    const { plan, lights, tiles } = set();
    lights.surge = 1;
    const bright = lights.at(430, 280, tiles, newLit());
    expect(bright.level).toBeGreaterThan(0.4);
    for (let i = 0; i < 60; i++) lights.update(1 + i / 60, 2, plan, 1 / 60);
    expect(lights.surge).toBe(0);
  });
});
