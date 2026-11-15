import { contactSheet, type Rgba, writePng } from '../core/image';
import { bush, crystals, fern, flowerClump, mushrooms, rock, tallGrass } from './flora';
import { BLOOM, PAL } from './palette';
import { renderScene } from './scene';

/** Usage: tsx tools/art/world/flora-preview.ts */
const t0 = Date.now();
const frames: Rgba[] = [];
const cfg = { width: 128, height: 128, originX: 64, originY: 104, ss: 4 };
const items = [
  bush({ seed: 1, foliage: 'emerald' }),
  bush({ seed: 2, foliage: 'lime', dots: 'pink', dotCount: 14 }),
  bush({ seed: 3, foliage: 'emerald', dots: 'rose', dotCount: 10, scale: 0.8 }),
  flowerClump({ seed: 4, bloom: 'pink' }),
  flowerClump({ seed: 5, bloom: 'sky', bloom2: 'white' }),
  flowerClump({ seed: 6, bloom: 'yellow', count: 7 }),
  rock({ seed: 7, moss: true }),
  rock({ seed: 8, ramp: PAL.dirt, scale: 0.9 }),
  crystals({ seed: 9, hue: 'amethyst', lit: false }),
  crystals({ seed: 10, hue: 'amethyst', lit: true }),
  mushrooms({ seed: 11, cap: BLOOM.rose, spots: true }),
  fern({ seed: 12 }),
  tallGrass({ seed: 13 }),
];
for (const scene of items) frames.push(renderScene(scene, cfg).rgba);
console.log('rendered in', Date.now() - t0, 'ms');
writePng(
  'assets/source/_scratch/flora.png',
  contactSheet(frames, { cols: 7, scale: 2, bg: [112, 168, 110, 255], grid: true }),
);
