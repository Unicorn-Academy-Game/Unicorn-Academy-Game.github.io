import { mkdirSync } from 'node:fs';
import { flag } from '../../lib/args';
import { blit, createRgba, writePng } from '../core/image';
import { cloud, HILLS, hills, rainbow, SKY_STRIP, skyStrip } from './sky';

/**
 * Scratch composite of the palace backdrop. Usage: tsx tools/art/world/sky-preview.ts [--out
 * name.png]
 */
const out = flag('out', 'sky-preview.png');
mkdirSync('assets/source/_scratch', { recursive: true });
const W = 1700,
  H = 700;
const sheet = createRgba(W, H);
const strip = skyStrip();
for (let x = 0; x < W; x += SKY_STRIP.w) blit(sheet, strip, x, 0);
const rb = rainbow({ a: 740, b: 550, band: 20, legs: 140 });
blit(sheet, rb, W / 2 - rb.width / 2, 40);
const clouds = [cloud(3, 300, 120), cloud(8, 220, 96), cloud(12, 380, 130), cloud(21, 180, 80)];
blit(sheet, clouds[0]!, 80, 90);
blit(sheet, clouds[1]!, 1300, 60);
blit(sheet, clouds[2]!, 1180, 260);
blit(sheet, clouds[3]!, 420, 40);
for (let x = 0, v = 0; x < W; x += HILLS.w, v++) blit(sheet, hills({ layer: 'far', variant: v }), x, 360);
for (let x = 0, v = 0; x < W; x += HILLS.w, v++) blit(sheet, hills({ layer: 'near', variant: v + 3 }), x, 440);
writePng(`assets/source/_scratch/${out}`, sheet);
console.log(`wrote ${out}`);
