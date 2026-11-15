import { MAP_IDS, type MapId } from '../shared/ids';
import type { MapAsset, MapExit } from '../shared/manifest';

/**
 * Where a word is found. The manifest says, for every map, which things in it give a word and which
 * ways lead out of it, so the way to a word can be worked out from anywhere without loading a map
 * the player is not in.
 */

/** What a child can find in one map. */
interface Stock {
  /** The things that stand in it and give a word. */
  subjects: ReadonlySet<string>;
  /** The ways out of it, in the order the map lists them. */
  exits: readonly MapExit[];
}

/** Every map of the game and what is in it. */
export type Chart = ReadonlyMap<MapId, Stock>;

export function chartOf(maps: Readonly<Partial<Record<MapId, Pick<MapAsset, 'subjects' | 'exits'>>>>): Chart {
  const chart = new Map<MapId, Stock>();
  for (const id of MAP_IDS) {
    const map = maps[id];
    if (map) chart.set(id, { subjects: new Set(map.subjects), exits: map.exits });
  }
  return chart;
}

/** What it takes to find a word from where the player is. */
export type Route =
  /** The thing that gives it is in the place the player is in, or walks with them. */
  | { kind: 'here' }
  /** It is through `exit`, which is the first of `hops` ways out between the player and it. */
  | { kind: 'onward'; exit: MapExit; hops: number }
  /** No place in the game has a thing that gives it. */
  | { kind: 'nowhere' };

const HERE: Route = { kind: 'here' };
const NOWHERE: Route = { kind: 'nowhere' };

/**
 * The way to the nearest thing that gives a word, by the fewest ways out. `carried` is what walks
 * with her wherever she goes, which is the herd. Of two roads as long as each other the way out
 * that the map lists first is taken, so the road is the same every time.
 */
export function routeTo(chart: Chart, from: MapId, subjects: readonly string[], carried: ReadonlySet<string>): Route {
  if (subjects.some((subject) => carried.has(subject))) return HERE;
  const holds = (id: MapId): boolean => subjects.some((subject) => chart.get(id)?.subjects.has(subject) === true);
  if (!chart.has(from)) return NOWHERE;
  if (holds(from)) return HERE;
  const seen = new Set<MapId>([from]);
  const ahead: { id: MapId; exit: MapExit; hops: number }[] = [];
  const look = (at: MapId, through: MapExit | null, hops: number): void => {
    for (const exit of chart.get(at)?.exits ?? []) {
      if (seen.has(exit.mapId)) continue;
      seen.add(exit.mapId);
      ahead.push({ id: exit.mapId, exit: through ?? exit, hops });
    }
  };
  look(from, null, 1);
  for (let i = 0; i < ahead.length; i++) {
    const { id, exit, hops } = ahead[i]!;
    if (holds(id)) return { kind: 'onward', exit, hops };
    look(id, exit, hops + 1);
  }
  return NOWHERE;
}
