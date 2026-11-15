// SPDX-License-Identifier: GPL-3.0-only
// Written for this game to go with the adapted files of ToneMatrix Redux (https://github.com/lupine-dev/ToneMatrixRedux), Copyright (c) Wolfy, under
// the GNU General Public License version 3 only. See `src/wonder/games/tonematrix/NOTICE.md`.

import { type Drum, KIT } from '../../../shared/kit';
import { scaleNote } from '../../music';
import type { VoiceName } from '../../sound';
import { crowdLaw, FULL_STEP_DB, noteOfY, SIZE, STEPS, shadeOfNote, shadeOfY, trimOfY } from './scale';

/**
 * The three parts of the song, which are three grids of 16 by 16 that play together in one loop.
 * The melody is the piano of lights the game began as. The beat is a kit with a drum on each row.
 * The bass is a line of low notes, one at a time. A tile is a note of the one key of the game in
 * the melody and the bass, and a drum in the beat, so whatever the player puts on any of them goes
 * with whatever is on the other two. What a part is made of is here, so that the rest of the game
 * asks a part and never asks which part it is.
 */
export const PART_IDS = ['melody', 'beat', 'bass'] as const;
export type PartId = (typeof PART_IDS)[number];

/** One row of a part, from the top. */
interface Row {
  /** What the part's instrument is asked for: a note, or for the beat the number of a drum. */
  readonly midi: number;
  /** Which of the five colours the row is, from 0 for red to 4 for violet. */
  readonly shade: number;
  /**
   * What the gain of a tile on the row is multiplied by, so that the rows of a part are as loud as
   * each other.
   */
  readonly trim: number;
  /**
   * Where in the speakers the row is, from -1 on the left to 1 on the right. The melody has none,
   * because its notes are heard where their step is.
   */
  readonly pan: number | null;
}

/**
 * How the notes the player rings themselves on a part are kept from piling up. A scribble across a
 * grid is a run of notes and never a wall of them, and how much of a wall a part can bear is the
 * instrument's own: a ping is gone in a moment, a drum rings, and a bass is a held low note that a
 * dozen of at once is a growl.
 */
interface Own {
  /** How loud a note of the player's is when it is alone. */
  readonly gain: number;
  /**
   * What each of the notes the player has ringing at once is turned down to, for how many there
   * are.
   */
  readonly level: (notes: number) => number;
  /** The most notes the player may ring in a quarter of a second. */
  readonly budget: number;
  /** The most notes one touch rings at once. */
  readonly run: number;
  /**
   * How long each note of the player's is held, for a part that holds its notes. Left out, the
   * instrument has its own.
   */
  readonly hold: number | null;
}

export interface Part {
  readonly id: PartId;
  /** The instrument that plays its tiles. */
  readonly voice: VoiceName;
  /**
   * A line of one note at a time, each held until the next: a tile that goes on puts out the one
   * that was in its step.
   */
  readonly mono: boolean;
  /** How loud its loop is next to the other parts. */
  readonly loop: number;
  /** What each note of a step of the loop is turned down to for how many sound together. */
  readonly level: (notes: number) => number;
  /** The player's own notes. */
  readonly own: Own;
  /** The rows, the top one first, which is how the grid is drawn. */
  readonly rows: readonly Row[];
}

const db = (decibels: number): number => 10 ** (decibels / 20);

const MELODY: Part = {
  id: 'melody',
  voice: 'ping',
  mono: false,
  loop: 0.92,
  level: crowdLaw(FULL_STEP_DB),
  own: { gain: 1.1, level: crowdLaw(FULL_STEP_DB), budget: 9, run: 6, hold: null },
  rows: Array.from({ length: SIZE }, (_, y) => ({ midi: noteOfY(y), shade: shadeOfY(y), trim: trimOfY(y), pan: null })),
};

/**
 * The drum on each row, the bottom one first. They go from the deepest to the brightest, as the
 * notes of the other parts go up: the kick and the four toms, then what is struck flat (the snare,
 * a clap, a side stick), then what rings (a bell, two blocks, a triangle), then what is shaken or
 * hissed, and the crash at the top.
 */
export const DRUM_ROWS: readonly Drum[] = [
  'kick',
  'tomFloor',
  'tomLow',
  'tomMid',
  'tomHigh',
  'snare',
  'clap',
  'rim',
  'cowbell',
  'blockLow',
  'blockHigh',
  'triangle',
  'shaker',
  'hatClosed',
  'hatOpen',
  'crash',
];

/**
 * The colour of each drum: red for the kick and the toms, orange for the snare and what is like it,
 * gold for what rings, blue for what hisses and violet for the crash.
 */
const DRUM_SHADE: Readonly<Record<Drum, number>> = {
  kick: 0,
  tomFloor: 0,
  tomLow: 0,
  tomMid: 0,
  tomHigh: 0,
  snare: 1,
  clap: 1,
  rim: 1,
  cowbell: 2,
  blockLow: 2,
  blockHigh: 2,
  triangle: 2,
  shaker: 3,
  hatClosed: 3,
  hatOpen: 3,
  crash: 4,
};

/**
 * Where each drum is in the speakers, as a player sat in the middle has them: the low end in the
 * middle and the rest spread, so that the two sides weigh the same.
 */
const DRUM_PAN: Readonly<Record<Drum, number>> = {
  kick: 0,
  snare: 0,
  clap: 0.08,
  rim: -0.12,
  tomFloor: 0.3,
  tomLow: 0.15,
  tomMid: -0.1,
  tomHigh: -0.28,
  cowbell: 0.22,
  blockLow: -0.2,
  blockHigh: -0.28,
  triangle: 0.35,
  shaker: -0.32,
  hatClosed: 0.28,
  hatOpen: 0.3,
  crash: -0.4,
};

/**
 * What the rows of the beat are turned by, in decibels, on top of the balance the kit has as a kit,
 * where a kick weighs most and a hat least, as they do in any drum machine. A child has to hear the
 * hat they put down as well as the kick, and a small speaker gives the kick next to nothing, so the
 * quiet ones are lifted by as much as 4.5 and the loud ones are brought down by as much as 3, which
 * leaves the whole kit within six units of loudness where it was within twelve.
 * `tools/qa/matrix-sheet.ts --rows` measures it.
 */
const DRUM_TRIM_DB: Readonly<Record<Drum, number>> = {
  kick: -1,
  tomFloor: -1.5,
  tomLow: -1.5,
  tomMid: -1,
  tomHigh: -1,
  snare: 2,
  clap: 1.5,
  rim: 2.5,
  cowbell: 0.5,
  blockLow: 2,
  blockHigh: 2,
  triangle: 0.5,
  shaker: 4.5,
  hatClosed: 4.5,
  hatOpen: 1.5,
  crash: -3,
};

const BEAT: Part = {
  id: 'beat',
  voice: 'kit',
  mono: false,
  loop: 0.53,
  level: crowdLaw(FULL_STEP_DB),
  own: { gain: 1, level: crowdLaw(-12), budget: 6, run: 4, hold: null },
  rows: Array.from({ length: SIZE }, (_, y) => {
    const drum = DRUM_ROWS[SIZE - 1 - y]!;
    return { midi: KIT[drum], shade: DRUM_SHADE[drum], trim: db(DRUM_TRIM_DB[drum]), pan: DRUM_PAN[drum] };
  }),
};

/** The row, from the top, of a drum. */
export const rowOfDrum = (drum: Drum): number => SIZE - 1 - DRUM_ROWS.indexOf(drum);

/**
 * The note of the lowest row of the bass, G1. The same five notes to the octave as the melody and
 * from the same G, so the two are of one key.
 */
export const BASS_ROOT = 31;

/**
 * The note of a row of the bass counted from the bottom, which goes up through three octaves and a
 * note, G1 to G4.
 */
export const bassNoteOfRow = (row: number): number => scaleNote(BASS_ROOT, row, STEPS);

/**
 * What the rows of the bass are turned by, in decibels, the lowest first. The deep rows are turned
 * up so that they are as loud as the high ones, and by a little more than that, because a small
 * speaker gives next to nothing under 250 hertz and the lowest rows are the ones it takes most of.
 * `tools/qa/matrix-sheet.ts --rows` measures it.
 */
const BASS_TRIM_DB: readonly number[] = [
  3.3, 2.8, 2.1, 1.6, 1.2, 0.6, 0.3, -0.2, -0.4, -0.6, -0.7, -0.8, -0.9, -0.9, -1, -1.1,
];

const BASS: Part = {
  id: 'bass',
  voice: 'sub',
  mono: true,
  loop: 0.7,
  level: crowdLaw(FULL_STEP_DB),
  own: { gain: 1.1, level: crowdLaw(-11.5), budget: 3, run: 3, hold: 0.25 },
  rows: Array.from({ length: SIZE }, (_, y) => {
    const midi = bassNoteOfRow(SIZE - 1 - y);
    return { midi, shade: shadeOfNote(midi), trim: db(BASS_TRIM_DB[SIZE - 1 - y]!), pan: 0 };
  }),
};

export const PARTS: Readonly<Record<PartId, Part>> = { melody: MELODY, beat: BEAT, bass: BASS };
