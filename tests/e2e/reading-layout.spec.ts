import { expect, test } from '@playwright/test';
import { FEW_SCENES, FEW_SIZES, labQuery, optionsOf, WALKS } from '../../tools/qa/reading-lab';
import { disagreements, findingsIn, sweepScenes, walkPhases } from '../../tools/qa/reading-sweep';
import { silence } from '../../tools/qa/silence';
import { PATIENCE } from './helpers';

/**
 * The reading computer's screen on the lab page (the real screen and the real course, with none of
 * the rest of the game around them) at every one of a short list of sizes, from the narrowest phone
 * held upright to a wide window, in every state that is laid out differently from another: the
 * shortest and the longest word, the longest sentence, the first visit, the map of levels at both
 * ends, and the end of a round. Each is looked at twice, built at the size and turned to it,
 * because they are not the same road. What counts as a problem is what a child would see: something
 * cut off or off the screen, two things on top of each other, a button the player cannot reach or
 * hit, a word that does not fit the room it is given, a word that is a different size depending on
 * how the screen came to its size, or a word that grows as the player goes from touching it to
 * saying it to finding it. `pnpm exec tsx tools/qa/reading-fit.ts` prints the same walk as a table
 * over all thirty-one sizes and every scene, for a person to read.
 *
 * The screen is laid out from its own size and not the display's, so it runs on the phone and in
 * WebKit (which lays out the units differently) and on no other project, because this test sets the
 * sizes itself and the project's own screen does not matter. The lab page plays no sound, and it is
 * shut anyway, because WebKit has no mute switch and a page that came to play one would be heard.
 */
test('the reading screen fits every size it is made for, built there and turned to it', async ({ page }, info) => {
  test.skip(
    info.project.name !== 'phone' && info.project.name !== 'webkit',
    'the sizes are set by this test, so a second phone or a desktop shows nothing new',
  );
  test.setTimeout(900_000 * PATIENCE);
  const options = optionsOf([]);
  await silence(page);
  await page.addInitScript('window.__name = (f) => f;');
  await page.setViewportSize({ width: options.width, height: options.height });
  await page.goto(`/tools/lab/reading.html?${labQuery(options)}`);
  await page.waitForFunction(() => (window as unknown as { lab?: unknown }).lab !== undefined, undefined, {
    timeout: 120_000 * PATIENCE,
  });

  const base = { width: options.width, height: options.height };
  const sweep = await sweepScenes(page, FEW_SCENES, FEW_SIZES, { base });
  const problems = [...findingsIn(sweep).entries()]
    .filter(([line]) => line.startsWith('PROBLEM'))
    .map(
      ([line, where]) =>
        `${line} at ${where.slice(0, 4).join('; ')}${where.length > 4 ? `; and ${where.length - 4} more` : ''}`,
    );
  const jumps = await walkPhases(page, WALKS, FEW_SIZES, base);
  expect(
    [...problems, ...disagreements(sweep), ...jumps],
    `${FEW_SIZES.length} sizes, ${FEW_SCENES.length} scenes, ${WALKS.length} things walked`,
  ).toEqual([]);
  // It looked at every scene at every size by both roads, and every look found something to tap.
  expect(sweep.seen).toHaveLength(FEW_SIZES.length * FEW_SCENES.length * 2);
  expect(sweep.seen.every((s) => s.metrics.target > 0)).toBe(true);
  expect(sweep.seen.every((s) => s.metrics.text > 0)).toBe(true);
});
