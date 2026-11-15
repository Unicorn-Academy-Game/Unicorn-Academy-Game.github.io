import { describe, expect, it } from 'vitest';
import { glideAt, glideSeconds, glideSpeed } from './glide';

const G = 150;

/**
 * Heights on a screen of 360, where the herd leaves from a door and lands on the ground: the ones
 * the moon is used with, and the awkward ones.
 */
const CASES: readonly [from: number, to: number, top: number][] = [
  [237, 288, 138],
  [530, 624, 460],
  [347, 288, 100],
  [485, 288, 120],
  [-20, 288, -90],
  [288, 288, 138],
  [100, 600, 20],
];

describe('the way up and over and down', () => {
  it.each(CASES)('starts at %d, ends at %d, and gets no higher than %d', (from, to, top) => {
    const seconds = glideSeconds(from, to, top, G);
    expect(seconds).toBeGreaterThan(0);
    expect(Number.isFinite(seconds)).toBe(true);
    expect(glideAt(from, to, seconds, G, 0)).toBeCloseTo(from, 9);
    expect(glideAt(from, to, seconds, G, seconds)).toBeCloseTo(to, 9);
    let highest = Infinity;
    for (let i = 0; i <= 2000; i++) highest = Math.min(highest, glideAt(from, to, seconds, G, (i / 2000) * seconds));
    expect(highest).toBeCloseTo(top, 0);
  });

  it('goes up first when the top is above where it starts, and down at the end', () => {
    for (const [from, to, top] of CASES) {
      const seconds = glideSeconds(from, to, top, G);
      if (top < from) expect(glideSpeed(from, to, seconds, G, 0)).toBeLessThan(0);
      expect(glideSpeed(from, to, seconds, G, seconds)).toBeGreaterThan(0);
    }
  });

  it('agrees with itself: the speed is the slope of the height', () => {
    const [from, to, top] = CASES[0]!;
    const seconds = glideSeconds(from, to, top, G);
    for (const u of [0.1, 0.4, 0.5, 0.8]) {
      const t = u * seconds;
      const h = 1e-5;
      const slope = (glideAt(from, to, seconds, G, t + h) - glideAt(from, to, seconds, G, t - h)) / (2 * h);
      expect(glideSpeed(from, to, seconds, G, t)).toBeCloseTo(slope, 3);
    }
  });

  it('takes longer the weaker the pull, and longer the higher it goes', () => {
    const [from, to, top] = CASES[0]!;
    expect(glideSeconds(from, to, top, 80)).toBeGreaterThan(glideSeconds(from, to, top, 150));
    expect(glideSeconds(from, to, top - 60, G)).toBeGreaterThan(glideSeconds(from, to, top, G));
  });

  it('still lands where it was meant to when the screen changes size on the way', () => {
    // It was begun for a ground at 288, and the screen is turned so that the ground is now at 624.
    const seconds = glideSeconds(237, 288, 138, G);
    expect(glideAt(237, 624, seconds, G, seconds)).toBeCloseTo(624, 9);
    expect(glideAt(237, 624, seconds, G, seconds * 0.5)).toBeLessThan(624);
  });
});
