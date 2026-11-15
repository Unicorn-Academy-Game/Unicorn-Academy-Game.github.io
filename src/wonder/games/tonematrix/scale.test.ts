// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { PENTATONIC } from '../../music';
import {
  colorOfNote,
  colorOfY,
  levelOfCrowd,
  noteOfRow,
  noteOfY,
  PALETTE,
  ROOT,
  SIZE,
  shadeOfNote,
  shadeOfY,
  trimOfRow,
  trimOfY,
} from './scale';

/**
 * The 16 notes of the rows of the original, from the bottom: C4 D4 F4 G4 A4 C5 D5 F5 G5 A5 C6 D6 F6
 * G6 A6 C7.
 */
const ORIGINAL = [60, 62, 65, 67, 69, 72, 74, 77, 79, 81, 84, 86, 89, 91, 93, 96];
const gaps = (notes: readonly number[]): number[] => notes.slice(1).map((n, i) => n - notes[i]!);

describe('the notes of the rows', () => {
  const rows = Array.from({ length: SIZE }, (_, row) => noteOfRow(row));

  it('go up from G3 to G6, a little more than three octaves', () => {
    expect(rows[0]).toBe(55);
    expect(rows[SIZE - 1]).toBe(91);
    expect(ROOT).toBe(55);
  });

  it('have the same distance between each row and the next as the rows of the original', () => {
    expect(gaps(rows)).toEqual(gaps(ORIGINAL));
    expect(new Set(gaps(ORIGINAL))).toEqual(new Set([2, 3]));
  });

  it('are all notes of the pentatonic key of the rest of the game, so none of them sounds wrong beside a chime or a star', () => {
    for (const note of rows) expect(PENTATONIC, `note ${note}`).toContain(note % 12);
  });

  it('put the highest note at the top of the grid', () => {
    expect(noteOfY(0)).toBe(rows[SIZE - 1]);
    expect(noteOfY(SIZE - 1)).toBe(rows[0]);
    for (let y = 1; y < SIZE; y++) expect(noteOfY(y), `row ${y}`).toBeLessThan(noteOfY(y - 1));
  });
});

describe('the colours of the rows', () => {
  it('are one for each of the five notes, the same in every octave and different between notes', () => {
    const keys = new Set<string>();
    for (let y = 0; y < SIZE; y++) {
      const here = colorOfY(y);
      keys.add(here.join());
      if (y >= 5) expect(here, `row ${y} is the colour of the one an octave below`).toEqual(colorOfY(y - 5));
    }
    expect(keys.size).toBe(5);
    expect(colorOfNote(60)).toEqual(colorOfNote(72));
  });

  it('say so when a note is not in the key, instead of choosing one', () => {
    expect(() => colorOfNote(61)).toThrow();
    expect(() => shadeOfNote(61)).toThrow();
  });

  it('count the five notes up from C, so the shade of a note is its place in the palette and in the keys of the piano', () => {
    expect([60, 62, 64, 67, 69].map(shadeOfNote)).toEqual([0, 1, 2, 3, 4]);
    expect(shadeOfNote(48)).toBe(0);
    expect(shadeOfNote(93)).toBe(4);
    for (let y = 0; y < SIZE; y++) expect(PALETTE[shadeOfY(y)], `row ${y}`).toEqual(colorOfY(y));
  });
});

describe('how loud each note of a crowd is', () => {
  const db = (x: number): number => 20 * Math.log10(x);
  const power = (n: number): number => n * levelOfCrowd(n) ** 2;
  const louder = (n: number): number => 10 * Math.log10(power(n) / power(1));

  it('is 1 for a note that sounds alone, and a quieter and quieter note as the crowd grows', () => {
    expect(levelOfCrowd(1)).toBe(1);
    for (let n = 2; n <= 2 * SIZE; n++) expect(levelOfCrowd(n), `${n} notes`).toBeLessThan(levelOfCrowd(n - 1));
  });

  it('has the original at both ends: 9.375 decibels down for each note of a full step of sixteen', () => {
    expect(db(levelOfCrowd(SIZE))).toBeCloseTo(-9.375, 9);
  });

  it('never makes a step much louder than a note alone, and makes it louder for each note that joins', () => {
    for (let n = 2; n <= SIZE; n++) {
      expect(louder(n), `${n} notes`).toBeGreaterThan(louder(n - 1));
      expect(louder(n), `${n} notes`).toBeLessThan(3);
    }
    expect(louder(8), 'eight notes, which the original made 4.6 dB louder than one').toBeLessThan(2.1);
  });

  it("goes on being a quieter and quieter note for a crowd that is bigger than a grid has, which is what the player's own notes make", () => {
    expect(levelOfCrowd(24)).toBeLessThan(levelOfCrowd(SIZE));
    expect(louder(24)).toBeLessThan(4);
  });

  it('is never wild for a count that is not a count', () => {
    expect(levelOfCrowd(0)).toBe(1);
    expect(levelOfCrowd(-3)).toBe(1);
  });
});

describe('how much each row is turned up or down to be as loud as the rest', () => {
  it('has a trim for every row, and never more than three decibels either way', () => {
    for (let row = 0; row < SIZE; row++) {
      const db = 20 * Math.log10(trimOfRow(row));
      expect(Number.isFinite(db), `row ${row}`).toBe(true);
      expect(Math.abs(db), `row ${row}`).toBeLessThanOrEqual(3);
    }
  });

  it('turns the top row up most, because the lowpass takes most from it, and the middle rows down', () => {
    const trims = Array.from({ length: SIZE }, (_, row) => trimOfRow(row));
    expect(Math.max(...trims)).toBe(trims[SIZE - 1]);
    expect(trims[SIZE - 1]!).toBeGreaterThan(1.3);
    expect(Math.min(...trims)).toBeLessThan(0.9);
  });

  it('is the same row counted from the top as from the bottom', () => {
    for (let y = 0; y < SIZE; y++) expect(trimOfY(y), `row ${y} from the top`).toBe(trimOfRow(SIZE - 1 - y));
  });

  it('leaves the loudness of all the rows together where it was', () => {
    const mean =
      Array.from({ length: SIZE }, (_, row) => 20 * Math.log10(trimOfRow(row))).reduce((a, b) => a + b, 0) / SIZE;
    expect(Math.abs(mean)).toBeLessThan(0.1);
  });
});
