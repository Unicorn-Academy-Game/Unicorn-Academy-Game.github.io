import { STAGE_COUNT } from '../../src/content/reading';
import { seeded } from '../../tests/learning/helpers';
import { READERS, runCourse } from '../../tests/learning/reading/helpers';

/**
 * `pnpm course:sim`: children who read well, middling and slowly go through the reading course, a
 * few rounds at a sitting and a day between sittings, and this prints how many rounds each stage
 * held them and how many days the course took. It is what `CLEAR` in
 * `src/learning/reading/course.ts` was set by, and `tests/learning/reading/simulation.test.ts`
 * fails when a child is held too long.
 */

const median = (values: readonly number[]): number =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

console.log('who         sitting   rounds  days  per stage: least  median  most');
for (const [name, who] of Object.entries(READERS)) {
  for (const [perSitting, gap] of [
    [3, 24],
    [1, 24],
    [6, 48],
  ] as const) {
    const runs = [1, 2, 3, 4, 5].map((seed) => runCourse(who, seeded(seed), perSitting, gap));
    const rounds = median(runs.map((run) => run.rounds));
    const days = median(runs.map((run) => Math.round(run.days)));
    const stages = runs.flatMap((run) => run.roundsPerStage);
    const cleared = Math.min(...runs.map((run) => run.roundsPerStage.length));
    console.log(
      `${name.padEnd(10)}  ${`${perSitting}/day`.padStart(7)}  ${String(rounds).padStart(7)}  ${String(days).padStart(4)}  ${String(Math.min(...stages)).padStart(17)}  ${String(median(stages)).padStart(6)}  ${String(Math.max(...stages)).padStart(4)}   (${cleared} of ${STAGE_COUNT} stages in the slowest run)`,
    );
  }
}
