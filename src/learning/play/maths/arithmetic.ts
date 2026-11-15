import type { MathsLevel } from '../../../shared/play';
import { between, pick, type Random } from '../random';
import { numeric, type StrandDef } from './ask';
import { OPERATION, PHRASES, phraseClip, TERMS, termClip } from './clips';
import { COUNTABLES } from './counting';
import { numberClip } from './numbers';
import type { Question, Visual } from './question';

/** The most a sum may come to at each level: a hand, two hands, and past ten. */
const SUM_TOP: Readonly<Record<MathsLevel, number>> = { 1: 5, 2: 10, 3: 20 };

function sumQuestion(
  level: MathsLevel,
  a: number,
  op: '+' | '-',
  b: number,
  answer: number,
  range: readonly [number, number],
  random: Random,
): Question {
  // The first level shows the things that are put together or taken away, so that a sum can be
  // counted out.
  const word = level === 1 ? pick(COUNTABLES, random) : null;
  const base = {
    strand: op === '+' ? 'add' : 'take',
    level,
    prompt: `${PHRASES['what-is']} ${a} ${OPERATION[op].text} ${b}?`,
    say: [phraseClip('what-is'), numberClip(a, 'lead'), OPERATION[op].clip, numberClip(b, 'last')],
    show: { kind: 'sum', a, op, b, word } satisfies Visual,
  } as const;
  // The slips are the other sum of the same two numbers, and the number either side of the answer.
  const likely = op === '+' ? [Math.abs(a - b), answer + 1, answer - 1] : [a + b, answer + 1, answer - 1];
  return numeric(base, answer, level === 1 ? 3 : 4, range, random, likely);
}

function askAdd(level: MathsLevel, random: Random): Question {
  const top = SUM_TOP[level];
  // Past ten both numbers are big enough that it is not just counting on from one.
  const least = level === 3 ? 3 : 1;
  const a = between(least, level === 3 ? 14 : top - 1, random);
  const b = between(Math.max(least, level === 3 ? 11 - a : 1), top - a, random);
  return sumQuestion(level, a, '+', b, a + b, [1, top + 2], random);
}

function askTake(level: MathsLevel, random: Random): Question {
  const top = SUM_TOP[level];
  const a = level === 1 ? between(2, top, random) : level === 2 ? between(3, top, random) : between(11, top, random);
  // Taking everything away leaves nothing, which the player meets from the second level.
  const b = level === 1 ? between(1, a - 1, random) : level === 2 ? between(1, a, random) : between(2, 9, random);
  return sumQuestion(level, a, '-', b, a - b, [0, top + 2], random);
}

function askDouble(level: MathsLevel, random: Random): Question {
  const halves = level === 3;
  const n = halves ? 2 * between(1, 10, random) : level === 1 ? between(1, 5, random) : between(2, 10, random);
  const answer = halves ? n / 2 : 2 * n;
  const word = pick(COUNTABLES, random);
  // A heap to count, or to share, is shown for the first doubles and the halves. The bigger doubles
  // are for knowing.
  const show: Visual = halves
    ? { kind: 'things', word, count: n }
    : level === 1
      ? { kind: 'twice', word, count: n }
      : { kind: 'words', text: `${TERMS.double} ${n}` };
  const base = {
    strand: 'double',
    level,
    prompt: `${PHRASES['what-is']} ${halves ? PHRASES['half-of'] : TERMS.double} ${n}?`,
    say: [phraseClip('what-is'), halves ? phraseClip('half-of') : termClip('double'), numberClip(n, 'last')],
    show,
  } as const;
  // The slip is the number itself, which is neither the double nor the half.
  return numeric(
    base,
    answer,
    4,
    halves ? [1, 12] : [1, 22],
    random,
    halves ? [n, answer + 1, answer - 1] : [n, answer + 2, answer - 2],
  );
}

function askTens(level: MathsLevel, random: Random): Question {
  const tens = level === 1 ? 1 : level === 2 ? between(1, 5, random) : between(2, 9, random);
  const ones = level === 1 ? between(1, 9, random) : level === 2 ? between(0, 9, random) : between(2, 9, random);
  const answer = 10 * tens + ones;
  // The slips are the digits the wrong way round, the tens alone, the ones alone, the two digits
  // added, and a ten more or less.
  const likely = [10 * ones + tens, 10 * tens, ones, tens + ones, answer + 10, answer - 10].filter((n) => n > 0);
  const range: readonly [number, number] = level === 1 ? [1, 20] : [1, 99];
  // At the last level half the questions are put in words, and what is shown is the same words.
  if (level < 3 || random() < 0.5) {
    const base = {
      strand: 'tens',
      level,
      prompt: PHRASES['in-all'],
      say: [phraseClip('in-all')],
      show: { kind: 'blocks', tens, ones },
    } as const;
    return numeric(base, answer, 4, range, random, likely);
  }
  const text = `${tens} ${TERMS.tens} ${TERMS.and} ${ones} ${TERMS.ones}`;
  const base = {
    strand: 'tens',
    level,
    prompt: `${PHRASES['which-number']} ${text}?`,
    say: [
      phraseClip('which-number'),
      numberClip(tens, 'lead'),
      termClip('tens'),
      termClip('and'),
      numberClip(ones, 'lead'),
      termClip('ones'),
    ],
    show: { kind: 'words', text },
  } as const;
  return numeric(base, answer, 4, range, random, likely);
}

export const ARITHMETIC: readonly StrandDef[] = [
  { id: 'add', name: 'Adding', ask: askAdd },
  { id: 'take', name: 'Taking away', ask: askTake },
  { id: 'double', name: 'Doubles and halves', ask: askDouble },
  { id: 'tens', name: 'Tens and ones', ask: askTens },
];
