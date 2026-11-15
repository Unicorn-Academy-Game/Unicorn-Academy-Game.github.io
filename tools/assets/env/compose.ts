import { mkdirSync } from 'node:fs';
import { blit, createRgba, upscale, writePng } from '../../art/core/image';
import { flag } from '../../lib/args';
import { RECIPES } from './registry';

/**
 * Lays overlay sprites over a base one with their ground anchors together, as the game does, one
 * per frame.
 *
 * Usage: tsx tools/assets/env/compose.ts --base id --over id,id --frames 0,3,6 [--scale 2] [--crop
 * x,y,w,h] [--bg r,g,b] [--out name.png] `--crop` is in the base sprite's pixels and keeps the
 * picture to the part being judged.
 */
const find = (id: string) =>
  RECIPES.find((r) => r.id === id) ??
  (() => {
    throw new Error(`no recipe ${id}`);
  })();
const base = find(flag('base', ''));
const overs = flag('over', '').split(',').filter(Boolean).map(find);
const scale = Number(flag('scale', '2'));
const bg = flag('bg', '30,20,50').split(',').map(Number) as [number, number, number];
const frames = flag('frames', '0').split(',').map(Number);
const [cx, cy, cw, ch] = flag('crop', `0,0,${base.canvas.w},${base.canvas.h}`).split(',').map(Number) as [
  number,
  number,
  number,
  number,
];

const baseImg = base.render(0);
const pad = 8;
const cellW = cw * scale,
  cellH = ch * scale;
const sheet = createRgba(frames.length * (cellW + pad) + pad, cellH + pad * 2, [bg[0], bg[1], bg[2], 255]);
frames.forEach((f, i) => {
  const cell = createRgba(base.canvas.w, base.canvas.h, [bg[0], bg[1], bg[2], 255]);
  blit(cell, baseImg, 0, 0);
  for (const o of overs) {
    const count = o.anim?.frames ?? 1;
    blit(cell, o.render(Math.min(f, count - 1)), base.canvas.ox - o.canvas.ox, base.canvas.oy - o.canvas.oy);
  }
  const part = createRgba(cw, ch, [bg[0], bg[1], bg[2], 255]);
  for (let y = 0; y < ch; y++)
    for (let x = 0; x < cw; x++) {
      const sx = cx + x,
        sy = cy + y;
      if (sx < 0 || sy < 0 || sx >= cell.width || sy >= cell.height) continue;
      const k = (sy * cell.width + sx) * 4,
        d = (y * cw + x) * 4;
      for (let c = 0; c < 4; c++) part.data[d + c] = cell.data[k + c]!;
    }
  blit(sheet, scale === 1 ? part : upscale(part, scale), pad + i * (cellW + pad), pad);
});
mkdirSync('assets/source/_scratch', { recursive: true });
const out = flag('out', 'compose.png');
writePng(`assets/source/_scratch/${out}`, sheet);
console.log(`wrote assets/source/_scratch/${out} ${sheet.width}x${sheet.height}`);
