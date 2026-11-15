import { STAGE_COUNT } from '../../../src/content/reading';
import { emptyProfile, type LearnerProfile } from '../../../src/learning';
import { finishItem, planRound, type ReadItem, type Reward } from '../../../src/learning/reading';
import { MINUTE, T0 } from '../helpers';

/**
 * How a child reads, in the chance that a thing they read needs no help, and the chance that one
 * that did was told to them.
 */
export interface Reader {
  readonly clean: number;
  readonly told: number;
}

export const READERS = {
  strong: { clean: 0.97, told: 0 },
  middling: { clean: 0.8, told: 0.1 },
  slow: { clean: 0.55, told: 0.3 },
} as const satisfies Record<string, Reader>;

/**
 * What a child does with one thing: reads it clean, or needs help, or has it told. A little more is
 * read clean the better it is known.
 */
function readOne(who: Reader, item: ReadItem, random: () => number): { slips: number; hints: number } {
  const chance = Math.min(0.99, who.clean + 0.03 * item.level);
  if (random() < chance) return { slips: 0, hints: 0 };
  return random() < who.told ? { slips: 2, hints: 2 } : { slips: 1, hints: 1 };
}

/** The seconds the player takes over one thing, so a round takes a few minutes. */
const SECONDS_AN_ITEM = 25;

export interface Played {
  readonly profile: LearnerProfile;
  readonly now: number;
  readonly items: readonly ReadItem[];
  readonly rewards: readonly Reward[];
}

/** Reads one round from the player's book, the way the game deals it. */
export function readRound(
  profile: LearnerProfile,
  now: number,
  who: Reader,
  random: () => number,
  focus?: number,
): Played {
  const items = planRound(profile, now, focus);
  const rewards: Reward[] = [];
  let book = profile;
  let at = now;
  for (const item of items) {
    at += SECONDS_AN_ITEM * 1000;
    const done = finishItem(book, item, readOne(who, item, random), at);
    book = done.profile;
    rewards.push(done.reward);
  }
  return { profile: book, now: at, items, rewards };
}

export interface Run {
  readonly profile: LearnerProfile;
  readonly rounds: number;
  readonly days: number;
  /**
   * The rounds it took to clear each stage, counted from the stage before it, for the stages that
   * were cleared.
   */
  readonly roundsPerStage: readonly number[];
}

/**
 * A child who reads `perSitting` rounds in a sitting, with a few minutes between rounds, and comes
 * back after `gapHours`, until the course is cleared or `limit` rounds have gone by.
 */
export function runCourse(who: Reader, random: () => number, perSitting = 3, gapHours = 24, limit = 1500): Run {
  let profile = emptyProfile();
  let now = T0;
  let rounds = 0;
  const roundsPerStage: number[] = [];
  let sinceClear = 0;
  while (rounds < limit) {
    for (let i = 0; i < perSitting && rounds < limit; i++) {
      const played = readRound(profile, now, who, random);
      profile = played.profile;
      now = played.now + 3 * MINUTE;
      rounds += 1;
      sinceClear += 1;
      for (const reward of played.rewards) {
        if (reward.cleared !== null) {
          roundsPerStage.push(sinceClear);
          sinceClear = 0;
        }
      }
      if (roundsPerStage.length === STAGE_COUNT)
        return { profile, rounds, days: (now - T0) / (24 * 60 * MINUTE), roundsPerStage };
    }
    now += gapHours * 60 * MINUTE;
  }
  return { profile, rounds, days: (now - T0) / (24 * 60 * MINUTE), roundsPerStage };
}

/**
 * Reads rounds the way `runCourse` does, a few at a sitting and a day between sittings, until
 * `done` says the book is where a test needs it. A stage cannot be cleared in minutes, because what
 * the player has read is not due again for that long, so a test that needs a book in the middle of
 * the course has to let days go by.
 */
export function readUntil(
  done: (profile: LearnerProfile) => boolean,
  who: Reader,
  random: () => number,
  perSitting = 3,
  gapHours = 24,
  limit = 1500,
): { profile: LearnerProfile; now: number; rounds: number } {
  let profile = emptyProfile();
  let now = T0;
  let rounds = 0;
  while (!done(profile)) {
    for (let i = 0; i < perSitting && !done(profile); i++) {
      if (rounds >= limit) throw new Error(`the book was not where the test needed it after ${limit} rounds`);
      const played = readRound(profile, now, who, random);
      profile = played.profile;
      now = played.now + 3 * MINUTE;
      rounds += 1;
    }
    now += gapHours * 60 * MINUTE;
  }
  return { profile, now, rounds };
}
