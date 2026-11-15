import type { UnicornId } from '../../../src/shared/ids';
import { contactSheet, crop, type Rgba, writePng } from '../core/image';
import { UNICORN_IDS, UNICORNS } from './characters';
import { parseFacings } from './facings';
import { makeKit, renderFrame } from './frame';
import { restPose } from './pose';

/**
 * Usage: [CHAR=id,id|all] tsx turnaround.ts <facings,comma|eight|all> <scale> <out.png> [x,y,w,h]
 * One row per character, one column per facing.
 */
const facings = parseFacings(process.argv[2] ?? 'east');
const scale = Number(process.argv[3] ?? 4);
const out = process.argv[4] ?? 'assets/source/_scratch/turnaround.png';
const cropArg = process.argv[5]?.split(',').map(Number);
const charArg = process.env.CHAR ?? 'wildstar';
const ids = charArg === 'all' ? UNICORN_IDS : (charArg.split(',') as UnicornId[]);

const t0 = Date.now();
const frames: Rgba[] = [];
for (const id of ids) {
  const kit = makeKit(UNICORNS[id]);
  for (const f of facings) {
    const fr = renderFrame(kit, restPose(), f);
    frames.push(
      cropArg && cropArg.length === 4 ? crop(fr.rgba, cropArg[0]!, cropArg[1]!, cropArg[2]!, cropArg[3]!) : fr.rgba,
    );
  }
}
console.log('rendered', frames.length, 'in', Date.now() - t0, 'ms');
writePng(
  out,
  contactSheet(frames, {
    cols: Number(process.env.COLS ?? facings.length),
    scale,
    bg: [112, 168, 110, 255],
    grid: true,
  }),
);
console.log('wrote', out);
