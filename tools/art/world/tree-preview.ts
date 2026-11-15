import { contactSheet, type Rgba, writePng } from '../core/image';
import { renderScene } from './scene';
import { birch, fir, oak, willow } from './trees';

/** Usage: tsx tools/art/world/tree-preview.ts */
const t0 = Date.now();
const frames: Rgba[] = [];
const cfg = { width: 448, height: 448, originX: 224, originY: 410, ss: 3 };
for (const scene of [
  oak({ seed: 1, foliage: 'emerald' }),
  oak({ seed: 5, foliage: 'lime' }),
  fir({ seed: 2, foliage: 'spruce' }),
  birch({ seed: 3, foliage: 'lime' }),
  willow({ seed: 4, foliage: 'emerald' }),
  oak({ seed: 7, foliage: 'blossom' }),
]) {
  frames.push(renderScene(scene, cfg).rgba);
}
console.log('rendered in', Date.now() - t0, 'ms');
writePng(
  'assets/source/_scratch/trees.png',
  contactSheet(frames, { cols: 3, scale: 1, bg: [112, 168, 110, 255], grid: true }),
);
