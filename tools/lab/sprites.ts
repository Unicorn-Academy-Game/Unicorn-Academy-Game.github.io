import { pageTexture } from '../../src/render/keys';
import { Manifest } from '../../src/shared/manifest';
import { drawPic, SpriteBank } from '../../src/wonder/engine/bank';

/**
 * Every frame of some sprites of a bundle, side by side with its name, its size and the point it is
 * anchored by, so a picture can be looked at before a game uses it.
 *   ?bundle=life&names=butterfly-monarch-flutter,fish-gold-swim&scale=3&bg=sky|dark|grass&wide=1100&only=0
 * Without `names` it shows every sprite of the bundle. `names` matches by prefix, so `names=fish-`
 * shows all of them. `only=N` shows a single frame.
 */
const q = new URLSearchParams(location.search);
const bundle = q.get('bundle') ?? 'life';
const scale = Number(q.get('scale') ?? 3);
const wide = Number(q.get('wide') ?? 1100);
const background = q.get('bg') ?? 'sky';
const only = q.has('only') ? Number(q.get('only')) : -1;
const wanted = (q.get('names') ?? '').split(',').filter(Boolean);

const manifest = Manifest.parse(await (await fetch('/assets/manifest.json')).json());
const pages = manifest.bundles[bundle]?.pages ?? [];
const images = new Map<string, HTMLImageElement>();
await Promise.all(
  pages.map(
    (page, i) =>
      new Promise<void>((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
          images.set(pageTexture(bundle, i), image);
          resolve();
        };
        image.onerror = () => reject(new Error(`could not load ${page.file}`));
        image.src = `/assets/${page.file}`;
      }),
  ),
);
const bank = new SpriteBank(manifest, (key) => images.get(key));
const names = Object.keys(manifest.bundles[bundle]?.sprites ?? {}).filter(
  (n) => wanted.length === 0 || wanted.some((w) => n.startsWith(w)),
);

const LABEL = 18;
const PAD = 8;
interface Cell {
  readonly name: string;
  readonly index: number;
  readonly w: number;
  readonly h: number;
}
const cells: Cell[] = [];
const rows: { name: string; frames: number; cells: Cell[] }[] = [];
for (const name of names) {
  const count = bank.frameCount(bundle, name);
  const row: Cell[] = [];
  for (let i = 0; i < count; i++) {
    if (only >= 0 && i !== only) continue;
    const pic = bank.spriteFrame(bundle, name, i)!;
    row.push({ name, index: i, w: pic.sw, h: pic.sh });
  }
  rows.push({ name, frames: count, cells: row });
  cells.push(...row);
}

const canvas = document.getElementById('sheet') as HTMLCanvasElement;
const placed: { cell: Cell; x: number; y: number }[] = [];
let y = PAD;
const labels: { text: string; x: number; y: number }[] = [];
for (const row of rows) {
  labels.push({ text: `${row.name}  ${row.frames} frames`, x: PAD, y: y + 12 });
  y += LABEL;
  let x = PAD;
  let lineHeight = 0;
  for (const cell of row.cells) {
    const cw = cell.w * scale + PAD;
    if (x + cw > wide) {
      x = PAD;
      y += lineHeight + PAD;
      lineHeight = 0;
    }
    placed.push({ cell, x, y });
    x += cw;
    lineHeight = Math.max(lineHeight, cell.h * scale);
  }
  y += lineHeight + PAD * 2;
}
canvas.width = wide;
canvas.height = Math.max(40, y);
const g = canvas.getContext('2d')!;
const fill = g.createLinearGradient(0, 0, 0, canvas.height);
if (background === 'dark') {
  fill.addColorStop(0, '#1a1730');
  fill.addColorStop(1, '#2c2650');
} else if (background === 'grass') {
  fill.addColorStop(0, '#86d36b');
  fill.addColorStop(1, '#4ea05a');
} else {
  fill.addColorStop(0, '#8fd2ff');
  fill.addColorStop(1, '#e6f6ff');
}
g.fillStyle = fill;
g.fillRect(0, 0, canvas.width, canvas.height);
g.font = '600 12px system-ui';
for (const l of labels) {
  g.fillStyle = background === 'dark' ? '#fff' : '#123';
  g.fillText(l.text, l.x, l.y);
}
for (const { cell, x: px, y: py } of placed) {
  const pic = bank.spriteFrame(bundle, cell.name, cell.index)!;
  g.strokeStyle = 'rgba(255,0,120,0.35)';
  g.strokeRect(px + 0.5, py + 0.5, cell.w * scale, cell.h * scale);
  drawPic(g, pic, px + pic.ax * scale, py + pic.ay * scale, { scale });
  g.fillStyle = '#f0a';
  g.fillRect(px + pic.ax * scale - 2, py + pic.ay * scale - 2, 4, 4);
}
document.title = `${rows.length} sprites ${cells.length} frames`;
