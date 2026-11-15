import type { WordId } from '../../../content/lexicon';
import type { MathsLevel } from '../../../shared/play';
import { between, pick, type Random, shuffled } from '../random';
import { numberChoice, numeric, type StrandDef } from './ask';
import { PHRASES, phraseClip } from './clips';
import { NUMBER_TOP, numberClip } from './numbers';
import type { Choice, Question } from './question';

/**
 * The pictures that are counted: things that are one thing each, drawn so that two of them are the
 * same however they lie. The heaps are made of these, and nothing else about a word is used. The
 * fish is not here because it is a thin pale shape that is hard to make out, and the heart is not
 * because its picture holds a big heart and a small one, so that every one of them would be counted
 * twice.
 */
export const COUNTABLES: readonly WordId[] = [
  'apple',
  'strawberry',
  'carrot',
  'tomato',
  'pumpkin',
  'ruby',
  'emerald',
  'sapphire',
  'amethyst',
  'diamond',
  'coin',
  'ladybug',
  'duck',
  'bee',
  'butterfly',
  'egg',
  'shell',
  'daisy',
];

const countable = (random: Random): WordId => pick(COUNTABLES, random);

/** How many there are to count, by level: a hand, two hands, and then past ten. */
const HEAP: Readonly<Record<MathsLevel, readonly [number, number]>> = { 1: [1, 5], 2: [3, 10], 3: [11, 20] };

function askCount(level: MathsLevel, random: Random): Question {
  const [low, high] = HEAP[level];
  const count = between(low, high, random);
  const base = {
    strand: 'count',
    level,
    prompt: PHRASES['how-many'],
    say: [phraseClip('how-many')],
    show: { kind: 'things', word: countable(random), count },
  } as const;
  return numeric(base, count, level === 1 ? 3 : 4, [Math.max(1, low - 2), Math.min(20, high + 2)], random);
}

/**
 * The way a row of numbers runs at each level: up by one, up and down by one, and then in twos,
 * fives and tens.
 */
const RUNS: Readonly<Record<MathsLevel, readonly number[]>> = { 1: [1], 2: [1, -1], 3: [2, 5, 10, -10] };
/**
 * Where skip counting may go, so it stays among numbers the player has met: twos to twenty, fives
 * to fifty, tens to a hundred.
 */
const SKIP_TOP: Readonly<Record<number, number>> = { 2: 20, 5: 50, 10: 100 };

/** The numbers a row may be made of, from the least to the most. */
function span(level: MathsLevel, size: number): readonly [number, number] {
  if (level === 1) return [1, 10];
  if (level === 2) return [0, 20];
  return [size, SKIP_TOP[size]!];
}

function askNext(level: MathsLevel, random: Random): Question {
  const step = pick(RUNS[level], random);
  const size = Math.abs(step);
  const [low, high] = span(level, size);
  // Three numbers are shown and the fourth is asked for, and all four stay between `low` and
  // `high`. Skip counting starts on a number it counts.
  const starts = Array.from({ length: high - low + 1 }, (_, i) => low + i).filter((n) => {
    const last = n + 3 * step;
    return last >= low && last <= high && (level < 3 || n % size === 0);
  });
  const start = pick(starts, random);
  const shown = [0, 1, 2].map((i) => start + i * step);
  const answer = start + 3 * step;
  // The slips are the number that repeats the last one shown, the one a step too far, and the ones
  // next to the answer.
  const likely = [answer + step, answer - step, answer + 1, answer - 1];
  const base = {
    strand: 'next',
    level,
    prompt: PHRASES['what-next'],
    // A row of small numbers is read to the player. A row of skip counting has bigger ones and is
    // only asked about.
    say: [...(level < 3 ? shown.map((n) => numberClip(n)) : []), phraseClip('what-next')],
    show: { kind: 'sequence', numbers: [...shown, null] },
  } as const;
  return numeric(base, answer, 4, [Math.max(0, low - 1), Math.min(NUMBER_TOP, high + 2)], random, likely);
}

const TWO_DIGITS: readonly number[] = Array.from({ length: 90 }, (_, i) => 10 + i);

const heap = (word: WordId, count: number): Choice => ({
  visual: { kind: 'things', word, count },
  label: `a group of ${count}`,
  clips: [numberClip(count)],
});

function askMore(level: MathsLevel, random: Random): Question {
  const wantMore = level === 1 || random() < 0.5;
  const prompt = level < 3 ? (wantMore ? 'which-more' : 'which-fewer') : wantMore ? 'which-bigger' : 'which-smaller';
  const base = { strand: 'more', level, prompt: PHRASES[prompt], say: [phraseClip(prompt)], show: null } as const;
  const larger = (a: number, b: number): boolean => (wantMore ? a > b : a < b);
  if (level < 3) {
    // Two heaps of the same thing. At first they are far enough apart to see at a glance, and then
    // they are as close as one.
    const [low, high, gap] = level === 1 ? [1, 6, 2] : [1, 10, 1];
    const pairs = Array.from({ length: high - low + 1 }, (_, i) => low + i)
      .flatMap((a) => Array.from({ length: high - low + 1 }, (_, i) => low + i).map((b): [number, number] => [a, b]))
      .filter(([a, b]) => Math.abs(a - b) >= gap);
    const [a, b] = pick(pairs, random);
    const word = countable(random);
    return { ...base, choices: [heap(word, a), heap(word, b)], answer: larger(a, b) ? 0 : 1 };
  }
  // Numbers to be told apart by their size. Half the time two of them are the same digits the other
  // way round, which is the slip to catch.
  const tens = between(1, 9, random);
  const ones = pick(
    [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => n !== tens),
    random,
  );
  const first = 10 * tens + ones;
  const second =
    random() < 0.5
      ? 10 * ones + tens
      : pick(
          TWO_DIGITS.filter((n) => n !== first),
          random,
        );
  const third = pick(
    TWO_DIGITS.filter((n) => n !== first && n !== second),
    random,
  );
  const numbers = shuffled([first, second, third], random);
  const best = numbers.reduce((a, b) => (larger(a, b) ? a : b));
  return { ...base, choices: numbers.map(numberChoice), answer: numbers.indexOf(best) };
}

export const COUNTING: readonly StrandDef[] = [
  { id: 'count', name: 'Counting', ask: askCount },
  { id: 'next', name: 'What comes next', ask: askNext },
  { id: 'more', name: 'More or fewer', ask: askMore },
];
