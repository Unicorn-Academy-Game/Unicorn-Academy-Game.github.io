import type { UnicornId, Vec2 } from '../shared/ids';
import { dist } from './geometry';
import { slotIndex, slotS, unicornList } from './ops';
import { restingPlace } from './slots';
import type { UnicornActor, World } from './types';

/**
 * How near to somebody a unicorn may choose to settle. A side-on body is 158 units wide, so closer
 * than this and two bodies sit on one another: the "phasing" a child sees when two unicorns share a
 * spot and play different animations.
 */
export const ROOM = 84;

/**
 * A stationary unicorn is not walked through: a route that passes this close to one is not taken.
 */
export const PASSING = 44;

/**
 * Where a follower belongs when the herd stands: the place its slot gives it, which does not move
 * until the leader does.
 */
export function homePlace(world: World, actor: UnicornActor): Vec2 {
  if (actor.id === 'wildstar' || !world.persistent.recruited.includes(actor.id)) return actor.pos;
  return restingPlace(world.trail, slotS(world, actor.id), slotIndex(world, actor.id));
}

/**
 * Who has a claim on a place. A unicorn claims the ground it stands on, the place it is walking to,
 * and the place the herd gives it when it is away from the herd. A worker claims the ground it
 * stands on. Anyone may be chosen to be left out, such as the unicorn that is asking and the friend
 * it is going to nuzzle.
 *
 * Returns who holds the claim, or null when the place is free to settle in.
 */
export function claimOn(world: World, at: Vec2, except: readonly UnicornId[], room: number = ROOM): string | null {
  for (const u of unicornList(world)) {
    if (except.includes(u.id)) continue;
    if (dist(u.pos, at) < room) return u.id;
    const s = u.state;
    if (s.kind === 'approaching' && dist(s.to, at) < room) return u.id;
    if (s.kind !== 'following' && dist(homePlace(world, u), at) < room) return u.id;
  }
  for (const n of world.npcs) if (dist(n.pos, at) < room * 0.75) return n.instanceId;
  return null;
}

/**
 * Whether a route walks through anyone who is standing still. A friend to nuzzle is stood beside,
 * not walked into, so the same rule holds for it: the place to meet is a body's width away from it.
 */
export function passesThrough(world: World, from: Vec2, path: readonly Vec2[], walker: UnicornId): boolean {
  if (path.length === 0) return false;
  const line = [from, ...path];
  for (const u of unicornList(world)) {
    if (u.id === walker || u.speed > 8) continue;
    for (let i = 1; i < line.length; i++) if (segmentDistance(line[i - 1]!, line[i]!, u.pos) < PASSING) return true;
  }
  return false;
}

function segmentDistance(a: Vec2, b: Vec2, p: Vec2): number {
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const l2 = ex * ex + ey * ey;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.y - a.y) * ey) / l2));
  return Math.hypot(p.x - (a.x + ex * t), p.y - (a.y + ey * t));
}
