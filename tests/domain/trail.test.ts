import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/domain/config';
import { dist } from '../../src/domain/geometry';
import { Trail } from '../../src/domain/trail';

describe('trail', () => {
  it('reports points by arc length along the walked path', () => {
    const t = new Trail({ x: 0, y: 0 });
    for (let x = 4; x <= 100; x += 4) t.push({ x, y: 0 });
    t.push({ x: 100, y: 0 }, true);
    for (let y = 4; y <= 60; y += 4) t.push({ x: 100, y });
    expect(t.head).toBeCloseTo(160, 5);
    expect(t.pointAt(50)).toEqual({ x: 50, y: 0 });
    const p = t.pointAt(130);
    expect(p.x).toBeCloseTo(100, 5);
    expect(p.y).toBeCloseTo(30, 5);
    // Beyond the head it clamps to the leader.
    expect(t.pointAt(1e6)).toEqual({ x: 100, y: 60 });
  });

  it('keeps the corner exactly, so a follower never cuts across a bend', () => {
    const t = new Trail({ x: 0, y: 0 });
    // Walk 30 units east then 30 north in 4 unit steps, reporting the turn as a corner.
    for (let x = 4; x <= 28; x += 4) t.push({ x, y: 0 });
    t.push({ x: 30, y: 0 }, true);
    for (let y = 4; y <= 32; y += 4) t.push({ x: 30, y });
    // The point at arc length 30 is the corner, not a chord across it.
    expect(t.pointAt(30)).toEqual({ x: 30, y: 0 });
    // And points before and after lie on the legs.
    expect(t.pointAt(26).y).toBe(0);
    expect(t.pointAt(34).x).toBe(30);
  });

  it('forgets points beyond the retention distance but keeps interpolating near the cutoff', () => {
    const t = new Trail({ x: 0, y: 0 });
    for (let x = 4; x <= 3000; x += 4) t.push({ x, y: 0 });
    expect(t.head - t.tail).toBeLessThanOrEqual(CONFIG.herd.retention + CONFIG.herd.crumb + 1);
    expect(t.head - t.tail).toBeGreaterThanOrEqual(CONFIG.herd.retention);
    const p = t.pointAt(t.head - 700);
    expect(p.x).toBeCloseTo(3000 - 700, 3);
  });

  it('can be seeded with a polyline and extended from it', () => {
    const t = new Trail({ x: 0, y: 0 });
    t.seed([
      { x: 0, y: 100 },
      { x: 0, y: 50 },
      { x: 0, y: 0 },
    ]);
    expect(t.head).toBeCloseTo(100, 5);
    expect(t.pointAt(25)).toEqual({ x: 0, y: 75 });
    t.push({ x: 20, y: 0 });
    expect(t.head).toBeCloseTo(120, 5);
  });

  it('can be laid again so that the newest point keeps the arc length it had, and anyone on it stays where their own arc length says', () => {
    const t = new Trail({ x: 0, y: 0 });
    for (let x = 4; x <= 800; x += 4) t.push({ x, y: 0 });
    const was = t.head;
    // Someone 300 behind her stood at (500, 0). She is put down far away, with the way she could
    // have come behind her.
    t.seed(
      [
        { x: 600, y: 900 },
        { x: 600, y: 700 },
        { x: 600, y: 500 },
      ],
      was,
    );
    expect(t.head).toBe(was);
    expect(t.tail).toBeCloseTo(was - 400, 5);
    expect(t.headPoint).toEqual({ x: 600, y: 500 });
    expect(t.pointAt(was)).toEqual({ x: 600, y: 500 });
    expect(t.pointAt(was - 300)).toEqual({ x: 600, y: 800 });
    // She walks on and the numbers go on from where they were.
    t.push({ x: 640, y: 500 });
    expect(t.head).toBeCloseTo(was + 40, 5);
  });

  it('finds the nearest trail point within a window', () => {
    const t = new Trail({ x: 0, y: 0 });
    for (let x = 4; x <= 400; x += 4) t.push({ x, y: 0 });
    const n = t.nearest({ x: 210, y: 30 }, 100, 300);
    expect(n.s).toBeGreaterThan(200);
    expect(n.s).toBeLessThan(220);
    expect(n.d).toBeCloseTo(30, 0);
    expect(dist(t.pointAt(n.s), { x: 210, y: 0 })).toBeLessThan(10);
  });

  it('answers with the nearest end when the window lies off the trail, so a short trail can still be joined', () => {
    const t = new Trail({ x: 0, y: 0 });
    // Nothing has been walked yet: a window that starts before the beginning is still held to the
    // one point there is.
    expect(t.nearest({ x: 30, y: 40 }, -328, -68)).toEqual({ s: 0, d: 50 });
    for (let x = 4; x <= 100; x += 4) t.push({ x, y: 0 });
    expect(t.nearest({ x: 10, y: 30 }, -200, -20)).toEqual({ s: 0, d: Math.hypot(10, 30) });
    // And a window beyond the leader is held to the leader.
    expect(t.nearest({ x: 100, y: 30 }, 500, 700)).toEqual({ s: 100, d: 30 });
  });
});
