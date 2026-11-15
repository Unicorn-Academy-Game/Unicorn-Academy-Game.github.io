import { SOUTH } from '../../../src/shared/compass';
import type { UnicornId } from '../../../src/shared/ids';
import { contactSheet, writePng } from '../core/image';
import { clipPose } from './anims';
import { type Coat, coatSpec } from './coats';
import { makeKit, renderFrame } from './frame';

/**
 * Looks at coats. Usage: tsx coats-preview.ts out.png base:coat:mane[:vivid] ... (degrees round the
 * colour wheel)
 */
const [out, ...items] = process.argv.slice(2);
if (!out || items.length === 0) throw new Error('usage: coats-preview out.png base:coat:mane[:vivid] ...');
const frames = items.map((item) => {
  const [base, coat, mane, vivid] = item.split(':');
  const c: Coat = {
    id: item,
    base: base as UnicornId,
    coat: Number(coat),
    mane: Number(mane),
    ...(vivid ? { vivid: Number(vivid) } : {}),
  };
  const spec = coatSpec(c);
  return renderFrame(makeKit(spec), clipPose(spec, 'idle', 0, SOUTH), SOUTH).rgba;
});
writePng(out, contactSheet(frames, { cols: Math.min(6, frames.length), scale: 2, gap: 2, bg: [196, 164, 112, 255] }));
console.log(`wrote ${out}`);
