import type { Facing } from '../../src/shared/ids';
import { contactSheet, writePng } from '../art/core/image';
import { FOLK } from '../art/human/cast';
import { renderHuman } from '../art/human/frame';
import { CAST } from '../art/human/index';
import { flag } from '../lib/args';

/**
 * One picture of the whole cast, to look at: each person standing facing the viewer, facing east,
 * from behind, and waving. `tsx tools/qa/folk-sheet.ts [--only a,b] [--clip idle] [--out path]`
 */
const only = flag('only', '').split(',').filter(Boolean);
const ids = only.length > 0 ? only : Object.keys(FOLK);
const out = flag('out', 'assets/source/_scratch/folk-sheet.png');
const clip = flag('clip', 'idle');
const frames = [];
for (const id of ids) {
  const member = CAST[id];
  if (!member) throw new Error(`no one called ${id}`);
  for (const [name, facing] of [
    [clip, 'south'],
    [clip, 'east'],
    [clip, 'north'],
    [clip === 'dance' ? 'dance' : 'tend', 'south'],
  ] as const) {
    const spec = member.clips[name]!;
    const k = spec.at(0.25, facing as Facing);
    frames.push(renderHuman(member.character, k.pose, facing as Facing, k.extras).rgba);
  }
}
writePng(out, contactSheet(frames, { cols: 4, scale: 2, bg: [112, 168, 110, 255], gap: 2 }));
console.log(`wrote ${out}: ${ids.join(', ')}`);
