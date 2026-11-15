import { readFileSync } from 'node:fs';
import { doorways, trailOf } from '../../src/domain/arrival';
import { computeSlots, restingPlace } from '../../src/domain/slots';
import { navFor } from '../../src/domain/world';
import { CompiledMap } from '../../src/shared/compiled-map';
import { MAP_IDS, type MapId, type UnicornId } from '../../src/shared/ids';
import { Manifest } from '../../src/shared/manifest';
import { flag } from '../lib/args';
import { herdRoom } from './herd-room';

/**
 * Prints whether each built map's spawn lines hold every herd, and can draw one to see why not.
 *
 * Usage: tsx tools/maps/herd-rooms.ts [--draw forest/start] [--herd
 * leaf,glacier,river,cinder,storm] The drawing marks ground a unicorn cannot stand on with #, the
 * line's points with digits, Wildstar with W and the herd with the first letter of each name.
 */

const manifest = Manifest.parse(JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')));
const maps = Object.fromEntries(
  MAP_IDS.map((id) => [
    id,
    CompiledMap.parse(JSON.parse(readFileSync(`public/assets/${manifest.maps[id]!.file}`, 'utf8'))).logic,
  ]),
) as Record<MapId, CompiledMap['logic']>;

for (const id of MAP_IDS) {
  const nav = navFor(maps[id]);
  for (const group of maps[id].spawns) {
    const room = herdRoom(nav, group, doorways(maps[id]), maps[id].solo === true);
    const length = group.points
      .slice(1)
      .reduce((sum, p, i) => sum + Math.hypot(p.x - group.points[i]!.x, p.y - group.points[i]!.y), 0);
    const verdict = room.failed
      ? `FAILS for ${room.failed.herd.join(',') || 'Wildstar alone'} (on ground ${room.failed.fit.onGround}, walkable ${room.failed.fit.walkable}, roomy ${room.failed.fit.roomy}, standable ${room.failed.fit.standable})`
      : 'holds every herd';
    console.log(
      `${id}/${group.spawnId}: line ${length.toFixed(0)} long, closest ${room.closest.toFixed(0)}: ${verdict}`,
    );
  }
}

const draw = flag('draw');
if (draw) {
  const [id, spawnId] = draw.split('/') as [MapId, string];
  const map = maps[id];
  const nav = navFor(map);
  const group = map.spawns.find((s) => s.spawnId === spawnId);
  if (!group) throw new Error(`no spawn ${draw}`);
  const herd = (flag('herd') || 'leaf,glacier,river,cinder,storm').split(',').filter(Boolean) as UnicornId[];
  const leader = group.points[0]!;
  const trail = trailOf(group.points);
  const slots = computeSlots(trail, herd);
  const marks = new Map<string, string>();
  const cell = 24;
  const key = (x: number, y: number): string => `${Math.round(x / cell)},${Math.round(y / cell)}`;
  group.points.forEach((p, i) => {
    marks.set(key(p.x, p.y), String(i));
  });
  marks.set(key(leader.x, leader.y), 'W');
  herd.forEach((who, i) => {
    const p = restingPlace(trail, slots.at.get(who)!, i);
    marks.set(key(p.x, p.y), who[0]!.toUpperCase());
  });
  for (const portal of map.portals) marks.set(key(portal.approach.x, portal.approach.y), 'D');
  const xs = [...group.points.map((p) => p.x), leader.x],
    ys = [...group.points.map((p) => p.y), leader.y];
  const x0 = Math.max(0, Math.min(...xs) - 360),
    x1 = Math.min(map.widthTiles * 64, Math.max(...xs) + 360);
  const y0 = Math.max(0, Math.min(...ys) - 300),
    y1 = Math.min(map.heightTiles * 64, Math.max(...ys) + 300);
  console.log(
    `\n${draw}, herd ${herd.join(',') || 'none'}, ${slots.cramped ? 'CRAMPED' : 'roomy'}; one character is ${cell} units; x from ${Math.round(x0)}, y from ${Math.round(y0)}`,
  );
  for (let y = y0; y <= y1; y += cell) {
    let row = '';
    for (let x = x0; x <= x1; x += cell) row += marks.get(key(x, y)) ?? (nav.isWalkable({ x, y }, 2) ? '.' : '#');
    console.log(row);
  }
}
