import { describe, expect, it } from 'vitest';
import { WORDS } from '../../../src/content/lexicon';
import { CHEERS, cheerClip } from '../../../src/learning/lines';
import { MATHS_CLIPS, PHRASES, TERMS } from '../../../src/learning/play/maths/clips';
import { COUNTABLES } from '../../../src/learning/play/maths/counting';
import { NUMBER_TOP, numberClip } from '../../../src/learning/play/maths/numbers';
import {
  type Choice,
  FAMILIES,
  familyOf,
  type Op,
  type Question,
  SHAPES,
  STRAND_IDS,
  type StrandId,
  strandsOf,
  type Visual,
} from '../../../src/learning/play/maths/question';
import { ROUND_LENGTH } from '../../../src/learning/play/maths/round';
import { evaluate } from '../../../src/learning/play/maths/school';
import { ask, STRANDS } from '../../../src/learning/play/maths/strands';
import { MATHS_LEVELS, type MathsLevel } from '../../../src/shared/play';
import { seeded } from '../helpers';

/**
 * Every question the strands can make, checked without looking at how they were made: what a
 * question shows and says is read the way a child reads it, the right answer is worked out again
 * from that, and it has to be the one choice the question says is right. A question with two right
 * choices, or none, is a question a child would be marked wrong for answering well.
 */

const SEEDS = 400;
const LEVELS: readonly MathsLevel[] = MATHS_LEVELS;
const KNOWN = new Set([...MATHS_CLIPS.map((clip) => clip.id), ...CHEERS.map(cheerClip)]);
const TEXT = new Map(MATHS_CLIPS.map((clip) => [clip.id, clip.text]));

const questions = (strand: StrandId, level: MathsLevel, n = SEEDS): Question[] =>
  Array.from({ length: n }, (_, i) => ask(strand, level, seeded(i * 7919 + 13)));

const numberOf = (choice: Choice): number => {
  if (choice.visual.kind !== 'number') throw new Error(`a choice of ${choice.visual.kind} was read as a number`);
  return choice.visual.value;
};
const countOf = (choice: Choice): number => {
  if (choice.visual.kind !== 'things') throw new Error(`a choice of ${choice.visual.kind} was read as a heap`);
  return choice.visual.count;
};
const shown = <K extends Visual['kind']>(q: Question, kind: K): Extract<Visual, { kind: K }> => {
  if (q.show?.kind !== kind) throw new Error(`${q.strand} showed ${q.show?.kind ?? 'nothing'} where ${kind} was read`);
  return q.show as Extract<Visual, { kind: K }>;
};

const WORD: Readonly<Record<Op, string>> = { '+': 'plus', '-': 'take away', '*': 'times', '/': 'divided by' };

/**
 * A sum worked from the left, one step after the other, as a child who has not met the order of
 * working does it.
 */
const fromTheLeft = (terms: readonly number[], ops: readonly Op[]): number =>
  ops.reduce((total, op, at) => {
    const term = terms[at + 1]!;
    return op === '+' ? total + term : op === '-' ? total - term : op === '*' ? total * term : total / term;
  }, terms[0]!);

/**
 * The same sum worked the way it is taught: every times and divided by before any plus or take
 * away. It is worked by another road than the game's.
 */
function timesFirst(terms: readonly number[], ops: readonly Op[]): number {
  let total = 0;
  let sign = 1;
  let run = terms[0]!;
  for (const [at, op] of ops.entries()) {
    const term = terms[at + 1]!;
    if (op === '*') run *= term;
    else if (op === '/') run /= term;
    else {
      total += sign * run;
      sign = op === '+' ? 1 : -1;
      run = term;
    }
  }
  return total + sign * run;
}

/**
 * The places of the choices that are right by the question's own words and pictures, worked out
 * afresh.
 */
function rightPlaces(q: Question): number[] {
  const where = (is: (choice: Choice) => boolean): number[] =>
    q.choices.flatMap((choice, place) => (is(choice) ? [place] : []));
  switch (q.strand) {
    case 'count':
      return where((c) => numberOf(c) === shown(q, 'things').count);
    case 'next': {
      const [a, b, c, gap] = shown(q, 'sequence').numbers;
      expect(gap, 'the number asked for is not shown').toBeNull();
      expect(c! - b!, 'the row of numbers goes up or down by the same step').toBe(b! - a!);
      return where((choice) => numberOf(choice) === c! + (b! - a!));
    }
    case 'more': {
      const values = q.choices.map((c) => (c.visual.kind === 'things' ? c.visual.count : numberOf(c)));
      expect(new Set(values).size, 'no two choices are as big as each other').toBe(values.length);
      const more = /\b(more|bigger)\b/.test(q.prompt);
      const best = more ? Math.max(...values) : Math.min(...values);
      return values.flatMap((v, place) => (v === best ? [place] : []));
    }
    case 'add': {
      const { a, b, op } = shown(q, 'sum');
      expect(op).toBe('+');
      expect(q.prompt).toBe(`What is ${a} plus ${b}?`);
      return where((c) => numberOf(c) === a + b);
    }
    case 'take': {
      const { a, b, op } = shown(q, 'sum');
      expect(op).toBe('-');
      expect(q.prompt).toBe(`What is ${a} take away ${b}?`);
      return where((c) => numberOf(c) === a - b);
    }
    case 'plus':
    case 'minus':
    case 'times':
    case 'share':
    case 'mixed': {
      const { terms, ops } = shown(q, 'expression');
      expect(ops, 'one operation between every two numbers').toHaveLength(terms.length - 1);
      expect(q.prompt).toBe(
        `What is ${terms.map((term, at) => (at === 0 ? `${term}` : `${WORD[ops[at - 1]!]} ${term}`)).join(' ')}?`,
      );
      const answer = timesFirst(terms, ops);
      expect(
        Number.isInteger(answer) && answer >= 0 && answer <= 100,
        `${answer} is a whole number from 0 to 100`,
      ).toBe(true);
      expect(
        fromTheLeft(terms, ops),
        'worked from the left it comes to the same, so no child is marked wrong for the order of working',
      ).toBe(answer);
      expect(evaluate(terms, ops), 'the game and the check agree').toBe(answer);
      return where((c) => numberOf(c) === answer);
    }
    case 'double': {
      const double = /^What is double (\d+)\?$/.exec(q.prompt);
      const half = /^What is half of (\d+)\?$/.exec(q.prompt);
      expect([double, half].filter(Boolean), 'the question is a double or a half').toHaveLength(1);
      const n = Number((double ?? half)![1]);
      if (q.show?.kind === 'things') expect(q.show.count).toBe(n);
      if (q.show?.kind === 'twice') expect(q.show.count).toBe(n);
      if (q.show?.kind === 'words') expect(q.show.text).toBe(`double ${n}`);
      return where((c) => numberOf(c) === (double ? 2 * n : n / 2));
    }
    case 'tens': {
      let value: number;
      if (q.show?.kind === 'blocks') value = 10 * q.show.tens + q.show.ones;
      else {
        const said = /^(\d) tens and (\d) ones$/.exec(shown(q, 'words').text);
        expect(said, 'the words are a number of tens and a number of ones').not.toBeNull();
        value = 10 * Number(said![1]) + Number(said![2]);
        expect(q.prompt).toBe(`Which number is ${shown(q, 'words').text}?`);
      }
      return where((c) => numberOf(c) === value);
    }
    case 'shape': {
      if (q.show?.kind === 'polygon') return where((c) => numberOf(c) === (q.show as { sides: number }).sides);
      const named = /^Which one is the (\w+)\?$/.exec(q.prompt);
      expect(named, 'the question names a shape').not.toBeNull();
      return where((c) => c.visual.kind === 'shape' && c.visual.shape === named![1]);
    }
    case 'clock': {
      if (q.show?.kind === 'clock') {
        const { hour, half } = q.show;
        return where((c) => c.visual.kind === 'time' && c.visual.hour === hour && c.visual.half === half);
      }
      const { hour, half } = shown(q, 'time');
      expect(q.prompt).toBe(`Which clock shows ${half ? `half past ${hour}` : `${hour} o'clock`}?`);
      return where((c) => c.visual.kind === 'clock' && c.visual.hour === hour && c.visual.half === half);
    }
    case 'pattern': {
      const row = shown(q, 'beads').beads;
      expect(row[row.length - 1], 'the bead asked for is not shown').toBeNull();
      const beads = row.slice(0, -1);
      // The pattern repeats after the shortest stretch that the row is made of.
      const period = [...beads.keys()]
        .map((i) => i + 1)
        .find((p) => beads.every((bead, i) => i < p || bead === beads[i - p]))!;
      const expected = beads[beads.length - period];
      return where((c) => c.visual.kind === 'bead' && c.visual.bead === expected);
    }
  }
}

/** The words of the clips as they are written, with the marks and the case taken away. */
function written(clips: readonly string[]): string {
  return clips
    .map((id) => TEXT.get(id) ?? `?${id}`)
    .join(' ')
    .toLowerCase()
    .replace(/[?!.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
const plain = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[?!.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

describe('the kinds of sum', () => {
  it('are all there, each under its own name, and none is named twice', () => {
    expect(Object.keys(STRANDS)).toEqual([...STRAND_IDS]);
    for (const id of STRAND_IDS) expect(STRANDS[id].id).toBe(id);
    expect(new Set(STRAND_IDS.map((id) => STRANDS[id].name)).size).toBe(STRAND_IDS.length);
    for (const id of STRAND_IDS) expect(id).toMatch(/^[a-z][a-z-]{0,23}$/);
  });

  it('count the things that can be counted, which all have a picture of their own', () => {
    expect(new Set(COUNTABLES).size).toBe(COUNTABLES.length);
    const looks = COUNTABLES.map((word) => JSON.stringify(WORDS[word].picture));
    expect(new Set(looks).size, 'two of them are drawn the same').toBe(COUNTABLES.length);
    for (const word of COUNTABLES)
      expect(WORDS[word].picture.kind, `${word} is a picture drawn for a thing and not a friend's face`).toBe('sprite');
  });
});

describe.each(STRAND_IDS)('%s questions', (strand) => {
  describe.each(LEVELS)('at level %i', (level) => {
    const made = questions(strand, level);

    it('have exactly one right choice, and it is the one the question says is right', () => {
      for (const q of made) {
        expect(rightPlaces(q), JSON.stringify(q)).toEqual([q.answer]);
      }
    });

    it('have two to four choices that are all different, and no two have the same name', () => {
      for (const q of made) {
        expect(q.choices.length).toBeGreaterThanOrEqual(2);
        expect(q.choices.length).toBeLessThanOrEqual(4);
        expect(new Set(q.choices.map((c) => JSON.stringify(c.visual))).size, JSON.stringify(q.choices)).toBe(
          q.choices.length,
        );
        expect(new Set(q.choices.map((c) => c.label)).size, JSON.stringify(q.choices)).toBe(q.choices.length);
        expect(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.choices.length).toBe(true);
      }
    });

    it('say only what the voice has a clip for, and the words said are the words written', () => {
      for (const q of made) {
        expect(q.say.length).toBeGreaterThan(0);
        for (const id of [...q.say, ...q.choices.flatMap((c) => c.clips)])
          expect(KNOWN.has(id), `${id} has no clip`).toBe(true);
        expect(
          written(q.say).endsWith(plain(q.prompt)),
          `"${written(q.say)}" is not said as "${q.prompt}" is written`,
        ).toBe(true);
        for (const [at, id] of q.say.entries()) {
          if (id.startsWith('lead.'))
            expect(at < q.say.length - 1, `${id} runs on into nothing in "${q.prompt}"`).toBe(true);
          else if (id.startsWith('last.'))
            expect(at, `${id} ends a sentence that goes on in "${q.prompt}"`).toBe(q.say.length - 1);
        }
        expect(q.prompt.length).toBeGreaterThan(0);
        expect(q.strand).toBe(strand);
        expect(q.level).toBe(level);
      }
    });

    it('do not say which choice is right in the words of the choices', () => {
      for (const q of made) for (const c of q.choices) expect(c.label).not.toMatch(/\b(right|correct|answer|wrong)\b/i);
    });

    it('are not all the same question: a round of five can always be made of questions that differ', () => {
      const keys = new Set(
        made.map((q) => JSON.stringify([q.prompt, q.show, q.show ? null : q.choices.map((c) => c.label).sort()])),
      );
      expect(
        keys.size,
        `${strand} at level ${level} asked only ${keys.size} different things in ${SEEDS}`,
      ).toBeGreaterThan(ROUND_LENGTH);
    });

    it('put the right choice in every place about as often as in any other', () => {
      const places = new Map<number, number>();
      for (const q of made) places.set(q.answer, (places.get(q.answer) ?? 0) + 1);
      const size = Math.min(...made.map((q) => q.choices.length));
      for (let place = 0; place < size; place++)
        expect(places.get(place) ?? 0, `place ${place} of ${strand} at level ${level}`).toBeGreaterThan(
          SEEDS / (size * 3),
        );
    });
  });
});

describe('what each level asks', () => {
  const all = (strand: StrandId, level: MathsLevel) => questions(strand, level);

  it('counts up to five, then ten, then past ten to twenty', () => {
    const counts = (level: MathsLevel) => all('count', level).map((q) => shown(q, 'things').count);
    expect(Math.max(...counts(1))).toBe(5);
    expect(Math.min(...counts(1))).toBe(1);
    expect(Math.max(...counts(2))).toBe(10);
    expect(Math.min(...counts(3))).toBe(11);
    expect(Math.max(...counts(3))).toBe(20);
  });

  it('adds within five with the things to count, within ten, and then past ten', () => {
    for (const q of all('add', 1)) {
      const sum = shown(q, 'sum');
      expect(sum.a + sum.b).toBeLessThanOrEqual(5);
      expect(sum.word, 'the things are shown at the first level').not.toBeNull();
    }
    for (const q of all('add', 2)) expect(shown(q, 'sum').word).toBeNull();
    const sums = all('add', 3).map((q) => shown(q, 'sum').a + shown(q, 'sum').b);
    expect(Math.min(...sums)).toBeGreaterThanOrEqual(11);
    expect(Math.max(...sums)).toBeLessThanOrEqual(20);
  });

  it('takes away without going below nothing, and lets nothing be left from the second level', () => {
    const leftover = (level: MathsLevel) => all('take', level).map((q) => shown(q, 'sum').a - shown(q, 'sum').b);
    expect(Math.min(...leftover(1))).toBeGreaterThanOrEqual(1);
    expect(Math.min(...leftover(2))).toBe(0);
    expect(Math.min(...leftover(3))).toBeGreaterThanOrEqual(2);
  });

  it('counts on in ones, up and down, and then in twos, fives and tens', () => {
    const steps = (level: MathsLevel) =>
      new Set(
        all('next', level).map((q) => {
          const [a, b] = shown(q, 'sequence').numbers;
          return b! - a!;
        }),
      );
    expect([...steps(1)]).toEqual([1]);
    expect([...steps(2)].sort()).toEqual([-1, 1]);
    expect([...steps(3)].sort((x, y) => x - y)).toEqual([-10, 2, 5, 10]);
    for (const q of all('next', 3))
      for (const n of shown(q, 'sequence').numbers)
        if (n !== null) expect(n % 2 === 0 || n % 5 === 0, `${n} is in a count of twos, fives or tens`).toBe(true);
  });

  it('keeps the numbers of a row where a child counts to, and reads out the row only while it is of small numbers', () => {
    for (const level of LEVELS) {
      for (const q of all('next', level)) {
        const numbers = shown(q, 'sequence').numbers.filter((n): n is number => n !== null);
        expect(Math.min(...numbers)).toBeGreaterThanOrEqual(0);
        expect(Math.max(...numbers)).toBeLessThanOrEqual(level === 1 ? 10 : level === 2 ? 20 : 100);
        const spoken = q.say.filter((id) => id.startsWith('num.')).length;
        expect(spoken > 0, `the row of level ${level} is ${spoken > 0 ? '' : 'not '}read out`).toBe(level < 3);
      }
    }
  });

  it('asks for the fewer and the smaller as well as the more and the bigger, but only the more at the first level', () => {
    expect(new Set(all('more', 1).map((q) => q.prompt)).size).toBe(1);
    expect(new Set(all('more', 2).map((q) => q.prompt)).size).toBe(2);
    expect(new Set(all('more', 3).map((q) => q.prompt)).size).toBe(2);
    for (const q of all('more', 1))
      expect(Math.abs(countOf(q.choices[0]!) - countOf(q.choices[1]!))).toBeGreaterThanOrEqual(2);
  });

  it('puts numbers whose digits are the same the other way round together with others, about as often as chance would not', () => {
    const swapped = all('more', 3).filter((q) => {
      const values = q.choices.map(numberOf);
      return values.some((a) => values.some((b) => a !== b && a === 10 * (b % 10) + Math.floor(b / 10)));
    });
    expect(swapped.length, 'the slip of reading digits the wrong way is tested for').toBeGreaterThan(SEEDS / 3);
  });

  it('shows tens and ones up to nineteen, then to fifty-nine, then to ninety-nine, and puts half of the last in words', () => {
    const values = (level: MathsLevel) =>
      all('tens', level)
        .filter((q) => q.show?.kind === 'blocks')
        .map((q) => 10 * shown(q, 'blocks').tens + shown(q, 'blocks').ones);
    expect(Math.min(...values(1))).toBe(11);
    expect(Math.max(...values(1))).toBe(19);
    expect(Math.max(...values(2))).toBeLessThanOrEqual(59);
    expect(Math.max(...values(3))).toBeGreaterThan(80);
    const words = all('tens', 3).filter((q) => q.show?.kind === 'words').length;
    expect(words).toBeGreaterThan(SEEDS / 3);
    expect(words).toBeLessThan((2 * SEEDS) / 3);
    expect(
      all('tens', 1)
        .concat(all('tens', 2))
        .every((q) => q.show?.kind === 'blocks'),
    ).toBe(true);
  });

  it('names four shapes, then eight, and then counts the sides or the corners of one from three to eight', () => {
    const named = (level: MathsLevel) =>
      new Set(
        all('shape', level).flatMap((q) => q.choices.map((c) => (c.visual.kind === 'shape' ? c.visual.shape : ''))),
      );
    expect([...named(1)].sort()).toEqual(['circle', 'rectangle', 'square', 'triangle']);
    expect([...named(2)].sort()).toEqual([...SHAPES].sort());
    const sides = new Set(all('shape', 3).map((q) => shown(q, 'polygon').sides));
    expect([...sides].sort()).toEqual([3, 4, 5, 6, 8]);
    expect(new Set(all('shape', 3).map((q) => q.prompt))).toEqual(new Set(['How many sides?', 'How many corners?']));
  });

  it('never asks for the rectangle with a square beside it, since a square is a rectangle to anyone who argues it', () => {
    for (const level of [1, 2] as const) {
      const asked = all('shape', level).filter((q) => q.prompt.endsWith('rectangle?'));
      expect(asked.length).toBeGreaterThan(20);
      for (const q of asked) expect(q.choices.map((c) => c.label)).not.toContain('square');
    }
  });

  it('reads the hour, then the hour and the half hour, and then finds the clock for a time', () => {
    for (const q of all('clock', 1)) {
      expect(shown(q, 'clock').half).toBe(false);
      for (const c of q.choices) expect(c.visual.kind === 'time' && !c.visual.half).toBe(true);
    }
    expect(all('clock', 2).some((q) => shown(q, 'clock').half)).toBe(true);
    expect(all('clock', 2).some((q) => !shown(q, 'clock').half)).toBe(true);
    for (const q of all('clock', 2)) {
      const { hour, half } = shown(q, 'clock');
      expect(
        q.choices.some((c) => c.visual.kind === 'time' && c.visual.hour === hour && c.visual.half === !half),
        'the slip of the hand that is the wrong way round is among the choices',
      ).toBe(true);
    }
    for (const q of all('clock', 3)) expect(q.choices.every((c) => c.visual.kind === 'clock')).toBe(true);
  });

  it('goes round the clock: the hour before one is twelve, and the hour after twelve is one', () => {
    const hours = new Set(
      all('clock', 1).flatMap((q) => q.choices.map((c) => (c.visual.kind === 'time' ? c.visual.hour : 0))),
    );
    expect([...hours].sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
  });

  it('repeats a pattern of two, then of three or four, and shows two whole parts and one bead over', () => {
    for (const level of LEVELS) {
      for (const q of all('pattern', level)) {
        const row = shown(q, 'beads').beads.length - 1;
        expect([5, 7, 9]).toContain(row);
        expect(q.choices.length).toBe(level === 3 ? 4 : 3);
      }
    }
    expect(new Set(all('pattern', 1).map((q) => shown(q, 'beads').beads.length)).size).toBe(1);
  });

  it('has doubles to five with two heaps, doubles to ten without, and halves of the even numbers to twenty', () => {
    for (const q of all('double', 1)) expect(q.show?.kind).toBe('twice');
    for (const q of all('double', 2)) expect(q.show?.kind).toBe('words');
    const halves = all('double', 3).map((q) => shown(q, 'things').count);
    expect(halves.every((n) => n % 2 === 0 && n >= 2 && n <= 20)).toBe(true);
    expect(Math.max(...halves)).toBe(20);
  });
});

describe('the families of levels', () => {
  it('are Level 0 and Level 1, with every kind of sum on the tiles of one of them and none on two', () => {
    expect(FAMILIES.map((family) => family.level)).toEqual([0, 1]);
    expect(STRAND_IDS).toEqual(FAMILIES.flatMap((family) => [...family.strands]));
    expect(new Set(STRAND_IDS).size, 'no kind of sum is in two families').toBe(STRAND_IDS.length);
    for (const family of FAMILIES) {
      expect(strandsOf(family.level)).toEqual(family.strands);
      expect(family.about.length).toBeGreaterThan(0);
      for (const id of family.strands) expect(familyOf(id)).toBe(family.level);
    }
  });

  it('keep what a child meets before school as Level 0, the ten kinds it has always had, and put the sums of school in Level 1', () => {
    expect(strandsOf(0)).toEqual([
      'count',
      'next',
      'more',
      'add',
      'take',
      'tens',
      'double',
      'shape',
      'clock',
      'pattern',
    ]);
    expect(strandsOf(1)).toEqual(['plus', 'minus', 'times', 'share', 'mixed']);
  });
});

describe('working out a sum', () => {
  it('goes from the left for plus and take away, and does times and divided by first', () => {
    expect(evaluate([2, 7, 3], ['+', '-'])).toBe(6);
    expect(evaluate([9, 4, 3], ['-', '+'])).toBe(8);
    expect(evaluate([9, 4, 3], ['-', '-'])).toBe(2);
    expect(evaluate([4, 3, 5], ['*', '+'])).toBe(17);
    expect(evaluate([20, 4, 3], ['/', '+'])).toBe(8);
    expect(evaluate([3, 5, 2], ['+', '*'])).toBe(13);
    expect(evaluate([5, 2, 3, 4], ['*', '-', '*'])).toBe(-2);
    expect(evaluate([7], [])).toBe(7);
  });

  it('is what a second road to the same answer says, for every sum that Level 1 makes', () => {
    for (const strand of strandsOf(1)) {
      for (const level of LEVELS) {
        for (const q of questions(strand, level, 100)) {
          const { terms, ops } = shown(q, 'expression');
          expect(evaluate(terms, ops)).toBe(timesFirst(terms, ops));
        }
      }
    }
  });
});

describe('what each level of Level 1 asks', () => {
  const sums = (strand: StrandId, level: MathsLevel): { terms: number[]; ops: Op[] }[] =>
    questions(strand, level).map((q) => {
      const { terms, ops } = shown(q, 'expression');
      return { terms: [...terms], ops: [...ops] };
    });
  const two = (strand: StrandId, level: MathsLevel): { a: number; b: number; ops: Op[] }[] =>
    sums(strand, level).map(({ terms, ops }) => ({ a: terms[0]!, b: terms[1]!, ops }));
  const share = (found: readonly boolean[]): number => found.filter(Boolean).length / found.length;

  it('adds tens to a number, or ones that stay in the ones, then ones that go over a ten, then two numbers of two digits', () => {
    for (const { a, b, ops } of two('plus', 1)) {
      expect(ops).toEqual(['+']);
      expect(a).toBeGreaterThanOrEqual(11);
      expect(a + b).toBeLessThanOrEqual(99);
      if (b % 10 !== 0) expect((a % 10) + b, `${a} + ${b} stays in the ones`).toBeLessThanOrEqual(9);
    }
    expect(new Set(two('plus', 1).map(({ b }) => b % 10 === 0))).toEqual(new Set([true, false]));
    for (const { a, b } of two('plus', 2)) {
      expect(b).toBeGreaterThanOrEqual(2);
      expect(b).toBeLessThanOrEqual(9);
      expect((a % 10) + b, `${a} + ${b} goes over a ten`).toBeGreaterThanOrEqual(10);
      expect(a + b).toBeLessThanOrEqual(99);
    }
    for (const { a, b } of two('plus', 3)) {
      expect(Math.min(a, b)).toBeGreaterThanOrEqual(11);
      expect(a % 10 !== 0 && b % 10 !== 0, `${a} + ${b} are not in whole tens`).toBe(true);
      expect(a + b).toBeLessThanOrEqual(100);
    }
    const carried = share(two('plus', 3).map(({ a, b }) => (a % 10) + (b % 10) >= 10));
    expect(carried, 'about half of the sums of two numbers of two digits have a ten to carry').toBeGreaterThan(0.3);
    expect(carried).toBeLessThan(0.7);
  });

  it('takes tens from a number, or ones that it has, then ones that it has not, then a number of two digits', () => {
    for (const { a, b, ops } of two('minus', 1)) {
      expect(ops).toEqual(['-']);
      expect(a - b).toBeGreaterThanOrEqual(1);
      if (b % 10 !== 0) expect(b, `${a} - ${b} needs no ten broken`).toBeLessThanOrEqual(a % 10);
    }
    expect(new Set(two('minus', 1).map(({ b }) => b % 10 === 0))).toEqual(new Set([true, false]));
    for (const { a, b } of two('minus', 2)) {
      expect(b).toBeGreaterThanOrEqual(1);
      expect(b).toBeLessThanOrEqual(9);
      expect(b, `${a} - ${b} breaks a ten`).toBeGreaterThan(a % 10);
      expect(a - b).toBeGreaterThanOrEqual(1);
    }
    for (const { a, b } of two('minus', 3)) {
      expect(b).toBeGreaterThanOrEqual(11);
      expect(b % 10 !== 0, `${a} - ${b} takes a number that is not in whole tens`).toBe(true);
      expect(a - b).toBeGreaterThanOrEqual(1);
      expect(a).toBeLessThanOrEqual(99);
    }
    const broken = share(two('minus', 3).map(({ a, b }) => a % 10 < b % 10));
    expect(broken, 'about half of the sums of two numbers of two digits break a ten').toBeGreaterThan(0.3);
    expect(broken).toBeLessThan(0.7);
  });

  it('asks the tables of 2, 5 and 10, then 3 and 4 too, then 6 to 9 too, and never past ten times ten', () => {
    for (const level of LEVELS) {
      for (const { a, b, ops } of two('times', level)) {
        expect(ops).toEqual(['*']);
        expect(Math.min(a, b)).toBeGreaterThanOrEqual(2);
        expect(Math.max(a, b)).toBeLessThanOrEqual(10);
      }
    }
    const tables = (level: MathsLevel, of: readonly number[]): number[] =>
      two('times', level).map(({ a, b }) => (of.includes(a) || of.includes(b) ? 1 : 0));
    expect(tables(1, [2, 5, 10]).every(Boolean), 'the first level is only the tables of 2, 5 and 10').toBe(true);
    expect(tables(2, [2, 3, 4, 5, 10]).every(Boolean)).toBe(true);
    const threeOrFour = (level: MathsLevel): number =>
      share(two('times', level).map(({ a, b }) => [a, b].some((n) => n === 3 || n === 4)));
    expect(threeOrFour(1), 'the threes and fours come only as the other number at the first level').toBeLessThan(0.4);
    expect(threeOrFour(2)).toBeGreaterThan(0.5);
    const hard = share(two('times', 3).map(({ a, b }) => [a, b].some((n) => n >= 6 && n <= 9)));
    expect(hard, 'the sixes to nines are most of the last level').toBeGreaterThan(0.6);
    expect(Math.max(...two('times', 3).map(({ a, b }) => a * b))).toBeGreaterThanOrEqual(72);
    expect(
      two('times', 3).some(({ a, b }) => [a, b].some((n) => n === 2 || n === 5 || n === 10)),
      'the tables the player knows come back',
    ).toBe(true);
    expect(new Set(two('times', 3).map(({ a, b }) => a < b)), 'the numbers come in both orders').toEqual(
      new Set([true, false]),
    );
  });

  it('shares out the tables of 2, 5 and 10, then 3 and 4 too, then 6 to 9 too, with no remainder', () => {
    for (const level of LEVELS) {
      for (const { a, b, ops } of two('share', level)) {
        expect(ops).toEqual(['/']);
        expect(a % b, `${a} divided by ${b} is a whole number`).toBe(0);
        expect(a / b).toBeGreaterThanOrEqual(2);
        expect(a / b).toBeLessThanOrEqual(10);
        expect(a).toBeLessThanOrEqual(100);
      }
    }
    const by = (level: MathsLevel): Set<number> => new Set(two('share', level).map(({ b }) => b));
    expect([...by(1)].sort((x, y) => x - y)).toEqual([2, 5, 10]);
    expect([...by(2)].sort((x, y) => x - y)).toEqual([2, 3, 4, 5, 10]);
    expect([...by(3)].sort((x, y) => x - y)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(share(two('share', 2).map(({ b }) => b === 3 || b === 4))).toBeGreaterThan(0.5);
  });

  it('adds and takes away three numbers within ten, then within twenty, and never goes below one or past the top on the way', () => {
    for (const [level, top, smallest, biggest] of [
      [1, 10, 2, 9],
      [2, 20, 3, 15],
    ] as const) {
      const made = sums('mixed', level);
      for (const { terms, ops } of made) {
        expect(terms).toHaveLength(3);
        expect(ops.every((op) => op === '+' || op === '-')).toBe(true);
        expect(Math.max(...terms)).toBeLessThanOrEqual(biggest);
        expect(Math.min(...terms)).toBeGreaterThanOrEqual(smallest);
        for (let at = 1; at < terms.length; at++) {
          const soFar = fromTheLeft(terms.slice(0, at + 1), ops.slice(0, at));
          expect(soFar, `${terms.join(' ')} stays from 1 to ${top} on the way`).toBeGreaterThanOrEqual(1);
          expect(soFar).toBeLessThanOrEqual(top);
        }
      }
      expect(
        new Set(made.map(({ ops }) => ops.join(''))),
        `both signs come first and second at level ${level}`,
      ).toEqual(new Set(['++', '+-', '-+', '--']));
    }
    expect(
      sums('mixed', 2).every(({ terms }) => terms[0]! >= 8),
      'the second level starts from a number that is nearer twenty',
    ).toBe(true);
    expect(sums('mixed', 2).some(({ terms }) => terms.some((n) => n > 10))).toBe(true);
  });

  it('is the sum of a child at school, 2 + 7 - 3, and at the last level is four steps within fifty or a times with a number after it', () => {
    const made = sums('mixed', 3);
    const steps = made.filter(({ terms }) => terms.length === 4);
    const products = made.filter(({ terms }) => terms.length === 3);
    expect(steps.length + products.length).toBe(made.length);
    expect(steps.length).toBeGreaterThan(SEEDS / 4);
    expect(products.length).toBeGreaterThan(SEEDS / 4);
    for (const { terms, ops } of steps) {
      expect(ops.every((op) => op === '+' || op === '-')).toBe(true);
      expect(Math.min(...terms)).toBeGreaterThanOrEqual(3);
      expect(Math.max(...terms)).toBeLessThanOrEqual(25);
      for (let at = 1; at < terms.length; at++) {
        const soFar = fromTheLeft(terms.slice(0, at + 1), ops.slice(0, at));
        expect(soFar).toBeGreaterThanOrEqual(1);
        expect(soFar).toBeLessThanOrEqual(50);
      }
    }
    for (const { terms, ops } of products) {
      expect(ops[0], 'the times is the first step, so the order of working cannot change the answer').toBe('*');
      expect(['+', '-']).toContain(ops[1]);
      expect(terms[0]! * terms[1]!, 'a product big enough to be worth working out').toBeGreaterThanOrEqual(9);
      expect(terms[2]!).toBeGreaterThanOrEqual(2);
      expect(terms[2]!).toBeLessThanOrEqual(20);
    }
    expect(new Set(products.map(({ ops }) => ops[1])), 'the player adds after a times and takes away after it').toEqual(
      new Set(['+', '-']),
    );
  });

  it('puts the slips of a child among the choices, which are the sum with a sign the other way round, and the digits turned', () => {
    const slipped = questions('mixed', 1).filter((q) => {
      const { terms, ops } = shown(q, 'expression');
      const other = ops.map((_, at) =>
        fromTheLeft(
          terms,
          ops.map((o, i): Op => (i === at ? (o === '+' ? '-' : '+') : o)),
        ),
      );
      return q.choices.some((c) => other.includes(numberOf(c)));
    });
    expect(slipped.length, 'a wrong sign is among the choices of many questions').toBeGreaterThan(SEEDS * 0.4);
    const turnedOver = questions('plus', 3).filter((q) => {
      const { terms } = shown(q, 'expression');
      const sum = terms[0]! + terms[1]!;
      return (
        sum >= 10 && sum % 10 !== 0 && q.choices.some((c) => numberOf(c) === 10 * (sum % 10) + Math.floor(sum / 10))
      );
    });
    expect(
      turnedOver.length,
      'the answer with its digits the wrong way round is among the choices of some',
    ).toBeGreaterThan(SEEDS / 5);
  });
});

describe('the numbers the voice says', () => {
  it('are one clip for every number to a hundred, said alone, leading into more, or ending a question', () => {
    for (let n = 0; n <= NUMBER_TOP; n++) {
      expect(numberClip(n)).toBe(`num.${n}`);
      expect(numberClip(n, 'lead')).toBe(`lead.${n}`);
      expect(numberClip(n, 'last')).toBe(`last.${n}`);
      for (const place of ['alone', 'lead', 'last'] as const)
        expect(KNOWN.has(numberClip(n, place)), `${place} ${n} has no clip`).toBe(true);
    }
    for (const place of ['alone', 'lead', 'last'] as const) {
      expect(() => numberClip(NUMBER_TOP + 1, place)).toThrow(RangeError);
      expect(() => numberClip(-1, place)).toThrow(RangeError);
      expect(() => numberClip(2.5, place)).toThrow(RangeError);
    }
  });

  it('are written as numbers on the card and read as words by the voice, in whatever place they are said', () => {
    const numbers = MATHS_CLIPS.filter((c) => /^(num|lead|last)\.\d+$/.test(c.id));
    expect(numbers).toHaveLength(3 * (NUMBER_TOP + 1));
    for (const clip of numbers) {
      expect(clip.text).toBe(clip.id.slice(clip.id.indexOf('.') + 1));
      expect(clip.say, `${clip.id} is read as words`).toMatch(/^[a-z]+([- ][a-z]+)?$/);
    }
    expect(MATHS_CLIPS.find((c) => c.id === 'num.17')?.say).toBe('seventeen');
    expect(MATHS_CLIPS.find((c) => c.id === 'lead.34')?.say).toBe('thirty-four');
    expect(MATHS_CLIPS.find((c) => c.id === 'last.100')?.say).toBe('one hundred');
    expect(new Set(MATHS_CLIPS.map((c) => c.id)).size, 'no clip is named twice').toBe(MATHS_CLIPS.length);
  });

  it('are said as one clip each, and the numbers a question says are the numbers it writes', () => {
    for (const strand of STRAND_IDS)
      for (const level of LEVELS)
        for (const q of questions(strand, level, 40)) {
          const written = q.prompt.match(/\d+/g) ?? [];
          if (written.length === 0) continue;
          const said = q.say
            .filter((id) => /^(num|lead|last)\.\d+$/.test(id))
            .map((id) => id.slice(id.indexOf('.') + 1));
          expect(said, q.prompt).toEqual(written);
        }
  });
});

describe('the pieces of a sentence', () => {
  const framed = MATHS_CLIPS.filter((clip) => clip.frame !== undefined);
  const said = (clip: (typeof MATHS_CLIPS)[number]): string => (clip.say ?? clip.text).toLowerCase();

  it('are cut out of a sentence that has the words of the piece in it, once, in square brackets', () => {
    expect(framed.length).toBeGreaterThan(3 * (NUMBER_TOP + 1) - (NUMBER_TOP + 1));
    for (const clip of framed) {
      const frame = clip.frame!;
      expect(frame.match(/\[/g), `${clip.id}: ${frame}`).toHaveLength(1);
      expect(frame.match(/\]/g), `${clip.id}: ${frame}`).toHaveLength(1);
      expect(/\[(.+)\]/.exec(frame)![1]!.toLowerCase(), `${clip.id} is not the words in its frame`).toBe(said(clip));
      expect(frame, `${clip.id} is a question`).toMatch(/\?\]?$/);
    }
  });

  it('are named for where they fall: a piece with more after it leads, and a piece that ends the sentence is last', () => {
    for (const clip of framed.filter((c) => !c.id.startsWith('maths.'))) {
      const ends = /\]\s*[.?!]?$/.test(clip.frame!);
      expect(clip.id.startsWith(ends ? 'last.' : 'lead.'), `${clip.id}: ${clip.frame}`).toBe(true);
    }
  });

  it('are named for the sentence when the piece is one: it begins after a full stop and ends the frame', () => {
    const wholes = framed.filter((clip) => /(^|[.?!]\s+)\[[^\]]+\]$/.test(clip.frame!));
    expect(wholes.map((clip) => clip.id).sort()).toEqual(['maths.how-many', 'maths.in-all']);
    for (const clip of framed.filter((c) => !wholes.includes(c)))
      expect(clip.id.startsWith('maths.'), `${clip.id} is part of a sentence`).toBe(false);
  });

  it('are the only clips that are not made whole, so every other phrase and term is a sentence of its own', () => {
    const whole = MATHS_CLIPS.filter((clip) => clip.id.startsWith('maths.'));
    expect(whole.map((clip) => clip.id).sort()).toEqual(
      [
        'pick',
        'how-many',
        'what-next',
        'which-more',
        'which-fewer',
        'which-bigger',
        'which-smaller',
        'in-all',
        'sides',
        'corners',
        'what-time',
        'look-again',
        'done',
      ]
        .map((phrase) => `maths.${phrase}`)
        .sort(),
    );
  });

  it('have every phrase and term of the card in them, so what is shown is what is said', () => {
    const texts = new Set(framed.map((clip) => clip.text));
    for (const text of Object.values(TERMS)) expect(texts.has(text), `${text} is not said in a sentence`).toBe(true);
    for (const text of [PHRASES['what-is'], PHRASES['take-away'], PHRASES['half-of'], PHRASES['half-past']])
      expect(texts.has(text), `${text} is not said in a sentence`).toBe(true);
  });
});
