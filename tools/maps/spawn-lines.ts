import { doorways, fit, lengthFor, lineCandidates } from '../../src/domain/arrival';
import { navFor } from '../../src/domain/world';
import { args } from '../lib/args';
import { mapContext } from './build-maps';
import { compileDraft } from './compile';
import { everyHerd, herdRoomProblems } from './herd-room';

/**
 * For the maps an author is still working on: compiles every authored map without writing
 * anything, and for each spawn that does not hold the herd prints lines that do, ready to paste
 * into the author file. Usage: tsx tools/maps/spawn-lines.ts [map ...]. The compile does not need
 * to pass first, which is the whole point: `herd-line.ts` reads the compiled maps, and a map whose
 * spawn is wrong is never compiled.
 */
const only = new Set(args);
const { compiled, errors } = compileDraft('assets/maps', mapContext());
for (const c of compiled) {
  const map = c.map.logic;
  if (only.size > 0 && !only.has(map.id)) continue;
  const nav = navFor(map);
  const doors = doorways(map);
  for (const group of map.spawns) {
    const herds = map.solo ? [[]] : [...everyHerd()];
    if (herdRoomProblems(nav, group, doors, map.id, map.solo).length === 0) continue;
    const widest = herds.reduce((a, b) => (lengthFor(b) > lengthFor(a) ? b : a));
    const found = lineCandidates(group.points[0]!, group.facing, lengthFor(widest))
      .map((l) => ({ ...l, line: l.line.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })) }))
      .filter((l) =>
        herds.every((herd) => {
          const f = fit(nav, l.line, herd, 30, doors);
          return f.onGround && f.walkable && f.roomy && f.standable;
        }),
      );
    console.log(`\n${map.id}/${group.spawnId}: ${found.length} lines hold every herd`);
    for (const l of found.slice(0, 3))
      console.log(
        `  ${l.what} (score ${l.score.toFixed(1)})\n  b.spawn('${group.spawnId}', '${group.facing}', [${l.line.map((p) => `pt(${p.x}, ${p.y})`).join(', ')}]);`,
      );
  }
}
console.log(`\n${errors.length} problem(s) in all`);
for (const e of errors) console.log(`  ${e}`);
