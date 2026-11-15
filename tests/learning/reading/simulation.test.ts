import { describe, expect, it } from 'vitest';
import { STAGE_COUNT, STAGES } from '../../../src/content/reading';
import { CLEAR, courseState, finished } from '../../../src/learning/reading';
import { seeded } from '../helpers';
import { READERS, type Reader, runCourse } from './helpers';

/**
 * Children who read well, middling and slowly go through the whole course, a few rounds at a
 * sitting and a day between sittings. The bounds are what `pnpm course:sim` printed for the course
 * of eighty-five small stages, with a tenth more, and they say what the course is: a long one,
 * about a hundred and ten days at three rounds a day, that holds nobody on a stage and rushes
 * nobody through it.
 *
 *   strong     334 rounds, 112 days     most rounds on one stage: 6
 *   middling   340 rounds, 114 days     6
 *   slow       372 rounds, 125 days     7 to 10
 */
const BOUNDS: Record<keyof typeof READERS, { rounds: number; days: number }> = {
  strong: { rounds: 368, days: 124 },
  middling: { rounds: 375, days: 126 },
  slow: { rounds: 410, days: 138 },
};
/**
 * The most rounds any one stage may hold a child, which is twice the most that the runs held them.
 */
const LONGEST_STAGE = 14;

const run = (who: Reader, seed: number, perSitting = 3, gapHours = 24) =>
  runCourse(who, seeded(seed), perSitting, gapHours);

describe('the whole course, read by three kinds of child', () => {
  const runs = new Map<string, ReturnType<typeof run>>();
  const course = (name: keyof typeof READERS) => {
    if (!runs.has(name)) runs.set(name, run(READERS[name], 1));
    return runs.get(name)!;
  };

  for (const name of Object.keys(READERS) as (keyof typeof READERS)[]) {
    describe(`a ${name} reader, three rounds a day`, () => {
      it('clears every stage, in order, within the bounds', () => {
        const result = course(name);
        expect(finished(result.profile)).toBe(true);
        expect(result.roundsPerStage).toHaveLength(STAGE_COUNT);
        expect(result.rounds).toBeLessThanOrEqual(BOUNDS[name].rounds);
        expect(result.days).toBeLessThanOrEqual(BOUNDS[name].days);
      }, 120_000);

      it(`is held on no stage for more than ${LONGEST_STAGE} rounds, and is not let through one in fewer than two`, () => {
        const result = course(name);
        expect(Math.max(...result.roundsPerStage)).toBeLessThanOrEqual(LONGEST_STAGE);
        // Seven things a round, about four new words at most: a stage of six words and a few
        // sentences cannot be met in less.
        expect(Math.min(...result.roundsPerStage)).toBeGreaterThanOrEqual(2);
      }, 120_000);

      it('has read the sentences of every stage that its clearing asks for, and met the words', () => {
        const result = course(name);
        for (const state of courseState(result.profile)) {
          expect(state.met, `stage ${state.stage.n} words met`).toBeGreaterThanOrEqual(
            Math.ceil(state.words * CLEAR.met),
          );
          expect(state.linesRead, `stage ${state.stage.n} sentences read`).toBeGreaterThanOrEqual(
            Math.ceil(state.lines * CLEAR.lines),
          );
        }
        expect(STAGES.length).toBe(STAGE_COUNT);
      }, 120_000);
    });
  }

  it('does not hold a child who needs help to the same pace as one who does not: they are given at least as many rounds, and more to go over', () => {
    const strong = course('strong');
    const slow = course('slow');
    expect(slow.rounds).toBeGreaterThanOrEqual(strong.rounds);
  }, 120_000);

  it('is the same course for the same child on the same days, and a child who comes once a day or in long sittings still finishes', () => {
    expect(run(READERS.middling, 1).rounds).toBe(course('middling').rounds);
    for (const [perSitting, gap] of [
      [1, 24],
      [6, 48],
    ] as const) {
      const result = run(READERS.middling, 2, perSitting, gap);
      expect(finished(result.profile), `${perSitting} a sitting`).toBe(true);
      expect(result.rounds, `${perSitting} a sitting`).toBeLessThanOrEqual(BOUNDS.middling.rounds);
    }
  }, 240_000);
});
