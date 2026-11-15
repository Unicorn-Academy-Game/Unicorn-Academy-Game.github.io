import { readFileSync } from 'node:fs';
import { doorways, fit, lengthFor, lineCandidates } from '../../src/domain/arrival';
import { navFor } from '../../src/domain/world';
import { CompiledMap } from '../../src/shared/compiled-map';
import { MAP_IDS, type MapId, type UnicornId } from '../../src/shared/ids';
import { Manifest } from '../../src/shared/manifest';
import { args, flag } from '../lib/args';
import { everyHerd } from './herd-room';

/**
 * Suggests spawn lines that hold every herd, for a map author to paste into the map's author file.
 * The game finds a line the same way when a saved game is loaded, so what it suggests here is what
 * a load would do.
 *
 * Usage: tsx tools/maps/herd-line.ts <map>/<spawn> [--clear 30] [--top 5] [--style
 * any|block|straight] It keeps the leader's point and facing and tries straight lines, one bend,
 * and blocks that double back, leading away from the way she faces in eight directions. Each must
 * keep every unicorn on ground with `--clear` units to spare beyond a foot's width and hold every
 * herd.
 */

const [mapId, spawnId] = (args[0] ?? '').split('/') as [MapId, string];
if (!MAP_IDS.includes(mapId) || !spawnId) throw new Error('usage: herd-line.ts <map>/<spawn>');
const manifest = Manifest.parse(JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')));
const map = CompiledMap.parse(JSON.parse(readFileSync(`public/assets/${manifest.maps[mapId]!.file}`, 'utf8'))).logic;
const nav = navFor(map);
const group = map.spawns.find((s) => s.spawnId === spawnId);
if (!group) throw new Error(`no spawn ${spawnId} on ${mapId}`);

const doors = doorways(map);
const clear = Number(flag('clear', '30'));
const top = Number(flag('top', '5'));
const style = flag('style', 'any');
const herds: UnicornId[][] = [...everyHerd()];
const all = herds.reduce((a, b) => (lengthFor(b) > lengthFor(a) ? b : a));

const found = lineCandidates(group.points[0]!, group.facing, lengthFor(all))
  .filter((c) => style === 'any' || c.what.startsWith(style))
  .map((c) => ({ ...c, line: c.line.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })) }))
  .filter((c) =>
    herds.every((herd) => {
      const f = fit(nav, c.line, herd, clear, doors);
      return f.onGround && f.walkable && f.roomy && f.standable;
    }),
  );

console.log(`${mapId}/${spawnId}: ${found.length} lines hold every herd`);
for (const c of found.slice(0, top)) {
  console.log(`\n${c.what} (score ${c.score.toFixed(1)}, ${c.line.length} points)`);
  console.log(`b.spawn('${spawnId}', '${group.facing}', [${c.line.map((p) => `pt(${p.x}, ${p.y})`).join(', ')}]);`);
}
