// SPDX-License-Identifier: GPL-3.0-only
// Written for this game to go with the adapted files of ToneMatrix Redux (https://github.com/lupine-dev/ToneMatrixRedux), Copyright (c) Wolfy, under
// the GNU General Public License version 3 only. See `src/wonder/games/tonematrix/NOTICE.md`.

/**
 * The player's own notes that a part lets through are counted over this long, so that scribbling is
 * a run of notes and not a buzz.
 */
export const BUDGET_SECONDS = 0.25;
/**
 * A note of the player's is heard for about this long, so the notes that are this close together
 * are one crowd, and each is turned down for it.
 */
export const RING_SECONDS = 0.6;
/** How far apart, in seconds, the notes of a run are put. */
export const RUN_APART = 0.03;

/** `list` cut down to at most `most` of its items, spread along it, the first and the last kept. */
export function thin<T>(list: readonly T[], most: number): readonly T[] {
  if (list.length <= most) return list;
  return Array.from({ length: most }, (_, i) => list[Math.round((i * (list.length - 1)) / (most - 1))]!);
}

/**
 * The notes the player rings themselves on one part, which the grid does not play. It remembers
 * when each was rung, lets only so many through in a short time, and says how loud a note is for
 * the crowd it makes with the ones still ringing, as a step of the loop turns its notes down for
 * how many sound together: a stroke that is a hundred notes must not be a hundred times as loud as
 * one note.
 */
export class Ringing {
  private readonly at: number[] = [];
  /** How many notes have been let through, for a measuring tool to count. */
  rung = 0;

  /** `budget` is the most notes this lets through in a quarter of a second. */
  constructor(private readonly budget: number) {}
  /**
   * Asks to ring `wanted` notes at `now`. Gives how many may sound, and how loud each of them is,
   * as a share of a note alone, by the law of the crowd of the part they are of.
   */
  take(
    now: number,
    wanted: number,
    law: (notes: number) => number,
  ): { readonly allowed: number; readonly level: number } {
    while (this.at.length > 0 && now - this.at[0]! > RING_SECONDS) this.at.shift();
    const level = law(this.at.length + wanted);
    let allowed = 0;
    while (allowed < wanted && this.lately(now) < this.budget) {
      this.at.push(now);
      allowed++;
    }
    this.rung += allowed;
    return { allowed, level };
  }

  private lately(now: number): number {
    let count = 0;
    for (let i = this.at.length - 1; i >= 0 && now - this.at[i]! <= BUDGET_SECONDS; i--) count++;
    return count;
  }

  clear(): void {
    this.at.length = 0;
  }
}
