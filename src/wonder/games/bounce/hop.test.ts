import { describe, expect, it } from 'vitest';
import { Rng } from '../../../domain/rng';
import { arcAt, arcBetween, arcPoint, newPose } from './hop';

const rng = new Rng(11);
/** Places to leap between: sideways, up, down and hardly anywhere, with every sort of time. */
const cases = Array.from({ length: 300 }, () => ({
  x0: rng.range(-400, 400),
  y0: rng.range(-300, 300),
  x1: rng.range(-400, 400),
  y1: rng.range(-300, 300),
  seconds: rng.range(0.4, 2),
  lift: rng.range(20, 120),
}));

describe('a leap', () => {
  it('leaves from where she stands and comes down where she is going, at exactly the time asked', () => {
    for (const c of cases) {
      const arc = arcBetween(c.x0, c.y0, c.x1, c.y1, c.seconds, c.lift);
      const start = arcAt(arc, 0);
      const end = arcAt(arc, c.seconds);
      expect(start.x).toBeCloseTo(c.x0, 6);
      expect(start.y).toBeCloseTo(c.y0, 6);
      expect(end.x).toBeCloseTo(c.x1, 6);
      expect(end.y).toBeCloseTo(c.y1, 6);
    }
  });

  it('goes up before it comes down, and the top is the lift above the higher of the two places', () => {
    for (const c of cases) {
      const arc = arcBetween(c.x0, c.y0, c.x1, c.y1, c.seconds, c.lift);
      const top = arcAt(arc, arc.top);
      expect(top.y).toBeCloseTo(Math.min(c.y0, c.y1) - c.lift, 5);
      expect(arc.top).toBeGreaterThan(0);
      expect(arc.top).toBeLessThan(c.seconds);
      // Upward at first, downward at the end.
      expect(arcAt(arc, 0.0001).vy).toBeLessThan(0);
      expect(arcAt(arc, c.seconds - 0.0001).vy).toBeGreaterThan(0);
    }
  });

  it('never dips below the lower of the two places', () => {
    for (const c of cases) {
      const arc = arcBetween(c.x0, c.y0, c.x1, c.y1, c.seconds, c.lift);
      const lowest = Math.max(c.y0, c.y1);
      for (let t = 0; t <= c.seconds; t += c.seconds / 40) expect(arcAt(arc, t).y).toBeLessThanOrEqual(lowest + 1e-6);
    }
  });

  it('is the same curve however long it takes, so a star hung along it is passed whenever she leaps', () => {
    for (const c of cases.slice(0, 120)) {
      const slow = arcBetween(c.x0, c.y0, c.x1, c.y1, c.seconds, c.lift);
      const quick = arcBetween(c.x0, c.y0, c.x1, c.y1, c.seconds * 0.6, c.lift);
      for (const f of [0.1, 0.25, 0.5, 0.75, 0.9]) {
        const a = arcAt(slow, c.seconds * f);
        const b = arcAt(quick, c.seconds * 0.6 * f);
        expect(a.x).toBeCloseTo(b.x, 5);
        expect(a.y).toBeCloseTo(b.y, 5);
      }
    }
  });

  it('is where `arcPoint` says it is at that fraction of the way', () => {
    const out = { x: 0, y: 0 };
    for (const c of cases.slice(0, 80)) {
      const arc = arcBetween(c.x0, c.y0, c.x1, c.y1, 1.3, c.lift);
      for (const f of [0.2, 0.5, 0.8]) {
        const p = arcAt(arc, 1.3 * f);
        arcPoint(c.x0, c.y0, c.x1, c.y1, c.lift, f, out);
        expect(out.x).toBeCloseTo(p.x, 5);
        expect(out.y).toBeCloseTo(p.y, 5);
      }
    }
  });

  it('is going as fast as it looks: the speed is how far she moves in a moment', () => {
    const pose = newPose();
    for (const c of cases.slice(0, 80)) {
      const arc = arcBetween(c.x0, c.y0, c.x1, c.y1, c.seconds, c.lift);
      for (const f of [0.2, 0.5, 0.8]) {
        const t = c.seconds * f;
        const h = 1e-5;
        const here = arcAt(arc, t, pose);
        const vx = here.vx;
        const vy = here.vy;
        const before = arcAt(arc, t - h);
        const after = arcAt(arc, t + h);
        expect(vx).toBeCloseTo((after.x - before.x) / (2 * h), 2);
        expect(vy).toBeCloseTo((after.y - before.y) / (2 * h), 2);
      }
    }
  });

  it('is at the start before it begins and at the end after it, and is not going anywhere then', () => {
    const arc = arcBetween(0, 0, 100, -50, 1, 60);
    expect(arcAt(arc, -1).x).toBe(0);
    expect(arcAt(arc, -1).vy).toBe(0);
    expect(arcAt(arc, 5).x).toBeCloseTo(100, 6);
    expect(arcAt(arc, 5).vx).toBe(0);
  });

  it('is a leap even between two clouds at the same height, and when she has hardly any way to go', () => {
    const level = arcBetween(0, 0, 200, 0, 1, 60);
    expect(arcAt(level, level.top).y).toBeCloseTo(-60, 6);
    const here = arcBetween(10, 10, 10, 10, 0.8, 40);
    expect(arcAt(here, here.top).y).toBeCloseTo(-30, 6);
    expect(arcAt(here, 0.8).y).toBeCloseTo(10, 6);
  });

  it('refuses a leap that takes no time or goes nowhere up', () => {
    expect(() => arcBetween(0, 0, 1, 1, 0, 40)).toThrow();
    expect(() => arcBetween(0, 0, 1, 1, 1, 0)).toThrow();
  });
});
