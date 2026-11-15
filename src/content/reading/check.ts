import { WORD_PATTERN } from '../../shared/learning';
import { HETERONYMS, IRREGULAR, NAMES, SUPPORT_WORDS, UNWELCOME } from './rules';
import type { Chapter, ChapterId, ReadWord, Stage, Tile } from './types';

/**
 * What is wrong with a course, said so that the author can find it. The course is data that a child
 * meets one stage at a time, so a word they cannot sound out with what they have been taught, or a
 * sentence with a word they have not met, is caught when the tests run.
 */
export interface Problem {
  /** The stage it is in, or none when it is about the course as a whole. */
  readonly stage: number | null;
  readonly what: string;
}

export interface Limits {
  readonly minStages: number;
  /** Words to sound out, and words that are spelled by name. */
  readonly minWords: number;
  readonly minTricky: number;
  readonly minLines: number;
  readonly minStageWords: number;
  readonly minStageLines: number;
  /**
   * A round is seven things, so a stage has at least this many words and sentences between them.
   */
  readonly minStageItems: number;
  /** The fewest and the most words a sentence has, in each chapter. */
  readonly lineWords: Readonly<Record<ChapterId, readonly [number, number]>>;
  /** What the screen has room for: the most tiles in a word and letters in a sentence. */
  readonly maxTiles: number;
  readonly maxLineChars: number;
  /** How much harder the last chapter is than the first, at least, as a multiple. */
  readonly growth: number;
  /**
   * How much easier a chapter may be than the one before it. A chapter is a handful of stages, so a
   * dip of a few tenths is how its words were cut.
   */
  readonly slack: number;
}

export const COURSE_LIMITS: Limits = {
  minStages: 30,
  minWords: 500,
  minTricky: 50,
  minLines: 200,
  minStageWords: 5,
  minStageLines: 3,
  minStageItems: 8,
  lineWords: {
    tiny: [3, 7],
    meadow: [3, 8],
    farm: [3, 8],
    pond: [4, 10],
    beach: [4, 10],
    forest: [4, 11],
    treehouse: [4, 11],
    palace: [5, 13],
    garden: [5, 13],
    sky: [5, 15],
    stars: [5, 15],
    rainbow: [6, 20],
    unicorn: [6, 20],
  },
  maxTiles: 12,
  maxLineChars: 96,
  growth: 2,
  slack: 0.5,
};

/**
 * The most tiles of a word that are read without a gap, since a word that is put together out of
 * parts is read a part at a time.
 */
function longestPart(word: ReadWord): number {
  let longest = 0;
  let run = 0;
  for (const tile of word.tiles) {
    run = tile.gap === true ? 1 : run + 1;
    longest = Math.max(longest, run);
  }
  return longest;
}

const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

/**
 * Which kind of tile this is: the letters, the sound they make and whether they are one end of a
 * split digraph.
 */
const kindOf = (tile: Tile): string => `${tile.letters}:${tile.sound ?? '-'}:${tile.split ?? ''}`;

/**
 * The stage at which each kind of tile is first asked for in a word to sound out. A tile that comes
 * late is a rarer one.
 */
function firstSeen(stages: readonly Stage[]): Map<string, number> {
  const seen = new Map<string, number>();
  for (const stage of stages) {
    for (const word of stage.words) {
      for (const tile of word.tiles) if (!seen.has(kindOf(tile))) seen.set(kindOf(tile), stage.n);
    }
  }
  return seen;
}

/**
 * How hard a stage is, as one number. It adds up the length of the words (the tiles to touch), half
 * the length of the sentences, and how late the tiles of its words came into the course (0 for the
 * first stage and 6 for a stage that is all of the newest), so a stage that is harder in any of the
 * three scores higher.
 */
function stageDifficulty(stage: Stage, seen: ReadonlyMap<string, number>, stageCount: number): number {
  const tiles = mean([...stage.words, ...stage.tricky].map((word) => word.tiles.length));
  const lineWords = mean(stage.lines.map((line) => line.words.length));
  const rarity = mean(
    stage.words
      .flatMap((word) => word.tiles)
      .map((tile) => ((seen.get(kindOf(tile)) ?? 1) - 1) / Math.max(1, stageCount - 1)),
  );
  return tiles + lineWords / 2 + 6 * rarity;
}

/** The difficulty of each chapter, which is the mean of its stages. */
export function chapterDifficulties(stages: readonly Stage[], chapters: readonly Chapter[]): number[] {
  const seen = firstSeen(stages);
  return chapters.map((chapter) =>
    mean(
      stages
        .filter((stage) => stage.n >= chapter.from && stage.n <= chapter.to)
        .map((stage) => stageDifficulty(stage, seen, stages.length)),
    ),
  );
}

export interface Counts {
  readonly stages: number;
  readonly words: number;
  readonly tricky: number;
  readonly lines: number;
  /** The kinds of tile there are, which is each group of letters with each sound it makes. */
  readonly kinds: number;
  readonly longestWord: number;
  readonly longestLine: number;
}

export function countCourse(stages: readonly Stage[]): Counts {
  const words = stages.flatMap((stage) => [...stage.words, ...stage.tricky]);
  const lines = stages.flatMap((stage) => stage.lines);
  return {
    stages: stages.length,
    words: stages.reduce((sum, stage) => sum + stage.words.length, 0),
    tricky: stages.reduce((sum, stage) => sum + stage.tricky.length, 0),
    lines: lines.length,
    kinds: firstSeen(stages).size,
    longestWord: Math.max(0, ...words.map((word) => word.tiles.length)),
    longestLine: Math.max(0, ...lines.map((line) => line.words.length)),
  };
}

const UNWELCOME_SET: ReadonlySet<string> = new Set(UNWELCOME);
const NAME_SET: ReadonlySet<string> = new Set(NAMES);
const HETERONYM_SET: ReadonlySet<string> = new Set(HETERONYMS);
const SUPPORT_SET: ReadonlySet<string> = new Set(SUPPORT_WORDS);

export function checkCourse(
  stages: readonly Stage[],
  chapters: readonly Chapter[],
  limits: Limits = COURSE_LIMITS,
): Problem[] {
  const problems: Problem[] = [];
  const say = (stage: number | null, what: string): void => void problems.push({ stage, what });

  if (stages.length < limits.minStages)
    say(null, `there are ${stages.length} stages and at least ${limits.minStages} are wanted`);

  let next = 1;
  for (const chapter of chapters) {
    if (chapter.from !== next || chapter.to < chapter.from)
      say(
        null,
        `chapter ${chapter.id} runs from stage ${chapter.from} to ${chapter.to}, and the one before it ended at stage ${next - 1}`,
      );
    next = chapter.to + 1;
  }
  if (next - 1 !== stages.length)
    say(null, `the chapters end at stage ${next - 1} and there are ${stages.length} stages`);

  const titles = new Set<string>();
  const known = new Set<string>();
  const words = new Set<string>();
  const lineIds = new Set<string>();
  stages.forEach((stage, index) => {
    const at = stage.n;
    if (at !== index + 1) say(at, `it says it is stage ${at} and is number ${index + 1} in the list`);
    if (stage.title.trim().length < 3) say(at, 'it has no title');
    if (titles.has(stage.title)) say(at, `its title "${stage.title}" is the title of another stage`);
    titles.add(stage.title);
    if (stage.words.length < limits.minStageWords)
      say(at, `it has ${stage.words.length} words to sound out and at least ${limits.minStageWords} are wanted`);
    if (stage.lines.length < limits.minStageLines)
      say(at, `it has ${stage.lines.length} sentences and at least ${limits.minStageLines} are wanted`);
    if (stage.words.length + stage.lines.length < limits.minStageItems)
      say(
        at,
        `it has ${stage.words.length + stage.lines.length} words and sentences and at least ${limits.minStageItems} are wanted, to fill a round`,
      );
    for (const word of stage.words.slice(0, 3)) {
      const longest = longestPart(word);
      if (longest > 5)
        say(at, `"${word.id}" is one of the three words the level map shows and it has ${longest} tiles in a row`);
    }

    for (const word of [...stage.words, ...stage.tricky]) {
      const id = word.id;
      if (!WORD_PATTERN.test(id)) say(at, `"${id}" is not a word the book can keep`);
      if (words.has(id)) say(at, `"${id}" is already in an earlier stage or twice in this one`);
      words.add(id);
      known.add(id);
      if (word.stage !== at) say(at, `"${id}" says it is in stage ${word.stage}`);
      if (UNWELCOME_SET.has(id)) say(at, `"${id}" has no place in this game`);
      if (NAME_SET.has(id)) say(at, `"${id}" is a name`);
      if (HETERONYM_SET.has(id)) say(at, `"${id}" is said two ways and the clip says one`);
      if (word.tiles.map((tile) => tile.letters).join('') !== id)
        say(at, `the tiles of "${id}" spell "${word.tiles.map((tile) => tile.letters).join('')}"`);
      if (word.tiles.length > limits.maxTiles)
        say(at, `"${id}" has ${word.tiles.length} tiles and the screen has room for ${limits.maxTiles}`);
      if (word.tricky) {
        if (word.tiles.some((tile) => tile.name !== true || tile.sound !== null))
          say(at, `the tricky word "${id}" has a tile that is not a letter name`);
      } else {
        if (word.tiles.some((tile) => tile.name === true))
          say(at, `the word "${id}" is sounded out and has a tile that says a letter name`);
        if (
          word.tiles.some(
            (tile) =>
              tile.sound === null &&
              !(tile.letters === 'e' && (tile.split === 'end' || tile === word.tiles[word.tiles.length - 1])),
          )
        ) {
          say(at, `the word "${id}" has a tile with no sound that is not a silent e`);
        }
        if (IRREGULAR.has(id) && word.explicit !== true)
          say(at, `"${id}" does not sound the way it is spelled, so it is a tricky word or its tiles are written out`);
      }
    }

    const [fewest, most] = limits.lineWords[stage.chapter];
    const own = new Set([...stage.words, ...stage.tricky].map((word) => word.id));
    for (const line of stage.lines) {
      const label = `"${line.text}"`;
      if (lineIds.has(line.id)) say(at, `${label} is the same sentence as one before it`);
      lineIds.add(line.id);
      if (line.stage !== at) say(at, `${label} says it is in stage ${line.stage}`);
      if (line.words.length < fewest || line.words.length > most)
        say(at, `${label} has ${line.words.length} words, and a ${stage.chapter} sentence has ${fewest} to ${most}`);
      if (line.text.length > limits.maxLineChars)
        say(at, `${label} is ${line.text.length} letters and the screen has room for ${limits.maxLineChars}`);
      if (!line.words.some((word) => own.has(word))) say(at, `${label} has no word of this stage`);
      for (const word of line.words) {
        if (!known.has(word) && !SUPPORT_SET.has(word))
          say(at, `${label} has "${word}", which has not been met by this stage`);
        if (UNWELCOME_SET.has(word)) say(at, `${label} has "${word}", which has no place in this game`);
        if (NAME_SET.has(word)) say(at, `${label} has "${word}", which is a name`);
        if (HETERONYM_SET.has(word)) say(at, `${label} has "${word}", which is said two ways`);
      }
    }
  });

  const counts = countCourse(stages);
  if (counts.words < limits.minWords)
    say(null, `there are ${counts.words} words to sound out and at least ${limits.minWords} are wanted`);
  if (counts.tricky < limits.minTricky)
    say(null, `there are ${counts.tricky} tricky words and at least ${limits.minTricky} are wanted`);
  if (counts.lines < limits.minLines)
    say(null, `there are ${counts.lines} sentences and at least ${limits.minLines} are wanted`);

  const hardness = chapterDifficulties(stages, chapters);
  hardness.forEach((value, i) => {
    const before = hardness[i - 1];
    if (before !== undefined && value < before - limits.slack)
      say(
        null,
        `chapter ${chapters[i]!.id} is easier (${value.toFixed(2)}) than the one before it (${before.toFixed(2)})`,
      );
  });
  const first = hardness[0];
  const last = hardness[hardness.length - 1];
  if (first !== undefined && last !== undefined && last < limits.growth * first) {
    say(
      null,
      `the last chapter (${last.toFixed(2)}) is not ${limits.growth} times as hard as the first (${first.toFixed(2)})`,
    );
  }
  return problems;
}
