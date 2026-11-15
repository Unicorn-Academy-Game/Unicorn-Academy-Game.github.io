import { describe, expect, it } from 'vitest';
import { BURST, FIRST, flightOf, GRAVITY, heightOf, Jets, speedFor } from './jets';

describe('the maths of a column of jewels', () => {
  it('sends a jewel exactly as high as asked and has it back at the nozzle when it should be', () => {
    for (const height of [40, 120, 230]) {
      const v = speedFor(height);
      expect((v * v) / (2 * GRAVITY), `the height of ${height}`).toBeCloseTo(height, 6);
      const t = flightOf(height);
      expect(v * t - 0.5 * GRAVITY * t * t, 'back at the nozzle').toBeCloseTo(0, 6);
    }
    expect(speedFor(0)).toBe(0);
    expect(speedFor(-5)).toBe(0);
  });

  it('makes a stronger column higher, never above the room there is', () => {
    const room = 200;
    expect(heightOf(0, room)).toBeLessThan(heightOf(0.5, room));
    expect(heightOf(0.5, room)).toBeLessThan(heightOf(1, room));
    expect(heightOf(1, room)).toBeLessThan(room);
    expect(heightOf(2, room), 'a strength past full is full').toBe(heightOf(1, room));
    expect(heightOf(FIRST, room), 'a tap is a good column').toBeGreaterThan(room * 0.55);
  });
});

describe('the seven jets', () => {
  it('make a puff when they are only tapped and are off a moment later', () => {
    const j = new Jets();
    j.press(3, 1, 10);
    expect(j.on(3, 10)).toBe(true);
    expect(j.level[3]).toBeCloseTo(FIRST, 6);
    j.release(1);
    expect(j.on(3, 10 + BURST - 0.05), 'still going at the end of the burst').toBe(true);
    expect(j.on(3, 10 + BURST + 0.05), 'off after it').toBe(false);
    expect(j.on(2, 10), 'the others were not touched').toBe(false);
  });

  it('climb to full while a finger is held on them, and sink when it is lifted', () => {
    const j = new Jets();
    j.press(0, 7, 0);
    let now = 0;
    for (let i = 0; i < 60; i++) {
      now += 1 / 60;
      j.step(1 / 60, now);
    }
    expect(j.level[0], 'after a second held').toBe(1);
    expect(j.held(0)).toBe(true);
    expect(j.release(7)).toBe(0);
    expect(j.held(0)).toBe(false);
    for (let i = 0; i < 60; i++) {
      now += 1 / 60;
      j.step(1 / 60, now);
    }
    expect(j.level[0], 'after a second let go').toBe(0);
  });

  it('keep a jet on while any one of two fingers is held on it', () => {
    const j = new Jets();
    j.press(4, 1, 0);
    j.press(4, 2, 0);
    j.release(1);
    expect(j.on(4, 5)).toBe(true);
    j.release(2);
    expect(j.on(4, 5)).toBe(false);
  });

  it('let a finger that slides from one jet to the next hold only the new one', () => {
    const j = new Jets();
    j.press(1, 5, 0);
    j.press(2, 5, 0.1);
    expect(j.held(1), 'it left the first').toBe(false);
    expect(j.held(2)).toBe(true);
    expect(j.heldBy(5)).toBe(2);
    expect(j.release(5)).toBe(2);
    expect(j.release(5), 'nothing to release the second time').toBe(-1);
  });

  it('throw more jewels the stronger they are, and carry the part of a jewel that is left over', () => {
    const weak = new Jets();
    const strong = new Jets();
    weak.press(0, 1, 0);
    strong.press(0, 1, 0);
    strong.level[0] = 1;
    let a = 0;
    let b = 0;
    for (let i = 0; i < 30; i++) {
      a += weak.throwing(0, 1 / 60, i / 60);
      b += strong.throwing(0, 1 / 60, i / 60);
    }
    expect(b, 'more from a strong one').toBeGreaterThan(a);
    expect(a, 'and some from a weak one').toBeGreaterThan(3);
    expect(weak.throwing(5, 1, 0), 'nothing from a jet that is off').toBe(0);
  });

  it('can be made to go for a time with no finger on them, as strong as can be, and are off after it', () => {
    const j = new Jets();
    j.kick(5, 10, 1.4);
    expect(j.on(5, 10)).toBe(true);
    expect(j.level[5]).toBeGreaterThan(0.85);
    expect(j.on(5, 11.3)).toBe(true);
    expect(j.on(5, 11.5)).toBe(false);
  });

  it('can be kept going by the game for the finale, and let go', () => {
    const j = new Jets();
    j.keep(6, true);
    expect(j.on(6, 100)).toBe(true);
    for (let i = 0; i < 120; i++) j.step(1 / 60, i / 60);
    expect(j.level[6]).toBeGreaterThan(0.98);
    j.keep(6, false);
    expect(j.on(6, 100)).toBe(false);
    expect(j.count(100)).toBe(0);
  });

  it('are all off again after a reset', () => {
    const j = new Jets();
    for (let i = 0; i < 7; i++) j.press(i, i, 0);
    j.reset();
    expect(j.count(0)).toBe(0);
    expect(j.level.every((l) => l === 0)).toBe(true);
    expect(j.held(3)).toBe(false);
  });
});
