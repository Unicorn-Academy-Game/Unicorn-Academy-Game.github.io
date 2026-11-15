import { describe, expect, it } from 'vitest';
import { type Flight, poseAt } from './pickup-pose';

const flight: Flight = { from: { x: 100, y: 200 }, lift: 150, to: { x: 160, y: 260 }, born: 2 };
const FALL = 0.62;

describe('where a piece of fruit is while it falls', () => {
  it('is not drawn until its turn comes, since a piece can be listed before it drops', () => {
    const pose = poseAt(flight, 1.9, FALL, 0);
    expect(pose.shown).toBe(false);
    expect(pose.landed).toBe(false);
  });

  it('starts at the height it grew at, over the tree', () => {
    const pose = poseAt(flight, 2, FALL, 0);
    expect(pose.shown).toBe(true);
    expect(pose.z).toBeCloseTo(150);
    expect(pose.at).toEqual({ x: 100, y: 200 });
  });

  it('only ever comes down and across on the way, and never dips below the ground', () => {
    let last = Infinity;
    for (let t = 2; t < 2 + FALL; t += 0.02) {
      const pose = poseAt(flight, t, FALL, 0);
      expect(pose.z).toBeLessThanOrEqual(last + 1e-9);
      expect(pose.z).toBeGreaterThanOrEqual(0);
      last = pose.z;
    }
  });

  it('lands exactly where the simulation put it, and stays there', () => {
    for (const t of [2 + FALL, 2 + FALL + 0.1, 2 + FALL + 3, 2 + FALL + 60]) {
      const pose = poseAt(flight, t, FALL, 1.3);
      expect(pose.at).toEqual({ x: 160, y: 260 });
      expect(pose.landed).toBe(true);
    }
  });

  it("hops a little when it lands and then only bobs a hair, never floating above a hand's width", () => {
    let high = 0;
    for (let t = 2 + FALL; t < 2 + FALL + 6; t += 0.01) high = Math.max(high, poseAt(flight, t, FALL, 0.7).z);
    expect(high).toBeGreaterThan(2);
    expect(high).toBeLessThan(12);
    expect(poseAt(flight, 2 + FALL + 5, FALL, 0.7).z).toBeLessThan(2);
  });

  it('gives the same pose for the same moment', () => {
    expect(poseAt(flight, 2.31, FALL, 4)).toEqual(poseAt(flight, 2.31, FALL, 4));
  });
});
