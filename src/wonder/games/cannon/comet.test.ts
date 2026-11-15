import { describe, expect, it } from 'vitest';
import { Rng } from '../../../domain/rng';
import { COMET_GAP, COMET_REACH, Comets, FIRST_COMET, type Sky } from './comet';

const SKY: Sky = { w: 800, top: 90, bottom: 150, calm: false };

function run(comets: Comets, rng: Rng, seconds: number, may = true): number {
  let sent = 0;
  for (let t = 0; t < seconds; t += 1 / 30) {
    if (comets.update(1 / 30, may, SKY, rng)) sent++;
  }
  return sent;
}

describe('the golden comet', () => {
  it('does not come before its first moment, and then does', () => {
    const c = new Comets();
    const rng = new Rng(1);
    expect(run(c, rng, FIRST_COMET - 0.5)).toBe(0);
    expect(run(c, rng, 1)).toBe(1);
    expect(c.current).not.toBeNull();
  });

  it('crosses the whole sky and is gone, and the next comes no sooner than the gap', () => {
    const c = new Comets();
    const rng = new Rng(2);
    const sent: number[] = [];
    let crossing = 0;
    let longest = 0;
    for (let t = 0; t < 120; t += 1 / 30) {
      if (c.update(1 / 30, true, SKY, rng)) sent.push(t);
      crossing = c.current ? crossing + 1 / 30 : 0;
      longest = Math.max(longest, crossing);
    }
    expect(sent.length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < sent.length; i++) expect(sent[i]! - sent[i - 1]!).toBeGreaterThanOrEqual(COMET_GAP[0]);
    // It is on its way for a few seconds, never stuck in the sky.
    expect(longest).toBeGreaterThan(3);
    expect(longest).toBeLessThan(5);
  });

  it('keeps to the band of sky it was given, from one edge to the other', () => {
    for (let seed = 1; seed < 20; seed++) {
      const c = new Comets();
      const rng = new Rng(seed);
      const sent = c.send(SKY, rng, seed % 2 === 0 ? 1 : -1);
      expect(sent.y).toBeGreaterThanOrEqual(SKY.top);
      expect(sent.y).toBeLessThanOrEqual(SKY.bottom);
      expect(Math.abs(sent.vx) * 3.8).toBeGreaterThanOrEqual(SKY.w);
      expect(sent.x < 0 || sent.x > SKY.w).toBe(true);
    }
  });

  it('flies slower in calm mode', () => {
    const rng = new Rng(4);
    const fast = new Comets().send(SKY, rng, 1);
    const calm = new Comets().send({ ...SKY, calm: true }, rng, 1);
    expect(Math.abs(calm.vx)).toBeLessThan(Math.abs(fast.vx));
  });

  it('does not come while the game does not want it, and does not lose its turn', () => {
    const c = new Comets();
    const rng = new Rng(5);
    expect(run(c, rng, 40, false)).toBe(0);
    expect(run(c, rng, FIRST_COMET + 1, true)).toBe(1);
  });

  it('is caught by a touch near enough, and not by one far away', () => {
    const c = new Comets();
    const rng = new Rng(6);
    c.send(SKY, rng, 1);
    const at = c.current!;
    expect(c.hits(at.x + COMET_REACH - 1, at.y)).toBe(true);
    expect(c.hits(at.x + COMET_REACH + 6, at.y)).toBe(false);
    expect(c.take()).toBe(at);
    expect(c.current).toBeNull();
    expect(c.hits(at.x, at.y)).toBe(false);
  });

  it('starts over when reset', () => {
    const c = new Comets();
    const rng = new Rng(7);
    run(c, rng, 30);
    c.reset();
    expect(c.current).toBeNull();
    expect(run(c, rng, FIRST_COMET - 0.5)).toBe(0);
  });
});
