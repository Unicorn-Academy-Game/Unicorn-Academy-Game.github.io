import { describe, expect, it } from 'vitest';
import { AIM_RANGE } from './barrel';
import { aimAt, arcFrom, at, flightSeconds, heading, lofting, loop } from './flight';

const PIVOT = { x: 90, y: 280 };

describe('the aim of the barrel', () => {
  it('points above the target, and more the farther it is', () => {
    const near = aimAt(PIVOT, { x: 190, y: 180 });
    const far = aimAt(PIVOT, { x: 790, y: 80 });
    expect(near).toBeLessThan(Math.atan2(180 - 280, 190 - 90));
    expect(far).toBeLessThan(Math.atan2(80 - 280, 790 - 90));
    expect(lofting(900)).toBeGreaterThan(lofting(100));
    expect(lofting(1e6)).toBeLessThanOrEqual(0.3);
    expect(lofting(0)).toBeGreaterThanOrEqual(0.08);
  });

  it('stays inside what the barrel can do for every star a picture can have, from the cannon on any screen', () => {
    for (const w of [576, 640, 863, 360]) {
      for (let x = 40; x < w; x += 40) {
        for (let y = 20; y < 240; y += 20) {
          const angle = aimAt({ x: 90, y: 280 }, { x, y });
          if (x < 90 + 30 && y > 200) continue;
          expect(angle).toBeLessThan(AIM_RANGE[1] + 1e-9);
        }
      }
    }
  });
});

describe('the flight of a shell', () => {
  const muzzle = { x: 150, y: 220, angle: -0.7 };
  const target = { x: 520, y: 90 };
  const arc = arcFrom(muzzle, target);

  it('leaves the muzzle the way the barrel points and lands on the target', () => {
    const start = at(arc, 0);
    const end = at(arc, 1);
    expect(start.x).toBeCloseTo(150, 9);
    expect(start.y).toBeCloseTo(220, 9);
    expect(end.x).toBeCloseTo(520, 9);
    expect(end.y).toBeCloseTo(90, 9);
    expect(heading(arc, 0)).toBeCloseTo(-0.7, 9);
  });

  it('always makes headway toward the target, so it never loops back', () => {
    const chord = { x: target.x - muzzle.x, y: target.y - muzzle.y };
    let before = -Infinity;
    for (let u = 0; u <= 1.0001; u += 0.02) {
      const p = at(arc, Math.min(1, u));
      const along = (p.x - muzzle.x) * chord.x + (p.y - muzzle.y) * chord.y;
      expect(along).toBeGreaterThan(before - 1e-9);
      before = along;
    }
  });

  it('arches over the straight line when the barrel points above the target, and not below it', () => {
    const mid = at(arc, 0.5);
    const straightY = (muzzle.y + target.y) / 2;
    expect(mid.y).toBeLessThan(straightY - 1);
  });

  it('takes longer to go farther, and never longer than a child will wait', () => {
    expect(flightSeconds(100)).toBeLessThan(flightSeconds(600));
    expect(flightSeconds(0)).toBeGreaterThan(0.3);
    expect(flightSeconds(1e6)).toBeLessThan(1);
  });

  it('can bow a spell over the way from a friend', () => {
    const spell = loop({ x: 700, y: 300 }, { x: 400, y: 100 }, 30);
    expect(at(spell, 0).x).toBeCloseTo(700, 9);
    expect(at(spell, 1).y).toBeCloseTo(100, 9);
    expect(Math.min(...[0.25, 0.5, 0.75].map((u) => at(spell, u).y))).toBeLessThan(100 + 1);
  });
});
