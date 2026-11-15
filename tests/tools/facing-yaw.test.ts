import { describe, expect, it } from 'vitest';
import {
  angleOf,
  EAST,
  FACING_STEP,
  facingAt,
  NORTH,
  NORTHEAST,
  NORTHWEST,
  SOUTH,
  SOUTHEAST,
  SOUTHWEST,
  UNICORN_FACINGS,
  WEST,
} from '../../src/shared/compass';
import { DIAGONAL_LEAN, facingYaw } from '../../tools/art/unicorn/model';

/**
 * The art version hashes the model and not the compass, so the model carries its own table of
 * turns, and this holds the two together.
 */
describe('the turn the model is drawn at for each facing', () => {
  it('is the angle of the facing on the map, turned back, for every one of the 32', () => {
    for (const f of UNICORN_FACINGS) {
      expect(Math.cos(facingYaw(f)), `facing ${f}`).toBeCloseTo(Math.cos(angleOf(f)), 12);
      expect(Math.sin(facingYaw(f)), `facing ${f}`).toBeCloseTo(-Math.sin(angleOf(f)), 12);
    }
  });

  it('keeps the eight named views exactly where they were first drawn, so they are the pictures that already shipped', () => {
    expect(facingYaw(EAST)).toBe(0);
    expect(facingYaw(NORTH)).toBe(Math.PI / 2);
    expect(facingYaw(WEST)).toBe(Math.PI);
    expect(facingYaw(SOUTH)).toBe(-Math.PI / 2);
    expect(facingYaw(NORTHEAST)).toBe(DIAGONAL_LEAN);
    expect(facingYaw(NORTHWEST)).toBe(Math.PI - DIAGONAL_LEAN);
    expect(facingYaw(SOUTHWEST)).toBe(-(Math.PI - DIAGONAL_LEAN));
    expect(facingYaw(SOUTHEAST)).toBe(-DIAGONAL_LEAN);
  });

  it('turns by the same step between every two neighbours round the whole ring', () => {
    const wrap = (r: number): number => Math.atan2(Math.sin(r), Math.cos(r));
    for (const f of UNICORN_FACINGS) {
      const next = facingAt(f + 1);
      expect(wrap(facingYaw(f) - facingYaw(next)), `from ${f} to ${next}`).toBeCloseTo(FACING_STEP, 12);
    }
  });
});
