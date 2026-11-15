import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Rng } from '../../src/domain/rng';
import { SHELL_KINDS, shell } from '../../src/wonder/games/shells';
import { contactSheet, type Rgba } from '../art/core/image';
import { args, flag } from '../lib/args';
import { encodePngRgba } from '../lib/png';

/**
 * Draws the shape every kind of shell makes, as dots, on one sheet, so a shape can be judged by eye
 * before any firework is lit. Dots are coloured by how far along the shell's colours they are and
 * dimmed by how late they light.
 *   tsx tools/qa/shell-sheet.ts [out.png] [--n 220] [--cell 240]
 */
const out = args[0] && !args[0].startsWith('--') ? args[0] : 'assets/source/_scratch/shells.png';
const n = Number(flag('n', '220'));
const cell = Number(flag('cell', '240'));

const hue = (t: number): [number, number, number] => {
  const h = (1 - t) * 4;
  const f = h - Math.floor(h);
  const stops: [number, number, number][] = [
    [255, 90, 90],
    [255, 210, 90],
    [120, 230, 120],
    [90, 190, 255],
    [190, 120, 255],
  ];
  const a = stops[Math.min(4, Math.floor(h))]!;
  const b = stops[Math.min(4, Math.floor(h) + 1)]!;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
};

const frames: Rgba[] = SHELL_KINDS.map((kind) => {
  const data = new Uint8Array(cell * cell * 4);
  for (let i = 0; i < cell * cell; i++) data.set([14, 10, 30, 255], i * 4);
  // A faint unit circle, so a shape's size against its bounds can be seen.
  for (let a = 0; a < 720; a++) {
    const x = Math.round(cell / 2 + Math.cos((a / 720) * Math.PI * 2) * (cell / 2 - 14));
    const y = Math.round(cell / 2 + Math.sin((a / 720) * Math.PI * 2) * (cell / 2 - 14));
    data.set([50, 44, 80, 255], (y * cell + x) * 4);
  }
  const sparks = shell(kind, n, new Rng(3));
  for (const s of sparks) {
    const cx = cell / 2 + s.x * (cell / 2 - 14);
    const cy = cell / 2 + s.y * (cell / 2 - 14);
    const [r, g, b] = hue(s.tone);
    const dim = 1 - Math.min(0.65, s.delay * 2);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (dx * dx + dy * dy > 5) continue;
        const px = Math.round(cx) + dx;
        const py = Math.round(cy) + dy;
        if (px < 0 || py < 0 || px >= cell || py >= cell) continue;
        data.set([r * dim, g * dim, b * dim, 255], (py * cell + px) * 4);
      }
    }
  }
  return { width: cell, height: cell, data };
});

mkdirSync(dirname(out), { recursive: true });
const sheet = contactSheet(frames, { cols: 5, scale: 1, gap: 4, bg: [0, 0, 0, 255] });
writeFileSync(out, encodePngRgba({ width: sheet.width, height: sheet.height, data: sheet.data }));
console.log(`wrote ${out}: ${SHELL_KINDS.join(', ')} (${n} points each)`);
