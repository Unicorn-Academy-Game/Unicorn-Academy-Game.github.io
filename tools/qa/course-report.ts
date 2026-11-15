import { CHAPTERS, STAGES } from '../../src/content/reading';
import { chapterDifficulties, checkCourse, countCourse } from '../../src/content/reading/check';

/**
 * `pnpm course:report`: what the reading course holds, stage by stage, and what is wrong with it.
 * It prints the table the tests summarise (how many words and sentences there are, how long the
 * words are, how hard each chapter is) so a person can see the course grow as stages are written.
 * The exit code is 1 when `checkCourse` finds anything.
 */

const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

const problems = checkCourse(STAGES, CHAPTERS);
for (const problem of problems) console.log(`stage ${problem.stage ?? '-'}: ${problem.what}`);

console.log('stage  title                     words  tricky  lines  tiles  words/line  difficulty');
for (const stage of STAGES) {
  const tiles = mean([...stage.words, ...stage.tricky].map((word) => word.tiles.length));
  const perLine = mean(stage.lines.map((line) => line.words.length));
  const hardness = chapterDifficulties(STAGES, [{ id: 'meadow', title: '', from: stage.n, to: stage.n }])[0]!;
  console.log(
    `${String(stage.n).padStart(5)}  ${stage.title.padEnd(24)}  ${String(stage.words.length).padStart(5)}  ${String(stage.tricky.length).padStart(6)}  ${String(stage.lines.length).padStart(5)}  ${tiles.toFixed(2).padStart(5)}  ${perLine.toFixed(1).padStart(10)}  ${hardness.toFixed(2).padStart(10)}`,
  );
}

const counts = countCourse(STAGES);
console.log(
  `\n${counts.stages} stages, ${counts.words} words to sound out, ${counts.tricky} tricky words, ${counts.lines} sentences, ${counts.kinds} kinds of tile`,
);
console.log(`longest word ${counts.longestWord} tiles, longest sentence ${counts.longestLine} words`);
const hardness = chapterDifficulties(STAGES, CHAPTERS);
console.log(
  `difficulty by chapter: ${CHAPTERS.map((chapter, i) => `${chapter.title} ${hardness[i]!.toFixed(2)}`).join(', ')}`,
);
console.log(
  `the last chapter is ${(hardness[hardness.length - 1]! / hardness[0]!).toFixed(2)} times as hard as the first`,
);
console.log(
  problems.length === 0 ? 'nothing is wrong with the course' : `${problems.length} things are wrong with the course`,
);
process.exit(problems.length === 0 ? 0 : 1);
