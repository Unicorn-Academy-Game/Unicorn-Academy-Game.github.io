import { ACTIVITIES, type ActivityId } from '../../content/activities';
import { UNICORN_DEFS } from '../../content/unicorns';
import { unicornFacingFor } from '../../shared/compass';
import type { Encounter } from '../../shared/map';
import { copy, dist } from '../geometry';
import { animate, effect, emit, setState, walkPath } from '../ops';
import type { Command, UnicornActor, World } from '../types';
import { startInPlace } from './idle';
import { beginCast } from './magic';

/** Slow pace for a friend who has not been found yet. */
const WANDER_SPEED = 84;

/** How long a new friend turns toward Wildstar, with hearts, before it shares a little magic. */
const GREETING_PAUSE = 0.9;

/**
 * How far past its trigger distance Wildstar must go before a friend who was waiting lets her go,
 * so standing at the edge does not make the friend turn back and forth.
 */
const LET_GO = 1.35;

/** How long a friend who was met watches Wildstar go before she wanders again. */
const WATCH_FOR = 1.5;

/**
 * Whether Wildstar stands where a friend would join her: near, in sight, and on the same ground.
 */
export function inReach(world: World, friend: UnicornActor, enc: Encounter): boolean {
  const leader = world.unicorns.wildstar!;
  return (
    dist(leader.pos, friend.pos) <= enc.triggerRadius &&
    world.nav.lineOfSight(leader.pos, friend.pos) &&
    world.nav.sameComponent(leader.pos, friend.pos)
  );
}

export function stepEncounters(world: World, dt: number): void {
  const leader = world.unicorns.wildstar!;
  for (const enc of world.map.encounters) {
    const friend = world.unicorns[enc.unicornId];
    if (!friend) continue;
    if (world.persistent.recruited.includes(friend.id)) {
      if (friend.state.kind === 'greeting') stepGreeting(world, friend);
    } else if (world.rules.friends === 'ask') stepAsked(world, friend, leader, enc, dt);
    else {
      // The rule may have changed while she waited. A friend who was waiting is let go of before
      // she is found as usual.
      if (world.met.has(friend.id)) letGo(world, friend);
      if (inReach(world, friend, enc)) recruit(world, friend, leader);
      else stepUnrecruited(world, friend, enc, dt);
    }
  }
}

/**
 * The `ask` rule. A friend who is reached stops, turns toward Wildstar and tells the game, and only
 * joins when the game sends `befriend`. She waits for as long as Wildstar is near and goes back to
 * her clearing after Wildstar leaves, and the game is told when each happens.
 */
function stepAsked(world: World, friend: UnicornActor, leader: UnicornActor, enc: Encounter, dt: number): void {
  if (!world.met.has(friend.id)) {
    if (inReach(world, friend, enc)) meet(world, friend, leader);
    else stepUnrecruited(world, friend, enc, dt);
    return;
  }
  if (dist(leader.pos, friend.pos) > enc.triggerRadius * LET_GO) {
    letGo(world, friend);
    return;
  }
  wait(world, friend, leader);
}

function meet(world: World, friend: UnicornActor, leader: UnicornActor): void {
  world.met.add(friend.id);
  emit(world, { type: 'friend-met', unicornId: friend.id, at: copy(friend.pos) });
  // A fresh state ends what she was doing, and drops a walk she was waiting to be given, so she
  // stays where she is.
  setState(world, friend, { kind: 'unrecruited-idle', nextAt: world.time + WATCH_FOR });
  wait(world, friend, leader);
  effect(world, 'sparkle', friend.pos, 1.6);
}

/** She stands where she is, turned toward Wildstar. */
function wait(world: World, friend: UnicornActor, leader: UnicornActor): void {
  friend.speed = 0;
  friend.facing = unicornFacingFor(
    { x: leader.pos.x - friend.pos.x, y: leader.pos.y - friend.pos.y },
    friend.facing,
    0,
  );
  animate(friend, world, 'idle', friend.facing);
}

function letGo(world: World, friend: UnicornActor): void {
  world.met.delete(friend.id);
  emit(world, { type: 'friend-away', unicornId: friend.id });
  if (friend.state.kind === 'unrecruited-idle') friend.state.nextAt = world.time + WATCH_FOR;
}

/**
 * The game says a waiting friend may join. It is the same joining as walking up. It does nothing
 * for a friend who is not here, has already joined, or is not beside Wildstar, so a late or
 * repeated call can never pull a friend across the map.
 */
export function commandBefriend(world: World, c: Extract<Command, { type: 'befriend' }>): void {
  const friend = world.unicorns[c.unicornId];
  const enc = world.map.encounters.find((e) => e.unicornId === c.unicornId);
  if (!friend || !enc || world.persistent.recruited.includes(c.unicornId)) return;
  if (!world.met.has(c.unicornId) && !inReach(world, friend, enc)) return;
  world.met.delete(c.unicornId);
  recruit(world, friend, world.unicorns.wildstar!);
}

/**
 * Discovery. Membership is recorded first and a save is requested at once, so closing the app
 * during the greeting still leaves a friend who is part of the herd.
 */
function recruit(world: World, friend: UnicornActor, leader: UnicornActor): void {
  world.persistent.recruited.push(friend.id);
  world.order.push(friend.id);
  emit(world, { type: 'friend-recruited', unicornId: friend.id });
  emit(world, { type: 'save-needed', reason: 'recruit' });
  emit(world, { type: 'greeting-started', unicornId: friend.id, at: friend.pos });
  setState(world, friend, { kind: 'greeting', castAt: world.time + GREETING_PAUSE });
  friend.speed = 0;
  friend.path = null;
  friend.facing = unicornFacingFor(
    { x: leader.pos.x - friend.pos.x, y: leader.pos.y - friend.pos.y },
    friend.facing,
    0,
  );
  animate(friend, world, 'idle', friend.facing);
  effect(world, 'hearts', friend.pos, 2.4);
}

function stepGreeting(world: World, friend: UnicornActor): void {
  if (friend.state.kind !== 'greeting' || world.time < friend.state.castAt) return;
  const spell = UNICORN_DEFS[friend.id].magic;
  beginCast(world, friend, { kind: 'spell', magic: spell });
}

/** Idle life in the clearing: stand, look around, rest, or wander a few steps. */
function stepUnrecruited(world: World, friend: UnicornActor, enc: Encounter, dt: number): void {
  const st = friend.state;
  if (st.kind !== 'unrecruited-idle') return;
  if (friend.path) {
    const arrived = walkPath(friend, WANDER_SPEED, dt, unicornFacingFor);
    friend.speed = arrived ? 0 : WANDER_SPEED;
    animate(friend, world, arrived ? 'idle' : 'walk', friend.facing);
    if (arrived) {
      friend.path = null;
      st.nextAt = world.time + world.rng.range(2, 4.5);
    }
    return;
  }
  friend.speed = 0;
  animate(friend, world, 'idle', friend.facing);
  if (world.time < st.nextAt) return;

  if (world.rng.next() < 0.5) {
    const options = (Object.keys(UNICORN_DEFS[friend.id].activityWeights) as ActivityId[]).filter(
      (id) => !ACTIVITIES[id].anchorTag && !ACTIVITIES[id].paired,
    );
    if (options.length > 0) {
      startInPlace(world, friend, world.rng.pick(options));
      return;
    }
  }
  // Wander to a nearby reachable point, staying inside the clearing.
  const angle = world.rng.range(0, Math.PI * 2);
  const radius = world.rng.range(0.3, 1) * enc.idleRadius;
  const wish = { x: enc.home.x + Math.cos(angle) * radius, y: enc.home.y + Math.sin(angle) * radius };
  const spot = world.nav.nearestReachable(friend.pos, wish, 120);
  if (!spot || dist(spot.point, enc.home) > enc.idleRadius + 40) {
    st.nextAt = world.time + 1.5;
    return;
  }
  st.nextAt = Infinity;
  world.paths.request(friend.id, friend.pos, spot.point, (path) => {
    if (friend.state !== st) return;
    if (path) friend.path = path;
    else st.nextAt = world.time + 1.5;
  });
}
