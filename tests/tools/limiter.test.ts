import { describe, expect, it } from 'vitest';
import { limit, windowMinimum } from '../../tools/audio/limiter';

/**
 * The limiter holds the peaks of a voice clip down so the clip can be turned up. It has to do three
 * things and no more: leave nothing over the ceiling, leave alone whatever is not near a peak, and
 * bring the level down and back without a step, which would be heard as a click.
 */

const RATE = 24000;
const CEILING_DB = -1.5;
const CEILING = 10 ** (CEILING_DB / 20);
const ms = (t: number): number => Math.round((t / 1000) * RATE);

/** The same numbers every time. */
function noise(n: number, seed = 1): Float32Array {
  let state = seed;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    out[i] = (state / 2 ** 32) * 2 - 1;
  }
  return out;
}

/**
 * A steady tone at `level`, with the stretch from `at` to `at + width` samples made `boost` times
 * taller.
 */
function tone(seconds: number, level: number, at = -1, width = 0, boost = 1): Float32Array {
  const out = new Float32Array(Math.round(seconds * RATE));
  for (let i = 0; i < out.length; i++)
    out[i] = level * (i >= at && i < at + width ? boost : 1) * Math.sin((2 * Math.PI * 210 * i) / RATE);
  return out;
}

const biggest = (x: Float32Array): number => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

describe('limiting the peaks of a clip', () => {
  it('leaves no sample over the ceiling, however the signal is made', () => {
    const loud = noise(RATE, 7).map((v) => v * 3);
    const burst = tone(1, 0.2, ms(400), ms(30), 9);
    const spike = new Float32Array(RATE);
    spike[ms(500)] = 5;
    for (const [name, signal] of Object.entries({ loud, burst, spike })) {
      const { samples } = limit(signal, CEILING_DB, RATE);
      expect(biggest(samples), name).toBeLessThanOrEqual(CEILING * (1 + 1e-6));
    }
  });

  it('gives back the signal itself when nothing is over the ceiling, and says it held nothing', () => {
    const quiet = tone(0.5, 0.5);
    const out = limit(quiet, CEILING_DB, RATE);
    expect(out.samples).toBe(quiet);
    expect(out.heldDb).toBe(0);
  });

  it('leaves the signal as it was, away from a peak, and has the level back within a second', () => {
    const at = ms(500);
    const signal = tone(2, 0.3, at, ms(20), 4);
    const { samples } = limit(signal, CEILING_DB, RATE);
    const within = (from: number, to: number, tolerance: number): boolean =>
      samples.slice(from, to).every((v, i) => Math.abs(v - signal[from + i]!) <= tolerance);
    expect(within(0, at - ms(8), 1e-7), 'well before the peak').toBe(true);
    expect(within(at + ms(20) + ms(400), signal.length, 0.01 * 0.3), 'long after it, to a hundredth').toBe(true);
    expect(Math.abs(samples[at + ms(10)]!) < Math.abs(signal[at + ms(10)]!), 'in the middle of it').toBe(true);
  });

  it('is already coming down when the peak arrives, so the peak is not the first thing it does', () => {
    const at = ms(500);
    const signal = tone(1, 0.3, at, ms(20), 4);
    const { samples } = limit(signal, CEILING_DB, RATE);
    let early = 0;
    for (let i = at - ms(1.5); i < at; i++)
      if (Math.abs(signal[i]!) > 1e-3) early = Math.max(early, 1 - Math.abs(samples[i]! / signal[i]!));
    expect(early, 'a sample just before the peak is turned down').toBeGreaterThan(0.02);
  });

  it('turns the level down and up without a step', () => {
    const signal = tone(1.5, 0.3, ms(500), ms(25), 4);
    const { samples } = limit(signal, CEILING_DB, RATE);
    // The gain can only be read where the signal is not near zero, and it is compared between
    // samples that are next to each other.
    let steepest = 0;
    let before: number | null = null;
    for (let i = 0; i < signal.length; i++) {
      if (Math.abs(signal[i]!) < 0.05) {
        before = null;
        continue;
      }
      const gain = samples[i]! / signal[i]!;
      if (before !== null) steepest = Math.max(steepest, Math.abs(gain - before));
      before = gain;
    }
    expect(steepest, 'the most the gain moved between neighbouring samples').toBeLessThan(0.005);
  });

  it('says how far it turned the loudest peak down', () => {
    const spike = new Float32Array(RATE);
    spike[ms(300)] = 4 * CEILING;
    const { samples, heldDb } = limit(spike, CEILING_DB, RATE);
    expect(heldDb).toBeCloseTo(20 * Math.log10(4), 5);
    expect(samples[ms(300)]).toBeCloseTo(CEILING, 5);
  });

  it('does not touch what it is given, and gives the same answer twice', () => {
    const signal = noise(RATE / 2, 3).map((v) => v * 2);
    const copy = Float32Array.from(signal);
    const first = limit(signal, CEILING_DB, RATE);
    expect(signal).toEqual(copy);
    expect(limit(signal, CEILING_DB, RATE).samples).toEqual(first.samples);
  });

  it('copes with a peak at either end of the clip', () => {
    const signal = new Float32Array(ms(200)).fill(0.1);
    signal[0] = 3;
    signal[signal.length - 1] = -3;
    const { samples } = limit(signal, CEILING_DB, RATE);
    expect(biggest(samples)).toBeLessThanOrEqual(CEILING * (1 + 1e-6));
    expect(samples.every(Number.isFinite)).toBe(true);
  });
});

describe('the lowest value near each sample', () => {
  it('is what looking at every neighbour would find, for any reach and any length', () => {
    for (const [length, reach] of [
      [1, 1],
      [2, 5],
      [37, 1],
      [37, 3],
      [200, 12],
      [200, 250],
    ] as const) {
      const x = noise(length, length + reach);
      const slow = x.map((_, i) => {
        let lowest = Infinity;
        for (let j = Math.max(0, i - reach); j <= Math.min(length - 1, i + reach); j++)
          lowest = Math.min(lowest, x[j]!);
        return lowest;
      });
      expect(windowMinimum(x, reach), `${length} samples, reach ${reach}`).toEqual(slow);
    }
  });
});
