import { describe, expect, it } from 'vitest';
import { CONSTELLATIONS, constellationOf, fit } from './constellations';

describe.each(Object.values(CONSTELLATIONS))('the $name constellation', (c) => {
  it('has a star for each note of the three phrases that the stars sing as they wake', () => {
    expect(c.points).toHaveLength(21);
  });

  it('keeps every star on its sheet', () => {
    for (const p of c.points) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(c.aspect);
    }
  });

  it('draws every line between two stars that are there, and none twice', () => {
    const seen = new Set<string>();
    for (const [a, b] of c.lines) {
      expect(a).not.toBe(b);
      expect(c.points[a]).toBeDefined();
      expect(c.points[b]).toBeDefined();
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      expect(seen.has(key), `line ${key} twice`).toBe(false);
      seen.add(key);
    }
  });

  it('is one picture: every star is joined to the others by lines', () => {
    const reached = new Set<number>([0]);
    for (let again = 0; again < c.points.length; again++) {
      for (const [a, b] of c.lines) {
        if (reached.has(a)) reached.add(b);
        if (reached.has(b)) reached.add(a);
      }
    }
    expect(reached.size).toBe(c.points.length);
  });

  it('keeps its stars far enough apart to be touched one at a time on a phone', () => {
    // Fitted into the smallest room a screen gives it, a star is still this far from the next one,
    // in units where a star is 34 wide.
    const room = { x: 0, y: 0, w: 330, h: 200 };
    const at = fit(c, room);
    for (let i = 0; i < at.length; i++) {
      for (let j = i + 1; j < at.length; j++) {
        expect(Math.hypot(at[i]!.x - at[j]!.x, at[i]!.y - at[j]!.y), `stars ${i} and ${j}`).toBeGreaterThan(20);
      }
    }
  });
});

describe('fitting a picture into a room', () => {
  it('centres it and keeps its shape', () => {
    const c = constellationOf('star');
    const at = fit(c, { x: 100, y: 50, w: 800, h: 100 });
    const xs = at.map((p) => p.x);
    const ys = at.map((p) => p.y);
    // The room is short, so the height is what counts, and the picture is as wide as it needs to be
    // and in the middle.
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(100 + 1e-9);
    const wide = (Math.max(...xs) - Math.min(...xs)) / (Math.max(...ys) - Math.min(...ys));
    const sheet =
      (Math.max(...c.points.map((p) => p.x)) - Math.min(...c.points.map((p) => p.x))) /
      (Math.max(...c.points.map((p) => p.y)) - Math.min(...c.points.map((p) => p.y)));
    expect(wide).toBeCloseTo(sheet, 6);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeGreaterThan(100 + 800 * 0.35);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeLessThan(100 + 800 * 0.65);
  });

  it('puts the same stars in the same places for the same room', () => {
    const c = constellationOf('heart');
    const room = { x: 10, y: 20, w: 400, h: 300 };
    expect(fit(c, room)).toEqual(fit(c, { ...room }));
  });

  it('falls back to the unicorn for a look it does not know', () => {
    expect(constellationOf('nothing').name).toBe('unicorn');
  });
});
