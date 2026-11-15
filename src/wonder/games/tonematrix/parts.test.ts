// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { DRUMS, type Drum, drumOf, KIT } from '../../../shared/kit';
import { PENTATONIC } from '../../music';
import { BASS_ROOT, bassNoteOfRow, DRUM_ROWS, PART_IDS, PARTS, rowOfDrum } from './parts';
import { FULL_STEP_DB, noteOfY, SIZE, shadeOfNote, trimOfY } from './scale';

const db = (x: number): number => 20 * Math.log10(x);

describe('the three parts of the song', () => {
  it('are a melody, a beat and a bass, each with a grid of sixteen rows', () => {
    expect(PART_IDS).toEqual(['melody', 'beat', 'bass']);
    for (const id of PART_IDS) {
      expect(PARTS[id].id).toBe(id);
      expect(PARTS[id].rows, id).toHaveLength(SIZE);
    }
  });

  it('are played by a piano of lights, a kit and a bass, and only the bass is one note at a time', () => {
    expect(PART_IDS.map((id) => PARTS[id].voice)).toEqual(['ping', 'kit', 'sub']);
    expect(PART_IDS.map((id) => PARTS[id].mono)).toEqual([false, false, true]);
  });

  it('have a colour of the five for every row, a trim that is a gain and a place in the speakers that is inside them', () => {
    for (const id of PART_IDS) {
      for (const [y, row] of PARTS[id].rows.entries()) {
        const where = `${id} row ${y}`;
        expect(Number.isInteger(row.shade) && row.shade >= 0 && row.shade <= 4, where).toBe(true);
        expect(row.trim, where).toBeGreaterThan(0);
        expect(Math.abs(db(row.trim)), `${where} is not turned by more than 6 dB`).toBeLessThanOrEqual(6);
        if (row.pan !== null) expect(Math.abs(row.pan), where).toBeLessThanOrEqual(0.5);
      }
    }
  });

  it('have a loop that is not louder than a note the player plays, so that their note is the one they hear', () => {
    for (const id of PART_IDS) expect(PARTS[id].loop, id).toBeLessThanOrEqual(PARTS[id].own.gain);
  });

  it('turn each note of a crowd down by the same law, 9.375 dB for each note of a full step, until a part has been measured to need another', () => {
    for (const id of PART_IDS) {
      expect(PARTS[id].level(1), id).toBe(1);
      expect(db(PARTS[id].level(SIZE)), id).toBeCloseTo(FULL_STEP_DB, 9);
    }
  });
});

describe('the notes the player rings', () => {
  it('are turned down for a crowd as the loop is, and a note alone is as loud as it can be', () => {
    for (const id of PART_IDS) {
      expect(PARTS[id].own.level(1), id).toBe(1);
      expect(PARTS[id].own.level(8), id).toBeLessThan(PARTS[id].own.level(2));
    }
  });

  it('are held in check by a budget that is no smaller than what one touch rings, and the bass is the part with the least room', () => {
    for (const id of PART_IDS) expect(PARTS[id].own.budget, id).toBeGreaterThanOrEqual(PARTS[id].own.run);
    const budgets = PART_IDS.map((id) => PARTS[id].own.budget);
    expect(PARTS.bass.own.budget).toBe(Math.min(...budgets));
  });

  it('are held for a short while on the part that holds its notes, so that a scribble across it is not a growl', () => {
    for (const id of PART_IDS) {
      const { hold } = PARTS[id].own;
      if (PARTS[id].mono) {
        expect(hold, id).not.toBeNull();
        expect(hold!, id).toBeLessThanOrEqual(0.4);
      } else expect(hold, id).toBeNull();
    }
  });
});

describe('the melody', () => {
  const rows = PARTS.melody.rows;

  it('is the rows it has always had: the same notes, shades and trims as the scale of the grid, top first', () => {
    for (const [y, row] of rows.entries()) {
      expect(row.midi, `row ${y}`).toBe(noteOfY(y));
      expect(row.trim, `row ${y}`).toBe(trimOfY(y));
      expect(row.pan, `row ${y} has none, its notes are heard where their step is`).toBeNull();
    }
  });
});

describe('the beat', () => {
  const rows = PARTS.beat.rows;

  it('has every drum of the kit once, the kick at the bottom and the crash at the top', () => {
    expect([...DRUM_ROWS].sort()).toEqual([...DRUMS].sort());
    expect(DRUM_ROWS).toHaveLength(SIZE);
    expect(rows.at(-1)!.midi).toBe(KIT.kick);
    expect(rows[0]!.midi).toBe(KIT.crash);
    expect(rowOfDrum('kick')).toBe(SIZE - 1);
    expect(rowOfDrum('crash')).toBe(0);
  });

  it('asks the kit for the drum of each row, by its number, which the kit hears as that drum', () => {
    for (const [y, row] of rows.entries()) expect(drumOf(row.midi), `row ${y}`).toBe(DRUM_ROWS[SIZE - 1 - y]);
  });

  it('colours the drums by family, so a child can read a row without knowing its name', () => {
    const shades = (...drums: Drum[]): number[] => drums.map((d) => rows[rowOfDrum(d)]!.shade);
    expect(shades('kick', 'tomFloor', 'tomLow', 'tomMid', 'tomHigh'), 'the kick and the toms are red').toEqual([
      0, 0, 0, 0, 0,
    ]);
    expect(shades('snare', 'clap', 'rim'), 'the snare and what is struck like it are orange').toEqual([1, 1, 1]);
    expect(shades('cowbell', 'blockLow', 'blockHigh', 'triangle'), 'what rings is gold').toEqual([2, 2, 2, 2]);
    expect(shades('shaker', 'hatClosed', 'hatOpen'), 'what hisses is blue').toEqual([3, 3, 3]);
    expect(shades('crash'), 'the crash is violet').toEqual([4]);
  });

  it('puts the kick and the snare in the middle of the speakers and the rest on both sides, so the two sides weigh about the same', () => {
    expect(rows[rowOfDrum('kick')]!.pan).toBe(0);
    expect(rows[rowOfDrum('snare')]!.pan).toBe(0);
    const pans = rows.map((r) => r.pan!);
    expect(pans.some((p) => p < 0) && pans.some((p) => p > 0)).toBe(true);
    expect(Math.abs(pans.reduce((a, b) => a + b, 0)), 'the sum of all the pans is near the middle').toBeLessThan(0.35);
  });
});

describe('the bass', () => {
  const rows = PARTS.bass.rows;

  it('goes up from G1, three octaves and a note, in the five notes of the key of the melody and no others', () => {
    expect(BASS_ROOT).toBe(31);
    expect(bassNoteOfRow(0)).toBe(31);
    expect(bassNoteOfRow(SIZE - 1)).toBe(67);
    for (const row of rows) expect(PENTATONIC, `note ${row.midi}`).toContain(row.midi % 12);
    for (let y = 1; y < SIZE; y++) expect(rows[y]!.midi, `row ${y}`).toBeLessThan(rows[y - 1]!.midi);
  });

  it('is of the same key as the melody, so each of its notes is a pitch class the melody has, and the same notes are the same colours', () => {
    const melodyClasses = new Set(PARTS.melody.rows.map((r) => r.midi % 12));
    for (const row of rows) {
      expect(melodyClasses, `note ${row.midi}`).toContain(row.midi % 12);
      expect(row.shade, `note ${row.midi}`).toBe(shadeOfNote(row.midi));
    }
  });

  it('puts its notes in the middle of the speakers, because the low end does not go to a side', () => {
    for (const row of rows) expect(row.pan).toBe(0);
  });

  it('starts on a note of 49 hertz, which is as low as a good speaker goes and that a small one lets be heard by its harmonics, and no lower', () => {
    const hertz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);
    expect(hertz(rows.at(-1)!.midi)).toBeGreaterThan(48);
    expect(hertz(rows.at(-1)!.midi)).toBeLessThan(50);
  });
});
