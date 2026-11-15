// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { Rng } from '../../../domain/rng';
import { SIZE } from './scale';
import { DIM, glowOf, LIFE, PER_BURST, POOL, SPEED, Sparks } from './sparks';

const FRAME = 1 / 60;
const run = (s: Sparks, frames: number): void => {
  for (let i = 0; i < frames; i++) s.update(FRAME);
};
const heatOf = (s: Sparks): Float32Array => s.heat(new Float32Array(SIZE * SIZE));
const total = (h: Float32Array): number => h.reduce((a, b) => a + b, 0);

describe('the sparks of a struck tile', () => {
  it('are twenty, and all of them start on the tile, at full life, so a tile that was just struck is at full glow', () => {
    const s = new Sparks();
    s.burst(5.5, 9.5, () => 0);
    expect(s.count).toBe(PER_BURST);
    const h = heatOf(s);
    expect(h[5 * SIZE + 9]).toBe(PER_BURST * LIFE);
    expect(total(h)).toBe(PER_BURST * LIFE);
    expect(glowOf(h[5 * SIZE + 9]!)).toBe(1);
  });

  it('spread over the tiles around it at about a quarter of a tile a frame, and fade', () => {
    const s = new Sparks();
    s.burst(8.5, 8.5, () => 0.3);
    run(s, 10);
    const h = heatOf(s);
    expect(h[8 * SIZE + 8], 'nothing is left on the tile they left').toBe(0);
    let farthest = 0;
    for (let x = 0; x < SIZE; x++)
      for (let y = 0; y < SIZE; y++) if (h[x * SIZE + y]! > 0) farthest = Math.max(farthest, Math.hypot(x - 8, y - 8));
    expect(farthest, 'ten frames at a quarter of a tile').toBeGreaterThan(2);
    expect(farthest).toBeLessThan(4);
    expect(total(h), 'each has lost ten frames of its forty').toBeCloseTo(PER_BURST * (LIFE - 10), 0);
    expect(SPEED * 10).toBeCloseTo(2.5, 9);
  });

  it('live forty frames and then are gone, and there are none in the air after that', () => {
    const s = new Sparks();
    s.burst(3.5, 3.5, () => 0.5);
    run(s, LIFE - 2);
    expect(s.count).toBe(PER_BURST);
    run(s, 4);
    expect(s.count).toBe(0);
    expect(total(heatOf(s))).toBe(0);
  });

  it('go the same way when the clock is cut into pieces of another size', () => {
    const a = new Sparks();
    const b = new Sparks();
    a.burst(8, 8, () => 0.1);
    b.burst(8, 8, () => 0.1);
    for (let i = 0; i < 12; i++) a.update(FRAME);
    for (let i = 0; i < 6; i++) b.update(2 * FRAME);
    const ha = heatOf(a);
    const hb = heatOf(b);
    for (let i = 0; i < ha.length; i++) expect(ha[i]!, `tile ${i}`).toBeCloseTo(hb[i]!, 3);
  });

  it('bounce off the edge of the grid and never leave it', () => {
    const s = new Sparks();
    s.burst(0.2, 0.2, () => 0);
    s.burst(15.8, 15.8, () => 0.5);
    s.burst(0.1, 15.9, () => 0.25);
    s.burst(0.3, 8, () => 0.5);
    run(s, 25);
    expect(s.count).toBe(4 * PER_BURST);
    expect(
      total(heatOf(s)),
      'a spark that had left would not be over any tile and its heat would be missing',
    ).toBeCloseTo(4 * PER_BURST * (LIFE - 25), 0);
  });

  it('give up the oldest places when more are asked for than the pool holds, and never hold more', () => {
    const s = new Sparks();
    const rng = new Rng(7);
    for (let i = 0; i < POOL / PER_BURST + 30; i++) s.burst(rng.range(0, SIZE), rng.range(0, SIZE), () => rng.next());
    expect(s.count).toBe(POOL);
    s.update(FRAME);
    expect(s.count).toBe(POOL);
    s.clear();
    expect(s.count).toBe(0);
    expect(total(heatOf(s))).toBe(0);
  });

  it('do not leave in the same directions every time, and do the same when the dice are the same', () => {
    const spread = (random: number): number[] => {
      const s = new Sparks();
      s.burst(8.5, 8.5, () => random);
      s.update(FRAME * 8);
      return [...heatOf(s)];
    };
    expect(spread(0.37)).toEqual(spread(0.37));
    expect(spread(0)).not.toEqual(spread(0.37));
  });
});

describe('how bright the glow is', () => {
  it('is the dim of a tile nothing touched, up to the full of one just struck, in a straight line of the heat', () => {
    expect(glowOf(0)).toBe(DIM);
    expect(DIM).toBeCloseTo(0.2, 9);
    expect(glowOf(400)).toBeCloseTo(DIM + 0.4, 9);
    expect(glowOf(PER_BURST * LIFE)).toBe(1);
    expect(glowOf(1e9), 'never more than full').toBe(1);
  });
});
