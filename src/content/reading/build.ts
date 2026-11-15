import { CourseError, START_TAUGHT, type Taught, teach } from './graphemes';
import { idOf, nameTiles, parseWord } from './parse';
import type { Chapter, ChapterId, Line, ReadWord, Stage, StageSource } from './types';

/** The words of a list written in a stage, which are separated by any space. */
const listOf = (text: string | undefined): string[] => (text ?? '').split(/\s+/).filter((word) => word !== '');

/** Says which item a `CourseError` is about. */
function about<T>(what: string, make: () => T): T {
  try {
    return make();
  } catch (error) {
    if (error instanceof CourseError) throw new CourseError(`${what}: ${error.message}`);
    throw error;
  }
}

/**
 * A sentence as the player reads it, and the words in it. Throws a `CourseError` for anything that
 * is not a sentence for a beginner.
 */
export function lineOf(text: string, stage: number): Line {
  if (!/^[A-Z]/.test(text)) throw new CourseError(`"${text}" does not begin with a capital letter`);
  if (!/[.!?]$/.test(text)) throw new CourseError(`"${text}" does not end with a mark`);
  const words = text.split(' ').map((token) => {
    const found = /^([A-Za-z]+)[.,!?]*$/.exec(token);
    if (!found) throw new CourseError(`"${token}" in "${text}" is not a word with marks after it`);
    return found[1]!.toLowerCase();
  });
  return { id: words.join('-'), text, words, stage };
}

function build(source: StageSource, n: number, chapter: ChapterId, taught: Taught): Stage {
  const prefer = source.prefer ?? {};
  const words: ReadWord[] = listOf(source.words).map((spec) =>
    about(`the word "${spec}"`, () => ({
      id: idOf(spec),
      tiles: parseWord(spec, taught, prefer),
      tricky: false,
      stage: n,
      ...(spec.includes('=') ? { explicit: true as const } : {}),
    })),
  );
  const tricky: ReadWord[] = listOf(source.tricky).map((word) =>
    about(`the tricky word "${word}"`, () => {
      if (!/^[a-z]{2,24}$/.test(word)) throw new CourseError('it is not a word that can be asked');
      return { id: word, tiles: nameTiles(word), tricky: true, stage: n };
    }),
  );
  // The words are in the order the author teaches them. The sentences are sorted, shortest first,
  // so that a round can take from the front.
  const lines = source.lines
    .map((text) => about('a sentence', () => lineOf(text, n)))
    .sort((a, b) => a.words.length - b.words.length);
  return { n, chapter, title: source.title, teaches: source.teaches, words, tricky, lines };
}

const chapterOf = (chapters: readonly Chapter[], n: number): ChapterId => {
  const found = chapters.find((chapter) => n >= chapter.from && n <= chapter.to);
  if (!found) throw new CourseError(`stage ${n} is in no chapter`);
  return found.id;
};

/**
 * Turns what the stages are written as into stages. Each stage may use what it and the stages
 * before it teach, and a stage that does not is thrown, with its number.
 */
export function buildStages(sources: readonly StageSource[], chapters: readonly Chapter[]): Stage[] {
  let taught = START_TAUGHT;
  return sources.map((source, i) => {
    const n = i + 1;
    return about(`stage ${n} (${source.title})`, () => {
      taught = teach(taught, source.teaches);
      return build(source, n, chapterOf(chapters, n), taught);
    });
  });
}
