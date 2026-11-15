import { describe, expect, it } from 'vitest';
import { Rng } from '../../domain/rng';
import { MIN_SPARKS, SHELL_KINDS, shell } from './shells';

const rng = (seed = 7): Rng => new Rng(seed);

describe('shell shapes', () => {
  for (const kind of SHELL_KINDS) {
    describe(kind, () => {
      it('makes about as many sparks as asked for, and never fewer than the minimum', () => {
        for (const n of [10, 40, 90]) {
          const want = Math.max(MIN_SPARKS, n);
          const got = shell(kind, n, rng()).length;
          expect(Math.abs(got - want)).toBeLessThanOrEqual(Math.max(14, want * 0.15));
        }
      });

      it('keeps every spark inside the unit circle, with a tone from 0 to 1 and a delay that is not negative', () => {
        for (const s of shell(kind, 80, rng())) {
          expect(Math.hypot(s.x, s.y)).toBeLessThanOrEqual(1.0001);
          expect(s.tone).toBeGreaterThanOrEqual(0);
          expect(s.tone).toBeLessThanOrEqual(1);
          expect(s.delay).toBeGreaterThanOrEqual(0);
          expect(Number.isFinite(s.x + s.y)).toBe(true);
        }
      });

      it('reaches near the edge, so the shape fills the size the game gives it', () => {
        const far = Math.max(...shell(kind, 80, rng()).map((s) => Math.hypot(s.x, s.y)));
        expect(far).toBeGreaterThan(0.9);
      });

      it('is the same for the same seed', () => {
        expect(shell(kind, 60, rng(3))).toEqual(shell(kind, 60, rng(3)));
      });
    });
  }

  it('lets chance change the shapes that are made by chance and not the ones that are drawn', () => {
    expect(shell('peony', 60, rng(1))).not.toEqual(shell('peony', 60, rng(2)));
    expect(shell('heart', 60, rng(1))).toEqual(shell('heart', 60, rng(2)));
  });

  it('draws a heart that is the same on both sides, with its two bumps at the top', () => {
    const pts = shell('heart', 80, rng());
    const meanX = pts.reduce((a, p) => a + p.x, 0) / pts.length;
    expect(Math.abs(meanX)).toBeLessThan(0.03);
    // The screen's y grows downward, so the bumps are the points with the lowest y, one on each
    // side.
    const top = [...pts].sort((a, b) => a.y - b.y).slice(0, 8);
    expect(top.some((p) => p.x < -0.2)).toBe(true);
    expect(top.some((p) => p.x > 0.2)).toBe(true);
    // And the one point at the bottom is on the middle line.
    const bottom = [...pts].sort((a, b) => b.y - a.y)[0]!;
    expect(Math.abs(bottom.x)).toBeLessThan(0.1);
  });

  it('draws a star with five tips', () => {
    const outline = shell('star', 100, rng()).filter((p) => p.tone === 0);
    const cx = outline.reduce((a, p) => a + p.x, 0) / outline.length;
    const cy = outline.reduce((a, p) => a + p.y, 0) / outline.length;
    // A fifth of a turn about its own middle puts it back on itself, and it is not a circle: the
    // radius swings a lot.
    const turn = (Math.PI * 2) / 5;
    for (const p of outline) {
      const dx = p.x - cx;
      const dy = p.y - cy;
      const rx = cx + dx * Math.cos(turn) - dy * Math.sin(turn);
      const ry = cy + dx * Math.sin(turn) + dy * Math.cos(turn);
      const nearest = Math.min(...outline.map((q) => Math.hypot(q.x - rx, q.y - ry)));
      expect(nearest).toBeLessThan(0.12);
    }
    const radii = outline.map((p) => Math.hypot(p.x - cx, p.y - cy));
    expect(Math.min(...radii)).toBeLessThan(0.55 * Math.max(...radii));
  });

  it('draws a smiley with two eyes above the middle and a mouth below it', () => {
    const pts = shell('smiley', 80, rng());
    const eyes = pts.filter((p) => p.tone === 1);
    expect(eyes.length).toBeGreaterThan(3);
    expect(eyes.every((p) => p.y < 0)).toBe(true);
    expect(eyes.some((p) => p.x < -0.2) && eyes.some((p) => p.x > 0.2)).toBe(true);
    const mouth = pts.filter((p) => p.tone === 0.5);
    expect(mouth.length).toBeGreaterThan(5);
    expect(mouth.every((p) => p.y > 0)).toBe(true);
  });

  it('draws a rainbow of six bands, widest at the outside, over the top', () => {
    const pts = shell('rainbow', 100, rng());
    expect(new Set(pts.map((p) => p.tone)).size).toBe(6);
    const outerTone = [...pts].sort((a, b) => Math.hypot(b.x, b.y - 0.0) - Math.hypot(a.x, a.y - 0.0))[0]!.tone;
    expect(outerTone).toBe(0);
    // Every band is an arch: nothing hangs below the ends.
    const ends = Math.max(...pts.map((p) => p.y));
    expect(ends).toBeCloseTo(Math.max(...pts.filter((p) => p.tone === 0).map((p) => p.y)), 1);
  });

  it('makes a spiral that lights from the middle outward', () => {
    const pts = shell('spiral', 80, rng());
    const near = pts.filter((p) => Math.hypot(p.x, p.y) < 0.3);
    const far = pts.filter((p) => Math.hypot(p.x, p.y) > 0.8);
    const avg = (a: typeof pts): number => a.reduce((s, p) => s + p.delay, 0) / a.length;
    expect(avg(far)).toBeGreaterThan(avg(near));
  });

  it('makes a crescent with an outer edge and an inner edge', () => {
    const pts = shell('crescent', 80, rng());
    expect(pts.filter((p) => p.tone === 0).length).toBeGreaterThan(30);
    expect(pts.filter((p) => p.tone === 1).length).toBeGreaterThan(20);
    // The inner edge is nearer the middle than the outer edge is, on average, which is what makes
    // it a crescent and not a ring.
    const mean = (t: number): number => {
      const s = pts.filter((p) => p.tone === t);
      return s.reduce((a, p) => a + Math.hypot(p.x - 0.1, p.y), 0) / s.length;
    };
    expect(mean(1)).toBeLessThan(mean(0));
  });
});
