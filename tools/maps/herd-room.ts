import { type Fit, fit, type Rect, trailOf } from '../../src/domain/arrival';
import { dist } from '../../src/domain/geometry';
import type { Nav } from '../../src/domain/nav/nav';
import { computeSlots, restingPlace } from '../../src/domain/slots';
import type { UnicornId, Vec2 } from '../../src/shared/ids';
import type { SpawnGroup } from '../../src/shared/map';

const FRIENDS: readonly UnicornId[] = ['leaf', 'glacier', 'river', 'cinder', 'storm'];

/**
 * Every herd Wildstar can arrive with: each ordered choice of friends, from none to all five, in
 * every order they were found.
 */
export function* everyHerd(): Generator<UnicornId[]> {
  function* extend(herd: UnicornId[], left: readonly UnicornId[]): Generator<UnicornId[]> {
    yield herd;
    for (const friend of left)
      yield* extend(
        [...herd, friend],
        left.filter((f) => f !== friend),
      );
  }
  yield* extend([], FRIENDS);
}

export interface HerdRoom {
  /** The first herd the line does not hold, and how it fails, or null when it holds every herd. */
  failed: { herd: UnicornId[]; fit: Fit } | null;
  /** Least distance between any two unicorns standing on arrival, over every herd. */
  closest: number;
}

/**
 * Checks that a spawn line holds every possible herd: the line is on ground a unicorn can stand on,
 * its legs can be walked, the friends can be given places a spacing apart along it and every place
 * is on standable ground. The line is the way the herd came in, so how long and how wide it has to
 * be depends on how it turns, which is why this asks the same code that places the herd on arrival.
 */
export function herdRoom(nav: Nav, group: SpawnGroup, doors: readonly Rect[], solo = false): HerdRoom {
  const line: Vec2[] = group.points;
  const room: HerdRoom = { failed: null, closest: Infinity };
  // A room that only Wildstar enters needs to hold her alone.
  for (const herd of solo ? [[]] : everyHerd()) {
    const f = fit(nav, line, herd, 2, doors);
    if (!(f.onGround && f.walkable && f.roomy && f.standable)) {
      room.failed ??= { herd, fit: f };
      continue;
    }
    const trail = trailOf(line);
    const slots = computeSlots(trail, herd);
    const standing = [line[0]!, ...herd.map((id, i) => restingPlace(trail, slots.at.get(id)!, i))];
    for (let i = 0; i < standing.length; i++)
      for (let j = i + 1; j < standing.length; j++)
        room.closest = Math.min(room.closest, dist(standing[i]!, standing[j]!));
  }
  return room;
}

/** What is wrong with a spawn line, in words for a map author, or nothing. */
export function herdRoomProblems(
  nav: Nav,
  group: SpawnGroup,
  doors: readonly Rect[],
  mapId: string,
  solo = false,
): string[] {
  const { failed } = herdRoom(nav, group, doors, solo);
  if (!failed) return [];
  const why = !failed.fit.onGround
    ? 'a point of the line is not on ground a unicorn can stand on'
    : !failed.fit.walkable
      ? 'a leg of the line crosses an obstacle'
      : !failed.fit.roomy
        ? 'the line is too short or too tight, so the last friends would stand on the ones before'
        : 'a friend would stand on ground that cannot be stood on, or in a doorway';
  return [
    `${mapId}: spawn ${group.spawnId} does not hold the herd ${failed.herd.join(', ') || 'of Wildstar alone'}: ${why}`,
  ];
}
