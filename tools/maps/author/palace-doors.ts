import type { MapId } from '../../../src/shared/ids';
import { HALL } from '../../art/world/hall';
import type { MapBuilder } from './builder';
import { stand as E, pt } from './geom';

/** What a room is called in the name of a door, a portal or a spawn: `hall`, `dining`. */
const shortOf = (id: MapId): string => id.replace(/^palace-/, '');

/**
 * The herd arrives in a line straight down from a doorway, from just beyond the doorway to nearly
 * the front of the room. The whole herd of five needs 574 units of it.
 */
export const ARRIVAL = [470, 765, 1060] as const;

/**
 * A door in the back wall of a room of the palace, at the middle of a wall piece, to another room.
 * The room gets a spawn just inside the door named for where the herd came from, so a door and the
 * room beyond it always meet. The floor below a doorway is kept clear, so the herd has the room to
 * stand in.
 */
export function doorway(b: MapBuilder, x: number, to: MapId): void {
  const y = HALL.wallY;
  const name = `door-to-${shortOf(to)}`;
  b.interactable({
    name,
    definitionId: 'door',
    look: 'palace-room',
    pos: pt(x, y),
    hit: { x: x - 92, y: y - 214, w: 184, h: 236 },
    approach: [E(x, y + 38, 'north')],
  });
  b.portal({
    name: `to-${shortOf(to)}`,
    bounds: { x: x - 56, y: y + 22, w: 112, h: 44 },
    approach: pt(x, y + 38),
    toMap: to,
    toSpawn: `from-${shortOf(b.opts.id)}`,
    door: name,
  });
  b.spawn(
    `from-${shortOf(to)}`,
    'south',
    ARRIVAL.map((y) => pt(x, y)),
  );
}
