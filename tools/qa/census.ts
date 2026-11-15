import { readFileSync, writeFileSync } from 'node:fs';
import { CompiledMap } from '../../src/shared/compiled-map';
import { MAP_IDS, type MapId } from '../../src/shared/ids';
import { Manifest } from '../../src/shared/manifest';
import { flag } from '../lib/args';
import { report, runCensus } from './census-core';

/**
 * Plays the built maps with no screen and prints what looks wrong to a child (see census-core.ts).
 *
 * Usage: tsx tools/qa/census.ts [--minutes 6] [--seeds 4] [--map forest] [--json out.json] [--fast
 * 0.25] [--close 60] [--steer 0.6]
 *        [--trace "stable [from forest 4f seed4],214,218,storm,river" --every 3]
 *   --map    only start on this map
 *   --fast   a change that undoes itself within this many seconds counts as a flicker
 *   --close  two unicorns nearer than this many units, for half a second or more, count as stacked
 *   --steer  the share of play spent holding a finger on the screen to steer Wildstar, instead of
 *            tapping (default none)
 *   --trace  print what the named unicorns do every few steps, in the run whose label contains the
 *            first part, between the two times
 */

const manifest = Manifest.parse(JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')));
const maps = Object.fromEntries(
  MAP_IDS.map((id) => [
    id,
    CompiledMap.parse(JSON.parse(readFileSync(`public/assets/${manifest.maps[id]!.file}`, 'utf8'))).logic,
  ]),
) as Record<MapId, CompiledMap['logic']>;

const [where = '', from = '0', to = '0', ...who] = flag('trace', '').split(',');
const only = flag('map', '') as MapId | '';
const options = {
  minutes: Number(flag('minutes', '6')),
  seeds: Number(flag('seeds', '4')),
  only: only || undefined,
  fast: Number(flag('fast', '0.25')),
  close: Number(flag('close', '60')),
  steering: Number(flag('steer', '0')) || undefined,
  styles: flag('styles', '') ? flag('styles', '').split(',').map(Number) : undefined,
  trace: where ? { where, from: Number(from), to: Number(to), who, every: Number(flag('every', '3')) } : undefined,
};

const started = Date.now();
const census = runCensus(maps, options);
for (const line of report(census, options)) console.log(line);
console.log(`\n(${((Date.now() - started) / 1000).toFixed(0)} s)`);
const json = flag('json', '');
if (json) writeFileSync(json, JSON.stringify(census, null, 1));
