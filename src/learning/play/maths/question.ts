import type { WordId } from '../../../content/lexicon';
import type { MathsLevel } from '../../../shared/play';
import type { ClipId } from '../../lines';
import type { TermId } from './clips';

/**
 * What a question of the maths game is. A question is made whole by the rules and handed to the
 * screen as it is: what to ask, what to show, the choices, and which one is right. The screen draws
 * it and keeps no arithmetic, so a question can be checked without a screen.
 */

/**
 * The families of levels the table has. Each has its own tiles, one for each kind of sum, and each
 * kind of sum has three levels of its own. Level 0 is what comes before school sums: counting,
 * shapes, the clock, and sums to twenty with things to count. Level 1 is the sums a child does at
 * school: adding and taking away past twenty, times tables, sharing, and sums with more than one
 * step. The name of a kind of sum is a name in the record of what they have done, and no two
 * families share one.
 */
export const FAMILIES = [
  {
    level: 0,
    about: 'Counting, shapes, clocks and first sums',
    strands: ['count', 'next', 'more', 'add', 'take', 'tens', 'double', 'shape', 'clock', 'pattern'],
  },
  {
    level: 1,
    about: 'Sums from school: adding, taking away, times and sharing',
    strands: ['plus', 'minus', 'times', 'share', 'mixed'],
  },
] as const;
export type Family = (typeof FAMILIES)[number]['level'];
export type StrandId = (typeof FAMILIES)[number]['strands'][number];

/** Every kind of sum, family by family, in the order of the tiles. */
export const STRAND_IDS: readonly StrandId[] = FAMILIES.flatMap((family) => family.strands);

/** The kinds of sum on the tiles of a family. */
export const strandsOf = (family: Family): readonly StrandId[] => FAMILIES[family].strands;

/** The family a kind of sum is in. */
export const familyOf = (strand: StrandId): Family =>
  FAMILIES.find((family) => (family.strands as readonly StrandId[]).includes(strand))!.level;

/** An operation: plus, take away, times, and divided by. */
export type Op = '+' | '-' | '*' | '/';

/** The flat shapes the player is asked to name. Each has a clip of its own. */
export const SHAPES = [
  'circle',
  'square',
  'triangle',
  'rectangle',
  'star',
  'pentagon',
  'hexagon',
] as const satisfies readonly TermId[];
export type ShapeId = (typeof SHAPES)[number];

/**
 * The beads of a pattern: a colour and a shape each, so that two of them are told apart by either.
 */
export const BEADS = [
  'red-circle',
  'blue-square',
  'yellow-star',
  'green-triangle',
  'pink-heart',
  'orange-diamond',
] as const;
export type BeadId = (typeof BEADS)[number];

/** Something to look at. */
export type Visual =
  /** A heap of the same picture to be counted. */
  | { readonly kind: 'things'; readonly word: WordId; readonly count: number }
  /** Two heaps of the same size side by side. */
  | { readonly kind: 'twice'; readonly word: WordId; readonly count: number }
  /** A row of numbers, where a number that is not there yet is `null`. */
  | { readonly kind: 'sequence'; readonly numbers: readonly (number | null)[] }
  /**
   * A sum written out, with pictures of it when `word` is given. A take-away shows all the things
   * and fades the ones taken.
   */
  | {
      readonly kind: 'sum';
      readonly a: number;
      readonly op: '+' | '-';
      readonly b: number;
      readonly word: WordId | null;
    }
  /**
   * A sum of two or more numbers written out, where `ops[i]` stands between `terms[i]` and `terms[i
   * + 1]`.
   */
  | { readonly kind: 'expression'; readonly terms: readonly number[]; readonly ops: readonly Op[] }
  /** Tens as bars of ten and ones as single squares. */
  | { readonly kind: 'blocks'; readonly tens: number; readonly ones: number }
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'words'; readonly text: string }
  | { readonly kind: 'shape'; readonly shape: ShapeId }
  /** A shape with this many straight sides. */
  | { readonly kind: 'polygon'; readonly sides: number }
  /** A time written as a clock in a shop writes it. */
  | { readonly kind: 'time'; readonly hour: number; readonly half: boolean }
  /** A time on a clock face with two hands. */
  | { readonly kind: 'clock'; readonly hour: number; readonly half: boolean }
  /** A row of beads, where the one that is not there yet is `null`. */
  | { readonly kind: 'beads'; readonly beads: readonly (BeadId | null)[] }
  | { readonly kind: 'bead'; readonly bead: BeadId };

/** A thing the player can touch to answer. */
export interface Choice {
  readonly visual: Visual;
  /** What a screen reader says for it. */
  readonly label: string;
  /** What the voice says when it is touched. A choice that has no name to say says nothing. */
  readonly clips: readonly ClipId[];
}

/**
 * The number that answers a question when the answer can be typed in, and nothing otherwise. A
 * question can be typed when its answer is a number and there is something shown to work it out
 * from. A question whose choices are all there is to look at, such as which of three numbers is the
 * biggest, is not one to type, since the choices are the question.
 */
export const typedAnswer = (question: Question): number | null => {
  const right = question.choices[question.answer]?.visual;
  return question.show !== null && right?.kind === 'number' ? right.value : null;
};

export interface Question {
  readonly strand: StrandId;
  readonly level: MathsLevel;
  /** The question as it is written. */
  readonly prompt: string;
  /** The clips that say it. */
  readonly say: readonly ClipId[];
  /** What is looked at in the question, when the choices are not all there is to look at. */
  readonly show: Visual | null;
  readonly choices: readonly Choice[];
  /** The place of the one right choice. */
  readonly answer: number;
}
