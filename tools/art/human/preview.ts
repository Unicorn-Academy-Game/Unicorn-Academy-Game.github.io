import type { Facing } from '../../../src/shared/ids';
import { args, flag } from '../../lib/args';
import { contactSheet, crop, writePng } from '../core/image';
import { renderHuman } from './frame';
import { CAST } from './index';

/**
 * `npx tsx tools/art/human/preview.ts gardener water [--facings south,east] [--scale 2] [--out
 * path] [--frames 0,2,4]`
 */
const [id, clipName] = args;
const member = CAST[id ?? ''];
if (!member || !clipName) {
  console.error(
    `usage: preview.ts <${Object.keys(CAST).join('|')}> <clip> [--facings a,b] [--scale n] [--out path] [--frames 0,1,2] [--crop x,y,w,h]`,
  );
  process.exit(1);
}
const clip = member.clips[clipName];
if (!clip) {
  console.error(`no clip ${clipName}; have ${Object.keys(member.clips).join(', ')}`);
  process.exit(1);
}
const facings = flag('facings', 'south,east,north,west').split(',') as Facing[];
const scale = Number(flag('scale', '2'));
const only = flag('frames', '').split(',').filter(Boolean).map(Number);
const box = flag('crop', '').split(',').filter(Boolean).map(Number);
const out = flag('out', `assets/source/_scratch/${id}-${clipName}.png`);
const picks = only.length ? only : Array.from({ length: clip.frames }, (_, i) => i);
const frames = [];
for (const facing of facings) {
  for (const i of picks) {
    const k = clip.at(i / clip.frames, facing);
    const img = renderHuman(member.character, k.pose, facing, k.extras).rgba;
    frames.push(box.length === 4 ? crop(img, box[0]!, box[1]!, box[2]!, box[3]!) : img);
  }
}
writePng(out, contactSheet(frames, { cols: picks.length, scale, bg: [112, 168, 110, 255], gap: 2 }));
console.log(`wrote ${out} (${frames.length} frames)`);
