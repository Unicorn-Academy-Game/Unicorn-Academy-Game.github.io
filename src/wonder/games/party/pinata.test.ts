import { describe, expect, it } from 'vitest';
import { Rng } from '../../../domain/rng';
import { KINDS, LIFT, Pinata } from './pinata';

const hung = (seed = 4): Pinata => {
  const p = new Pinata(new Rng(seed));
  p.place({ x: 200, top: 20, y: 120, r: 30 });
  return p;
};

const run = (p: Pinata, seconds: number): void => {
  for (let t = 0; t < seconds; t += 1 / 60) p.update(1 / 60);
};

describe('the pinata', () => {
  it('hangs still where it is put, on the end of its rope', () => {
    const p = hung();
    run(p, 3);
    const m = p.middle();
    expect(m.x).toBeCloseTo(200, 6);
    expect(m.y).toBeCloseTo(120, 6);
    expect(p.at(200, 120)).toBe(true);
    expect(p.at(200 + 30 + 12 - 1, 120)).toBe(true);
    expect(p.at(260, 120)).toBe(false);
  });

  it('swings away from the side it is touched on', () => {
    const left = hung();
    expect(left.knock(180)!.push).toBe(1);
    run(left, 0.4);
    expect(left.middle().x).toBeGreaterThan(200);
    const right = hung();
    expect(right.knock(225)!.push).toBe(-1);
    run(right, 0.4);
    expect(right.middle().x).toBeLessThan(200);
  });

  it('swings like a pendulum, keeps its rope the same length, and settles', () => {
    const p = hung();
    p.knock(150);
    let widest = 0;
    for (let t = 0; t < 8; t += 1 / 60) {
      p.update(1 / 60);
      const m = p.middle();
      widest = Math.max(widest, Math.abs(m.x - 200));
      // It is always as far from where the rope is tied as the rope is long.
      expect(Math.hypot(m.x - 200, m.y - 20)).toBeCloseTo(100, 4);
    }
    expect(widest).toBeGreaterThan(30);
    run(p, 12);
    expect(Math.abs(p.angle)).toBeLessThan(0.02);
  });

  it('is never swung higher than a part of the way up to where its rope is tied, however often and however hard it is knocked', () => {
    for (const side of [150, 250]) {
      const p = hung();
      let highest = Infinity;
      let widest = 0;
      for (let t = 0; t < 40; t += 1 / 60) {
        // Knocked every time it comes by the middle, the way it is already going, and never allowed
        // to burst.
        p.hits = 0;
        if (Math.abs(p.angle) < 0.03) p.knock(p.omega === 0 ? side : p.omega > 0 ? 150 : 250);
        p.update(1 / 60);
        highest = Math.min(highest, p.middle().y);
        widest = Math.max(widest, Math.abs(p.angle));
      }
      expect(widest, 'it does swing').toBeGreaterThan(0.7);
      expect(widest).toBeLessThanOrEqual(LIFT + 1e-6);
      expect(highest, 'it stays on the screen below where the rope is tied').toBeGreaterThan(
        20 + 100 * Math.cos(LIFT) - 0.5,
      );
    }
  });

  it('cracks a little more with each knock and bursts on the last, which is the third to the fifth', () => {
    for (let seed = 1; seed <= 24; seed++) {
      const p = hung(seed);
      const needs = p.needs;
      expect(needs).toBeGreaterThanOrEqual(3);
      expect(needs).toBeLessThanOrEqual(5);
      let last = null;
      for (let i = 1; i <= needs; i++) {
        expect(p.crack).toBeCloseTo((i - 1) / needs, 6);
        last = p.knock(210)!;
        expect(last.hits).toBe(i);
        expect(last.burst).toBe(i === needs);
        run(p, 0.05);
      }
      expect(last!.burst).toBe(true);
      expect(p.state).toBe('broken');
      expect(p.count).toBe(1);
    }
  });

  it('does not feel a knock while it is broken or being let down', () => {
    const p = hung();
    while (p.state === 'hanging') p.knock(210);
    expect(p.at(200, 120)).toBe(false);
    expect(p.knock(210)).toBeNull();
    run(p, 1.5);
    expect(p.state).toBe('coming');
    expect(p.knock(210)).toBeNull();
  });

  it('lets a new one down on the rope, from above, bouncing a little as it settles, and it is a different one', () => {
    const p = hung();
    while (p.state === 'hanging') p.knock(210);
    expect(p.kind).toBe(KINDS[0]);
    run(p, 1.45);
    expect(p.state).toBe('coming');
    expect(p.kind).toBe(KINDS[1]);
    expect(p.hits).toBe(0);
    const heights: number[] = [];
    for (let t = 0; t < 1.2; t += 1 / 60) {
      p.update(1 / 60);
      heights.push(p.lowering);
    }
    expect(heights[0]).toBeGreaterThan(100);
    expect(heights[heights.length - 1]).toBe(0);
    expect(p.state).toBe('hanging');
    // Its middle is above its place while it comes down.
    const q = hung();
    while (q.state === 'hanging') q.knock(210);
    run(q, 1.45);
    expect(q.middle().y).toBeLessThan(0);
  });

  it('goes through the kinds, one after another, and round', () => {
    const p = hung();
    const seen: string[] = [p.kind];
    for (let i = 0; i < KINDS.length; i++) {
      while (p.state === 'hanging') p.knock(210);
      run(p, 3);
      seen.push(p.kind);
    }
    expect(seen.slice(0, KINDS.length)).toEqual([...KINDS]);
    expect(seen[KINDS.length]).toBe(KINDS[0]);
  });

  it('starts over when it is asked to', () => {
    const p = hung();
    p.knock(210);
    while (p.state === 'hanging') p.knock(210);
    p.reset();
    expect(p.state).toBe('hanging');
    expect(p.hits).toBe(0);
    expect(p.count).toBe(0);
    expect(p.kind).toBe(KINDS[0]);
    expect(p.angle).toBe(0);
  });
});
