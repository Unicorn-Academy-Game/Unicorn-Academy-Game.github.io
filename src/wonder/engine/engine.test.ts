import { describe, expect, it } from 'vitest';
import { bucket, hex, hsl, mix, unbucket } from './color';
import {
  clamp,
  damp,
  easeOutBack,
  easeOutBounce,
  easeOutElastic,
  remap,
  Spring,
  smooth,
  smoother,
  spread,
  unlerp,
  wrap,
} from './ease';
import { FLASH_CAP, FlashBudget } from './flash';
import { Meter } from './meter';
import { Particles } from './particles';
import { Script } from './script';

describe('easing', () => {
  it('starts at 0 and ends at 1 for every curve that is meant to', () => {
    for (const f of [smooth, smoother, easeOutBack, easeOutElastic, easeOutBounce]) {
      expect(f(0)).toBeCloseTo(0, 6);
      expect(f(1)).toBeCloseTo(1, 6);
    }
  });

  it('smooth curves never leave the range they are given', () => {
    for (let t = -0.5; t <= 1.5; t += 0.05) {
      expect(smooth(t)).toBeGreaterThanOrEqual(0);
      expect(smooth(t)).toBeLessThanOrEqual(1);
    }
  });

  it('easeOutBack overshoots before it settles', () => {
    const peak = Math.max(...Array.from({ length: 101 }, (_, i) => easeOutBack(i / 100)));
    expect(peak).toBeGreaterThan(1.05);
  });

  it('wraps negative numbers into range and maps ranges', () => {
    expect(wrap(-1, 5)).toBe(4);
    expect(wrap(11, 5)).toBe(1);
    expect(unlerp(10, 20, 15)).toBe(0.5);
    expect(unlerp(10, 20, 99)).toBe(1);
    expect(remap(5, 0, 10, 100, 200)).toBe(150);
    expect(clamp(7, 1, 3)).toBe(3);
  });

  it('spreads values across a range with both ends included', () => {
    expect([0, 1, 2, 3, 4].map((i) => spread(i, 5, 0, 8))).toEqual([0, 2, 4, 6, 8]);
    expect(spread(0, 1, 0, 8)).toBe(4);
  });

  it('damp closes the same share of the gap whatever the frame rate', () => {
    let a = 0;
    for (let i = 0; i < 60; i++) a = damp(a, 1, 5, 1 / 60);
    let b = 0;
    for (let i = 0; i < 30; i++) b = damp(b, 1, 5, 1 / 30);
    expect(a).toBeCloseTo(b, 6);
    expect(a).toBeGreaterThan(0.99);
  });

  it('a spring comes to rest on its target and does not blow up on a long frame', () => {
    const s = new Spring(0, 1, 180, 14);
    for (let i = 0; i < 90; i++) s.step(1 / 60);
    expect(s.x).toBeCloseTo(1, 2);
    const wild = new Spring(0, 1, 400, 6);
    wild.step(0.5);
    expect(Number.isFinite(wild.x)).toBe(true);
    expect(Math.abs(wild.x)).toBeLessThan(10);
  });
});

describe('colour', () => {
  it('reads hex and mixes', () => {
    expect(hex('#ff7ac8')).toEqual([255, 122, 200]);
    expect(mix([0, 0, 0], [255, 255, 255], 0.5)).toEqual([128, 128, 128]);
    expect(() => hex('pink')).toThrow();
  });

  it('turns hue into the colours of a rainbow', () => {
    expect(hsl(0, 1, 0.5)).toEqual([255, 0, 0]);
    expect(hsl(1 / 3, 1, 0.5)).toEqual([0, 255, 0]);
    expect(hsl(2 / 3, 1, 0.5)).toEqual([0, 0, 255]);
  });

  it('shares one bucket among near colours and keeps black and white exact', () => {
    expect(bucket(255, 255, 255)).toBe(0xfff);
    expect(unbucket(bucket(255, 255, 255))).toEqual([255, 255, 255]);
    expect(unbucket(bucket(0, 0, 0))).toEqual([0, 0, 0]);
    expect(bucket(200, 100, 50)).toBe(bucket(203, 98, 52));
    expect(bucket(200, 100, 50)).not.toBe(bucket(100, 200, 50));
  });
});

describe('Meter', () => {
  const costs = [3, 8, 15, 25, 40];

  it('earns a star at each cost and tells how far it is to the next', () => {
    const m = new Meter(costs);
    expect(m.add(2)).toBe(0);
    expect(m.fraction).toBeCloseTo(2 / 3);
    expect(m.add(1)).toBe(1);
    expect(m.stars).toBe(1);
    expect(m.fraction).toBe(0);
    expect(m.add(2.5)).toBe(0);
    expect(m.fraction).toBeCloseTo(2.5 / 5);
  });

  it('can earn several stars from one big moment, and stops at five', () => {
    const m = new Meter(costs);
    expect(m.add(30)).toBe(4);
    expect(m.add(500)).toBe(1);
    expect(m.stars).toBe(5);
    expect(m.full).toBe(true);
    expect(m.fraction).toBe(1);
    expect(m.add(5)).toBe(0);
  });

  it('ignores play that is not a positive amount and can start over', () => {
    const m = new Meter(costs);
    expect(m.add(-4)).toBe(0);
    expect(m.add(Number.NaN)).toBe(0);
    expect(m.score).toBe(0);
    m.add(9);
    m.reset();
    expect(m.stars).toBe(0);
    expect(m.score).toBe(0);
  });

  it('refuses costs that are not rising', () => {
    expect(() => new Meter([3, 3, 5, 6, 7])).toThrow();
    expect(() => new Meter([1, 2, 3])).toThrow();
    expect(() => new Meter([0, 1, 2, 3, 4])).toThrow();
  });
});

describe('FlashBudget', () => {
  it('lets three big flashes through in a second and softens the rest', () => {
    const b = new FlashBudget();
    const strengths = [0, 0.1, 0.2, 0.3, 0.4, 0.5].map((t) => b.allow(1, t));
    expect(strengths.slice(0, 3).every((s) => s === FLASH_CAP)).toBe(true);
    expect(strengths.slice(3).every((s) => s < 0.1)).toBe(true);
  });

  it('gives the budget back as time passes', () => {
    const b = new FlashBudget();
    for (const t of [0, 0.1, 0.2]) b.allow(1, t);
    expect(b.allow(1, 0.4)).toBeLessThan(0.1);
    expect(b.allow(1, 1.3)).toBe(FLASH_CAP);
  });

  it('never exceeds the cap, whatever it is asked for', () => {
    const b = new FlashBudget();
    expect(b.allow(50, 0)).toBe(FLASH_CAP);
    expect(b.allow(-3, 5)).toBe(0);
  });

  it('does not count a glow that is too faint to notice', () => {
    const b = new FlashBudget();
    for (let i = 0; i < 20; i++) expect(b.allow(0.2, i * 0.01)).toBeCloseTo(0.2 * FLASH_CAP);
    expect(b.allow(1, 0.3)).toBe(FLASH_CAP);
  });
});

describe('Script', () => {
  it('runs cues in order as time passes, once each', () => {
    const s = new Script();
    const seen: string[] = [];
    s.at(0.5, () => seen.push('b'))
      .at(0.2, () => seen.push('a'))
      .at(1, () => seen.push('c'));
    s.update(0.3);
    expect(seen).toEqual(['a']);
    s.update(0.3);
    s.update(0.5);
    s.update(5);
    expect(seen).toEqual(['a', 'b', 'c']);
    expect(s.finished).toBe(true);
  });

  it('spreads cues evenly and numbers them', () => {
    const s = new Script();
    const seen: [number, number][] = [];
    s.spread(0, 1, 5, (i, n) => seen.push([i, n]));
    s.update(0.5);
    expect(seen.map((x) => x[0])).toEqual([0, 1, 2]);
    s.update(0.6);
    expect(seen.map((x) => x[0])).toEqual([0, 1, 2, 3, 4]);
    expect(seen.every(([, n]) => n === 5)).toBe(true);
  });

  it('runs a cue that was added late at the next step', () => {
    const s = new Script();
    s.update(2);
    let ran = false;
    s.at(0.5, () => (ran = true));
    s.update(0.016);
    expect(ran).toBe(true);
  });
});

describe('Particles', () => {
  const calm = (): number => 0.5;
  const only = (p: Particles): { x: number; y: number; vx: number; vy: number } => {
    let found: { x: number; y: number; vx: number; vy: number } | null = null;
    p.each((q) => (found = { x: q.x, y: q.y, vx: q.vx, vy: q.vy }));
    return found!;
  };

  it('slows a particle by drag the way the formula says', () => {
    const p = new Particles(8, calm);
    p.emit({ x: 0, y: 0, vx: 100, life: 2, drag: 1 });
    for (let i = 0; i < 60; i++) p.update(1 / 60);
    const q = only(p);
    // One second of drag leaves 1/e of the speed, and the distance covered is v0 (1 - 1/e).
    expect(q.vx).toBeCloseTo(100 / Math.E, 0);
    expect(Math.abs(q.x - 100 * (1 - 1 / Math.E))).toBeLessThan(1);
  });

  it('pulls a particle down with gravity', () => {
    const p = new Particles(8, calm);
    p.emit({ x: 0, y: 0, life: 2, gravity: 50 });
    for (let i = 0; i < 60; i++) p.update(1 / 60);
    const q = only(p);
    expect(q.vy).toBeCloseTo(50, 0);
    expect(Math.abs(q.y - 25)).toBeLessThan(1);
    expect(q.x).toBe(0);
  });

  it('removes a particle when its life is over and keeps the rest', () => {
    const p = new Particles(8, calm);
    p.emit({ x: 0, y: 0, life: 0.1 });
    p.emit({ x: 5, y: 0, life: 1 });
    p.emit({ x: 0, y: 0, life: 0.1 });
    p.update(0.2);
    expect(p.alive).toBe(1);
    expect(only(p).x).toBeGreaterThanOrEqual(5);
    p.update(1);
    expect(p.alive).toBe(0);
  });

  it('holds a delayed particle back, still, and does not age it', () => {
    const p = new Particles(4, calm);
    p.emit({ x: 0, y: 0, vx: 100, life: 0.1, delay: 0.5 });
    p.update(0.3);
    expect(p.alive).toBe(1);
    expect(only(p).x).toBe(0);
    p.update(0.3);
    p.update(0.05);
    expect(p.alive).toBe(1);
    p.update(0.2);
    expect(p.alive).toBe(0);
  });

  it('gives the place of an old particle to a new one when full, and never grows', () => {
    const p = new Particles(3, calm);
    for (let i = 0; i < 10; i++) p.emit({ x: i, y: 0, life: 5 });
    expect(p.alive).toBe(3);
    const xs: number[] = [];
    p.each((q) => xs.push(q.x));
    // The last three emitted are the ones that remain.
    expect(xs.sort((a, b) => a - b)).toEqual([7, 8, 9]);
  });

  it('scales a count by density and never to zero for a request', () => {
    const p = new Particles(4, calm);
    p.density = 0.4;
    expect(p.count(50)).toBe(20);
    expect(p.count(1)).toBe(1);
    expect(p.count(0)).toBe(0);
  });

  it('clears by tag and leaves the rest', () => {
    const p = new Particles(8, calm);
    p.emit({ x: 0, y: 0, life: 5, tag: 1 });
    p.emit({ x: 0, y: 0, life: 5, tag: 2 });
    p.emit({ x: 0, y: 0, life: 5, tag: 1 });
    p.clearTag(1);
    expect(p.alive).toBe(1);
    expect(only(p)).toBeTruthy();
  });

  it('moves everything in the air with the world, floors and particles that are still waiting included', () => {
    const p = new Particles(4, calm);
    p.emit({ x: 10, y: 20, life: 5, floor: 100 });
    p.emit({ x: 30, y: 40, life: 5, delay: 2 });
    p.shift(-7, 3);
    const seen: { x: number; y: number }[] = [];
    p.each((q) => seen.push({ x: q.x, y: q.y }));
    expect(seen).toEqual([
      { x: 3, y: 23 },
      { x: 23, y: 43 },
    ]);
    // The floor went with it: a particle that falls now lands 3 below where it would have.
    const fall = new Particles(2, calm);
    fall.emit({ x: 0, y: 0, gravity: 900, floor: 50, bounce: 0, life: 30 });
    fall.shift(0, 10);
    for (let i = 0; i < 120; i++) fall.update(1 / 60);
    expect(only(fall).y).toBeCloseTo(60, 0);
  });

  it('bounces off a floor, loses speed, and comes to rest on it', () => {
    const p = new Particles(2, calm);
    p.emit({ x: 0, y: 0, gravity: 300, floor: 100, bounce: 0.4, life: 30 });
    let highestAfterFirstBounce = Infinity;
    let bounced = false;
    for (let i = 0; i < 60 * 12; i++) {
      p.update(1 / 60);
      const q = only(p);
      if (q.y >= 100 && q.vy <= 0) bounced = true;
      if (bounced && i < 60 * 3) highestAfterFirstBounce = Math.min(highestAfterFirstBounce, q.y);
      expect(q.y).toBeLessThanOrEqual(100.0001);
    }
    expect(bounced).toBe(true);
    expect(highestAfterFirstBounce).toBeLessThan(100);
    const end = only(p);
    expect(end.y).toBeCloseTo(100, 3);
    expect(Math.abs(end.vy)).toBeLessThan(15);
  });

  it('swirl turns the direction of travel and keeps the speed', () => {
    const p = new Particles(2, calm);
    p.emit({ x: 0, y: 0, vx: 60, swirl: Math.PI, life: 5 });
    for (let i = 0; i < 30; i++) p.update(1 / 60);
    const q = only(p);
    // Half a second at pi radians a second is a quarter turn, so it now goes straight down the
    // screen.
    expect(q.vx).toBeCloseTo(0, 0);
    expect(q.vy).toBeCloseTo(60, 0);
    // It has travelled a quarter of a circle of radius 60 / pi.
    const r = 60 / Math.PI;
    expect(Math.abs(q.x - r)).toBeLessThan(1.5);
    expect(Math.abs(q.y - r)).toBeLessThan(1.5);
  });

  it('leaves a trail of small glows behind a moving spark, and only while there is room', () => {
    const p = new Particles(40, calm);
    p.emit({ x: 0, y: 0, vx: 100, life: 1, trail: 0.05, size: 6 });
    for (let i = 0; i < 30; i++) p.update(1 / 60);
    expect(p.alive).toBeGreaterThan(5);
    expect(p.alive).toBeLessThanOrEqual(40);
    const full = new Particles(3, calm);
    full.emit({ x: 0, y: 0, vx: 100, life: 1, trail: 0.01 });
    for (let i = 0; i < 30; i++) full.update(1 / 60);
    expect(full.alive).toBeLessThanOrEqual(3);
    // The spark itself is still the one going to the right.
    let fastest = 0;
    full.each((q) => (fastest = Math.max(fastest, q.vx)));
    expect(fastest).toBe(100);
  });
});
