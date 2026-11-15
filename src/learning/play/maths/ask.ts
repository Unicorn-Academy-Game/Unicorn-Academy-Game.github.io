import type { MathsLevel } from '../../../shared/play';
import type { ClipId } from '../../lines';
import { type Random, shuffled } from '../random';
import { numberClip } from './numbers';
import type { Choice, Question, StrandId, Visual } from './question';

/** One kind of sum: what its tile is called, and how it asks a question at each level. */
export interface StrandDef {
  readonly id: StrandId;
  readonly name: string;
  readonly ask: (level: MathsLevel, random: Random) => Question;
}

export const numberChoice = (value: number): Choice => ({
  visual: { kind: 'number', value },
  label: String(value),
  clips: [numberClip(value)],
});

/**
 * `count` different numbers from `low` to `high` with `answer` among them, in an order chosen by
 * `random`. The others are the ones in `likely` first, which are the slips a child makes (the
 * numbers added when they should have been taken, a digit the wrong way round), and then the
 * nearest to the answer on either side.
 */
function numberChoices(
  answer: number,
  count: number,
  [low, high]: readonly [number, number],
  random: Random,
  likely: readonly number[] = [],
): number[] {
  if (answer < low || answer > high || high - low + 1 < count)
    throw new RangeError(`${count} choices with ${answer} among them do not fit from ${low} to ${high}`);
  const others: number[] = [];
  const fits = (n: number): boolean =>
    Number.isInteger(n) && n >= low && n <= high && n !== answer && !others.includes(n);
  for (const n of shuffled([...new Set(likely)], random)) if (others.length < count - 1 && fits(n)) others.push(n);
  for (let spread = 1; others.length < count - 1; spread++) {
    for (const n of shuffled([answer - spread, answer + spread], random))
      if (others.length < count - 1 && fits(n)) others.push(n);
  }
  return shuffled([answer, ...others], random);
}

/** A question whose choices are numbers, one of which is the answer. */
export function numeric(
  base: { strand: StrandId; level: MathsLevel; prompt: string; say: readonly ClipId[]; show: Visual | null },
  answer: number,
  count: number,
  range: readonly [number, number],
  random: Random,
  likely: readonly number[] = [],
): Question {
  const values = numberChoices(answer, count, range, random, likely);
  return { ...base, choices: values.map(numberChoice), answer: values.indexOf(answer) };
}
