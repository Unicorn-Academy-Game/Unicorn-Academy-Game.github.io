// SPDX-License-Identifier: GPL-3.0-only
// Written for this game, in the style of ToneMatrix Redux (https://github.com/lupine-dev/ToneMatrixRedux), Copyright (c) Wolfy, which has no
// tunes ready made. Distributed under the GNU General Public License version 3 only. See `src/wonder/games/tonematrix/NOTICE.md`.

import type { Drum } from '../../../shared/kit';
import type { Grid } from './grid';
import { BASS_ROOT, bassNoteOfRow, DRUM_ROWS, type PartId } from './parts';
import { SIZE } from './scale';

/**
 * A tune that is also a picture on the grid, drawn with `#` for a tile that is on, 16 rows of 16,
 * from the top.
 */
export interface Preset {
  readonly id: string;
  readonly art: readonly string[];
}

/**
 * Draws `#` at the given step and row, rows counted from the bottom, which is how notes go up. A
 * way to write a tune as a list.
 */
function notes(list: readonly (readonly [step: number, row: number])[]): string[] {
  const rows = Array.from({ length: SIZE }, () => Array<string>(SIZE).fill('.'));
  for (const [x, r] of list) rows[SIZE - 1 - r]![x] = '#';
  return rows.map((row) => row.join(''));
}

/** A shape in a few rows of text, put at a place in an empty grid. */
function drawn(at: { x: number; y: number }, shape: readonly string[]): string[] {
  const rows = Array.from({ length: SIZE }, () => Array<string>(SIZE).fill('.'));
  for (const [dy, line] of shape.entries())
    for (const [dx, c] of [...line].entries()) if (c === '#') rows[at.y + dy]![at.x + dx] = '#';
  return rows.map((row) => row.join(''));
}

const STAIRS = Array.from({ length: SIZE }, (_, x): [number, number] => [x, 2 + (x < SIZE / 2 ? x : SIZE - 1 - x)]);

const MELODY: readonly Preset[] = [
  {
    // A music box: the left hand goes C E G E on the beats, and the right hand goes up E G A and
    // comes down to D, which leads back to C.
    id: 'box',
    art: notes([
      [0, 2],
      [2, 9],
      [4, 4],
      [6, 10],
      [8, 5],
      [10, 11],
      [12, 4],
      [14, 8],
    ]),
  },
  {
    // The scale, up the left side of a hill and down the right: C D E G A C D E, then back.
    id: 'mountain',
    art: notes(STAIRS),
  },
  {
    // The two edges of a heart. Each step has two notes, one on the outline above and one below,
    // and the heart is the same read from the right.
    id: 'heart',
    art: drawn({ x: 2, y: 3 }, [
      '..###...###..',
      '.#...#.#...#.',
      '#.....#.....#',
      '#...........#',
      '.#.........#.',
      '..#.......#..',
      '...#.....#...',
      '....#...#....',
      '.....#.#.....',
      '......#......',
    ]),
  },
  {
    // High notes, far apart, like the last drops of rain.
    id: 'rain',
    art: notes([
      [1, 14],
      [3, 11],
      [5, 13],
      [6, 9],
      [8, 15],
      [10, 12],
      [12, 10],
      [14, 13],
    ]),
  },
  {
    // Mary had a little lamb: E D C D, E E E.
    id: 'lamb',
    art: notes([
      [0, 4],
      [2, 3],
      [4, 2],
      [6, 3],
      [8, 4],
      [10, 4],
      [12, 4],
    ]),
  },
];

/** A beat written by drum: the steps each drum is struck on. */
function kitted(hits: Readonly<Partial<Record<Drum, readonly number[]>>>): string[] {
  const list: [number, number][] = [];
  for (const [drum, steps] of Object.entries(hits) as [Drum, readonly number[]][])
    for (const step of steps) list.push([step, DRUM_ROWS.indexOf(drum)]);
  return notes(list);
}

const BEAT: readonly Preset[] = [
  {
    // The beat of a pop song: the kick on every beat, the snare on the second and the fourth, and
    // the hat between.
    id: 'pulse',
    art: kitted({ kick: [0, 4, 8, 12], snare: [4, 12], hatClosed: [2, 6, 10, 14] }),
  },
  {
    // Boom bap: the kick falls behind the beat, the snare is on the two and the four and the hat
    // ticks along, opening at the end.
    id: 'groove',
    art: kitted({ kick: [0, 6, 10], snare: [4, 12], hatClosed: [0, 2, 4, 6, 8, 10, 12, 14], hatOpen: [15] }),
  },
  {
    // A march: the snare is busy and the kick comes down on the one and the three, and the toms
    // roll down at the end.
    id: 'march',
    art: kitted({ kick: [0, 8], snare: [0, 4, 6, 8, 12, 14], tomHigh: [13], tomMid: [14], tomLow: [15] }),
  },
  {
    // A samba: a bell that goes round the clave, a shaker that never stops, a block on the off
    // beats and the kick on one and three.
    id: 'samba',
    art: kitted({
      kick: [0, 8],
      cowbell: [0, 3, 6, 10, 12],
      shaker: [0, 2, 4, 6, 8, 10, 12, 14],
      blockHigh: [4, 12],
      blockLow: [10],
    }),
  },
  {
    // The softest: a triangle, wooden ticks and a shaker, with no kick under them, like rain on a
    // tin roof.
    id: 'sparkle',
    art: kitted({ triangle: [0, 8], blockHigh: [2, 6, 10, 14], shaker: [4, 12], rim: [7, 15] }),
  },
];

/**
 * The row of a note of the bass, counted from the bottom, from its name: a letter of the key and
 * the octave, as `C2`.
 */
function bassRow(name: string): number {
  const pitch = { C: 0, D: 2, E: 4, G: 7, A: 9 }[name[0]!];
  if (pitch === undefined || !/^[CDEGA][1-4]$/.test(name)) throw new Error(`${name} is not a note of the bass`);
  const midi = 12 * (Number(name[1]) + 1) + pitch;
  const row = Array.from({ length: SIZE }, (_, r) => bassNoteOfRow(r)).indexOf(midi);
  if (row < 0)
    throw new Error(
      `${name} is not on a row of the bass, which goes from ${bassNoteOfRow(0)} to ${bassNoteOfRow(SIZE - 1)} and starts on ${BASS_ROOT}`,
    );
  return row;
}

/** A line of bass written by note: the step each note begins on. It holds until the next. */
const lined = (line: readonly (readonly [step: number, note: string])[]): string[] =>
  notes(line.map(([step, note]) => [step, bassRow(note)]));

const BASS: readonly Preset[] = [
  {
    // The bass of a dance floor: the root, then the root an octave up, between the beats where the
    // kick is not.
    id: 'bounce',
    art: lined([
      [2, 'C2'],
      [6, 'C3'],
      [10, 'C2'],
      [14, 'C3'],
    ]),
  },
  {
    // The root for half a bar, and then the fifth and the sixth for a beat each.
    id: 'roots',
    art: lined([
      [0, 'C2'],
      [8, 'G2'],
      [12, 'A2'],
    ]),
  },
  {
    // A walk up the chord and back down it: C E G, a step up to A, and home.
    id: 'walk',
    art: lined([
      [0, 'C2'],
      [4, 'E2'],
      [8, 'G2'],
      [10, 'A2'],
      [12, 'G2'],
      [14, 'E2'],
    ]),
  },
  {
    // The scale up a small hill and down it, a note every other step.
    id: 'hill',
    art: lined([
      [0, 'C2'],
      [2, 'D2'],
      [4, 'E2'],
      [6, 'G2'],
      [8, 'A2'],
      [10, 'G2'],
      [12, 'E2'],
      [14, 'D2'],
    ]),
  },
  {
    // A wave: the line rises and falls once in the bar, a note every other step.
    id: 'wave',
    art: lined([
      [0, 'G2'],
      [2, 'C3'],
      [4, 'D3'],
      [6, 'C3'],
      [8, 'G2'],
      [10, 'E2'],
      [12, 'D2'],
      [14, 'E2'],
    ]),
  },
];

export const PRESETS: Readonly<Record<PartId, readonly Preset[]>> = { melody: MELODY, beat: BEAT, bass: BASS };

/** Puts a preset on a grid, in place of what was there. */
export function fillWith(grid: Grid, preset: Preset): void {
  grid.clear();
  for (const [y, line] of preset.art.entries())
    for (const [x, c] of [...line].entries()) if (c === '#') grid.set(x, y, true);
}
