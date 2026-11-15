import { mkdirSync } from 'node:fs';
import { blit, createRgba, type Rgba, upscale, writePng } from '../../art/core/image';
import { args, flag } from '../../lib/args';
import { RECIPES } from './registry';

/**
 * A contact sheet of recipes, for looking at art before it goes through the full build. Usage: tsx
 * tools/assets/env/preview.ts <id|prefix*,...> [--frames 0,3|all] [--bg r,g,b] [--scale 1] [--out
 * name.png] [--w 1800] [--pad 16]
 */
const patterns = (args.find((a) => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--')) ?? '')
  .split(',')
  .filter(Boolean);
const scale = Number(flag('scale', '1'));
const maxW = Number(flag('w', '1800'));
const pad = Number(flag('pad', '16'));
const bg = flag('bg', '150,206,128').split(',').map(Number) as [number, number, number];
const out = flag('out', 'recipes.png');
const framesArg = flag('frames', '0');

const matches = RECIPES.filter((r) =>
  patterns.some((p) => (p.endsWith('*') ? r.id.startsWith(p.slice(0, -1)) : r.id === p)),
);
if (matches.length === 0) throw new Error(`no recipe matches ${patterns.join(',')}; ${RECIPES.length} recipes exist`);

interface Cell {
  img: Rgba;
  label: string;
  ox: number;
  oy: number;
}
const cells: Cell[] = [];
for (const r of matches) {
  const count = r.anim?.frames ?? 1;
  const frames =
    framesArg === 'all'
      ? Array.from({ length: count }, (_, i) => i)
      : framesArg
          .split(',')
          .map(Number)
          .filter((f) => f < count);
  for (const f of frames) {
    const t0 = Date.now();
    const img = r.render(f);
    console.log(
      `${r.id}#${f}: ${Date.now() - t0} ms ${img.width}x${img.height} (canvas ${r.canvas.w}x${r.canvas.h} origin ${r.canvas.ox},${r.canvas.oy})`,
    );
    cells.push({
      img: scale === 1 ? img : upscale(img, scale),
      label: `${r.id}#${f}`,
      ox: r.canvas.ox * scale,
      oy: r.canvas.oy * scale,
    });
  }
}

// Shelf layout: wrap rows at maxW, each row as tall as its tallest cell.
interface Placed {
  cell: Cell;
  x: number;
  y: number;
}
const placed: Placed[] = [];
let x = pad,
  y = pad,
  rowH = 0,
  width = 0;
for (const c of cells) {
  if (x + c.img.width + pad > maxW && x > pad) {
    x = pad;
    y += rowH + pad;
    rowH = 0;
  }
  placed.push({ cell: c, x, y });
  x += c.img.width + pad;
  rowH = Math.max(rowH, c.img.height);
  width = Math.max(width, x);
}
const sheet = createRgba(width, y + rowH + pad, [bg[0], bg[1], bg[2], 255]);
for (const p of placed) {
  blit(sheet, p.cell.img, p.x, p.y);
  // A small cross at the ground anchor so placement can be judged.
  const ax = p.x + p.cell.ox,
    ay = p.y + p.cell.oy;
  for (let d = -3; d <= 3; d++) {
    for (const [px, py] of [
      [ax + d, ay],
      [ax, ay + d],
    ] as const) {
      if (px >= 0 && py >= 0 && px < sheet.width && py < sheet.height) {
        const i = (py * sheet.width + px) * 4;
        sheet.data[i] = 255;
        sheet.data[i + 1] = 0;
        sheet.data[i + 2] = 80;
        sheet.data[i + 3] = 255;
      }
    }
  }
}
mkdirSync('assets/source/_scratch', { recursive: true });
writePng(`assets/source/_scratch/${out}`, sheet);
console.log(
  `wrote assets/source/_scratch/${out} ${sheet.width}x${sheet.height}: ${placed.map((p) => p.cell.label).join(', ')}`,
);
