import { WORDS, type WordId } from '../../src/content/lexicon';
import {
  type Attempt,
  type Context,
  emptyProfile,
  finish,
  type LearnerProfile,
  NO_PACE,
  type Offer,
  practiceOffer,
  withProgress,
} from '../../src/learning';
import { DEFAULT_LEARNING, type LearningSettings, type Progress } from '../../src/shared/learning';

/**
 * A small deterministic source of numbers from 0 up to but not including 1, so a test that uses
 * chance can be run again exactly.
 */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** A moment well after 1970, so that "due now" and "never" are different things. */
export const T0 = Date.UTC(2026, 9, 27, 9, 0, 0);

export const settings = (patch: Partial<LearningSettings> = {}): LearningSettings => ({
  ...DEFAULT_LEARNING,
  on: true,
  ...patch,
});

export const CLEAN: Attempt = { slips: 0, hints: 0 };

export const context = (profile: LearnerProfile = emptyProfile(), patch: Partial<Context> = {}): Context => ({
  profile,
  settings: settings(),
  now: T0,
  pace: NO_PACE,
  ...patch,
});

/** A progress record with everything filled in, so a test names only what it cares about. */
export const progress = (patch: Partial<Progress> = {}): Progress => ({
  level: 0,
  best: 0,
  streak: 0,
  struggles: 0,
  due: T0,
  done: 1,
  clean: 1,
  slips: 0,
  first: T0,
  last: T0,
  ...patch,
});

/** A profile in which each given word has been spelled once at a level. */
export function profileOf(words: Partial<Record<WordId, Partial<Progress>>>): LearnerProfile {
  let profile = emptyProfile();
  for (const [word, patch] of Object.entries(words))
    profile = withProgress(profile, word, 'spell', progress({ best: patch?.level ?? 0, ...patch }));
  return profile;
}

/** The same profile with each given word read once, at a level, as the patch says. */
export function withRead(profile: LearnerProfile, words: Partial<Record<WordId, Partial<Progress>>>): LearnerProfile {
  let next = profile;
  for (const [word, patch] of Object.entries(words))
    next = withProgress(next, word, 'read', progress({ best: patch?.level ?? 0, ...patch }));
  return next;
}

/** Spells a word cleanly at the level the profile has for it, and returns the new profile. */
export function spellCleanly(
  profile: LearnerProfile,
  word: WordId,
  now: number,
  patch: Partial<Context> = {},
): { profile: LearnerProfile; offer: Offer } {
  const offer = practiceOffer(word, context(profile, { now, ...patch }));
  return { profile: finish(profile, offer, CLEAN, now).profile, offer };
}

/** Spells every word of a list cleanly, one after the other. */
export function collect(
  words: readonly WordId[],
  start: LearnerProfile = emptyProfile(),
  now: number = T0,
): LearnerProfile {
  return words.reduce((profile, word) => spellCleanly(profile, word, now).profile, start);
}

export const ALL_WORDS = Object.keys(WORDS) as WordId[];
