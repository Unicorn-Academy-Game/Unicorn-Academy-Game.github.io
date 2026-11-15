import { readWord, STAGE_COUNT, STAGES } from '../../content/reading';
import type { Chapter, Line } from '../../content/reading/types';
import { type LearnerProfile, withProgress } from '../../shared/profile';
import { READS_FROM } from '../book';
import { type Attempt, isClean, isNew, learn } from '../mastery';
import { chapterEndedBy, stageState, wordProgress } from './course';
import { progressOfItem, type ReadItem, stageOf, withItem } from './items';

/**
 * What the player earned by reading one thing. Everything the screen celebrates comes from here.
 */
export interface Reward {
  readonly item: ReadItem;
  /** The first time the player has been through it. */
  readonly fresh: boolean;
  /** Read with no help, and within the slips its level allows. */
  readonly clean: boolean;
  readonly level: { readonly before: number; readonly after: number };
  /**
   * A word the player now reads on their own: it has climbed to the level that says so, for the
   * first time.
   */
  readonly reads: boolean;
  /** The stage this finished off, when it did. */
  readonly cleared: number | null;
  /** The chapter that stage was the last of, when it was. */
  readonly chapter: Chapter | null;
  /** The last stage of the course is cleared. */
  readonly everything: boolean;
}

const WITHOUT_HELP: Attempt = { slips: 0, hints: 0 };

/**
 * A sentence read without help is a clean read of each of its words that the player has met, once
 * for each word however often it comes in the sentence. A word they have not met is left alone,
 * since the first time they meet a word is by its tiles. This is how the words they learned come
 * round again as they go on, in the sentences they are in, and why the course does not have to ask
 * for each of them again.
 */
function creditWords(profile: LearnerProfile, line: Line, now: number): LearnerProfile {
  let next = profile;
  for (const id of new Set(line.words)) {
    const word = readWord(id);
    const before = word && wordProgress(next, word);
    if (!word || before === undefined || before.done === 0) continue;
    next = withProgress(next, word.id, 'read', learn('read', before, WITHOUT_HELP, now, before.level));
  }
  return next;
}

/**
 * One thing was read. Returns what the player knows now and what the player earned, and changes
 * nothing else. A word or sentence that is new to them begins at the level of its offer, and `now`
 * is when it happened. A word that was told to them is a read that had help, since they were
 * through it to the end, and it comes back soon.
 */
export function finishItem(
  profile: LearnerProfile,
  item: ReadItem,
  attempt: Attempt,
  now: number,
): { profile: LearnerProfile; reward: Reward } {
  const before = progressOfItem(profile, item);
  const after = learn('read', before, attempt, now, item.level);
  const clean = isClean('read', before?.level ?? item.level, attempt);
  const read = withItem(profile, item, after);
  const next = item.kind === 'line' && clean ? creditWords(read, item.line, now) : read;
  const stage = STAGES[stageOf(item) - 1]!;
  const wasCleared = stageState(profile, stage).cleared;
  const cleared = !wasCleared && stageState(next, stage).cleared;
  return {
    profile: next,
    reward: {
      item,
      fresh: isNew(before),
      clean,
      level: { before: before?.level ?? item.level, after: after.level },
      reads: item.kind === 'word' && (before?.best ?? 0) < READS_FROM && after.best >= READS_FROM,
      cleared: cleared ? stage.n : null,
      chapter: cleared ? (chapterEndedBy(stage.n) ?? null) : null,
      everything: cleared && stage.n === STAGE_COUNT,
    },
  };
}
