import { readFileSync } from 'node:fs';
import { navFor } from '../../src/domain/world';
import { CompiledMap } from '../../src/shared/compiled-map';
import type { MapId } from '../../src/shared/ids';
import { Manifest } from '../../src/shared/manifest';

/**
 * Prints how much room there is on a part of a built map, as text, for placing things by hand:
 * where unicorns can stand, and where a spawn point or an anchor would be refused. Usage: tsx
 * tools/qa/clearance.ts <map> <x,y,w,h> [step] [x,y ...] Each cell shows the room from that point
 * to the nearest obstacle. A point after the step is marked with a letter.
 *   #  no ground      +  ground, but too tight for the feet      .  room for the feet      o  roomy (60 or more)
 */
const [mapArg, rectArg, stepArg, ...marks] = process.argv.slice(2);
if (!mapArg || !rectArg) throw new Error('usage: tsx tools/qa/clearance.ts <map> <x,y,w,h> [step] [x,y ...]');
const [rx = 0, ry = 0, rw = 400, rh = 300] = rectArg.split(',').map(Number);
const step = Number(stepArg ?? 16);

const manifest = Manifest.parse(JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')));
const entry = manifest.maps[mapArg as MapId];
if (!entry) throw new Error(`no map called ${mapArg}`);
const compiled = CompiledMap.parse(JSON.parse(readFileSync(`public/assets/${entry.file}`, 'utf8')));
const nav = navFor(compiled.logic);

const pins = marks.map((m, i) => {
  const [x = 0, y = 0] = m.split(',').map(Number);
  return { x, y, letter: String.fromCharCode(65 + i) };
});

const rows: string[] = [];
for (let y = ry; y < ry + rh; y += step) {
  let line = `${String(y).padStart(5)} `;
  for (let x = rx; x < rx + rw; x += step) {
    const pin = pins.find((p) => Math.abs(p.x - x) < step / 2 && Math.abs(p.y - y) < step / 2);
    if (pin) {
      line += pin.letter;
      continue;
    }
    const p = { x, y };
    if (!nav.isWalkable(p)) line += '#';
    else {
      const room = nav.clearanceAt(p);
      line += room >= 60 ? 'o' : room >= 24 ? '.' : '+';
    }
  }
  rows.push(line);
}
console.log(`${mapArg}, x from ${rx} every ${step}, radius of the feet ${nav.radius}`);
console.log(rows.join('\n'));
for (const p of pins)
  console.log(
    `${p.letter} (${p.x}, ${p.y}) room ${Math.round(nav.clearanceAt(p))}${nav.isWalkable(p) ? '' : ' no ground'}`,
  );
