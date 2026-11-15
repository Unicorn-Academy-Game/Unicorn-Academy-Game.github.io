import { flag } from '../../lib/args';
import { blit, contactSheet, createRgba, type Rgba, writePng } from '../core/image';
import { FX_SPRITES } from './sprites';

/**
 * Contact sheet of effect sprites on a grass-colored ground, for judging them by eye.
 *   tsx tools/art/fx/preview.ts [--only leaf,petal] [--scale 3] [--cols 12] [--bg grass|dark|light] [--out path]
 */
const only = flag('only', '').split(',').filter(Boolean);
const scale = Number(flag('scale', '3'));
const cols = Number(flag('cols', '12'));
const bgName = flag('bg', 'grass');
const out = flag('out', 'assets/source/_scratch/fx.png');
const bg = { grass: [60, 150, 70, 255], dark: [30, 30, 48, 255], light: [220, 226, 240, 255] }[bgName] as [
  number,
  number,
  number,
  number,
];

const frames: Rgba[] = [];
for (const s of FX_SPRITES) {
  if (only.length > 0 && !only.some((o) => s.id.includes(o))) continue;
  const n = s.frames ?? 1;
  for (let f = 0; f < n; f++) {
    const img = s.render(f);
    if (img.width !== s.w || img.height !== s.h)
      throw new Error(`${s.id}: ${img.width}x${img.height} expected ${s.w}x${s.h}`);
    const cell = createRgba(s.w, s.h, bg);
    blit(cell, img, 0, 0);
    frames.push(cell);
  }
}
writePng(out, contactSheet(frames, { cols, scale, gap: 3, bg: [20, 22, 34, 255] }));
console.log(`wrote ${out} with ${frames.length} frames`);
