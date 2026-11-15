// SPDX-License-Identifier: GPL-3.0-only
// Adapted from ToneMatrix Redux (https://github.com/lupine-dev/ToneMatrixRedux), Copyright (c) Wolfy, under the GNU General Public License
// version 3 only. Translated to TypeScript and changed for this game on 31 October 2026. See `src/wonder/games/tonematrix/NOTICE.md`.

import type { Hit } from '../../engine/band';
import type { Grid } from './grid';
import type { Part } from './parts';
import { SIZE } from './scale';

/**
 * How far to the left and right of the middle the first and the last step are heard, as a share of
 * the way to the edge of the speakers.
 */
const SPREAD = 0.7;

/** Where a step is heard, from the left of the speakers for the first to the right for the last. */
export const panOf = (step: number): number => ((step + 0.5) / SIZE - 0.5) * SPREAD;

/**
 * How much sooner than the next note a held note lets go, in seconds, so that the two never sound
 * as one. The note before it is still dying out as the next one begins.
 */
export const LEGATO_GAP = 0.02;

/** The shortest a held note is told to be, in seconds, whatever the tempo. */
const SHORTEST_HELD = 0.06;

/**
 * What a part of the song plays. The band asks for a step a moment before it sounds, and this gives
 * it the notes of that step: one for each tile that is on, each as loud as its row and the number
 * there are make it, and heard where its row is or, for a part that has none, where its step is. A
 * part that is one note at a time holds each note until the next one, however far on that is. It
 * also remembers which tiles it gave, so that the picture, which is told when the step is reached,
 * shows the notes that sounded and not what the grid has become since.
 */
export class Sequence {
  private readonly given: (readonly number[] | null)[] = Array.from({ length: SIZE }, () => null);

  constructor(
    private readonly grid: Grid,
    private readonly part: Part,
  ) {}

  /**
   * The notes of a step, or null for a step with none. `stepSeconds` is how long a step lasts now,
   * for the notes that are held until the next.
   */
  hits(step: number, stepSeconds: number): Hit[] | null {
    const rows = this.grid.rowsOf(step);
    this.given[step] = rows.length > 0 ? rows : null;
    if (rows.length === 0) return null;
    const level = this.part.level(rows.length);
    const pan = panOf(step);
    const seconds = this.part.mono
      ? Math.max(SHORTEST_HELD, this.grid.gapAfter(step) * stepSeconds - LEGATO_GAP)
      : undefined;
    return rows.map((y) => {
      const row = this.part.rows[y]!;
      return {
        midi: row.midi,
        gain: level * row.trim,
        pan: row.pan ?? pan,
        ...(seconds === undefined ? {} : { seconds }),
      };
    });
  }

  /**
   * The rows of the tiles that were given for a step, once. A step that was never asked for, or was
   * dropped for being late, gives none.
   */
  took(step: number): readonly number[] {
    const rows = this.given[step] ?? [];
    this.given[step] = null;
    return rows;
  }

  forget(): void {
    this.given.fill(null);
  }
}
