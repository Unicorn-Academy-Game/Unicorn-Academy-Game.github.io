import {
  Floor,
  type LearnerProfile,
  MAX_FLOOR,
  PROFILE_VERSION,
  Progress,
  RECORD_SINCE,
  SENTENCE_PATTERN,
  SKILL_SINCE,
  SKILLS,
  type Skill,
  versionOf,
  WORD_PATTERN,
} from './learning';

/**
 * Reading, checking and merging a profile. It is in the shared layer because the Worker keeps a
 * copy of the book and merges into it with the same function the device uses, so the two cannot
 * disagree about what a merge is.
 *
 * A profile's version is the least one that can hold what is in it (see `versionOf`), so every
 * function here that makes a profile sets it from the words, and none of them can write a record
 * that an older copy of the game would damage.
 */

/**
 * What the player has learned, word by word and skill by skill. A plain value: every function here
 * returns a new one.
 */
export type { LearnerProfile };

/** The most words a profile will keep, so a record that grew wild cannot fill the device. */
export const MAX_WORDS = 2000;
/** The most sentences it will keep, which is more than twice what the reading course has. */
export const MAX_SENTENCES = 1000;

/**
 * A book with nothing in it. It has no sentences and no floor, so it is version 1, which every copy
 * of the game can read.
 */
export const emptyProfile = (): LearnerProfile => ({ schemaVersion: 1, words: {} });

export const progressOf = (profile: LearnerProfile, word: string, skill: Skill): Progress | undefined =>
  profile.words[word]?.[skill];

/** How well the player has read one sentence, by its id. */
export const sentenceProgress = (profile: LearnerProfile, id: string): Progress | undefined =>
  profile.sentences !== undefined && Object.hasOwn(profile.sentences, id) ? profile.sentences[id] : undefined;

/** The profile with one word's progress in one skill set to `progress`. */
export function withProgress(profile: LearnerProfile, word: string, skill: Skill, progress: Progress): LearnerProfile {
  return {
    ...profile,
    schemaVersion: Math.max(profile.schemaVersion, SKILL_SINCE[skill]) as LearnerProfile['schemaVersion'],
    words: { ...profile.words, [word]: { ...profile.words[word], [skill]: progress } },
  };
}

/**
 * The profile with one sentence's progress set to `progress`. The book is version 3 from here on,
 * so a copy of the game from before sentences leaves it alone.
 */
export function withSentence(profile: LearnerProfile, id: string, progress: Progress): LearnerProfile {
  return {
    ...profile,
    schemaVersion: Math.max(profile.schemaVersion, RECORD_SINCE.sentences) as LearnerProfile['schemaVersion'],
    sentences: { ...profile.sentences, [id]: progress },
  };
}

/**
 * The profile with the stage the player starts at raised to `stage`. It is only ever raised, so a
 * parent who has started them further on cannot be undone by a copy that was set up earlier, and a
 * stage is a whole number from 2: the first stage is where everyone starts, so it is no floor. A
 * stage that changes nothing gives the same profile back.
 */
export function raiseFloor(profile: LearnerProfile, stage: number): LearnerProfile {
  const to = Math.min(MAX_FLOOR, Math.floor(stage));
  // Written so that a stage that is not a number is not higher than anything, and a floor of 1
  // never gets in.
  if (!(to > (profile.floor ?? 1))) return profile;
  return {
    ...profile,
    schemaVersion: Math.max(profile.schemaVersion, RECORD_SINCE.floor) as LearnerProfile['schemaVersion'],
    floor: to,
  };
}

export interface Read {
  profile: LearnerProfile;
  /**
   * The record was written by a newer version of the game. It reads as empty, and nothing should
   * write over it.
   */
  newer: boolean;
  /**
   * How many things in the record could not be read and were left out. A record that was never
   * written has nothing to lose, so it is zero.
   */
  dropped: number;
}

const nothing = (): Read => ({ profile: emptyProfile(), newer: false, dropped: 0 });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Reads a stored profile as kindly as it can. A word or a skill that cannot be read is dropped and
 * the rest is kept, so one bad entry never costs the player the book, and the count of what was
 * dropped says whether the original is worth keeping. A record from a newer version reads as empty
 * and says so, so it can be left alone. Whatever version the record claims, the profile that comes
 * back has the version of what it holds.
 */
export function readProfile(raw: unknown): Read {
  if (raw === null || raw === undefined) return nothing();
  if (!isRecord(raw)) return { ...nothing(), dropped: 1 };
  const { schemaVersion, words } = raw;
  if (typeof schemaVersion === 'number' && schemaVersion > PROFILE_VERSION) return { ...nothing(), newer: true };
  if (!isRecord(words)) return { ...nothing(), dropped: 1 };
  const kept: Record<string, Partial<Record<Skill, Progress>>> = {};
  let count = 0;
  let dropped = 0;
  for (const [word, entry] of Object.entries(words)) {
    if (!WORD_PATTERN.test(word) || !isRecord(entry) || count >= MAX_WORDS) {
      dropped += 1;
      continue;
    }
    const skills: Partial<Record<Skill, Progress>> = {};
    let bad = 0;
    for (const skill of SKILLS) {
      if (entry[skill] === undefined) continue;
      const parsed = Progress.safeParse(entry[skill]);
      if (parsed.success) skills[skill] = parsed.data;
      else bad += 1;
    }
    if (Object.keys(skills).length === 0) dropped += Math.max(bad, 1);
    else {
      kept[word] = skills;
      count += 1;
      dropped += bad;
    }
  }
  const more = readRecords(raw);
  dropped += more.dropped;
  return {
    profile: {
      schemaVersion: versionOf(kept, more),
      words: kept,
      ...(more.sentences ? { sentences: more.sentences } : {}),
      ...(more.floor !== undefined ? { floor: more.floor } : {}),
    },
    newer: false,
    dropped,
  };
}

/**
 * The sentences and the floor of a stored record, one by one, as kindly as the words are read.
 * Neither is there when there is nothing to keep.
 */
function readRecords(raw: Record<string, unknown>): {
  sentences?: Record<string, Progress>;
  floor?: number;
  dropped: number;
} {
  let dropped = 0;
  let sentences: Record<string, Progress> | undefined;
  if (raw.sentences !== undefined) {
    if (!isRecord(raw.sentences)) dropped += 1;
    else {
      const kept: Record<string, Progress> = {};
      let count = 0;
      for (const [id, entry] of Object.entries(raw.sentences)) {
        const parsed = SENTENCE_PATTERN.test(id) && count < MAX_SENTENCES ? Progress.safeParse(entry) : null;
        if (parsed?.success) {
          kept[id] = parsed.data;
          count += 1;
        } else dropped += 1;
      }
      if (count > 0) sentences = kept;
    }
  }
  let floor: number | undefined;
  if (raw.floor !== undefined) {
    const parsed = Floor.safeParse(raw.floor);
    if (parsed.success) floor = parsed.data;
    else dropped += 1;
  }
  return { ...(sentences ? { sentences } : {}), ...(floor !== undefined ? { floor } : {}), dropped };
}

const sameProgress = (a: Progress, b: Progress): boolean =>
  (Object.keys(a) as (keyof Progress)[]).every((key) => a[key] === b[key]);

const NONE: Readonly<Record<string, Progress>> = {};

function sameSentences(a: LearnerProfile, b: LearnerProfile): boolean {
  const ids = Object.keys(a.sentences ?? NONE);
  if (ids.length !== Object.keys(b.sentences ?? NONE).length) return false;
  return ids.every((id) => {
    const x = sentenceProgress(a, id);
    const y = sentenceProgress(b, id);
    return x !== undefined && y !== undefined && sameProgress(x, y);
  });
}

/**
 * Whether two profiles hold the same progress, word for word and star for star, and the same
 * sentences and the same floor.
 */
export function sameProfile(a: LearnerProfile, b: LearnerProfile): boolean {
  if (a === b) return true;
  if ((a.floor ?? 0) !== (b.floor ?? 0) || !sameSentences(a, b)) return false;
  const words = Object.keys(a.words);
  if (words.length !== Object.keys(b.words).length) return false;
  return words.every((word) =>
    SKILLS.every((skill) => {
      const x = a.words[word]?.[skill];
      const y = b.words[word]?.[skill];
      return x === y || (x !== undefined && y !== undefined && sameProgress(x, y));
    }),
  );
}

/**
 * Which of two records of one word is the later one. Ties are broken by fields that cannot tie
 * across two different records, so the choice is the same whichever way round they are given.
 */
function later(a: Progress, b: Progress): Progress {
  const order = (p: Progress): readonly number[] => [p.last, p.level, p.streak, p.due, p.struggles, p.done];
  const x = order(a);
  const y = order(b);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i]! > y[i]! ? a : b;
  return a;
}

/**
 * Two records of one word, from two copies of the profile: the counters and the best take the
 * larger, and the state is the later one's.
 */
export function mergeProgress(a: Progress, b: Progress): Progress {
  return {
    ...later(a, b),
    best: Math.max(a.best, b.best),
    done: Math.max(a.done, b.done),
    clean: Math.max(a.clean, b.clean),
    slips: Math.max(a.slips, b.slips),
    first: Math.min(a.first, b.first),
    last: Math.max(a.last, b.last),
  };
}

/**
 * Two copies of a profile, for putting devices together. It never loses a word, a sentence or a
 * star, the stage the player starts at is the higher of the two, and it gives the same answer in
 * either order, so a copy can be merged again and again.
 */
export function mergeProfiles(a: LearnerProfile, b: LearnerProfile): LearnerProfile {
  const words: Record<string, Partial<Record<Skill, Progress>>> = {};
  for (const word of new Set([...Object.keys(a.words), ...Object.keys(b.words)])) {
    const skills: Partial<Record<Skill, Progress>> = {};
    for (const skill of SKILLS) {
      const x = a.words[word]?.[skill];
      const y = b.words[word]?.[skill];
      const merged = x && y ? mergeProgress(x, y) : (x ?? y);
      if (merged) skills[skill] = merged;
    }
    if (Object.keys(skills).length > 0) words[word] = skills;
  }
  const sentences: Record<string, Progress> = {};
  for (const id of new Set([...Object.keys(a.sentences ?? NONE), ...Object.keys(b.sentences ?? NONE)])) {
    const x = sentenceProgress(a, id);
    const y = sentenceProgress(b, id);
    const merged = x && y ? mergeProgress(x, y) : (x ?? y);
    if (merged) sentences[id] = merged;
  }
  const floor = Math.max(a.floor ?? 0, b.floor ?? 0) || undefined;
  const records = { sentences: Object.keys(sentences).length > 0 ? sentences : undefined, floor };
  return {
    schemaVersion: versionOf(words, records),
    words,
    ...(records.sentences ? { sentences: records.sentences } : {}),
    ...(floor !== undefined ? { floor } : {}),
  };
}
