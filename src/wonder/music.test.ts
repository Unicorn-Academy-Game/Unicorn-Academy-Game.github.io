import { describe, expect, it } from 'vitest';
import {
  BOAT,
  chord,
  hertz,
  JOY,
  MAJOR,
  noteAt,
  PENTATONIC,
  rising,
  scaleNote,
  TWINKLE,
  tuneBeats,
  tuneMidi,
} from './music';

describe('notes of a scale', () => {
  it('go up the scale from the root, and up an octave past its end', () => {
    expect([0, 1, 2, 3, 4].map((s) => scaleNote(60, s))).toEqual([60, 62, 64, 67, 69]);
    expect([5, 6, 7, 8, 9].map((s) => scaleNote(60, s))).toEqual([72, 74, 76, 79, 81]);
    expect(scaleNote(60, 10)).toBe(84);
  });

  it('go down from the root for a step below it, in the same scale', () => {
    expect(scaleNote(60, -1)).toBe(57);
    expect(scaleNote(60, -2)).toBe(55);
    expect(scaleNote(60, -5)).toBe(48);
    expect(scaleNote(60, -6)).toBe(45);
    for (let s = -20; s <= 20; s++) expect(PENTATONIC).toContain((((scaleNote(60, s) - 60) % 12) + 12) % 12);
  });

  it('rise by one octave for each five steps whichever way they go', () => {
    for (let s = -12; s <= 12; s++) expect(scaleNote(60, s + 5)).toBe(scaleNote(60, s) + 12);
  });

  it('work in any scale given, and the major scale has seven notes to the octave', () => {
    expect(scaleNote(60, 6, MAJOR)).toBe(71);
    expect(scaleNote(60, 7, MAJOR)).toBe(72);
    expect(scaleNote(60, -1, MAJOR)).toBe(59);
  });
});

describe('a note chosen by where along something a finger is', () => {
  it('is the lowest at the start, the highest at the end, and never beyond them', () => {
    expect(noteAt(0)).toBe(60);
    expect(noteAt(1)).toBe(scaleNote(60, 14));
    expect(noteAt(-3)).toBe(60);
    expect(noteAt(7)).toBe(scaleNote(60, 14));
  });

  it('only gives notes of the key, rising as the finger goes along', () => {
    let last = -Infinity;
    for (let i = 0; i <= 100; i++) {
      const n = noteAt(i / 100);
      expect(PENTATONIC).toContain(n % 12);
      expect(n).toBeGreaterThanOrEqual(last);
      last = n;
    }
  });

  it('gives each note an equal share of the way', () => {
    const counts = new Map<number, number>();
    for (let i = 0; i < 1500; i++) counts.set(noteAt(i / 1500), (counts.get(noteAt(i / 1500)) ?? 0) + 1);
    expect(counts.size).toBe(15);
    for (const n of counts.values()) expect(n).toBe(100);
  });
});

describe('pitch', () => {
  it('puts the A above middle C at 440 hertz and doubles for each octave', () => {
    expect(hertz(69)).toBe(440);
    expect(hertz(81)).toBeCloseTo(880, 8);
    expect(hertz(57)).toBeCloseTo(220, 8);
    expect(hertz(60)).toBeCloseTo(261.6256, 3);
  });
});

describe('chords and runs', () => {
  it('make a major chord of the root, a third and a fifth', () => {
    expect(chord(60)).toEqual([60, 64, 67]);
  });

  it('rise through the scale from the root for a star being earned', () => {
    expect(rising(72, 5)).toEqual([72, 74, 76, 79, 81]);
    expect(rising(72, 0)).toEqual([]);
    expect(rising(72, 7)).toEqual([72, 74, 76, 79, 81, 84, 86]);
  });
});

describe('the tunes', () => {
  it('Twinkle, Twinkle has forty-eight beats and forty-two notes', () => {
    expect(tuneBeats(TWINKLE)).toBe(48);
    expect(tuneMidi(TWINKLE, 60)).toHaveLength(42);
  });

  it('start and end on the root of the key, as a tune that is finished does', () => {
    for (const tune of [TWINKLE, JOY, BOAT]) {
      const notes = tuneMidi(tune, 60);
      expect(notes[0]! % 12 === 0 || notes[0]! % 12 === 4, tune.name).toBe(true);
      expect(notes[notes.length - 1]! % 12, tune.name).toBe(0);
    }
  });

  it('are all of the major scale, and a rest is left out of the notes', () => {
    for (const tune of [TWINKLE, JOY, BOAT]) {
      for (const n of tuneMidi(tune, 60)) expect(MAJOR, tune.name).toContain(n % 12);
    }
    const withRest = {
      name: 'rest',
      tempo: 100,
      notes: [
        [0, 1],
        [-1, 1],
        [2, 1],
      ] as const,
    };
    expect(tuneMidi(withRest, 60)).toEqual([60, 64]);
    expect(tuneBeats(withRest)).toBe(3);
  });

  it('have a tempo a child can follow', () => {
    for (const tune of [TWINKLE, JOY, BOAT]) {
      expect(tune.tempo).toBeGreaterThanOrEqual(80);
      expect(tune.tempo).toBeLessThanOrEqual(120);
    }
  });
});
