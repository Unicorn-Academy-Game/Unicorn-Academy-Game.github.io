import type { PropDef } from '../../content/props';
import type { Vec2 } from '../../shared/ids';
import type { Interactable } from '../../shared/map';
import { CONFIG } from '../config';
import { dist } from '../geometry';
import { emit, unicornList } from '../ops';
import { Rng } from '../rng';
import type { Pickup, Pickups, World } from '../types';

/**
 * Fruit and vegetables. A tree or a bed that is tapped lets some fall; they land near where
 * Wildstar stands and stay until a unicorn walks over them. They are never used up and never saved,
 * so this is a toy and not a chore.
 */

/**
 * What mixes the world's seed into the pickups' own stream, so they never draw from the unicorns'.
 * It spells "pick".
 */
const PICKUP_SEED = 0x7069636b;

const TAU = Math.PI * 2;

export const newPickups = (seed: number): Pickups => ({ rng: new Rng((seed ^ PICKUP_SEED) >>> 0), list: [], made: 0 });

/**
 * A place near `origin` where a unicorn can stand, at some distance from it and from the others
 * that fell with it.
 */
function landing(world: World, origin: Vec2, taken: readonly Vec2[]): Vec2 {
  const { rng } = world.pickups;
  const C = CONFIG.pickups;
  for (let i = 0; i < C.tries; i++) {
    const a = rng.range(0, TAU);
    const r = rng.range(C.reachMin, C.reachMax);
    // Ground is drawn flattened, so a ring is wider than it is tall.
    const p = { x: origin.x + Math.cos(a) * r, y: origin.y + Math.sin(a) * r * 0.7 };
    if (!world.nav.isWalkable(p, 0) || !world.nav.lineOfSight(origin, p)) continue;
    if (taken.some((t) => dist(t, p) < C.apart)) continue;
    return p;
  }
  return world.nav.freePointNear(origin, taken, C.apart, C.reachMax) ?? origin;
}

/** Gathers the oldest, as if by magic, to make room. */
function gatherOldest(world: World): void {
  const oldest = world.pickups.list.shift();
  if (oldest)
    emit(world, {
      type: 'produce-collected',
      pickupId: oldest.id,
      produce: oldest.produce,
      at: oldest.to,
      by: 'wildstar',
    });
}

/**
 * Lets fruit or vegetables fall from a tree or a bed, around the place Wildstar stands to reach it.
 */
export function dropProduce(world: World, inst: Interactable, def: PropDef): void {
  const harvest = def.harvest;
  if (!harvest) return;
  const { rng, list } = world.pickups;
  const origin = inst.approach[0]!.pos;
  const count = harvest.count[0] + rng.int(harvest.count[1] - harvest.count[0] + 1);
  const taken = list.map((p) => p.to);
  for (let i = 0; i < count; i++) {
    while (list.length >= CONFIG.pickups.cap) gatherOldest(world);
    const to = landing(world, origin, taken);
    taken.push(to);
    const pickup: Pickup = {
      id: `pickup-${++world.pickups.made}`,
      produce: rng.pick(harvest.produce),
      from: { x: inst.pos.x, y: inst.pos.y },
      lift: harvest.height,
      to,
      born: world.time + i * 0.09,
    };
    list.push(pickup);
    emit(world, { type: 'produce-dropped', produce: pickup.produce, from: pickup.from, to });
  }
}

/** Whoever stands closest to a pickup that has landed, if anyone is near enough, gathers it. */
export function stepPickups(world: World): void {
  const { list } = world.pickups;
  if (list.length === 0) return;
  const herd = unicornList(world).filter((u) => world.persistent.recruited.includes(u.id));
  for (let i = 0; i < list.length; i++) {
    const p = list[i]!;
    if (world.time < p.born + CONFIG.pickups.fall) continue;
    let by: (typeof herd)[number] | undefined;
    let nearest: number = CONFIG.pickups.gather;
    for (const u of herd) {
      const d = dist(u.pos, p.to);
      if (d <= nearest) {
        nearest = d;
        by = u;
      }
    }
    if (!by) continue;
    list.splice(i--, 1);
    emit(world, { type: 'produce-collected', pickupId: p.id, produce: p.produce, at: p.to, by: by.id });
  }
}
