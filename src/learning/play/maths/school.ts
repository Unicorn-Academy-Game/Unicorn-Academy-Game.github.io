import type { MathsLevel } from '../../../shared/play';
import { between, pick, type Random } from '../random';
import { numeric, type StrandDef } from './ask';
import { OPERATION, PHRASES, phraseClip } from './clips';
import { numberClip } from './numbers';
import type { Op, Question, StrandId, Visual } from './question';

/**
 * The kinds of sum of Level 1, which are the sums a child does at school: adding and taking away
 * past twenty, the times tables, sharing, and sums with more than one step, like 2 + 7 - 3. They
 * are written out as a school writes them and said in words, with no pictures, since a child at
 * school is reading the sum and not counting it out. Every number stays within a hundred, which the
 * voice can say.
 */

/**
 * What a run of numbers and operations comes to, with times and divided by done first, the way it
 * is taught.
 */
export function evaluate(terms: readonly number[], ops: readonly Op[]): number {
  // A sum is runs of times and divided by joined by plus and take away, so each run is worked out
  // first and the runs are joined from the left.
  const runs = [terms[0]!];
  const signs: ('+' | '-')[] = [];
  ops.forEach((op, at) => {
    const term = terms[at + 1]!;
    if (op === '+' || op === '-') {
      signs.push(op);
      runs.push(term);
    } else {
      const run = runs[runs.length - 1]!;
      runs[runs.length - 1] = op === '*' ? run * term : run / term;
    }
  });
  return signs.reduce((total, sign, at) => (sign === '+' ? total + runs[at + 1]! : total - runs[at + 1]!), runs[0]!);
}

/** The whole numbers from `low` to `high`, both included, that pass `keep`. */
const numbers = (low: number, high: number, keep: (n: number) => boolean = () => true): number[] =>
  Array.from({ length: Math.max(0, high - low + 1) }, (_, i) => low + i).filter(keep);

/**
 * One of the numbers from `low` to `high` that pass `keep`. A range with none is a mistake in a
 * rule, and it says so.
 */
function anyOf(low: number, high: number, keep: (n: number) => boolean, random: Random): number {
  const found = numbers(low, high, keep);
  if (found.length === 0) throw new RangeError(`there is no number from ${low} to ${high} that fits`);
  return pick(found, random);
}

const inTens = (n: number): boolean => n % 10 === 0;
const notInTens = (n: number): boolean => n % 10 !== 0;
const ones = (n: number): number => n % 10;
const tens = (n: number): number => Math.floor(n / 10);

/**
 * A two-digit number with its digits the wrong way round, which is how a number is misread. Any
 * other number is left as it is.
 */
const turned = (n: number): number => (n >= 10 && n < 100 && notInTens(n) ? 10 * ones(n) + tens(n) : n);

/**
 * The slips at a sum in the tens: a ten too many or too few, one too many or too few, and the
 * digits the wrong way round.
 */
const offBy = (answer: number): number[] => [answer + 10, answer - 10, answer + 1, answer - 1, turned(answer)];

/**
 * A question that asks what some numbers and operations come to. The card says it in the words the
 * voice says it in, and what is shown is the sum written out. The slips in `likely` are what a
 * child tends to answer when they are not right.
 */
function expression(
  strand: StrandId,
  level: MathsLevel,
  terms: readonly number[],
  ops: readonly Op[],
  range: readonly [number, number],
  likely: readonly number[],
  random: Random,
): Question {
  const text = terms.map((term, at) => (at === 0 ? `${term}` : `${OPERATION[ops[at - 1]!].text} ${term}`)).join(' ');
  const said = terms.flatMap((term, at) => {
    const number = numberClip(term, at === terms.length - 1 ? 'last' : 'lead');
    return at === 0 ? [number] : [OPERATION[ops[at - 1]!].clip, number];
  });
  const show: Visual = { kind: 'expression', terms, ops };
  const base = { strand, level, prompt: `${PHRASES['what-is']} ${text}?`, say: [phraseClip('what-is'), ...said], show };
  return numeric(base, evaluate(terms, ops), 4, range, random, likely);
}

function askPlus(level: MathsLevel, random: Random): Question {
  let a: number;
  let b: number;
  if (level === 1) {
    if (random() < 0.5) {
      // Tens added to a number: 34 + 20.
      a = anyOf(11, 79, notInTens, random);
      b = anyOf(10, 99 - a, inTens, random);
    } else {
      // Ones added to a number without the ones going over ten: 34 + 5.
      a = anyOf(11, 98, (n) => notInTens(n) && ones(n) <= 8, random);
      b = anyOf(1, 9 - ones(a), () => true, random);
    }
  } else if (level === 2) {
    // Ones added to a number so that the ones go over ten: 27 + 6.
    a = anyOf(11, 89, notInTens, random);
    b = anyOf(2, 9, (n) => ones(a) + n >= 10, random);
  } else {
    // Two numbers of two digits, with a ten to carry or without: 38 + 27.
    a = anyOf(11, 89, notInTens, random);
    b = anyOf(11, 100 - a, notInTens, random);
  }
  return expression('plus', level, [a, b], ['+'], [0, 100], offBy(a + b), random);
}

function askMinus(level: MathsLevel, random: Random): Question {
  let a: number;
  let b: number;
  if (level === 1) {
    if (random() < 0.5) {
      // Tens taken from a number: 74 - 30.
      a = anyOf(21, 99, notInTens, random);
      b = anyOf(10, a - 1, inTens, random);
    } else {
      // Ones taken from a number that has that many ones, so no ten is broken: 47 - 5.
      a = anyOf(12, 99, (n) => ones(n) >= 2, random);
      b = anyOf(1, ones(a), () => true, random);
    }
  } else if (level === 2) {
    // Ones taken from a number that has fewer, so a ten is broken: 52 - 8, and 60 - 7.
    a = anyOf(21, 98, (n) => ones(n) <= 8, random);
    b = anyOf(ones(a) + 1, 9, () => true, random);
  } else {
    // A number of two digits taken from a bigger one: 63 - 27.
    a = anyOf(22, 99, () => true, random);
    b = anyOf(11, a - 1, notInTens, random);
  }
  const answer = a - b;
  // The slip that is a child's own is to take the smaller digit from the bigger in each place,
  // whichever is on top.
  const digits = 10 * (tens(a) - tens(b)) + Math.abs(ones(a) - ones(b));
  return expression('minus', level, [a, b], ['-'], [0, 100], [...offBy(answer), digits, a + b], random);
}

/**
 * The tables a level is about, and the ones the player has had before it. A level asks about its
 * own most of the time.
 */
const NEW_TABLES: Readonly<Record<MathsLevel, readonly number[]>> = { 1: [2, 5, 10], 2: [3, 4], 3: [6, 7, 8, 9] };
const OLD_TABLES: Readonly<Record<MathsLevel, readonly number[]>> = {
  1: [2, 5, 10],
  2: [2, 5, 10],
  3: [2, 3, 4, 5, 10],
};
const NEW_TABLE_SHARE = 0.6;

const table = (level: MathsLevel, random: Random): number =>
  pick(random() < NEW_TABLE_SHARE ? NEW_TABLES[level] : OLD_TABLES[level], random);

function askTimes(level: MathsLevel, random: Random): Question {
  const t = table(level, random);
  const n = between(2, 10, random);
  const [a, b]: [number, number] = random() < 0.5 ? [t, n] : [n, t];
  const answer = t * n;
  // The slips are one group too many or too few, and the two numbers added instead of times.
  return expression(
    'times',
    level,
    [a, b],
    ['*'],
    [0, 100],
    [answer + t, answer - t, answer + n, answer - n, t + n],
    random,
  );
}

function askShare(level: MathsLevel, random: Random): Question {
  const by = table(level, random);
  const answer = between(2, 10, random);
  // The slips are the number the player divides by, which is in the table too, and the numbers near
  // the answer.
  return expression(
    'share',
    level,
    [by * answer, by],
    ['/'],
    [1, 12],
    [by, answer + 1, answer - 1, answer + 2, answer - 2],
    random,
  );
}

interface Chain {
  readonly terms: number[];
  readonly ops: Op[];
}

/**
 * Numbers joined by plus and take away that never go below one or above `top` on the way, as a
 * child who works from the left keeps them in their head: 2 + 7 - 3 goes to 9 and then to 6. The
 * first number is within `first` and every number after it is within `rest`.
 */
function plusAndMinus(
  count: number,
  top: number,
  first: readonly [number, number],
  rest: readonly [number, number],
  random: Random,
): Chain {
  const terms = [between(first[0], first[1], random)];
  const ops: Op[] = [];
  let value = terms[0]!;
  while (terms.length < count) {
    const canAdd = top - value >= rest[0];
    const canTake = value - 1 >= rest[0];
    const op: Op = canAdd && (!canTake || random() < 0.5) ? '+' : '-';
    const term = between(rest[0], Math.min(rest[1], op === '+' ? top - value : value - 1), random);
    terms.push(term);
    ops.push(op);
    value += op === '+' ? term : -term;
  }
  return { terms, ops };
}

/**
 * Times with a number added or taken away after it: 4 x 6 + 5. The times is always the first step,
 * so worked from the left or with the times first the answer is the same, and a child who has not
 * met the order of working is never marked wrong for it.
 */
function productAndRest(random: Random): Chain {
  const a = pick([3, 4, 5, 6, 7, 10], random);
  const b = between(3, 10, random);
  const product = a * b;
  const add = product <= 80 && random() < 0.5;
  const c = between(2, Math.min(20, add ? 100 - product : product - 1), random);
  return { terms: [a, b, c], ops: ['*', add ? '+' : '-'] };
}

function askMixed(level: MathsLevel, random: Random): Question {
  const { terms, ops } =
    level === 1
      ? plusAndMinus(3, 10, [2, 9], [2, 9], random)
      : level === 2
        ? plusAndMinus(3, 20, [8, 15], [3, 12], random)
        : random() < 0.5
          ? plusAndMinus(4, 50, [10, 25], [3, 25], random)
          : productAndRest(random);
  const answer = evaluate(terms, ops);
  const top = level === 1 ? 12 : level === 2 ? 22 : 100;
  // The slips are the same sum with one sign the other way round, what it came to when a step was
  // left out, and the numbers next to the answer.
  const opposite = (op: Op): Op => (op === '-' ? '+' : op === '+' ? '-' : '+');
  const signs = ops.map((_, at) =>
    evaluate(
      terms,
      ops.map((op, i) => (i === at ? opposite(op) : op)),
    ),
  );
  const soFar = evaluate(terms.slice(0, 2), ops.slice(0, 1));
  return expression('mixed', level, terms, ops, [0, top], [...signs, soFar, answer + 1, answer - 1], random);
}

export const SCHOOL: readonly StrandDef[] = [
  { id: 'plus', name: 'Adding up', ask: askPlus },
  { id: 'minus', name: 'Subtracting', ask: askMinus },
  { id: 'times', name: 'Times tables', ask: askTimes },
  { id: 'share', name: 'Dividing', ask: askShare },
  { id: 'mixed', name: 'Mixed sums', ask: askMixed },
];
