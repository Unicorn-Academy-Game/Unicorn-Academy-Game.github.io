import { buildStages } from './build';
import { BEACH } from './stages/beach';
import { FARM } from './stages/farm';
import { FOREST } from './stages/forest';
import { GARDEN } from './stages/garden';
import { MEADOW } from './stages/meadow';
import { PALACE } from './stages/palace';
import { POND } from './stages/pond';
import { RAINBOW } from './stages/rainbow';
import { SKY } from './stages/sky';
import { STARS } from './stages/stars';
import { TINY } from './stages/tiny';
import { TREEHOUSE } from './stages/treehouse';
import { UNICORN } from './stages/unicorn';
import type { Chapter, Line, ReadWord, Stage, StageSource } from './types';

/**
 * The reading course: eighty-five stages in thirteen chapters, from "a cat in a hat" to "butterfly"
 * and "unicorn". The stages are written in `stages/` as lists of words and sentences, and cut into
 * tiles here, once, by what each stage has taught. `check.ts` says what is wrong with them, and the
 * tests run it, so nothing in this list reaches a child that the player cannot read with what they
 * were taught.
 *
 * A stage is small, so that a round or two clears it, and the player can play any of them at any
 * time. A chapter is a place on the map, which is a handful of stages with one thing in common.
 */

export const CHAPTERS: readonly Chapter[] = [
  { id: 'tiny', title: 'Tiny Tales', from: 1, to: 5 },
  { id: 'meadow', title: 'The Meadow', from: 6, to: 11 },
  { id: 'farm', title: 'The Farm', from: 12, to: 17 },
  { id: 'pond', title: 'The Pond', from: 18, to: 23 },
  { id: 'beach', title: 'The Beach', from: 24, to: 29 },
  { id: 'forest', title: 'The Forest', from: 30, to: 35 },
  { id: 'treehouse', title: 'The Treehouse', from: 36, to: 41 },
  { id: 'palace', title: 'The Palace', from: 42, to: 49 },
  { id: 'garden', title: 'The Garden', from: 50, to: 55 },
  { id: 'sky', title: 'The Sky', from: 56, to: 63 },
  { id: 'stars', title: 'The Stars', from: 64, to: 71 },
  { id: 'rainbow', title: 'The Rainbow', from: 72, to: 79 },
  { id: 'unicorn', title: 'Unicorn Land', from: 80, to: 85 },
];

const SOURCES: readonly StageSource[] = [
  ...TINY,
  ...MEADOW,
  ...FARM,
  ...POND,
  ...BEACH,
  ...FOREST,
  ...TREEHOUSE,
  ...PALACE,
  ...GARDEN,
  ...SKY,
  ...STARS,
  ...RAINBOW,
  ...UNICORN,
];

export const STAGES: readonly Stage[] = buildStages(SOURCES, CHAPTERS);
export const STAGE_COUNT = STAGES.length;

const WORDS: ReadonlyMap<string, ReadWord> = new Map(
  STAGES.flatMap((stage) => [...stage.words, ...stage.tricky]).map((word) => [word.id, word]),
);
const LINES: ReadonlyMap<string, Line> = new Map(STAGES.flatMap((stage) => stage.lines).map((line) => [line.id, line]));

/** Every word of the course, to sound out or to spell, in the order of the stages. */
export const READ_WORDS: readonly ReadWord[] = [...WORDS.values()];
/** Every sentence of the course, in the order of the stages. */
export const READ_LINES: readonly Line[] = [...LINES.values()];

export const readWord = (id: string): ReadWord | undefined => WORDS.get(id);
export const readLine = (id: string): Line | undefined => LINES.get(id);

/**
 * The stage with this number, counted from 1. A number that is not a stage is a mistake in the
 * game, and is thrown.
 */
export function stageAt(n: number): Stage {
  const stage = STAGES[n - 1];
  if (!stage) throw new RangeError(`there is no reading stage ${n}`);
  return stage;
}

export const chapterAt = (n: number): Chapter => {
  const chapter = CHAPTERS.find((c) => n >= c.from && n <= c.to);
  if (!chapter) throw new RangeError(`stage ${n} is in no chapter`);
  return chapter;
};
