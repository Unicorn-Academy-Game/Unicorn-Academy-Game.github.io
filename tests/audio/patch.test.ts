import { describe, expect, it } from 'vitest';
import { glide, hill, hold, ratio, roomImpulse, SILENCE, strike } from '../../src/audio/synth/patch';
import { fakeParam } from './web-audio-fake';

const lcg = (seed: number): (() => number) => {
  let a = seed;
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
};

const rms = (x: Float32Array, from: number, to: number): number => {
  let sum = 0;
  for (let i = from; i < to; i++) sum += x[i]! * x[i]!;
  return Math.sqrt(sum / Math.max(1, to - from));
};

describe('semitones to a frequency ratio', () => {
  it('is an octave for twelve, and the inverse for the opposite', () => {
    expect(ratio(0)).toBe(1);
    expect(ratio(12)).toBe(2);
    expect(ratio(-12)).toBe(0.5);
    expect(ratio(7)).toBeCloseTo(1.4983, 3);
    expect(ratio(5) * ratio(-5)).toBeCloseTo(1, 10);
  });
});

describe('the room', () => {
  const rate = 32000;
  const [left, right] = roomImpulse(rate, 1.5, lcg(3));

  it('is as long as asked, in two channels, with nothing in either that is not a number or is louder than full scale', () => {
    expect(left.length).toBe(rate * 1.5);
    expect(right.length).toBe(left.length);
    for (const ch of [left, right]) for (const v of ch) expect(Number.isFinite(v) && Math.abs(v) <= 1).toBe(true);
  });

  it('keeps a short gap before the sound of the room begins', () => {
    const gap = Math.floor(rate * 0.012);
    for (let i = 0; i < gap; i++) expect(left[i]).toBe(0);
    expect(rms(left, gap, gap + 400)).toBeGreaterThan(0);
  });

  it('dies away and ends in near silence', () => {
    const n = left.length;
    const early = rms(left, 0, Math.floor(n * 0.1));
    const late = rms(left, Math.floor(n * 0.9), n);
    expect(late).toBeLessThan(early * 0.02);
  });

  it('is different on the two sides, so the room has width, and the same every time for the same random numbers', () => {
    let different = 0;
    for (let i = 0; i < left.length; i += 97) if (left[i] !== right[i]) different++;
    expect(different).toBeGreaterThan(100);
    const [again] = roomImpulse(rate, 1.5, lcg(3));
    expect(Array.from(again.subarray(0, 500))).toEqual(Array.from(left.subarray(0, 500)));
  });

  it('darkens as it rings out', () => {
    // The brightness of a stretch of noise is how much it changes from sample to sample compared
    // with its size.
    const roughness = (x: Float32Array, from: number, to: number): number => {
      let diff = 0;
      for (let i = from + 1; i < to; i++) diff += Math.abs(x[i]! - x[i - 1]!);
      return diff / (rms(x, from, to) * (to - from));
    };
    const n = left.length;
    expect(roughness(left, Math.floor(n * 0.5), Math.floor(n * 0.7))).toBeLessThan(
      roughness(left, Math.floor(n * 0.03), Math.floor(n * 0.1)),
    );
  });
});

describe('the shapes a level follows', () => {
  it('a strike starts at a level above zero, rises, falls to a level above zero and then is set to nothing after it is over', () => {
    const p = fakeParam();
    const end = strike(p as unknown as AudioParam, 2, 0.8, 0.003, 0.4);
    expect(end).toBeCloseTo(2.403, 6);
    const [start, rise, fall, off] = p.events;
    expect(start).toMatchObject({ kind: 'setValueAtTime', args: [SILENCE, 2] });
    expect(rise).toMatchObject({ kind: 'linearRampToValueAtTime', args: [0.8, 2.003] });
    expect(fall).toMatchObject({ kind: 'exponentialRampToValueAtTime' });
    expect((fall!.args[0] as number) > 0).toBe(true);
    expect(off!.args[0]).toBe(0);
    expect(off!.args[1] as number).toBeGreaterThan(end);
  });

  it('never gives an exponential ramp a target of zero, which the browser refuses', () => {
    const p = fakeParam();
    strike(p as unknown as AudioParam, 0, 1, 0.01, 0.5);
    glide(p as unknown as AudioParam, 800, 0, 0, 0.3);
    const ramps = p.events.filter((e) => e.kind === 'exponentialRampToValueAtTime');
    expect(ramps).toHaveLength(2);
    for (const e of ramps) expect(e.args[0] as number).toBeGreaterThan(0);
  });

  it('a hill is one curve that starts and ends at nothing, with nothing else at the moment it starts', () => {
    const p = fakeParam();
    const end = hill(p as unknown as AudioParam, 1.5, 0.6, 0.7);
    expect(end).toBeCloseTo(2.1, 10);
    const curve = p.events.find((e) => e.kind === 'setValueCurveAtTime')!;
    const values = curve.args[0] as Float32Array;
    expect(values[0]).toBe(0);
    expect(values[values.length - 1]).toBeCloseTo(0, 6);
    expect(Math.max(...values)).toBeCloseTo(0.7, 2);
    expect(curve.args[1]).toBe(1.5);
    expect(curve.args[2]).toBe(0.6);
    for (const other of p.events.filter((e) => e !== curve)) expect(other.args[1] as number).toBeGreaterThan(1.5);
  });

  it('a held sound rises, holds and falls as two curves that do not overlap, and ends at nothing', () => {
    const p = fakeParam();
    const end = hold(p as unknown as AudioParam, 0, 0.3, 2, 0.5, 0.6);
    expect(end).toBeCloseTo(2.5, 10);
    const curves = p.events.filter((e) => e.kind === 'setValueCurveAtTime');
    expect(curves).toHaveLength(2);
    const [up, down] = curves as [(typeof curves)[number], (typeof curves)[number]];
    expect((up.args[1] as number) + (up.args[2] as number)).toBeLessThanOrEqual(down.args[1] as number);
    expect((up.args[0] as Float32Array)[0]).toBe(0);
    const fall = down.args[0] as Float32Array;
    expect(fall[0]).toBeCloseTo(0.6, 6);
    expect(fall[fall.length - 1]).toBeCloseTo(0, 6);
  });

  it('a note shorter than its own rise is held for the rise and a moment, so the two curves still do not overlap', () => {
    const p = fakeParam();
    hold(p as unknown as AudioParam, 0, 0.4, 0.1, 0.3, 1);
    const curves = p.events.filter((e) => e.kind === 'setValueCurveAtTime');
    const [up, down] = curves as [(typeof curves)[number], (typeof curves)[number]];
    expect((up.args[1] as number) + (up.args[2] as number)).toBeLessThan(down.args[1] as number);
  });

  it('a glide goes from one pitch to another over the time given', () => {
    const p = fakeParam();
    glide(p as unknown as AudioParam, 300, 900, 1, 0.5);
    expect(p.events[0]).toMatchObject({ kind: 'setValueAtTime', args: [300, 1] });
    expect(p.events[1]).toMatchObject({ kind: 'exponentialRampToValueAtTime', args: [900, 1.5] });
  });
});
