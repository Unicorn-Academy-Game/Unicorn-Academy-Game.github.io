// SPDX-License-Identifier: GPL-3.0-only
// Adapted from ToneMatrix Redux (https://github.com/lupine-dev/ToneMatrixRedux), Copyright (c) Wolfy, under the GNU General Public License
// version 3 only. Translated to TypeScript and changed for this game on 31 October 2026. See `src/wonder/games/tonematrix/NOTICE.md`.

import { COLORS, type RGB } from '../../engine/color';
import { scaleNote } from '../../music';

/**
 * Tiles across, which is steps in the loop, and tiles down, which is notes. The original is 16 by
 * 16 too.
 */
export const SIZE = 16;

/**
 * The steps from one row of the grid to the next, going up. They make five notes to the octave, 2 3
 * 2 2 3 semitones apart, which is the pitch pattern of the original (its rows are C D F G A, going
 * up from C4).
 */
export const STEPS = [0, 2, 5, 7, 9] as const;

/**
 * The note of the lowest row, G3. The original starts on C4, which gives it F where every other
 * sound in this game has E, so a star or a chime played over a tune would sound a semitone off.
 * Starting the same pattern on G keeps every distance between the rows and puts all the notes (G A
 * C D E) inside the one pentatonic key the game is in. To go back to the original's own pitches,
 * make this 60 and the notes are those of the original.
 */
export const ROOT = 55;

/** The note of a row counted from the bottom, which is how the notes go up. */
export const noteOfRow = (row: number): number => scaleNote(ROOT, row, STEPS);

/**
 * The note of a tile, by its row counted from the top, which is how the grid is drawn and how the
 * original counts.
 */
export const noteOfY = (y: number): number => noteOfRow(SIZE - 1 - y);

/** The pitch classes of the five notes of the key, from C up, as they sit in an octave. */
const PITCH_CLASSES: readonly number[] = [0, 2, 4, 7, 9];

/**
 * The colour of each of the five notes, going up the rainbow as the notes go up: red for C, orange
 * for D, yellow for E, blue for G and purple for A.
 */
export const PALETTE: readonly RGB[] = [COLORS.red, COLORS.orange, COLORS.gold, COLORS.blue, COLORS.violet];

/**
 * Which of the five a note is, from 0 for C to 4 for A. A note that is not of the key has no
 * colour, and is an error.
 */
export function shadeOfNote(midi: number): number {
  const at = PITCH_CLASSES.indexOf(((midi % 12) + 12) % 12);
  if (at < 0) throw new Error(`${midi} is not a note of the key`);
  return at;
}

/** The colour of a note, which is the colour of its key and of every tile that plays it. */
export const colorOfNote = (midi: number): RGB => PALETTE[shadeOfNote(midi)]!;

export const shadeOfY = (y: number): number => shadeOfNote(noteOfY(y));
export const colorOfY = (y: number): RGB => colorOfNote(noteOfY(y));

/**
 * What the original turns each note of a step down to when all sixteen sound, against a note alone,
 * in decibels: -10 dB alone, -20 dB full.
 */
export const FULL_STEP_DB = -9.375;

/**
 * The law of a crowd for a part that turns each note of a full step of sixteen down by `fullStepDb`
 * against a note alone, and each note of a smaller crowd down by the power law that joins the two
 * ends, so that a note alone is 1.
 */
export function crowdLaw(fullStepDb: number): (notes: number) => number {
  const exponent = ((fullStepDb / 20) * Math.LN10) / Math.log(SIZE);
  return (notes) => Math.max(1, notes) ** exponent;
}

/**
 * How loud each note of a crowd is for how many sound together, relative to a note that is alone,
 * so that a crowd is not much louder than a note. The original turns every note of a step down as
 * it fills, from -10 dB for one note to -20 dB for sixteen, in a straight line, and the line makes
 * a step of eight 4.6 dB louder than one note and a full step only 2.7 dB louder, so a grid of
 * middling thickness was the loudest (measured with `tools/qa/matrix-sheet.ts`: it peaked at -2.7
 * dBFS). This keeps the two ends and joins them with a power law, on which a step is a little
 * louder for each note that joins (2.0 dB at eight, 2.7 at sixteen) and never louder for having
 * fewer. A note that is alone is 1, and so is anything less.
 */
export const levelOfCrowd = crowdLaw(FULL_STEP_DB);

/**
 * How much each row is turned up or down so that the rows are as loud as each other, in decibels,
 * the lowest row first. Every note goes through the same lowpass, so the top of the grid is much
 * quieter than the middle: at the same gain the loudest row (A5) was 4.5 LU above the quietest
 * (G6). These are what `tools/qa/matrix-sheet.ts` measured at gain 1, brought to the mean, and it
 * measures the rows again with them in. If the voice changes, so do they.
 */
const ROW_TRIM_DB: readonly number[] = [
  0.9, 0.8, 0.6, 0.5, 0.4, 0.2, 0, -0.3, -0.6, -0.9, -1.4, -1.6, -1.4, -0.7, 0.5, 2.9,
];

/** What a row's gain is multiplied by, counted from the bottom as the notes go up. */
export const trimOfRow = (row: number): number => 10 ** (ROW_TRIM_DB[row]! / 20);

/** What the gain of a tile's note is multiplied by, by its row counted from the top. */
export const trimOfY = (y: number): number => trimOfRow(SIZE - 1 - y);
