import { describe, expect, it } from 'vitest';
import { Runs, SWEEP } from './runs';

describe('a run along a row', () => {
  it('grows by one for each next jet along the ring, in either direction, with a moment between', () => {
    const r = new Runs();
    expect(r.play(0, 0)).toEqual({ length: 1, way: 0 });
    expect(r.play(1, 0.2)).toEqual({ length: 2, way: 1 });
    expect(r.play(2, 0.4)).toEqual({ length: 3, way: 1 });
    expect(r.play(3, 0.6)).toEqual({ length: 4, way: 1 });
    const down = new Runs();
    down.play(6, 0);
    down.play(5, 0.1);
    expect(down.play(4, 0.2)).toEqual({ length: 3, way: -1 });
  });

  it('is a sweep from four jets and a scale at the seventh', () => {
    const r = new Runs();
    let run = r.play(0, 0);
    for (let i = 1; i < 7; i++) {
      run = r.play(i, i * 0.15);
      expect(run.length >= SWEEP, `at ${i + 1} jets`).toBe(i + 1 >= SWEEP);
    }
    expect(r.isScale(run)).toBe(true);
    expect(r.isScale({ length: 6, way: 1 })).toBe(false);
  });

  it('starts again at a jump, a wait, or a turn round', () => {
    const r = new Runs();
    r.play(0, 0);
    r.play(1, 0.2);
    expect(r.play(4, 0.4), 'a jump').toEqual({ length: 1, way: 0 });
    r.play(5, 0.6);
    expect(r.play(4, 0.8), 'turned round: the way is the new one but it begins again').toEqual({ length: 1, way: 0 });
    expect(r.play(5, 2), 'a wait').toEqual({ length: 1, way: 0 });
  });

  it('is not broken, nor made longer, by the same jet again', () => {
    const r = new Runs();
    r.play(2, 0);
    r.play(3, 0.2);
    expect(r.play(3, 0.3)).toEqual({ length: 2, way: 1 });
    expect(r.play(4, 0.4)).toEqual({ length: 3, way: 1 });
  });

  it('forgets everything on a reset', () => {
    const r = new Runs();
    r.play(0, 0);
    r.play(1, 0.1);
    r.reset();
    expect(r.play(2, 0.2)).toEqual({ length: 1, way: 0 });
  });
});

describe('a run with its own count and gap', () => {
  it('is a scale at the end of a shorter row, and waits as long as it is told to', () => {
    const r = new Runs(4, 1.5);
    r.play(0, 0);
    r.play(1, 1.2);
    r.play(2, 2.4);
    const run = r.play(3, 3.6);
    expect(run.length).toBe(4);
    expect(r.isScale(run)).toBe(true);
    expect(r.play(2, 5.5), 'a wait longer than the gap').toEqual({ length: 1, way: 0 });
  });
});
