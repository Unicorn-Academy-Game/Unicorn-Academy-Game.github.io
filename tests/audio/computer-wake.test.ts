import { describe, expect, it } from 'vitest';
import { COLUMNS, timeOfColumn } from '../../src/shared/computer';
import { PENTATONIC, scaleNote } from '../../src/wonder/music';
import { renderSound } from '../../tools/audio/catalog';
import { gainToDb, midiHz, peakOf, SR } from '../../tools/audio/dsp';
import { bleep, computerWake, wakeParts } from '../../tools/audio/sfx/computer';

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

/**
 * The notes the run plays, which are one in two of the columns of keys, and the sample each column
 * is lit at.
 */
const NOTES = [76, 79, 81, 84, 86] as const;
const NOTE_COLUMNS = [1, 3, 5, 7, 9] as const;
const at = (column: number): number => Math.round(timeOfColumn(column) * SR);

describe('the waking the computer plays when it is tapped', () => {
  const wake = computerWake();

  it('goes up the five notes of the key, from the E over the C an octave above middle C, which is the key the rest of the game is in', () => {
    expect(NOTES).toEqual(NOTE_COLUMNS.map((_, i) => scaleNote(72, 2 + i)));
    for (const midi of NOTES) expect(PENTATONIC).toContain(midi % 12);
  });

  it('plays each note at the moment its column of keys is lit', () => {
    const window = Math.round(0.03 * SR);
    NOTE_COLUMNS.forEach((column, i) => {
      const hz = midiHz(NOTES[i]!);
      const before = strength(wake, Math.max(0, at(column) - window), window, hz);
      const after = strength(wake, at(column) + Math.round(0.004 * SR), window, hz);
      expect(after, `column ${column} at ${hz.toFixed(0)} Hz after it is lit`).toBeGreaterThan(before * 3);
      expect(after, `column ${column} is heard`).toBeGreaterThan(0.005);
    });
  });

  it('taps for every column of keys, including the ones that sound no note, and for nothing else', () => {
    const { taps } = wakeParts();
    const window = Math.round(0.012 * SR);
    for (let column = 0; column < COLUMNS; column++) {
      expect(peakOf(taps.subarray(at(column), at(column) + window)), `column ${column}`).toBeGreaterThan(0.02);
    }
    // Halfway between two columns, which are 34 milliseconds apart, a tap has long died away.
    for (let column = 0; column < COLUMNS - 1; column++) {
      const between = Math.round(((timeOfColumn(column) + timeOfColumn(column + 1)) / 2) * SR);
      expect(peakOf(taps.subarray(between, between + Math.round(0.004 * SR))), `after column ${column}`).toBeLessThan(
        0.002,
      );
    }
  });

  it('whirrs up as the screen wakes, so that the first part is lower than the last, and is over by the time the first column is lit', () => {
    const quarter = Math.round(timeOfColumn(0) * SR * 0.25);
    const first = Math.round(timeOfColumn(0) * SR * 0.04);
    const lastFrom = Math.round(timeOfColumn(0) * SR * 0.7);
    const low = (from: number): number => strength(wake, from, quarter, 260);
    const high = (from: number): number => strength(wake, from, quarter, 700);
    expect(low(first)).toBeGreaterThan(high(first));
    expect(high(lastFrom)).toBeGreaterThan(low(lastFrom));
    expect(peakOf(wake.subarray(0, 4))).toBeLessThan(0.01);
  });

  it('rings a bell above the last note once the light has gone along the keys, and has died away by the end', () => {
    const bellAt = Math.round((timeOfColumn(COLUMNS - 1) + 0.05) * SR);
    const window = Math.round(0.04 * SR);
    const hz = midiHz(88);
    expect(strength(wake, bellAt + Math.round(0.004 * SR), window, hz)).toBeGreaterThan(
      strength(wake, bellAt - window, window, hz) * 3,
    );
    // It is that note and not one beside it: a window long enough to tell semitones apart finds the
    // E over the notes a semitone under and over.
    const long = Math.round(0.12 * SR);
    const heard = (midi: number): number => strength(wake, bellAt + Math.round(0.01 * SR), long, midiHz(midi));
    expect(heard(88)).toBeGreaterThan(heard(87) * 2);
    expect(heard(88)).toBeGreaterThan(heard(89) * 2);
    expect(gainToDb(peakOf(wake.subarray(wake.length - Math.round(0.01 * SR))))).toBeLessThan(-70);
    expect(wake.length / SR).toBeGreaterThan(1.2);
    expect(wake.length / SR).toBeLessThan(2);
  });

  it('is finished as a sound of the world: a take that starts and ends without a click, at the level the catalog sets', () => {
    const take = renderSound('computer-wake', 0);
    expect(Math.abs(take[0]!)).toBeLessThan(1e-3);
    expect(Math.abs(take[take.length - 1]!)).toBeLessThan(1e-3);
    expect(gainToDb(peakOf(take))).toBeCloseTo(-13, 1);
    let mean = 0;
    for (const v of take) mean += v;
    expect(Math.abs(mean / take.length)).toBeLessThan(1e-4);
  });
});

describe('a note of the computer', () => {
  it('is the pitch that was asked for, to within three cents', () => {
    for (const midi of NOTES) {
      const tone = bleep(midiHz(midi));
      const crossings: number[] = [];
      for (let i = Math.round(0.02 * SR); i < Math.round(0.2 * SR); i++) {
        if (tone[i]! <= 0 && tone[i + 1]! > 0) crossings.push(i + -tone[i]! / (tone[i + 1]! - tone[i]!));
      }
      const hz = ((crossings.length - 1) * SR) / (crossings[crossings.length - 1]! - crossings[0]!);
      expect(Math.abs(1200 * Math.log2(hz / midiHz(midi))), `${midi} is ${hz.toFixed(2)} Hz`).toBeLessThan(3);
    }
  });

  it('is struck at once and falls away, and is hollower than a sine, which is how the two toys are told apart', () => {
    const tone = bleep(midiHz(79));
    const level = (from: number, to: number): number =>
      peakOf(tone.subarray(Math.round(from * SR), Math.round(to * SR)));
    expect(level(0.004, 0.02)).toBeGreaterThan(level(0.2, 0.22) * 4);
    expect(tone[0]).toBe(0);
    const hz = midiHz(79);
    const body = strength(tone, Math.round(0.01 * SR), Math.round(0.06 * SR), hz);
    const third = strength(tone, Math.round(0.01 * SR), Math.round(0.06 * SR), 3 * hz);
    expect(third / body, 'a triangle has a third part a ninth as strong as the first').toBeGreaterThan(0.05);
    expect(third / body).toBeLessThan(0.2);
  });
});
