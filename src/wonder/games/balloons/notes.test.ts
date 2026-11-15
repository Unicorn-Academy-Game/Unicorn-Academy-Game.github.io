import { describe, expect, it } from 'vitest';
import { PENTATONIC } from '../../music';
import { DEGREES, degreeOf, midiOf, PITCHES } from './notes';

describe('the five notes of a balloon', () => {
  it('are the five notes of the pentatonic scale on C, in order, so no balloon is a wrong note', () => {
    expect(DEGREES.map((d) => midiOf(d) % 12)).toEqual([...PENTATONIC]);
    expect(DEGREES.map((d) => PITCHES[d].name).join('')).toBe('CDEGA');
  });

  it('rise: each is higher than the one before, and a small balloon is an octave above its big one', () => {
    const low = DEGREES.map((d) => midiOf(d));
    expect([...low].sort((a, b) => a - b)).toEqual(low);
    for (const d of DEGREES) expect(midiOf(d, true)).toBe(midiOf(d) + 12);
  });

  it('each have a colour of their own that is far from every other, so a child can tell them apart', () => {
    const distance = (a: readonly number[], b: readonly number[]): number =>
      Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
    for (const a of DEGREES) {
      for (const b of DEGREES) {
        if (a < b)
          expect(
            distance(PITCHES[a].color, PITCHES[b].color),
            `${PITCHES[a].name} and ${PITCHES[b].name}`,
          ).toBeGreaterThan(90);
      }
    }
  });

  it('are found by the letter they are written with, and nothing else is a note', () => {
    expect(degreeOf('G')).toBe(3);
    expect(() => degreeOf('F')).toThrow(/not one of the five/);
  });
});
