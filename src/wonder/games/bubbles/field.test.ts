import { describe, expect, it } from 'vitest';
import { Rng } from '../../../domain/rng';
import { type Air, type Birth, type Bubble, Field, join, PRIZES_MOST, R_MOST, R_ONE, radiusFor, windAt } from './field';

const AIR: Air = { w: 800, top: 0, floor: 330 };
const STEP = 1 / 60;

const field = (seed = 1): Field => new Field(new Rng(seed));
const run = (f: Field, seconds: number, from = 0, air: Air = AIR): void => {
  for (let t = from; t < from + seconds; t += STEP) f.step(STEP, t, air);
};
const one = (f: Field, o: Partial<Birth> = {}): Bubble => f.add({ x: 400, y: 250, prizes: ['butterfly'], ...o });
/** A bubble old enough to join others. */
const grown = (f: Field, o: Partial<Birth> = {}): Bubble => {
  const b = one(f, o);
  b.age = 5;
  return b;
};

describe('the air', () => {
  it('lets a bubble rise, slowly', () => {
    const f = field();
    const b = one(f, { y: 280 });
    run(f, 3);
    expect(b.y).toBeLessThan(260);
    expect(b.y).toBeGreaterThan(200);
  });

  it('carries it along with the wind, which comes and goes', () => {
    const f = field();
    const b = one(f, { x: 400, y: 300 });
    let t = 0;
    while (windAt(t) < 5) t += 0.1;
    run(f, 4, t);
    expect(b.vx).toBeGreaterThan(-1);
    const winds = Array.from({ length: 600 }, (_, i) => windAt(i * 0.5));
    expect(Math.max(...winds)).toBeGreaterThan(8);
    expect(Math.min(...winds)).toBeLessThan(-8);
  });

  it('swells a new bubble from a speck to its size in about a second', () => {
    const f = field();
    const b = f.add({ x: 100, y: 200, prizes: ['fish'], swell: true });
    expect(b.r).toBeLessThan(b.rTo * 0.25);
    run(f, 0.25);
    expect(b.r).toBeGreaterThan(b.rTo * 0.7);
    run(f, 1, 0.25);
    expect(b.r).toBeCloseTo(b.rTo, 1);
  });

  it('sizes a bubble by what it carries', () => {
    expect(radiusFor(1)).toBe(R_ONE);
    expect(radiusFor(2)).toBeCloseTo(R_ONE * Math.SQRT2, 6);
    expect(radiusFor(PRIZES_MOST)).toBeLessThanOrEqual(R_MOST);
  });

  it('lets a bubble float off the top, and says so', () => {
    const f = field();
    const b = one(f, { y: 30 });
    let left = 0;
    for (let t = 0; t < 8; t += STEP) left += f.step(STEP, t, AIR).left.length;
    expect(left).toBe(1);
    expect(f.bubbles).not.toContain(b);
  });

  it('turns a bubble back at both sides, so it never drifts off the screen sideways', () => {
    const f = field(3);
    const a = one(f, { x: 3, y: 300, vx: -40 });
    const b = one(f, { x: 797, y: 300, vx: 40 });
    for (let t = 0; t < 6; t += STEP) {
      f.step(STEP, t, { ...AIR, top: -2000 });
      expect(a.x).toBeGreaterThan(-12);
      expect(b.x).toBeLessThan(AIR.w + 12);
    }
  });

  it('holds a bubble up off the ground', () => {
    const f = field();
    const b = one(f, { y: 328, vy: 60 });
    run(f, 2);
    expect(b.y).toBeLessThan(AIR.floor);
  });

  it('plays the same way every time for the same seed', () => {
    const play = (): number[] => {
      const f = field(9);
      for (let i = 0; i < 6; i++) one(f, { x: 100 + i * 110, y: 300 - i * 20 });
      run(f, 6);
      return f.bubbles.flatMap((b) => [b.x, b.y, b.r]);
    };
    expect(play()).toEqual(play());
  });
});

describe('a prize put into a bubble', () => {
  it('makes it swell to hold one more, wobble, and remember how many it held before', () => {
    const f = field();
    const b = f.add({ x: 200, y: 200, prizes: ['fish'], held: true, mine: true });
    b.age = 3;
    const was = b.rTo;
    f.addPrize(b, 'star', 2);
    expect(b.prizes).toEqual(['fish', 'star']);
    expect(b.looks).toHaveLength(2);
    expect(b.looks[1]).toBe(2);
    expect(b.rTo).toBeGreaterThan(was);
    expect(b.rTo).toBeCloseTo(radiusFor(2), 6);
    expect(b.squashV).toBeGreaterThan(0);
    expect(b.held0).toBe(1);
    expect(b.changedAt).toBe(3);
    run(f, 1);
    expect(b.r).toBeCloseTo(b.rTo, 1);
  });

  it('is remembered by a bubble that two bubbles made, so what is inside can ease into its new places', () => {
    const a = grown(field(), { prizes: ['bee'] });
    const f = field();
    const x = grown(f, { prizes: ['bee'] });
    const y = grown(f, { prizes: ['snail', 'fish'], x: 440 });
    x.age = 7;
    join(x, y);
    expect(x.prizes).toHaveLength(3);
    expect(x.held0).toBe(1);
    expect(x.changedAt).toBe(7);
    expect(a.held0).toBe(1);
    expect(a.changedAt).toBeLessThan(0);
  });
});

describe('what a touch finds', () => {
  it('finds the bubble a point is in, and none in the empty air', () => {
    const f = field();
    const b = one(f, { x: 200, y: 150 });
    expect(f.at(205, 155, 0)).toBe(b);
    expect(f.at(200, 150 - R_ONE - 1, 0)).toBeNull();
  });

  it('gives a little room around each bubble, since a finger is wider than a point', () => {
    const f = field();
    const b = one(f, { x: 200, y: 150 });
    expect(f.at(200, 150 - R_ONE - 6, 8)).toBe(b);
    expect(f.at(200, 150 - R_ONE - 12, 8)).toBeNull();
  });

  it('takes the smaller of two bubbles it is in, since that is the one drawn on top', () => {
    const f = field();
    const big = one(f, { x: 200, y: 150, prizes: ['fish', 'bee'] });
    const small = one(f, { x: 215, y: 150 });
    expect(f.at(210, 150, 0)).toBe(small);
    expect(f.at(165, 150, 0)).toBe(big);
  });

  it('does not find a bubble that has not swelled to the size it is asked to have', () => {
    const f = field();
    const b = f.add({ x: 300, y: 200, prizes: ['fish'], swell: true });
    expect(f.at(300, 200, 0)).toBe(b);
    expect(f.at(300, 200, 0, 0.8)).toBeNull();
    run(f, 1.5);
    expect(f.at(300, 200, 0, 0.8)).toBe(b);
  });

  it('does not find a bubble that is still being blown', () => {
    const f = field();
    one(f, { x: 200, y: 150, held: true });
    expect(f.at(200, 150, 10)).toBeNull();
  });
});

describe('a finger sweeping through the air', () => {
  it('pushes the bubbles it passes along, the nearest the most', () => {
    const f = field();
    const near = one(f, { x: 300, y: 150 });
    const far = one(f, { x: 300 + R_ONE + 30, y: 150 });
    const out = one(f, { x: 600, y: 150 });
    const moved = f.push(300, 150, 200, 0, 40);
    expect(moved).toBe(2);
    expect(near.vx).toBeGreaterThan(far.vx);
    expect(far.vx).toBeGreaterThan(0);
    expect(out.vx).toBe(0);
  });

  it('never makes a bubble faster than it can go', () => {
    const f = field();
    const b = one(f, { x: 300, y: 150 });
    for (let i = 0; i < 40; i++) f.push(300, 150, 4000, -4000, 40);
    expect(Math.hypot(b.vx, b.vy)).toBeLessThan(215);
  });

  it('leaves a bubble with a friend inside alone, since she steers it herself', () => {
    const f = field();
    const b = one(f, { x: 300, y: 150, rider: 'leaf' });
    expect(f.push(300, 150, 500, 0, 40)).toBe(0);
    expect(b.vx).toBe(0);
  });
});

describe('a bubble that is steered', () => {
  it('floats to where it is aimed', () => {
    const f = field();
    const b = one(f, { x: 100, y: 300 });
    b.aim = { x: 600, y: 120 };
    run(f, 4, 0, { ...AIR, top: -500 });
    const nearer = Math.hypot(b.x - 600, b.y - 120);
    expect(nearer).toBeLessThan(Math.hypot(500, 180) - 250);
    run(f, 6, 4, { ...AIR, top: -500 });
    expect(Math.hypot(b.x - 600, b.y - 120)).toBeLessThan(14);
  });
});

describe('a bubble that bursts by itself', () => {
  it('goes when its time is up, and is told as burst, not as one that floated off', () => {
    const f = field();
    const a = one(f, { life: 1 });
    const b = one(f, { x: 600 });
    let burst = 0;
    let left = 0;
    for (let t = 0; t < 2; t += STEP) {
      const h = f.step(STEP, t, AIR);
      burst += h.burst.length;
      left += h.left.length;
    }
    expect(burst).toBe(1);
    expect(left).toBe(0);
    expect(f.bubbles).toEqual([b]);
    expect(a.life).toBeLessThanOrEqual(0);
  });

  it('stays until it is popped if it has no time of its own', () => {
    const f = field();
    const a = one(f, { y: 280 });
    run(f, 8);
    expect(f.bubbles).toContain(a);
    expect(a.life).toBeNull();
  });

  it('does not join other bubbles, however long they touch', () => {
    const f = field();
    const a = grown(f, { life: 20 });
    const b = grown(f, { x: 405, y: 250 });
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(a.r + b.r);
    run(f, 1);
    expect(f.bubbles).toHaveLength(2);
  });
});

describe('a bubble that is steered fast', () => {
  it('goes as fast as it was born to, and not faster than that', () => {
    const slow = field();
    const quick = field();
    const a = slow.add({ x: 50, y: 300, prizes: ['fish'] });
    const b = quick.add({ x: 50, y: 300, prizes: ['fish'] });
    b.speed = 240;
    a.aim = { x: 800, y: 300 };
    b.aim = { x: 800, y: 300 };
    run(slow, 2);
    run(quick, 2);
    expect(b.x).toBeGreaterThan(a.x + 40);
    expect(a.vx).toBeLessThanOrEqual(90.001);
    expect(b.vx).toBeLessThanOrEqual(240.001);
    expect(b.vx).toBeGreaterThan(100);
  });
});

describe('two bubbles that meet', () => {
  it('join into one that is as big as both, holds what both held, and says so', () => {
    const f = field();
    const a = grown(f, { x: 400, y: 200, prizes: ['butterfly'] });
    const b = grown(f, { x: 400 + R_ONE, y: 200, prizes: ['fish'] });
    const area = a.rTo ** 2 + b.rTo ** 2;
    const happened = f.step(STEP, 0, AIR);
    expect(happened.joined).toHaveLength(1);
    expect(f.bubbles).toHaveLength(1);
    const kept = f.bubbles[0]!;
    expect(kept.prizes.sort()).toEqual(['butterfly', 'fish']);
    expect(kept.rTo ** 2).toBeCloseTo(area, 6);
    expect(kept.x).toBeGreaterThan(400);
    expect(kept.x).toBeLessThan(400 + R_ONE);
  });

  it('wobble where they joined', () => {
    const f = field();
    const a = grown(f, { x: 400, y: 200 });
    grown(f, { x: 400 + R_ONE, y: 200, prizes: ['bee'] });
    f.step(STEP, 0, AIR);
    expect(f.bubbles[0]).toBe(a);
    expect(Math.abs(a.squashV)).toBeGreaterThan(1);
  });

  it('only bump when they merely touch, and drift apart', () => {
    const f = field();
    const a = grown(f, { x: 400, y: 200 });
    const b = grown(f, { x: 400 + R_ONE * 2 - 6, y: 200, prizes: ['bee'] });
    const before = b.x - a.x;
    run(f, 0.5);
    expect(f.bubbles).toHaveLength(2);
    expect(b.x - a.x).toBeGreaterThan(before);
  });

  it('do not join while one of them is new, so a bubble leaves the wand before it can meet the last', () => {
    const f = field();
    one(f, { x: 400, y: 200 });
    one(f, { x: 400 + R_ONE, y: 200, prizes: ['bee'] });
    f.step(STEP, 0, AIR);
    expect(f.bubbles).toHaveLength(2);
  });

  it('do not join if one holds a friend', () => {
    const f = field();
    grown(f, { x: 400, y: 200, rider: 'leaf', prizes: [] });
    grown(f, { x: 400 + R_ONE, y: 200, prizes: ['bee'] });
    f.step(STEP, 0, AIR);
    expect(f.bubbles).toHaveLength(2);
  });

  it('do not join if one is still being blown', () => {
    const f = field();
    grown(f, { x: 400, y: 200 });
    grown(f, { x: 400 + R_ONE, y: 200, prizes: ['bee'], held: true });
    f.step(STEP, 0, AIR);
    expect(f.bubbles).toHaveLength(2);
  });

  it('never make a bubble that holds more than it may', () => {
    const f = field();
    for (let i = 0; i < 6; i++) grown(f, { x: 400 + i * 4, y: 200, prizes: ['gem'] });
    run(f, 4, 0, { ...AIR, top: -2000 });
    for (const b of f.bubbles) {
      expect(b.prizes.length).toBeLessThanOrEqual(PRIZES_MOST);
      expect(b.rTo).toBeLessThanOrEqual(R_MOST + 1e-9);
    }
    expect(f.bubbles.reduce((n, b) => n + b.prizes.length, 0)).toBe(6);
  });

  it('are folded by `join` with every prize kept and no new area made', () => {
    const f = field();
    const a = grown(f, { prizes: ['star'] });
    const b = grown(f, { x: 430, prizes: ['heart', 'gem'] });
    const total = a.rTo ** 2 + b.rTo ** 2;
    join(a, b);
    expect(a.prizes).toEqual(['star', 'heart', 'gem']);
    expect(a.rTo ** 2).toBeCloseTo(total, 6);
  });

  it('keep the look of every prize they join, so what the player sees inside is what comes out', () => {
    const f = field();
    const a = grown(f, { prizes: ['butterfly'], looks: [3] });
    const b = grown(f, { x: 430, prizes: ['flower', 'fish'], looks: [7, 1] });
    join(a, b);
    expect(a.looks).toEqual([3, 7, 1]);
  });

  it('give every prize a look that exists, if none was asked for', () => {
    const f = field();
    const b = grown(f, { prizes: ['butterfly', 'gem', 'star'] });
    expect(b.looks).toHaveLength(3);
    expect(b.looks[0]).toBeLessThan(5);
    expect(b.looks[1]).toBeLessThan(5);
    expect(b.looks[2]).toBe(0);
  });
});
