import type { MathsLevel, PlayRecord } from '../../../shared/play';
import type { Random } from '../random';
import { FAMILIES, type Family, type Question, type StrandId } from './question';
import { ask } from './strands';

/**
 * A round of the maths game, with no screen and no clock. A round is five questions of one kind at
 * one level. A question has one right choice. A choice that is not the right one rests, with
 * nothing said about it, and the player tries another. After two rests the right choice shines. A
 * question counts as clean when the first choice they touched was the right one, and a round that
 * is finished earns stars by how many were clean. The player never goes down a level, and they go
 * up after a round with at most one question that was not clean.
 */

export const ROUND_LENGTH = 5;
/** The least clean questions in a round that take the player up a level. */
export const CLEAN_TO_LEVEL_UP = 4;
/** The least clean questions in a round that earn two stars. */
const CLEAN_FOR_TWO_STARS = 3;
/** How many choices may rest in one question before the right one shines. */
export const RESTS_TO_HINT = 2;

export interface Round {
  readonly strand: StrandId;
  readonly level: MathsLevel;
  /** Which question this is, from 0. */
  readonly index: number;
  readonly question: Question;
  /** What every question so far was, so that a round never asks the same thing twice. */
  readonly asked: readonly string[];
  /** The choices of this question that were touched and were not right. */
  readonly rested: readonly number[];
  /** Whether the right choice of this question has been touched. */
  readonly solved: boolean;
  /** How many questions so far were clean. */
  readonly clean: number;
}

/**
 * What a question comes to for the purpose of not asking it twice: what is asked and what is shown,
 * or the choices when nothing is shown.
 */
const keyOf = (q: Question): string =>
  JSON.stringify([q.prompt, q.show, q.show ? null : q.choices.map((c) => c.label).sort()]);

/**
 * A question of the round's kind and level that it has not asked, or one that it has when it cannot
 * find another.
 */
function fresh(strand: StrandId, level: MathsLevel, asked: readonly string[], random: Random): Question {
  let question = ask(strand, level, random);
  for (let tries = 0; tries < 25 && asked.includes(keyOf(question)); tries++) question = ask(strand, level, random);
  return question;
}

export function begin(strand: StrandId, level: MathsLevel, random: Random): Round {
  const question = fresh(strand, level, [], random);
  return { strand, level, index: 0, question, asked: [keyOf(question)], rested: [], solved: false, clean: 0 };
}

/**
 * What touching a choice came to: nothing (it was already touched, or the question is solved, or it
 * is not there), the right one, or one that rests.
 */
export type Chosen = 'ignored' | 'right' | 'rest';

export function choose(round: Round, at: number): { round: Round; result: Chosen } {
  const { question, rested } = round;
  if (round.solved || !Number.isInteger(at) || at < 0 || at >= question.choices.length || rested.includes(at))
    return { round, result: 'ignored' };
  if (at !== question.answer) return { round: { ...round, rested: [...rested, at] }, result: 'rest' };
  return { round: { ...round, solved: true, clean: round.clean + (rested.length === 0 ? 1 : 0) }, result: 'right' };
}

/** Whether the right choice should shine, because the player has tried enough others. */
export const hinted = (round: Round): boolean => !round.solved && round.rested.length >= RESTS_TO_HINT;

/** Whether the round is over: the last question is solved. */
export const finished = (round: Round): boolean => round.solved && round.index === ROUND_LENGTH - 1;

/**
 * The next question of the round, once this one is solved. A round that is not ready to go on is
 * the round it was.
 */
export function next(round: Round, random: Random): Round {
  if (!round.solved || round.index >= ROUND_LENGTH - 1) return round;
  const question = fresh(round.strand, round.level, round.asked, random);
  return {
    ...round,
    index: round.index + 1,
    question,
    asked: [...round.asked, keyOf(question)],
    rested: [],
    solved: false,
  };
}

/**
 * The stars a round earns. Every round that is finished is one star, three when every question was
 * clean, and two when most were.
 */
export function starsFor(clean: number): 1 | 2 | 3 {
  if (clean >= ROUND_LENGTH) return 3;
  if (clean >= CLEAN_FOR_TWO_STARS) return 2;
  return 1;
}

export const levelAfter = (level: MathsLevel, clean: number): MathsLevel =>
  clean >= CLEAN_TO_LEVEL_UP && level < 3 ? ((level + 1) as MathsLevel) : level;

/** The level the player plays this kind of sum at: the one they have reached, or the first. */
export const levelOf = (play: PlayRecord, strand: StrandId): MathsLevel => play.maths.strands[strand]?.level ?? 1;

/**
 * The family of levels the player has got furthest in, which is the one the table opens on: Level 0
 * until they have finished a round of Level 1.
 */
export const familyReached = (play: PlayRecord): Family =>
  FAMILIES.reduce<Family>(
    (reached, family) =>
      family.strands.some((strand) => (play.maths.strands[strand]?.rounds ?? 0) > 0) ? family.level : reached,
    0,
  );

/** The record with a round finished at `level` with `clean` clean questions added. */
export function withRound(play: PlayRecord, strand: StrandId, level: MathsLevel, clean: number): PlayRecord {
  const before = play.maths.strands[strand];
  return {
    ...play,
    maths: {
      played: play.maths.played + 1,
      strands: {
        ...play.maths.strands,
        [strand]: {
          level: Math.max(before?.level ?? 1, levelAfter(level, clean)) as MathsLevel,
          rounds: (before?.rounds ?? 0) + 1,
          flawless: (before?.flawless ?? 0) + (clean >= ROUND_LENGTH ? 1 : 0),
        },
      },
    },
  };
}
