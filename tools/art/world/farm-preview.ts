import { contactSheet, type Rgba, writePng } from '../core/image';
import { CRATES, CROPS, renderBed, renderCrate, renderFence, renderScarecrow } from './farm';

/** Usage: tsx tools/art/world/farm-preview.ts [out.png] */
const t0 = Date.now();
const frames: Rgba[] = [];
for (const crop of CROPS) frames.push(renderBed({ crop, seed: 3 }));
frames.push(renderScarecrow());
for (const kind of CRATES) frames.push(renderCrate(kind));
console.log('rendered', frames.length, 'in', Date.now() - t0, 'ms');
writePng(
  process.argv[2] ?? 'assets/source/_scratch/farm.png',
  contactSheet(frames, { cols: 4, scale: 1, bg: [112, 168, 110, 255], grid: true }),
);
const fences = [renderFence('x'), renderFence('y')];
writePng(
  'assets/source/_scratch/farm-fences.png',
  contactSheet(fences, { cols: 2, scale: 1, bg: [112, 168, 110, 255], grid: true }),
);
