import { COUNT_MAX, MAX_LEVEL, type Progress, type Skill } from '../shared/learning';
import { stepOf } from './ladders';

/**
 * What happened while one word was spelled or read, in the two numbers that decide what it means.
 */
export interface Attempt {
  /**
   * Wrong tries: a wrong key in spelling, a wrong choice in reading. A run of the same one counts
   * once.
   */
  slips: number;
  /**
   * Times the player was helped: a key that lit up because they kept missing, a peek, the help
   * button, or the word said when the card did not say it.
   */
  hints: number;
}

/**
 * A try is clean when the player was not helped and their slips stay within what the rung allows.
 */
export const isClean = (skill: Skill, level: number, attempt: Attempt): boolean =>
  attempt.hints === 0 && attempt.slips <= stepOf(skill, level).allow;

/** A word the player has never tried is due, and so is one whose time has come. */
export const isDue = (progress: Progress | undefined, now: number): boolean =>
  progress === undefined || progress.due <= now;

/** A word the player has not spelled yet: no try of it has ever been finished. */
export const isNew = (progress: Progress | undefined): boolean => progress === undefined || progress.done === 0;

const STREAK_CAP = 100;

/**
 * What a finished try does to what the player knows about the word.
 *
 * - A clean try adds to the streak, and enough of them in a row move the word up a level.
 * - A try that needed help or had many slips resets the streak. Two in a row move the word down one
 *   level.
 * - Every try sets when the word is due next, by the level it is left at.
 *
 * A word they have not tried before starts at `startLevel`. Giving up is not a try and never comes
 * here.
 */
export function learn(
  skill: Skill,
  before: Progress | undefined,
  attempt: Attempt,
  now: number,
  startLevel: number,
): Progress {
  const base: Progress = before ?? {
    level: Math.min(MAX_LEVEL, Math.max(0, startLevel)),
    best: Math.min(MAX_LEVEL, Math.max(0, startLevel)),
    streak: 0,
    struggles: 0,
    due: now,
    done: 0,
    clean: 0,
    slips: 0,
    first: now,
    last: now,
  };
  const clean = isClean(skill, base.level, attempt);
  let { level, streak, struggles } = base;
  if (clean) {
    streak += 1;
    struggles = 0;
    if (level < MAX_LEVEL && streak >= stepOf(skill, level).needs) {
      level += 1;
      streak = 0;
    } else streak = Math.min(streak, STREAK_CAP);
  } else {
    streak = 0;
    struggles += 1;
    if (struggles >= 2) {
      level = Math.max(0, level - 1);
      struggles = 0;
    }
  }
  return {
    level,
    best: Math.max(base.best, level),
    streak,
    struggles,
    due: now + stepOf(skill, level).due,
    done: Math.min(COUNT_MAX, base.done + 1),
    clean: Math.min(COUNT_MAX, base.clean + (clean ? 1 : 0)),
    slips: Math.min(COUNT_MAX, base.slips + attempt.slips),
    first: base.first,
    // Never earlier than before, so a clock that was set back cannot make an old state look new
    // when two copies are merged.
    last: Math.max(base.last, now),
  };
}

/**
 * What a word is worth once it is collected. The players are young and like stars, so the first
 * spell earns them all.
 */
export const STARS_PER_WORD = 5;

export type Stars = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * A word the player has collected has every star at once, so a book they start again or a word they
 * have to relearn is never empty of them. How well they know it is the level, which the book does
 * not show them and the parent page does.
 */
export const starsOf = (progress: Progress | undefined): Stars => (progress && progress.done > 0 ? STARS_PER_WORD : 0);
