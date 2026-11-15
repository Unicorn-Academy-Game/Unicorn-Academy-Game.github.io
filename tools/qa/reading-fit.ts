import { argsOf, openLab, optionsOf, SCENES, type Scene, sizesFor, WALKS } from './reading-lab';
import { disagreements, findingsIn, type Pass, type Seen, sweepScenes, walkPhases } from './reading-sweep';

/**
 * Looks at the reading computer's screen at every size of screen a child could hold, in every state
 * it is laid out differently in, and says what a person would see wrong: something cut off or off
 * the screen, two things on top of each other or under the buttons in the corner, something too
 * small to tap or to read, a word that does not fit its stage (`reading-sweep.ts` does the walk,
 * and `tests/e2e/reading-layout.spec.ts` holds a shorter list of sizes to zero problems).
 *   tsx tools/qa/reading-fit.ts [--sizes all|few|upright|sideways|<w>x<h>,...] [--scenes all|<part of a name>] [--passes new,resized] [--no-walks|--walks-only] [--calm] [--no-voice] [--two-buttons] [--verbose]
 * It prints a table with a row for each size and a column for each scene, and below it every
 * problem it found. `.` is a scene with nothing wrong, `w` has a warning and `X` has a problem. A
 * scene is looked at when the screen is built at a size, and again when the screen is turned to it;
 * a mark is the worse of the two. Run `pnpm exec vite --port 5173 --strictPort` first.
 */

const argv = process.argv.slice(2);
const args = argsOf(argv);
const options = optionsOf(argv);
const verbose = args.has('verbose');
const sizes = sizesFor(args.value('sizes', 'all'));
const which = args.value('scenes', 'all');
const scenes: readonly Scene[] = which === 'all' ? SCENES : SCENES.filter(({ name }) => name.includes(which));
const passes = args.value('passes', 'new,resized').split(',') as Pass[];

const { browser, page } = await openLab(options);
const base = { width: options.width, height: options.height };
const sweep = args.has('walks-only')
  ? { scenes, sizes, seen: [] }
  : await sweepScenes(page, scenes, sizes, { base, passes, log: console.log });
const { seen } = sweep;

const mark = (items: Seen[]): string =>
  items.some((s) => s.metrics.problems.length > 0) ? 'X' : items.some((s) => s.metrics.warnings.length > 0) ? 'w' : '.';
const at = (n: number): string => String(n + 1).padStart(2);

console.log('\nscenes');
scenes.forEach((scene, n) => {
  console.log(`  ${at(n)} ${scene.name}`);
});
console.log(`\n${'size'.padEnd(34)} ${scenes.map((_, n) => at(n)).join(' ')}`);
for (const size of sizes) {
  const row = scenes.map((scene) => ` ${mark(seen.filter((s) => s.size === size && s.scene === scene))}`).join(' ');
  console.log(`${`${size[0]}x${size[1]} ${size[2]}`.padEnd(34)} ${row}`);
}

let problems = 0;
console.log('');
for (const [key, where] of [...findingsIn(sweep).entries()].sort()) {
  if (key.startsWith('PROBLEM')) problems += where.length;
  console.log(
    `${key}  (${where.length}x) ${verbose || where.length <= 3 ? where.join('; ') : `${where.slice(0, 3).join('; ')}; ...`}`,
  );
}
const apart = disagreements(sweep);
for (const line of apart) console.log(`PROBLEM ${line}`);
problems += apart.length;
console.log(`\n${sizes.length} sizes, ${scenes.length} scenes, ${problems} problems so far`);

// The walks go last, with the report of the scenes already printed, since a walk is the long part
// and a page that is reloaded under it loses it.
if (!args.has('no-walks')) {
  console.log('\nwalking each thing through touching, saying and found');
  const jumps = await walkPhases(page, WALKS, sizes, base, console.log);
  for (const line of jumps) console.log(`PROBLEM ${line}`);
  problems += jumps.length;
  console.log(`${WALKS.length} things walked at ${sizes.length} sizes, ${jumps.length} that grew`);
}
await browser.close();
console.log(`\n${problems} problems`);

console.log('\nsmallest things, by size (tap, text)');
for (const size of sizes) {
  const mine = seen.filter((s) => s.size === size);
  const tap = Math.min(...mine.map((s) => s.metrics.target).filter((n) => n > 0));
  const text = Math.min(...mine.map((s) => s.metrics.text).filter((n) => n > 0));
  console.log(
    `${`${size[0]}x${size[1]}`.padEnd(12)} tap ${String(tap).padStart(3)}px  text ${String(text).padStart(5)}px`,
  );
}
process.exit(problems > 0 ? 1 : 0);
