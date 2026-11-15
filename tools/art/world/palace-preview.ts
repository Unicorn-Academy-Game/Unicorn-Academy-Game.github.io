import { mkdirSync } from 'node:fs';
import { flag } from '../../lib/args';
import { alphaBounds, blit, createRgba, writePng } from '../core/image';
import { BANNER, renderBanner } from './banner';
import { BANNER_ROD_RISE, PALACE_PIECES, type PalacePiece, renderPiece } from './palace';

/**
 * Renders the palace pieces assembled as they stand in the map. Usage: tsx
 * tools/art/world/palace-preview.ts [--out name] [--ss 3] [--only keep,tower-left]
 */
const ss = Number(flag('ss', '3'));
const out = flag('out', 'palace-preview.png');
const only = flag('only', '');
const names = (Object.keys(PALACE_PIECES) as PalacePiece[]).filter((n) => !only || only.split(',').includes(n));
mkdirSync('assets/source/_scratch', { recursive: true });
const W = 1700,
  H = 1000,
  KX = 850,
  KY = 920;
const sheet = createRgba(W, H, [160, 214, 150, 255]);
// Draw back to front: pieces further up the screen first.
const order = [...names].sort((a, b) => PALACE_PIECES[a].at.y - PALACE_PIECES[b].at.y);
for (const n of order) {
  const t0 = Date.now();
  const lay = PALACE_PIECES[n];
  const r = renderPiece(n, lay.canvas, ss);
  const b = alphaBounds(r.img)!;
  console.log(
    `${n}: ${Date.now() - t0} ms, bounds from origin x ${b.x - lay.canvas.ox}..${b.x + b.w - lay.canvas.ox} y ${b.y - lay.canvas.oy}..${b.y + b.h - lay.canvas.oy} (canvas ${lay.canvas.w}x${lay.canvas.h}, origin ${lay.canvas.ox},${lay.canvas.oy}, touching edge: ${b.x === 0 || b.y === 0 || b.x + b.w === lay.canvas.w || b.y + b.h === lay.canvas.h})`,
  );
  blit(sheet, r.img, KX + lay.at.x - lay.canvas.ox, KY + lay.at.y - lay.canvas.oy);
}
const banner = flag('banner', '');
if (banner !== '')
  blit(sheet, renderBanner(Number(banner)), KX - BANNER.canvas.w / 2, KY - BANNER_ROD_RISE - BANNER.rodY);
writePng(`assets/source/_scratch/${out}`, sheet);
console.log(`wrote assets/source/_scratch/${out} ${W}x${H}`);
