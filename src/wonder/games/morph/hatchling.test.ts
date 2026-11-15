import { describe, expect, it } from 'vitest';
import { HATCH_SECONDS, Hatchling, newShape, SECONDS, TRICKS } from './hatchling';

const grow = (h: Hatchling, seconds: number): void => {
  for (let t = 0; t < seconds - 1e-9; t += 1 / 60) h.tick(1 / 60);
};

describe('the hatchling', () => {
  it('is not there until the machine has made it, and cannot be touched', () => {
    const h = new Hatchling();
    expect(h.here).toBe(false);
    expect(h.touch()).toBeNull();
    expect(h.flight).toBe(1);
  });

  it('comes out of the machine, up in an arc, and lands on its feet', () => {
    const h = new Hatchling();
    h.hatch();
    expect(h.here).toBe(true);
    let highest = 0;
    for (let t = 0; t < HATCH_SECONDS; t += 1 / 60) {
      h.tick(1 / 60);
      highest = Math.max(highest, h.shape().lift);
    }
    expect(highest).toBeGreaterThan(60);
    grow(h, 0.2);
    expect(h.shape().lift).toBeCloseTo(0, 6);
    expect(h.flight).toBe(0);
  });

  it('starts at the dome and ends at its feet', () => {
    const h = new Hatchling();
    h.hatch();
    expect(h.flight).toBe(1);
    grow(h, HATCH_SECONDS / 2);
    expect(h.flight).toBeGreaterThan(0);
    expect(h.flight).toBeLessThan(1);
    grow(h, HATCH_SECONDS);
    expect(h.flight).toBe(0);
  });

  it('is not touched until it has landed', () => {
    const h = new Hatchling();
    h.hatch();
    grow(h, HATCH_SECONDS / 2);
    expect(h.touch()).toBeNull();
    grow(h, HATCH_SECONDS);
    expect(h.touch()).toBe(TRICKS[0]);
  });

  it('does a different trick each time it is touched, going round', () => {
    const h = new Hatchling();
    h.hatch();
    grow(h, HATCH_SECONDS + 0.1);
    const done = TRICKS.map(() => h.touch());
    expect(done).toEqual([...TRICKS]);
    expect(h.touch()).toBe(TRICKS[0]);
    expect(h.done).toBe(TRICKS.length + 1);
  });

  it('finishes a trick, and is still again, with its feet on the ground', () => {
    for (const trick of TRICKS) {
      const h = new Hatchling();
      h.hatch();
      grow(h, HATCH_SECONDS + 0.1);
      h.done = TRICKS.indexOf(trick);
      expect(h.touch()).toBe(trick);
      grow(h, SECONDS[trick] + 0.05);
      expect(h.trick, trick).toBeNull();
      const shape = h.shape();
      expect(shape.lift, trick).toBeCloseTo(0, 6);
      expect(Math.abs(shape.shift), trick).toBeLessThan(1e-9);
      expect(shape.wave, trick).toBe(0);
    }
  });

  it('never goes below its feet, and never turns its face through more than its own width', () => {
    for (const trick of TRICKS) {
      const h = new Hatchling();
      h.hatch();
      grow(h, HATCH_SECONDS + 0.1);
      h.done = TRICKS.indexOf(trick);
      h.touch();
      for (let t = 0; t < SECONDS[trick]; t += 1 / 60) {
        h.tick(1 / 60);
        const s = h.shape();
        expect(s.lift, `${trick} at ${t.toFixed(2)}`).toBeGreaterThanOrEqual(-1e-9);
        expect(Math.abs(s.face), trick).toBeLessThanOrEqual(1 + 1e-9);
        expect(s.smile, trick).toBeGreaterThan(0.5);
        expect(s.stretch, trick).toBeGreaterThan(-0.4);
        expect(s.stretch, trick).toBeLessThan(0.4);
      }
    }
  });

  it('blinks now and then, and never for long', () => {
    const h = new Hatchling();
    h.hatch();
    let blinks = 0;
    let was = false;
    let longest = 0;
    let run = 0;
    for (let t = 0; t < 30; t += 1 / 60) {
      h.tick(1 / 60);
      const closed = h.shape().blink > 0.5;
      if (closed && !was) blinks++;
      run = closed ? run + 1 / 60 : 0;
      longest = Math.max(longest, run);
      was = closed;
    }
    expect(blinks).toBeGreaterThanOrEqual(4);
    expect(blinks).toBeLessThanOrEqual(14);
    expect(longest).toBeLessThan(0.2);
  });

  it('is gone again when it is reset', () => {
    const h = new Hatchling();
    h.hatch();
    grow(h, 3);
    h.touch();
    h.reset();
    expect(h.here).toBe(false);
    expect(h.done).toBe(0);
    expect(h.shape(newShape()).lift).toBe(0);
  });
});
