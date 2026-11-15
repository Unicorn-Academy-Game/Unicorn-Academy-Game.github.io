import { afterEach, describe, expect, it, vi } from 'vitest';
import { Faults } from './faults';

describe('what is carried past', () => {
  afterEach(() => vi.restoreAllMocks());

  it('counts a failure by where it happened and goes on with what comes after', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const faults = new Faults();
    let after = 0;
    faults.carry('sound', () => {
      throw new Error('no speaker');
    });
    faults.carry('view', () => {
      after += 1;
    });
    faults.carry('sound', () => {
      throw new Error('still no speaker');
    });
    expect(after).toBe(1);
    expect(faults.counts.get('sound')).toBe(2);
    expect(faults.counts.get('view')).toBeUndefined();
    expect(faults.total).toBe(2);
  });

  it('tells the console the first three times and then at each power of ten, so a failure every frame does not fill the log', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const faults = new Faults();
    for (let i = 0; i < 1000; i++) faults.report('frame', new Error('again'));
    expect(faults.counts.get('frame')).toBe(1000);
    expect(logged).toHaveBeenCalledTimes(6);
    expect(logged.mock.calls.map((c) => c[0])).toEqual([
      'frame: 1 so far',
      'frame: 2 so far',
      'frame: 3 so far',
      'frame: 10 so far',
      'frame: 100 so far',
      'frame: 1000 so far',
    ]);
  });

  it('counts each place on its own', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const faults = new Faults();
    for (let i = 0; i < 3; i++) faults.report('view', 'x');
    faults.report('sound', 'y');
    expect(faults.counts.get('view')).toBe(3);
    expect(faults.counts.get('sound')).toBe(1);
    expect(faults.total).toBe(4);
  });
});

describe('a loop that is kept going', () => {
  afterEach(() => vi.restoreAllMocks());

  it('goes on after a frame that throws, counts it, and gives every frame its time and its length', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const seen: [number, number][] = [];
    const loop = {
      callback: (time: number, delta: number): void => {
        seen.push([time, delta]);
        if (seen.length === 2) throw new Error('the engine failed in the middle of a frame');
      },
    };
    const faults = new Faults();
    faults.guard(loop);
    expect(() => {
      loop.callback(1, 16);
      loop.callback(2, 17);
      loop.callback(3, 18);
    }).not.toThrow();
    expect(seen).toEqual([
      [1, 16],
      [2, 17],
      [3, 18],
    ]);
    expect(faults.counts.get('engine')).toBe(1);
  });

  it('does nothing to a loop whose frames do not fail', () => {
    const faults = new Faults();
    let frames = 0;
    const loop = {
      callback: (): void => {
        frames += 1;
      },
    };
    faults.guard(loop);
    loop.callback();
    expect(frames).toBe(1);
    expect(faults.total).toBe(0);
  });
});

describe('what is put right', () => {
  it('counts each kind on its own, and none of it is a failure', () => {
    const faults = new Faults();
    expect(faults.repaired).toEqual({ touch: 0, freed: 0 });
    faults.repair('touch');
    faults.repair('touch');
    faults.repair('freed');
    expect(faults.repaired).toEqual({ touch: 2, freed: 1 });
    expect(faults.total).toBe(0);
    expect(faults.counts.size).toBe(0);
  });
});
