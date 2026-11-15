import { cardinalOf } from '../../shared/compass';
import type { Vec2 } from '../../shared/ids';
import { wayBack } from '../arrival';
import { CONFIG } from '../config';
import { copy, dist, isFiniteVec } from '../geometry';
import { effect, emit, unicornList } from '../ops';
import type { Command, World } from '../types';
import { beginTravel, calm } from './leader';

/**
 * Keeping Wildstar where a finger can move her.
 *
 * She is led by a finger and slides along what is in her way. She is sent to a place by a route
 * made of cell centres. So there are places her feet fit and no route can begin: a lane a little
 * narrower than a cell, a gap about as wide as her feet that she slid through, a patch of cells
 * that nothing joins to the rest. Standing in one she answers a held finger and ignores every tap.
 * Two things keep her out of them. A command that sets her off first puts her on open ground if she
 * is not on it already, and is answered from there. And a watch notices, on every step, that she is
 * meant to be moving and is not, whatever the cause, and puts her right in steps that grow: send
 * her again, then set her down on open ground.
 */

const leaderOf = (world: World) => world.unicorns.wildstar!;

/** Everyone else's place, so she is not put down on a friend. */
function crowd(world: World): Vec2[] {
  const out: Vec2[] = [];
  for (const u of unicornList(world)) if (u !== leaderOf(world) && isFiniteVec(u.pos)) out.push(u.pos);
  for (const n of world.npcs) if (isFiniteVec(n.pos)) out.push(n.pos);
  return out;
}

/**
 * Puts her down at `to`. The trail is laid again from there with the way back behind her, and keeps
 * the arc length it had, so each of the herd is still at the place on it that its own arc length
 * says and runs to it from where it stands.
 */
function setDown(world: World, to: Vec2, why: 'misplaced' | 'stalled'): void {
  const a = leaderOf(world);
  if (isFiniteVec(a.pos)) effect(world, 'relocate', a.pos, 0.8);
  a.pos = copy(to);
  a.prev = copy(to);
  a.vel = { x: 0, y: 0 };
  a.speed = 0;
  a.path = null;
  world.leader.seat = null;
  const head = world.trail.head;
  world.trail.seed(wayBack(world.nav, a.pos, cardinalOf(a.facing)).reverse(), Number.isFinite(head) ? head : undefined);
  world.idle.lastLeaderMove = world.time;
  effect(world, 'relocate', a.pos, 0.8);
  emit(world, { type: 'leader-reset', why, at: copy(a.pos) });
}

/**
 * Puts her on open ground that she can be sent from, away from everyone, and says so. False when
 * the map has none. It is the nearest, or when `toward` says where she is headed, the one among the
 * nearest from which she gets there soonest. A hop for being stuck lands somewhere other than where
 * she was stuck.
 */
export function reseat(world: World, why: 'misplaced' | 'stalled', toward?: Vec2): boolean {
  const a = leaderOf(world);
  const lost = !isFiniteVec(a.pos);
  const avoid = crowd(world);
  if (why === 'stalled' && !lost) avoid.push(a.pos);
  const origin = lost ? world.leader.watch.good : a.pos;
  const to = world.nav.openGroundNear(origin, avoid, CONFIG.footing.apart, toward) ?? world.nav.openGroundNear(origin);
  if (!to) return false;
  setDown(world, to, why);
  return true;
}

/** Where a command that sets her off means her to go, so that she is put down on the side of it. */
function aimOf(world: World, command: Command): Vec2 | undefined {
  switch (command.type) {
    case 'move':
      return command.destination;
    case 'greet':
      return world.unicorns[command.unicornId]?.pos;
    case 'interact':
      return (
        world.npcs.find((n) => n.instanceId === command.instanceId)?.pos ??
        world.interactables.get(command.instanceId)?.pos
      );
    default:
      return undefined;
  }
}

/** A command that sets her off is answered from a place she can be set off from. */
export function ensureFooting(world: World, command: Command): void {
  const toward = aimOf(world, command);
  if (toward && !world.nav.canSetOff(leaderOf(world).pos)) reseat(world, 'misplaced', toward);
}

/**
 * True when the ground ahead lets her take a step the way she is held, which a tree she is leaning
 * on does not. It is the test her own step makes.
 */
function opens(world: World, from: Vec2, way: Vec2): boolean {
  const reach = CONFIG.speed.leader * CONFIG.step;
  const to = world.nav.slide(from, { x: from.x + way.x * reach, y: from.y + way.y * reach });
  return dist(from, to) >= CONFIG.steer.blockedBelow * reach;
}

/**
 * Whether she ought to be going somewhere: on a route, or led toward open ground, and not busy with
 * a cast, a door or a drink.
 */
function meantToMove(world: World): boolean {
  const a = leaderOf(world);
  const L = world.leader;
  if (L.portalAt || a.state.kind !== 'leading') return false;
  if (L.steer) return L.steer.want !== null && opens(world, a.pos, L.steer.want);
  return L.phase === 'pathing' || L.phase === 'walking';
}

/** Runs once per step, after she has moved. */
export function stepFooting(world: World): void {
  if (world.paused) return;
  const a = leaderOf(world);
  const L = world.leader;
  const W = L.watch;
  const cfg = CONFIG.footing;

  // Not a place, or one her feet do not fit in: nothing she is told can move her from there.
  if (!isFiniteVec(a.pos) || !world.nav.isWalkable(a.pos, -CONFIG.nav.standSlack)) {
    reseat(world, 'misplaced');
    if (a.state.kind === 'leading') calm(world);
    W.at = copy(a.pos);
    W.since = world.time;
    W.strikes = 0;
    return;
  }

  if (world.time - W.checkedAt >= cfg.noteEvery) {
    W.checkedAt = world.time;
    if (world.nav.canSetOff(a.pos)) W.good = copy(a.pos);
  }

  // She has gone somewhere, which is all that was wanted.
  if (dist(a.pos, W.at) >= cfg.moved) {
    W.at = copy(a.pos);
    W.since = world.time;
    W.strikes = 0;
    return;
  }
  // Nothing is asked of her, so there is nothing to wait for. A finger that was stood down takes a
  // step or two to say again, and the count of how often she has been put right is not forgotten
  // for that.
  if (!meantToMove(world)) {
    W.at = copy(a.pos);
    W.since = world.time;
    return;
  }
  if (world.time - W.since < cfg.patience) return;

  W.since = world.time;
  if (world.time - W.struckAt > cfg.forgive) W.strikes = 0;
  W.strikes += 1;
  W.struckAt = world.time;
  // First she is sent again where she was going. Then she is stood down, and set down on open
  // ground. Past that, only stood down.
  if (W.strikes === 1 && !L.steer && L.goal) {
    a.path = null;
    beginTravel(world, L.commandId ?? 'again', L.goal, L.onArrival);
  } else {
    const goal = L.goal ?? undefined;
    calm(world);
    if (W.strikes === 2 && reseat(world, 'stalled', goal)) {
      W.at = copy(a.pos);
      return;
    }
  }
  emit(world, { type: 'leader-reset', why: 'stalled', at: copy(a.pos) });
}
