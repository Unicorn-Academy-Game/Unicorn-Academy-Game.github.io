import type { MathsLevel } from '../../../shared/play';
import { between, pick, type Random, shuffled } from '../random';
import { numeric, type StrandDef } from './ask';
import { PHRASES, phraseClip, TERMS, termClip } from './clips';
import { numberClip } from './numbers';
import { BEADS, type BeadId, type Choice, type Question, SHAPES, type ShapeId, type Visual } from './question';

/**
 * The shapes the player is asked about first are the four everyone knows. The rest are met at the
 * second level.
 */
const FIRST_SHAPES: readonly ShapeId[] = ['circle', 'square', 'triangle', 'rectangle'];

const shapeChoice = (shape: ShapeId): Choice => ({
  visual: { kind: 'shape', shape },
  label: shape,
  clips: [termClip(shape)],
});

/**
 * The sides the player counts: the shapes of a triangle up to an octagon that they have seen, with
 * no heptagon, which nobody has.
 */
const SIDES = [3, 4, 5, 6, 8] as const;

function askShape(level: MathsLevel, random: Random): Question {
  if (level === 3) {
    // The sides or the corners of a shape are counted, and they come to the same number.
    const sides = pick(SIDES, random);
    const corners = random() < 0.5;
    const phrase = corners ? 'corners' : 'sides';
    const base = {
      strand: 'shape',
      level,
      prompt: PHRASES[phrase],
      say: [phraseClip(phrase)],
      show: { kind: 'polygon', sides },
    } as const;
    return numeric(base, sides, 4, [2, 10], random);
  }
  const pool = level === 1 ? FIRST_SHAPES : SHAPES;
  const target = pick(pool, random);
  // A square is a rectangle to anyone who argues it, so the rectangle is never asked for with a
  // square beside it.
  const others = shuffled(
    pool.filter((shape) => shape !== target && !(target === 'rectangle' && shape === 'square')),
    random,
  );
  const choices = shuffled([target, ...others.slice(0, (level === 1 ? 3 : 4) - 1)], random);
  return {
    strand: 'shape',
    level,
    prompt: `${PHRASES['which-shape']} ${target}?`,
    say: [phraseClip('which-shape'), termClip(target)],
    show: null,
    choices: choices.map(shapeChoice),
    answer: choices.indexOf(target),
  };
}

interface Time {
  readonly hour: number;
  readonly half: boolean;
}

/** An hour from 1 to 12, going round the clock the way the hands do. */
const round = (hour: number): number => ((((hour - 1) % 12) + 12) % 12) + 1;

const sameTime = (a: Time, b: Time): boolean => a.hour === b.hour && a.half === b.half;

/**
 * A clock as it is told to someone who cannot see it: where its two hands are, which is what the
 * time is read from.
 */
export const handsText = ({ hour, half }: Time): string =>
  `Clock, the short hand ${half ? `between ${hour} and ${round(hour + 1)}` : `at ${hour}`} and the long hand at ${half ? 6 : 12}`;

const timeText = ({ hour, half }: Time): string =>
  half ? `${PHRASES['half-past']} ${hour}` : `${hour} ${TERMS.oclock}`;
const timeClips = ({ hour, half }: Time, asked: boolean) =>
  half
    ? [phraseClip('half-past'), numberClip(hour, asked ? 'last' : 'alone')]
    : [numberClip(hour, 'lead'), termClip('oclock')];

/**
 * `count` different times with `time` among them. A clock that is read half past is the slip to
 * catch in a clock read at the hour, so once half pasts have been met the same hour the other way
 * round is always among them, and the others are the hours next to it.
 */
function timesAround(time: Time, count: number, halves: boolean, random: Random): Time[] {
  const hours = [round(time.hour + 1), round(time.hour - 1), round(time.hour + 2), round(time.hour - 2)];
  const asked: Time[] = halves
    ? [
        { hour: time.hour, half: !time.half },
        ...shuffled(
          hours.slice(0, 2).flatMap((hour): Time[] => [
            { hour, half: time.half },
            { hour, half: !time.half },
          ]),
          random,
        ),
      ]
    : shuffled(
        hours.map((hour): Time => ({ hour, half: false })),
        random,
      );
  const others: Time[] = [];
  for (const t of asked)
    if (others.length < count - 1 && !sameTime(t, time) && !others.some((o) => sameTime(o, t))) others.push(t);
  return shuffled([time, ...others], random);
}

function askClock(level: MathsLevel, random: Random): Question {
  const time: Time = { hour: between(1, 12, random), half: level > 1 && random() < 0.5 };
  const times = timesAround(time, level === 2 ? 4 : 3, level > 1, random);
  const answer = times.findIndex((t) => sameTime(t, time));
  if (level < 3) {
    // A clock face is shown, and the choices are the times in words and numbers.
    return {
      strand: 'clock',
      level,
      prompt: PHRASES['what-time'],
      say: [phraseClip('what-time')],
      show: { kind: 'clock', ...time },
      choices: times.map(
        (t): Choice => ({ visual: { kind: 'time', ...t }, label: timeText(t), clips: timeClips(t, false) }),
      ),
      answer,
    };
  }
  // The time is written, and the choices are clock faces. Each is told by where its hands are, and
  // the time is for the player to read from that.
  return {
    strand: 'clock',
    level,
    prompt: `${PHRASES['which-clock']} ${timeText(time)}?`,
    say: [phraseClip('which-clock'), ...timeClips(time, true)],
    show: { kind: 'time', ...time },
    choices: times.map((t): Choice => ({ visual: { kind: 'clock', ...t }, label: handsText(t), clips: [] })),
    answer,
  };
}

/** The repeating parts of a pattern at each level, written with a letter for each bead. */
const UNITS: Readonly<Record<MathsLevel, readonly string[]>> = {
  1: ['AB'],
  2: ['AAB', 'ABB'],
  3: ['ABC', 'AABB', 'ABAC'],
};

function askPattern(level: MathsLevel, random: Random): Question {
  const unit = pick(UNITS[level], random);
  const letters = [...new Set(unit)];
  const beads = shuffled(BEADS, random);
  const beadOf = (letter: string): BeadId => beads[letters.indexOf(letter)]!;
  // Two whole parts and one bead over are shown, so the pattern is plain, and the next bead is
  // asked for.
  const shown = 2 * unit.length + 1;
  const row = Array.from({ length: shown }, (_, i) => beadOf(unit[i % unit.length]!));
  const next = beadOf(unit[shown % unit.length]!);
  // The slips are the other beads of the pattern, and then a bead that is not in it at all.
  const others = [...letters.map(beadOf).filter((b) => b !== next), ...beads.slice(letters.length)];
  const wanted = level === 3 ? 4 : 3;
  const choices = shuffled([next, ...others.slice(0, wanted - 1)], random);
  const show: Visual = { kind: 'beads', beads: [...row, null] };
  return {
    strand: 'pattern',
    level,
    prompt: PHRASES['what-next'],
    say: [phraseClip('what-next')],
    show,
    choices: choices.map(
      (bead): Choice => ({ visual: { kind: 'bead', bead }, label: bead.replace('-', ' '), clips: [] }),
    ),
    answer: choices.indexOf(next),
  };
}

export const SHAPE_STRANDS: readonly StrandDef[] = [
  { id: 'shape', name: 'Shapes', ask: askShape },
  { id: 'clock', name: 'Clocks', ask: askClock },
  { id: 'pattern', name: 'Patterns', ask: askPattern },
];
