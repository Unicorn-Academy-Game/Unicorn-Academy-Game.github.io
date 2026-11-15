import { writeFileSync } from 'node:fs';
import { facingLabel, UNICORN_FACINGS } from '../../src/shared/compass';
import { type Body, COVER, drawnMass, fitBodies, holds, MARGIN } from '../assets/hit-bodies';
import { shippedManifest } from '../lib/unicorn-pictures';

/**
 * Fits the ellipse a tap on a unicorn is tested against to how she is drawn at each of the 32
 * facings, and prints each with how much of her it holds, as she is drawn with the fine sheets and
 * as she is drawn without them. Usage: tsx tools/qa/hit-bodies.ts [--write]
 *   --write  rewrites src/input/unicorn-bodies.ts with the fit. Run it when the pictures change,
 *            because tests/tools/hit-bodies.test.ts fails while the table is not what the pictures
 *            give.
 */
const TABLE_FILE = 'src/input/unicorn-bodies.ts';

/** The text of the table file for these bodies, one for each facing. */
function tableSource(bodies: readonly Body[]): string {
  const rows = bodies.map((b, f) => `  [${b.rx}, ${b.ry}, ${b.cy}], // ${facingLabel(UNICORN_FACINGS[f]!)}`);
  return [
    '// Made by `tsx tools/qa/hit-bodies.ts --write` from the pictures in the sheets. Do not edit it by hand.',
    '// One row for each facing, clockwise from east: the half-width and the half-height of the ellipse, and how high above her feet its center is.',
    '// prettier-ignore',
    'export const UNICORN_BODY_ROWS: readonly (readonly [rx: number, ry: number, cy: number])[] = [',
    ...rows,
    '];',
    '',
  ].join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const unicorns = Object.values(shippedManifest().unicorns);
  const bodies = fitBodies(unicorns);
  console.log(
    `Each ellipse holds ${COVER * 100}% of the pixels she is drawn with, and is ${MARGIN} wider and higher than that.`,
  );
  UNICORN_FACINGS.forEach((facing, i) => {
    const b = bodies[i]!;
    const fine = holds(drawnMass(unicorns, facing, 'fine'), b);
    const first = holds(drawnMass(unicorns, facing, 'first'), b);
    console.log(
      `${facingLabel(facing).padEnd(14)} half-width ${String(b.rx).padStart(3)}  half-height ${String(b.ry).padStart(3)}  center ${String(b.cy).padStart(3)} above her feet  holds ${(fine * 100).toFixed(1)}% of the fine pictures and ${(first * 100).toFixed(1)}% of the first sheet's`,
    );
  });
  if (process.argv.includes('--write')) {
    writeFileSync(TABLE_FILE, tableSource(bodies));
    console.log(`Wrote ${TABLE_FILE}.`);
  }
}
