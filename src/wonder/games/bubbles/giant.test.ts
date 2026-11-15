import { describe, expect, it } from 'vitest';
import { Rng } from '../../../domain/rng';
import { type Air, Field } from './field';
import { FULL, Giant, GUESTS_MOST, START, storm, type Taken } from './giant';

const AT = { x: 400, y: 120, r: 110 };
const STEP = 1 / 60;

const giant = (seed = 1): Giant => new Giant(new Rng(seed), AT);
const run = (g: Giant, seconds: number): void => {
  for (let t = 0; t < seconds; t += STEP) g.update(STEP);
};
const bubble = (o: Partial<Taken> = {}): Taken => ({ x: 300, y: 200, r: 36, prizes: ['fish'], looks: [0], ...o });

describe('the great bubble', () => {
  it('is not there until it opens, and then it is a speck that swells to its first size', () => {
    const g = giant();
    expect(g.opened).toBe(false);
    g.open();
    expect(g.opened).toBe(true);
    expect(g.r).toBeLessThan(AT.r * 0.1);
    run(g, 2.5);
    expect(g.r).toBeCloseTo(AT.r * START, 0);
    expect(g.size).toBeCloseTo(START, 1);
  });

  it('grows with every bubble it takes, never past the room it has, and never smaller', () => {
    const g = giant();
    g.open();
    let last = g.rTo;
    for (let i = 0; i < 30; i++) {
      g.take(bubble({ r: 30 + (i % 5) * 6 }));
      expect(g.rTo).toBeGreaterThanOrEqual(last);
      expect(g.rTo).toBeLessThanOrEqual(AT.r * FULL + 1e-9);
      last = g.rTo;
    }
    expect(g.rTo).toBeCloseTo(AT.r * FULL, 6);
    run(g, 4);
    expect(g.r).toBeLessThanOrEqual(AT.r * FULL + 0.01);
  });

  it('grows by about the area of what it takes: a dozen bubbles make it a good deal bigger but leave room to blow it up', () => {
    const g = giant();
    g.open();
    for (let i = 0; i < 12; i++) g.take(bubble({ r: 34 }));
    expect(g.rTo).toBeGreaterThan(AT.r * START * 1.2);
    expect(g.rTo).toBeLessThan(AT.r * FULL - 2);
  });

  it('shows what each bubble held, turning inside it, a few at most', () => {
    const g = giant();
    g.open();
    g.take(bubble({ prizes: ['bee', 'star', 'gem'], looks: [0, 1, 2] }));
    expect(g.guests.map((x) => x.prize)).toEqual(['bee', 'star', 'gem']);
    for (let i = 0; i < 10; i++) g.take(bubble({ prizes: ['bird', 'fish'], looks: [0, 1] }));
    expect(g.guests).toHaveLength(GUESTS_MOST);
    run(g, 5);
    for (const guest of g.guests) {
      expect(guest.orbit).toBeGreaterThan(0.15);
      expect(guest.orbit).toBeLessThan(0.65);
      const at = g.guestAt(guest);
      expect(Math.hypot(at.x - g.x, (at.y - g.y) / 0.85)).toBeLessThan(g.r);
    }
  });

  it('lets what came in come in from the side it came from', () => {
    const g = giant();
    g.open();
    g.take(bubble({ x: AT.x + 200, y: AT.y }));
    expect(g.guests[0]!.a).toBeCloseTo(0, 6);
    expect(g.squashAt).toBeCloseTo(0, 6);
    expect(g.squashV).toBeGreaterThan(0);
  });

  it('turns what is inside it, and the wobble of its skin settles', () => {
    const g = giant();
    g.open();
    g.take(bubble({ prizes: ['bee'], looks: [0] }));
    const a = g.guests[0]!.a;
    run(g, 1);
    expect(g.guests[0]!.a).not.toBe(a);
    run(g, 6);
    expect(Math.abs(g.squash)).toBeLessThan(0.01);
  });

  it('is blown up to a size, within its room', () => {
    const g = giant();
    g.open();
    g.inflate(2);
    expect(g.rTo).toBeCloseTo(AT.r * FULL, 6);
    g.inflate(0);
    expect(g.rTo).toBeCloseTo(AT.r * START, 6);
  });

  it('bursts, hands over what was in it, and is gone', () => {
    const g = giant();
    g.open();
    g.take(bubble({ prizes: ['fish', 'bee'], looks: [0, 1] }));
    const out = g.burst();
    expect(out.map((x) => x.prize)).toEqual(['fish', 'bee']);
    expect(g.opened).toBe(false);
    expect(g.guests).toHaveLength(0);
    expect(g.r).toBe(0);
    run(g, 1);
    expect(g.r).toBe(0);
  });

  it('keeps its size as a share of the room when the screen changes shape', () => {
    const g = giant();
    g.open();
    for (let i = 0; i < 6; i++) g.take(bubble());
    run(g, 4);
    const share = g.size;
    g.place({ x: 200, y: 300, r: 55 });
    expect(g.size).toBeCloseTo(share, 6);
    expect(g.x).toBe(200);
    expect(g.y).toBe(300);
    expect(g.rTo).toBeLessThanOrEqual(55 * FULL + 1e-9);
  });

  it('can be opened again after it burst, from nothing', () => {
    const g = giant();
    g.open();
    g.take(bubble());
    g.burst();
    g.open();
    expect(g.guests).toHaveLength(0);
    expect(g.r).toBeLessThan(AT.r * 0.1);
  });
});

describe('the storm of small bubbles', () => {
  const AIR: Air = { w: 800, top: -60, floor: 330 };

  it('is as many bubbles as it is asked for, each with a time of its own to go and none of them able to join', () => {
    const f = new Field(new Rng(4));
    const made = storm(f, new Rng(4), 400, 120, 30);
    expect(made).toHaveLength(30);
    expect(f.bubbles).toHaveLength(30);
    for (const b of made) {
      expect(b.life).not.toBeNull();
      expect(b.life!).toBeGreaterThan(1);
      expect(b.life!).toBeLessThan(4);
      expect(b.prizes).toEqual([]);
      expect(b.r).toBeLessThan(18);
    }
  });

  it('flies out of the middle in every direction and spreads across the sky', () => {
    const f = new Field(new Rng(5));
    storm(f, new Rng(5), 400, 120, 40);
    for (let t = 0; t < 1.2; t += 1 / 60) f.step(1 / 60, t, AIR);
    const xs = f.bubbles.map((b) => b.x);
    expect(Math.min(...xs)).toBeLessThan(330);
    expect(Math.max(...xs)).toBeGreaterThan(470);
    const sides = new Set(f.bubbles.map((b) => `${Math.sign(b.x - 400)}${Math.sign(b.y - 120)}`));
    expect(sides.size).toBeGreaterThanOrEqual(3);
  });

  it('goes off bubble by bubble, not all at once, and none is left a few seconds on', () => {
    const f = new Field(new Rng(6));
    storm(f, new Rng(6), 400, 120, 36);
    const gone: number[] = [];
    for (let t = 0; t < 4.2; t += 1 / 60) gone.push(f.step(1 / 60, t, AIR).burst.length);
    expect(f.bubbles).toHaveLength(0);
    const seconds = new Set(gone.flatMap((n, i) => (n > 0 ? [Math.floor(i / 60)] : [])));
    expect(seconds.size).toBeGreaterThanOrEqual(2);
    expect(Math.max(...gone)).toBeLessThan(8);
  });
});

describe('a touch on the great bubble', () => {
  it('is on it only while it is open, and only inside its skin', () => {
    const g = new Giant(new Rng(1), AT);
    expect(g.has(AT.x, AT.y)).toBe(false);
    g.open();
    for (let i = 0; i < 120; i++) g.update(1 / 60);
    expect(g.has(AT.x, AT.y)).toBe(true);
    expect(g.has(AT.x + g.r * 0.9, AT.y)).toBe(true);
    expect(g.has(AT.x + g.r * 1.1, AT.y)).toBe(false);
    g.burst();
    expect(g.has(AT.x, AT.y)).toBe(false);
  });

  it('makes the skin give on the side that was touched, and it comes back', () => {
    const g = new Giant(new Rng(1), AT);
    g.open();
    for (let i = 0; i < 120; i++) g.update(1 / 60);
    g.poke(AT.x - g.r, AT.y);
    expect(Math.abs(g.squashAt)).toBeCloseTo(Math.PI, 5);
    let most = 0;
    for (let i = 0; i < 20; i++) {
      g.update(1 / 60);
      most = Math.max(most, Math.abs(g.squash));
    }
    expect(most).toBeGreaterThan(0.01);
    for (let i = 0; i < 240; i++) g.update(1 / 60);
    expect(Math.abs(g.squash)).toBeLessThan(0.005);
  });
});
