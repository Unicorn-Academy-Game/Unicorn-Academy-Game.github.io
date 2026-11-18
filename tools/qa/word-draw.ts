import { contactSheet, writePng } from '../art/core/image';
import { WORD_DRAWINGS } from '../art/world/words';
import { args, flag } from '../lib/args';

/**
 * Draws the pictures of words straight from their drawing functions and lays them on one sheet, in
 * a second and with no build and no browser, so a drawing can be changed and looked at at once.
 *   tsx tools/qa/word-draw.ts <out.png> [--only fern,maple] [--scale 4] [--cols 10]
 * With no `--only` it draws every word. A word's picture in the game is cut from the same pixels,
 * so what is on the sheet is what the build packs.
 */
const out = args[0] ?? 'assets/source/_scratch/word-draw.png';
const scale = Number(flag('scale', '4'));
const cols = Number(flag('cols', '10'));
const only = flag('only', '')
  .split(',')
  .filter((id) => id !== '');

const ids = (Object.keys(WORD_DRAWINGS) as (keyof typeof WORD_DRAWINGS)[]).filter(
  (id) => only.length === 0 || only.includes(id),
);
const unknown = only.filter((id) => !(id in WORD_DRAWINGS));
if (unknown.length > 0) throw new Error(`no drawing for ${unknown.join(', ')}`);
writePng(
  out,
  contactSheet(
    ids.map((id) => WORD_DRAWINGS[id]()),
    { cols, scale, gap: 6, bg: [200, 228, 250, 255] },
  ),
);
console.log(`wrote ${out} with ${ids.length} pictures: ${ids.join(' ')}`);
