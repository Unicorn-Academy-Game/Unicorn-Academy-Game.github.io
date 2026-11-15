import { describe, expect, it } from 'vitest';
import { noteOfKey, PIANO_KEYS, timeOfKey } from '../../src/shared/piano';
import { PENTATONIC, scaleNote } from '../../src/wonder/music';
import { renderSound } from '../../tools/audio/catalog';
import { gainToDb, midiHz, peakOf, SR } from '../../tools/audio/dsp';
import { pianoRun, ping } from '../../tools/audio/sfx/piano';

/**
 * How much of a pure tone of this pitch there is in `n` samples from `from`, which a Goertzel
 * filter says without being fooled by the other notes ringing.
 */
function strength(x: Float32Array, from: number, n: number, hz: number): number {
  const w = (2 * Math.PI * hz) / SR;
  const c = 2 * Math.cos(w);
  let [s1, s2] = [0, 0];
  for (let i = 0; i < n; i++) {
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    const s = (x[from + i] ?? 0) * hann + c * s1 - s2;
    [s2, s1] = [s1, s];
  }
  return Math.sqrt(s1 * s1 + s2 * s2 - c * s1 * s2) / n;
}

const keys = Array.from({ length: PIANO_KEYS }, (_, key) => key).filter((key) => noteOfKey(key) !== null);

describe('the run the piano plays when it is tapped', () => {
  const run = pianoRun();

  it('has a note for each key of the piano that lights, and each comes in at the moment its key is down', () => {
    expect(keys).toHaveLength(10);
    const window = Math.round(0.03 * SR);
    keys.forEach((key, i) => {
      const at = Math.round(timeOfKey(key) * SR);
      const hz = midiHz(scaleNote(72, i));
      const before = strength(run, Math.max(0, at - window), window, hz);
      const after = strength(run, at + Math.round(0.004 * SR), window, hz);
      expect(after, `key ${key} at ${hz.toFixed(0)} Hz after it is down`).toBeGreaterThan(before * 3);
      expect(after, `key ${key} is heard`).toBeGreaterThan(0.005);
    });
  });

  it('goes up the five notes of the key, C D E G A and again, from the C an octave over middle C, which is the key the rest of the game is in', () => {
    const notes = keys.map((_, i) => scaleNote(72, i));
    expect(notes).toEqual([72, 74, 76, 79, 81, 84, 86, 88, 91, 93]);
    for (const midi of notes) expect(PENTATONIC).toContain(midi % 12);
  });

  it('is silent until the first key goes down, and has died away by the end', () => {
    const first = Math.round(timeOfKey(keys[0]!) * SR);
    expect(peakOf(run.subarray(0, first - 2))).toBe(0);
    expect(gainToDb(peakOf(run.subarray(run.length - Math.round(0.01 * SR))))).toBeLessThan(-70);
    expect(run.length / SR).toBeLessThan(2);
    expect(run.length / SR).toBeGreaterThan(1.2);
  });

  it('is finished as a sound of the world: a take that starts and ends without a click, at the level the catalog sets', () => {
    const take = renderSound('piano-run', 0);
    expect(Math.abs(take[0]!)).toBeLessThan(1e-3);
    expect(Math.abs(take[take.length - 1]!)).toBeLessThan(1e-3);
    expect(gainToDb(peakOf(take))).toBeCloseTo(-13, 1);
    let mean = 0;
    for (const v of take) mean += v;
    expect(Math.abs(mean / take.length)).toBeLessThan(1e-4);
  });
});

describe('a note of the piano run', () => {
  it('is the pitch that was asked for, to within three cents, at any of the notes the run plays', () => {
    for (const midi of [72, 74, 76, 79, 81, 84, 86, 88, 91, 93]) {
      const tone = ping(midiHz(midi));
      // Where the wave crosses zero going up, to a fraction of a sample: the gap between the first
      // and the last says the pitch.
      const crossings: number[] = [];
      for (let i = Math.round(0.03 * SR); i < Math.round(0.3 * SR); i++) {
        if (tone[i]! <= 0 && tone[i + 1]! > 0) crossings.push(i + -tone[i]! / (tone[i + 1]! - tone[i]!));
      }
      const hz = ((crossings.length - 1) * SR) / (crossings[crossings.length - 1]! - crossings[0]!);
      const cents = 1200 * Math.log2(hz / midiHz(midi));
      expect(Math.abs(cents), `${midi} is ${hz.toFixed(2)} Hz`).toBeLessThan(3);
    }
  });

  it('rises in a few milliseconds, settles to a soft body, and falls away after it is let go', () => {
    const tone = ping(midiHz(72), 0.125);
    const level = (from: number, to: number): number =>
      peakOf(tone.subarray(Math.round(from * SR), Math.round(to * SR)));
    expect(level(0, 0.012)).toBeGreaterThan(level(0.1, 0.12) * 1.5);
    expect(level(0.1, 0.12)).toBeGreaterThan(level(0.5, 0.52) * 3);
    expect(level(0.6, 0.62)).toBeLessThan(level(0.1, 0.12) / 10);
    expect(tone[0]).toBe(0);
  });
});
