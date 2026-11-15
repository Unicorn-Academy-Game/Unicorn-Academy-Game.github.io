import { mkdirSync } from 'node:fs';
import { flag } from '../../lib/args';
import { blit, createRgba, upscale, writePng } from '../core/image';
import { BANNER, renderBanner } from './banner';

/**
 * Scratch sheet of banner frames on a wall colour. Usage: tsx tools/art/world/banner-preview.ts
 * [--frames 0,3,6] [--scale 2] [--out name.png]
 */
const frames = flag('frames', '0,3,6,9').split(',').map(Number);
const scale = Number(flag('scale', '2'));
const out = flag('out', 'banner-preview.png');
mkdirSync('assets/source/_scratch', { recursive: true });
const { w, h } = BANNER.canvas;
const sheet = createRgba(w * Math.min(2, frames.length), h * Math.ceil(frames.length / 2), [222, 208, 196, 255]);
frames.forEach((f, i) => {
  blit(sheet, renderBanner(f), (i % 2) * w, Math.floor(i / 2) * h);
});
writePng(`assets/source/_scratch/${out}`, upscale(sheet, scale));
console.log(`wrote ${out}`);
