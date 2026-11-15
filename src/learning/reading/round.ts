import { STAGES } from '../../content/reading';
import { SUPPORT_WORDS } from '../../content/reading/rules';
import type { Line } from '../../content/reading/types';
import type { Progress } from '../../shared/learning';
import type { LearnerProfile } from '../../shared/profile';
import { isNew } from '../mastery';
import { currentStage, lineProgress, type StageState, stageState, wordProgress, wordsOf } from './course';
import { idOf, keyOf, lineItem, type ReadItem, wordItem } from './items';

/**
 * A round is seven things to read, the way the rainbow has seven bands: one band fills for each. It
 * is words and then whole sentences made of them, so the last bands are the sentences.
 *
 * 1. A word the player knows that is due, to begin with something they can do. It is one from an
 *    earlier stage when there is one, the best known of them, so what they learned a while ago
 *    comes round again while they go on.
 * 2. New words of the stage the player is on, and words that were read lately and are due again.
 *    They come in an order that looks like chance and is not (`scrambled`), so the words are not
 *    always met in the order the stage teaches them.
 * 3. Sentences, which come last: up to three, made of the words the player has read or is about to
 *    read in this round. A sentence with none they have not met comes before one with a word they
 *    have not met.
 *
 * Each of these has its share of the seven and no more, and what one does not use the others fill.
 * A round is never fewer than seven and never has one thing twice.
 */
export const ROUND_SIZE = 7;
/** The most sentences a round brings. */
export const SENTENCES = 3;
/**
 * The new words a round keeps a place for, whatever the sentences and the words that are due would
 * take.
 */
const MIN_NEWS = 2;
/**
 * The share of a stage's words that the player has met before its sentences begin, so a sentence is
 * never the first thing of a stage.
 */
export const UNLOCK = 0.5;

/**
 * How fast a stage goes, by how they have been reading it. A child who has needed help with the
 * words they met is given one fewer new word and a place for one more to go over, and every other
 * child has the usual round. The pace is the most new words a round brings, and how many words that
 * are due again it keeps a place for.
 */
export const PACES = {
  slow: { news: 3, reviews: 2 },
  usual: { news: 4, reviews: 1 },
} as const;
export type Pace = keyof typeof PACES;

/** How many words of a stage the player has to have met before it is told how they read them. */
export const PACE_AFTER = 4;
/**
 * The share of the words the player has met that they have read without help, below which they are
 * given the slow pace.
 */
export const SLOW_SHARE = 0.65;

export function paceOf(state: StageState): Pace {
  return state.met >= PACE_AFTER && state.clean / state.met < SLOW_SHARE ? 'slow' : 'usual';
}

interface Tried {
  readonly item: ReadItem;
  readonly progress: Progress;
  readonly stage: number;
}

/** Everything the player has been through to the end, in any stage. */
function triedBy(profile: LearnerProfile): Tried[] {
  const found: Tried[] = [];
  for (const stage of STAGES) {
    for (const word of wordsOf(stage)) {
      const progress = wordProgress(profile, word);
      if (progress !== undefined && progress.done > 0)
        found.push({ item: wordItem(word, progress), progress, stage: stage.n });
    }
    for (const line of stage.lines) {
      const progress = lineProgress(profile, line);
      if (progress !== undefined && progress.done > 0)
        found.push({ item: lineItem(line, progress), progress, stage: stage.n });
    }
  }
  return found;
}

const byName = (a: Tried, b: Tried): number => idOf(a.item).localeCompare(idOf(b.item));

/** A number made from a text, the same every time (FNV-1a). */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

/**
 * The words in an order that looks like chance and is not: it depends on the stage and on how much
 * the player has read, so every round has its own order, and the same book gives the same one,
 * which a round left half done needs.
 */
const scrambled = (items: readonly ReadItem[], seed: string): ReadItem[] =>
  items
    .map((item) => ({ item, key: hash(`${seed}:${keyOf(item)}`) }))
    .sort((a, b) => a.key - b.key || keyOf(a.item).localeCompare(keyOf(b.item)))
    .map(({ item }) => item);

/**
 * The round to read, for a stage: the one the player is on, or one they picked from the map.
 * Nothing in it is chosen by chance, so the same book at the same moment gives the same round, and
 * a round that is left half done is the same round when they come back to it.
 */
export function planRound(profile: LearnerProfile, now: number, focus: number = currentStage(profile)): ReadItem[] {
  const stage = STAGES[focus - 1];
  if (!stage) throw new RangeError(`there is no reading stage ${focus}`);
  const state = stageState(profile, stage);
  const pace = PACES[paceOf(state)];
  // What is read in a round is the stage in front of the player and the ones before it, never a
  // stage they have not come to.
  const tried = triedBy(profile).filter((t) => t.stage <= focus);
  // The oldest due first, and the stage the player is on before the others.
  const due = tried
    .filter((t) => t.progress.due <= now)
    .sort(
      (a, b) =>
        Number(a.stage !== focus) - Number(b.stage !== focus) ||
        a.progress.due - b.progress.due ||
        a.stage - b.stage ||
        byName(a, b),
    );
  const freshWords = wordsOf(stage)
    .filter((word) => isNew(wordProgress(profile, word)))
    .map((word) => wordItem(word, undefined));
  // The words a sentence may use without being new to the player: those they have read, and those
  // this round brings.
  const readNow = new Set([...tried.filter((t) => t.item.kind === 'word').map((t) => idOf(t.item)), ...SUPPORT_WORDS]);
  const readable = new Set([...readNow, ...freshWords.slice(0, pace.news).map(idOf)]);
  const unmet = (words: readonly string[]): number => words.filter((word) => !readable.has(word)).length;
  // Shortest first is kept among sentences that have as many words the player has not met, since
  // the sort is stable.
  const freshLines = stage.lines
    .filter((line) => isNew(lineProgress(profile, line)))
    .sort((a, b) => unmet(a.words) - unmet(b.words))
    .map((line) => lineItem(line, undefined));

  const chosen = new Set<string>();
  const warm: ReadItem[] = [];
  const news: ReadItem[] = [];
  const reviews: ReadItem[] = [];
  const more: ReadItem[] = [];
  const lines: ReadItem[] = [];
  const size = (): number => warm.length + news.length + reviews.length + more.length + lines.length;
  const take = (item: ReadItem, into: ReadItem[]): void => {
    if (size() >= ROUND_SIZE || chosen.has(keyOf(item))) return;
    chosen.add(keyOf(item));
    into.push(item);
  };
  /**
   * Takes from a list until the round is full, and puts a sentence with the sentences and a word
   * with the words.
   */
  const fill = (items: readonly ReadItem[]): void => {
    for (const item of items) take(item, item.kind === 'line' ? lines : more);
  };

  // A word the player knows to begin with: the best known of the earlier stages that is due, or
  // else the oldest due of this one.
  const known = due.filter((t) => t.item.kind === 'word' && t.progress.level >= 1);
  const older = known
    .filter((t) => t.stage < focus)
    .sort(
      (a, b) =>
        b.progress.level - a.progress.level || a.progress.due - b.progress.due || a.stage - b.stage || byName(a, b),
    );
  const warmUp = older[0] ?? known[0];
  if (warmUp) take(warmUp.item, warm);
  // The words that are due again keep their places, and then the sentences, and then the new words
  // have what is left up to their pace.
  const dueWords = due.filter((t) => t.item.kind === 'word');
  for (const t of dueWords) if (reviews.length < pace.reviews) take(t.item, reviews);
  const dueLine = due.find((t) => t.item.kind === 'line');
  if (dueLine) take(dueLine.item, lines);

  // The sentences have up to three places, and the new words keep two of the seven. A stage whose
  // sentences cannot open this round keeps no places for them, so its new words have the whole of
  // their pace.
  const reachable = state.words === 0 || (state.met + Math.min(pace.news, freshWords.length)) / state.words >= UNLOCK;
  const places = reachable
    ? Math.min(
        SENTENCES,
        Math.max(0, ROUND_SIZE - warm.length - reviews.length - Math.min(MIN_NEWS, freshWords.length)),
      )
    : 0;
  const newSlots = Math.min(pace.news, freshWords.length, ROUND_SIZE - warm.length - reviews.length - places);
  // Sentences begin once the player has met half of the stage's words, counting the new words this
  // round would bring.
  const unlocked = state.words === 0 || (state.met + newSlots) / state.words >= UNLOCK;
  // The sentences are picked first, as the ones that need the fewest new words together, and then
  // the new words are the ones they need. So the words of a round are the words its sentences are
  // made of.
  const ofStage = new Set(wordsOf(stage).map((word) => word.id));
  const needed = new Set<string>();
  if (unlocked) {
    const needs = (line: Line): string[] => line.words.filter((word) => ofStage.has(word) && !readNow.has(word));
    const left = freshLines
      .map((item) => (item.kind === 'line' ? item : undefined))
      .filter((item): item is Extract<ReadItem, { kind: 'line' }> => item !== undefined);
    const picked: ReadItem[] = [];
    while (lines.length + picked.length < places) {
      let best: (typeof left)[number] | undefined;
      let cost = Infinity;
      for (const item of left) {
        const extra = needs(item.line).filter((word) => !needed.has(word)).length;
        if (needed.size + extra <= newSlots && extra < cost) [best, cost] = [item, extra];
      }
      if (!best) break;
      for (const word of needs(best.line)) needed.add(word);
      left.splice(left.indexOf(best), 1);
      picked.push(best);
    }
    // They are read shortest first, as the stage has them.
    const order = new Map(stage.lines.map((line, n) => [line.id, n]));
    for (const item of picked.sort((a, b) =>
      a.kind === 'line' && b.kind === 'line' ? order.get(a.line.id)! - order.get(b.line.id)! : 0,
    ))
      take(item, lines);
    for (const line of freshLines) if (lines.length < places) take(line, lines);
  }
  for (const word of freshWords) if (news.length < newSlots && needed.has(idOf(word))) take(word, news);
  for (const word of freshWords) if (news.length < newSlots) take(word, news);

  // Whatever is still missing. What is due, then more new words, then more new sentences, then what
  // the player knows least well, whether or not it is due.
  fill(due.map((t) => t.item));
  fill(freshWords);
  if (unlocked) fill(freshLines);
  fill(
    [...tried]
      .sort(
        (a, b) =>
          Number(a.stage !== focus) - Number(b.stage !== focus) ||
          a.progress.level - b.progress.level ||
          a.progress.last - b.progress.last ||
          byName(a, b),
      )
      .map((t) => t.item),
  );
  const seed = `${stage.n}:${tried.reduce((sum, t) => sum + t.progress.done, 0)}`;
  const words = scrambled([...news, ...reviews, ...more], seed);
  // The first thing is a word the player knows or a new one, never one that the player has only
  // just met and is going over.
  if (warm.length === 0 && words[0]?.kind === 'word' && words[0].review) {
    const fresh = words.findIndex((item) => item.kind === 'word' && !item.review);
    if (fresh > 0) words.unshift(...words.splice(fresh, 1));
  }
  return [...warm, ...words, ...lines];
}
