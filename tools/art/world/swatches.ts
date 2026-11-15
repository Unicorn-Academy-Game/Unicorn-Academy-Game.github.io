import type { RGB } from '../core/color';
import { createRgba, upscale, writePng } from '../core/image';
import { BARK, BIRCH, BLOOM, FOLIAGE, GEM, PAL } from './palette';

/**
 * Renders every ramp as a row of swatches, for tuning the palette by eye. Usage: tsx
 * tools/art/world/swatches.ts
 */
const rows: [string, readonly RGB[]][] = [
  ...Object.entries(PAL),
  ...Object.entries(FOLIAGE).map(([k, v]): [string, readonly RGB[]] => [`foliage-${k}`, v]),
  ['bark', BARK],
  ['birch', BIRCH],
  ...Object.entries(BLOOM).map(([k, v]): [string, readonly RGB[]] => [`bloom-${k}`, v]),
  ...Object.entries(GEM).map(([k, v]): [string, readonly RGB[]] => [`gem-${k}`, v]),
];
const cell = 14;
const img = createRgba(8 * cell, rows.length * cell, [34, 30, 46, 255]);
rows.forEach(([, ramp], y) => {
  ramp.forEach((c, x) => {
    for (let py = 0; py < cell - 2; py++)
      for (let px = 0; px < cell - 2; px++)
        img.data.set([c[0], c[1], c[2], 255], ((y * cell + py) * img.width + x * cell + px) * 4);
  });
});
writePng('assets/source/_scratch/swatches.png', upscale(img, 3));
console.log(rows.map(([k]) => k).join(', '));
