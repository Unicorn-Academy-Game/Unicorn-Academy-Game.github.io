import type { ClipName } from '../../../src/shared/ids';
import { contactSheet, crop, type Rgba, writePng } from '../core/image';
import { CLIPS, clipPose } from './anims';
import { UNICORNS } from './characters';
import { parseFacings } from './facings';
import { makeKit, renderFrame } from './frame';
import { legStretch, makeRig } from './model';

/**
 * Usage: [CHAR=id] [COLS=n] tsx clip-sheet.ts <clip> <facings,comma|eight|all> <scale> <out.png>
 * [x,y,w,h]
 */
const clip = (process.argv[2] ?? 'walk') as ClipName;
const facings = parseFacings(process.argv[3] ?? 'east');
const scale = Number(process.argv[4] ?? 2);
const out = process.argv[5] ?? 'assets/source/_scratch/clip.png';
const cropArg = process.argv[6]?.split(',').map(Number);

const def = CLIPS[clip];
const spec = UNICORNS[(process.env.CHAR ?? 'wildstar') as keyof typeof UNICORNS];
const kit = makeKit(spec);
const frames: Rgba[] = [];
const t0 = Date.now();
for (const facing of facings) {
  for (let i = 0; i < def.frames; i++) {
    const pose = clipPose(spec, clip, i, facing);
    const worst = Math.max(...Object.values(legStretch(makeRig(spec.build, pose), pose)));
    if (worst > 1) console.warn(`${clip} ${facing} frame ${i}: leg stretched to ${worst.toFixed(3)} of reach`);
    const fr = renderFrame(kit, pose, facing);
    frames.push(
      cropArg && cropArg.length === 4 ? crop(fr.rgba, cropArg[0]!, cropArg[1]!, cropArg[2]!, cropArg[3]!) : fr.rgba,
    );
  }
}
console.log(`rendered ${frames.length} frames in ${Date.now() - t0} ms`);
writePng(
  out,
  contactSheet(frames, { cols: Number(process.env.COLS ?? def.frames), scale, bg: [112, 168, 110, 255], grid: true }),
);
console.log('wrote', out);
