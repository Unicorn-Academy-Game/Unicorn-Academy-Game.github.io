import { mkdirSync } from 'node:fs';
import { argsOf, measure, openLab, optionsOf, SCENES, type Scene, show } from './reading-lab';

/**
 * Takes a picture of each state of the reading computer's screen at one size, on the lab page, and
 * says what is wrong with each.
 *   tsx tools/qa/reading-shot.ts <out-dir> [--w 844] [--h 390] [--dpr 1] [--scenes all|<part of a name>] [--calm] [--no-voice] [--two-buttons]
 * Each picture is named for its scene. `reading-fit.ts` looks at every size at once and does not
 * take pictures.
 */

const argv = process.argv.slice(2);
const out = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'assets/source/_scratch/reading';
const options = optionsOf(argv);
const which = argsOf(argv).value('scenes', 'all');
const scenes: readonly Scene[] = which === 'all' ? SCENES : SCENES.filter(({ name }) => name.includes(which));

mkdirSync(out, { recursive: true });
const { browser, page } = await openLab(options);
for (const scene of scenes) {
  await show(page, scene);
  const found = await measure(page);
  const file = `${scene.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}-${options.width}x${options.height}.png`;
  await page.screenshot({ path: `${out}/${file}` });
  console.log(
    `${file}  ${found.shape}${found.problems.map((line) => `\n  PROBLEM ${line}`).join('')}${found.warnings.map((line) => `\n  warning ${line}`).join('')}`,
  );
}
console.log(`wrote ${scenes.length} pictures to ${out}`);
await browser.close();
