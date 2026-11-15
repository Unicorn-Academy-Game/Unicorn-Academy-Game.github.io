// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { PART_IDS, PARTS, type PartId } from './parts';
import { BUDGET_SECONDS, RING_SECONDS, Ringing, thin } from './ringing';
import { levelOfCrowd } from './scale';

/** What the melody lets through: nine notes in a quarter of a second, and six from one touch. */
const BUDGET = 9;
const MOST_IN_RUN = 6;

describe('a list cut down to what can be rung', () => {
  it('is the list itself when it is short enough, and never the same list when it is cut', () => {
    const few = [1, 2, 3];
    expect(thin(few, 6)).toBe(few);
    expect(thin(few, 3)).toBe(few);
    const many = Array.from({ length: 40 }, (_, i) => i);
    expect(thin(many, 6)).not.toBe(many);
  });

  it('keeps the first and the last, spreads the rest along the list, and keeps its order', () => {
    const many = Array.from({ length: 16 }, (_, i) => i);
    const kept = thin(many, MOST_IN_RUN);
    expect(kept).toHaveLength(MOST_IN_RUN);
    expect(kept[0]).toBe(0);
    expect(kept[MOST_IN_RUN - 1]).toBe(15);
    expect([...kept].sort((a, b) => a - b)).toEqual([...kept]);
    expect(new Set(kept).size).toBe(MOST_IN_RUN);
  });
});

describe('the notes the player rings', () => {
  it('lets a note that is alone sound as loud as a note can', () => {
    const ringing = new Ringing(BUDGET);
    expect(ringing.take(0, 1, levelOfCrowd)).toEqual({ allowed: 1, level: 1 });
    expect(ringing.rung).toBe(1);
  });

  it('turns the notes of a run down for the crowd they make, as the loop does for a step', () => {
    const ringing = new Ringing(BUDGET);
    const { allowed, level } = ringing.take(0, 6, levelOfCrowd);
    expect(allowed).toBe(6);
    expect(level).toBe(levelOfCrowd(6));
  });

  it('counts the notes that are still ringing as part of the crowd, and forgets them when they have rung out', () => {
    const ringing = new Ringing(BUDGET);
    ringing.take(0, 4, levelOfCrowd);
    expect(ringing.take(0.3, 1, levelOfCrowd).level).toBe(levelOfCrowd(5));
    expect(
      ringing.take(RING_SECONDS + 0.01, 1, levelOfCrowd).level,
      'the first four have gone, the one at 0.3 has not',
    ).toBe(levelOfCrowd(2));
    expect(ringing.take(RING_SECONDS + 0.4, 1, levelOfCrowd).level, 'all have gone but the last').toBe(levelOfCrowd(2));
    expect(new Ringing(BUDGET).take(10, 1, levelOfCrowd).level).toBe(1);
  });

  it('lets only so many notes through in a quarter of a second, and the rest of a run that is too long is dropped', () => {
    const ringing = new Ringing(BUDGET);
    expect(ringing.take(0, MOST_IN_RUN, levelOfCrowd).allowed).toBe(MOST_IN_RUN);
    expect(ringing.take(0.05, MOST_IN_RUN, levelOfCrowd).allowed).toBe(BUDGET - MOST_IN_RUN);
    expect(ringing.take(0.1, 1, levelOfCrowd).allowed).toBe(0);
    expect(ringing.rung).toBe(BUDGET);
  });

  it('lets notes through again once the quarter of a second is over, though the crowd still counts what is ringing', () => {
    const ringing = new Ringing(BUDGET);
    ringing.take(0, BUDGET, levelOfCrowd);
    const next = ringing.take(BUDGET_SECONDS + 0.01, 3, levelOfCrowd);
    expect(next.allowed).toBe(3);
    expect(next.level).toBe(levelOfCrowd(BUDGET + 3));
  });

  it('is quiet again for a note that comes after the player has stopped, and after the game starts over', () => {
    const ringing = new Ringing(BUDGET);
    ringing.take(0, BUDGET, levelOfCrowd);
    ringing.clear();
    expect(ringing.take(0.01, 1, levelOfCrowd)).toEqual({ allowed: 1, level: 1 });
  });

  it('lets a part that has less room let fewer notes through', () => {
    expect(new Ringing(3).take(0, 6, levelOfCrowd).allowed).toBe(3);
    expect(new Ringing(3).take(0.01, 1, levelOfCrowd).allowed).toBe(1);
  });

  it('keeps hammering on any part from being much louder than one note, however fast the player goes for ten seconds', () => {
    // How much of the power of one note the notes that are ringing add up to, at the worst, for
    // each part. A ping is gone in a moment, a drum rings, and a bass is held, so the parts have
    // less room.
    const most: Readonly<Record<PartId, number>> = { melody: 2.5, beat: 1.5, bass: 1.5 };
    for (const id of PART_IDS) {
      const { own } = PARTS[id];
      for (const perSecond of [4, 8, 20, 60]) {
        const ringing = new Ringing(own.budget);
        const rung: { at: number; level: number }[] = [];
        let worst = 0;
        for (let at = 0; at < 10; at += 1 / perSecond) {
          const { allowed, level } = ringing.take(at, 1, own.level);
          if (allowed === 0) continue;
          rung.push({ at, level });
          if (at < 2 * RING_SECONDS) continue;
          // The power of what is ringing, against one note alone, each note at the level it was
          // rung at.
          const power = rung.filter((n) => at - n.at <= RING_SECONDS).reduce((sum, n) => sum + n.level ** 2, 0);
          worst = Math.max(worst, power);
        }
        expect(worst, `${id} at ${perSecond} touches a second`).toBeLessThan(most[id]);
      }
    }
  });
});
