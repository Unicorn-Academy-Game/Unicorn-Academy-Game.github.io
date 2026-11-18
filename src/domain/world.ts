import { PROP_DEFS } from '../content/props';
import { lineOf } from '../content/unicorns';
import { facingOfCardinal } from '../shared/compass';
import type { Facing, UnicornId, Vec2 } from '../shared/ids';
import type { LogicMap } from '../shared/map';
import { AnchorBook } from './anchors';
import { doorways, herdLine, lineHolds, wayBack } from './arrival';
import { CONFIG } from './config';
import { copy, dist } from './geometry';
import { Nav } from './nav/nav';
import { emit, unicornList } from './ops';
import { PathQueue } from './paths';
import { Rng } from './rng';
import { computeSlots, lateralFor } from './slots';
import { commandBefriend, stepEncounters } from './systems/encounters';
import { ensureFooting, stepFooting } from './systems/footing';
import { placeFollower, stepHerd } from './systems/herd';
import { stepIdle } from './systems/idle';
import {
  commandCode,
  commandGreet,
  commandHalt,
  commandInteract,
  commandMove,
  commandSteer,
  stepLeader,
} from './systems/leader';
import { commandPoke, LIFE_SEED, populateLife, stepLife } from './systems/life';
import { commandCast, scheduleResets, stepCasts, stepResets } from './systems/magic';
import { placeNpc, stepNpcs } from './systems/npcs';
import { newPickups, stepPickups } from './systems/pickups';
import { stepWading } from './systems/wading';
import { Trail } from './trail';
import type {
  Command,
  Crown,
  DomainEvent,
  Following,
  Persistent,
  Rules,
  UnicornActor,
  UnicornState,
  World,
} from './types';

const navs = new WeakMap<LogicMap, Nav>();

/** Navigation for a map, built once. A map is immutable, so every world on it can share one. */
export function navFor(map: LogicMap): Nav {
  let nav = navs.get(map);
  if (!nav) {
    nav = new Nav({ width: map.widthTiles * 64, height: map.heightTiles * 64, obstacles: map.obstacles });
    navs.set(map, nav);
  }
  return nav;
}

export type Arrival =
  /** A new map. Wildstar and the herd stand on an authored spawn group. */
  | { kind: 'spawn'; spawnId: string }
  /** A load. Wildstar stands where she was saved and the herd forms behind her. */
  | { kind: 'saved'; position: Vec2; facing: Facing };

export interface WorldInit {
  map: LogicMap;
  persistent: Persistent;
  seed: number;
  arrival: Arrival;
  /**
   * The doors the game has opened so far. The same set goes to every world, so a door opened in one
   * place stays open in the next.
   */
  unlocked?: Set<string>;
  /**
   * How the game wants things to go. The same object goes to every world, so changing it changes
   * the world on the screen. Without one, friends join as Wildstar walks up.
   */
  rules?: Rules;
  /**
   * Whether she has the crown on. The same object goes to every world, so she keeps it on from one
   * place to the next.
   */
  crown?: Crown;
}

function makeUnicorn(id: UnicornId, pos: Vec2, facing: Facing, state: UnicornState, time: number): UnicornActor {
  const ring = facingOfCardinal(facing);
  return {
    id,
    pos: copy(pos),
    prev: copy(pos),
    vel: { x: 0, y: 0 },
    facing: ring,
    speed: 0,
    anim: { clip: 'idle', facing: ring, startedAt: time },
    path: null,
    state,
    history: [],
    stall: { at: time, pos: copy(pos) },
    decideAt: null,
  };
}

/** Wildstar's start, repaired if the saved point is no longer standable. */
function standingPlace(map: LogicMap, nav: Nav, wanted: Vec2): Vec2 {
  if (nav.isWalkable(wanted, 2)) return copy(wanted);
  const near = nav.freePointNear(wanted, [], 0, 640);
  if (near) return near;
  return copy(map.spawns.find((s) => s.spawnId === map.start)?.points[0] ?? map.spawns[0]!.points[0]!);
}

/**
 * The line the herd arrives along, Wildstar first. A map's authored line is used when it holds this
 * herd. Otherwise, as after a load, one is found from where she stands.
 */
function arrivalLine(
  map: LogicMap,
  nav: Nav,
  leader: Vec2,
  facing: Facing,
  authored: readonly Vec2[] | null,
  herd: readonly UnicornId[],
): Vec2[] {
  const doors = doorways(map);
  if (authored && lineHolds(nav, authored, herd, doors)) return authored.map(copy);
  return herdLine(nav, leader, facing, herd, doors) ?? wayBack(nav, leader, facing);
}

export function createWorld(init: WorldInit): World {
  const { map, persistent } = init;
  const nav = navFor(map);
  const time = 0;

  let leaderPos: Vec2;
  let facing: Facing;
  let line: Vec2[] | null = null;
  if (init.arrival.kind === 'spawn') {
    const wanted = init.arrival.spawnId;
    const group = map.spawns.find((s) => s.spawnId === wanted) ?? map.spawns[0]!;
    line = group.points.map(copy);
    leaderPos = copy(line[0]!);
    facing = group.facing;
  } else {
    leaderPos = standingPlace(map, nav, init.arrival.position);
    facing = init.arrival.facing;
  }

  // Where only Wildstar may go, the herd waits outside: the others are not here, and are at the
  // door when she comes out.
  const followers = map.solo ? [] : lineOf(persistent.recruited);
  const trail = new Trail(leaderPos);
  trail.seed(arrivalLine(map, nav, leaderPos, facing, line, followers).reverse());

  const world: World = {
    map,
    nav,
    interactables: new Map(map.interactables.map((i) => [i.instanceId, i])),
    anchorDefs: new Map(map.anchors.map((a) => [a.anchorId, a])),
    anchors: new AnchorBook(map.anchors),
    paths: new PathQueue(nav),
    rng: new Rng(init.seed),
    persistent,
    time,
    tick: 0,
    trail,
    slots: null,
    order: followers.slice(),
    leader: {
      commandId: null,
      phase: 'idle',
      goal: null,
      onArrival: { kind: 'none' },
      gen: 0,
      portalAt: null,
      knocked: null,
      steer: null,
      seat: null,
      watch: { good: copy(leaderPos), checkedAt: time, at: copy(leaderPos), since: time, strikes: 0, struckAt: time },
    },
    unicorns: {},
    npcs: [],
    life: {
      rng: new Rng((init.seed ^ LIFE_SEED) >>> 0),
      critters: [],
      zones: new Map(map.life.map((z) => [z.zoneId, z])),
    },
    pickups: newPickups(init.seed),
    resets: new Map(),
    transient: new Map(),
    unlocked: init.unlocked ?? new Set(),
    rules: init.rules ?? { friends: 'walk-up' },
    crown: init.crown ?? { worn: false },
    met: new Set(),
    effects: [],
    events: [],
    castSeq: 0,
    idle: { lastLeaderMove: -Infinity, stopped: true },
    lastAutosave: time,
    paused: false,
  };

  world.unicorns.wildstar = makeUnicorn('wildstar', leaderPos, facing, { kind: 'leading' }, time);

  // Each follower stands at its place on the trail, so the herd arrives already at rest and nobody
  // shuffles into position.
  const slots = computeSlots(trail, followers).at;
  const taken: Vec2[] = [leaderPos];
  followers.forEach((id, i) => {
    const s = Math.max(trail.tail, slots.get(id)!);
    const st: Following = {
      kind: 'following',
      s,
      v: 0,
      lat: lateralFor(i),
      join: { x: 0, y: 0 },
      push: { x: 0, y: 0 },
    };
    let spot = placeFollower(world, st).pos;
    // If the place is unusable (a trail too short to hold the herd, say) the follower starts nearby
    // and walks into it.
    if (!nav.isWalkable(spot, 2) || taken.some((t) => dist(t, spot) < 56)) {
      const at = trail.pointAt(s);
      spot = nav.freePointNear(spot, taken, 56) ?? nav.freePointNear(leaderPos, taken, 56) ?? copy(leaderPos);
      st.lat = 0;
      st.join = { x: spot.x - at.x, y: spot.y - at.y };
    }
    taken.push(spot);
    world.unicorns[id] = makeUnicorn(id, spot, facing, st, time);
  });

  // Friends waiting in this map's clearings who have not been found yet.
  for (const enc of map.encounters) {
    if (persistent.recruited.includes(enc.unicornId)) continue;
    const home = nav.isWalkable(enc.home, 2) ? enc.home : (nav.freePointNear(enc.home, [], 0, 400) ?? enc.home);
    const friend = makeUnicorn(
      enc.unicornId,
      home,
      enc.facing,
      { kind: 'unrecruited-idle', nextAt: time + world.rng.range(0.5, 2.5) },
      time,
    );
    world.unicorns[enc.unicornId] = friend;
  }

  for (const n of map.npcs) {
    const start = nav.isWalkable(n.start, 2) ? n.start : (nav.freePointNear(n.start, [], 0, 400) ?? n.start);
    world.npcs.push(placeNpc(world, n.npcId, start, n.facing));
  }

  populateLife(world);

  // Props that remember their state start from their definition the first time a map is seen.
  for (const inst of map.interactables) {
    const initial = PROP_DEFS[inst.definitionId]?.initial;
    if (initial && persistent.props[inst.instanceId] === undefined) persistent.props[inst.instanceId] = { ...initial };
  }
  scheduleResets(world);
  if (!persistent.visitedMaps.includes(map.id)) persistent.visitedMaps.push(map.id);

  emit(world, { type: 'map-entered', mapId: map.id });
  emit(world, { type: 'save-needed', reason: 'map' });
  return world;
}

/**
 * Advances the simulation by one fixed step. The order here is the order in which systems see each
 * other's work.
 */
export function step(world: World): void {
  if (world.paused) return;
  const dt = CONFIG.step;
  world.time += dt;
  world.tick += 1;

  // The picture slides each actor from prev to pos. Whoever moves this step moves from where it
  // stood, and whoever does not move stays put, so no system has to remember to keep prev honest.
  for (const u of unicornList(world)) {
    u.vel = { x: (u.pos.x - u.prev.x) / dt, y: (u.pos.y - u.prev.y) / dt };
    u.prev = copy(u.pos);
  }
  for (const n of world.npcs) n.prev = copy(n.pos);

  world.paths.process();
  stepLeader(world, dt);
  stepFooting(world);
  stepHerd(world, dt);
  stepIdle(world, dt);
  stepCasts(world);
  stepEncounters(world, dt);
  stepNpcs(world, dt);
  stepLife(world);
  stepPickups(world);
  stepWading(world);
  stepResets(world);

  for (const [id, t] of world.transient) if (t.until <= world.time) world.transient.delete(id);
  if (world.leader.phase !== 'idle' && world.time - world.lastAutosave >= CONFIG.autosaveEvery) {
    world.lastAutosave = world.time;
    emit(world, { type: 'save-needed', reason: 'position' });
  }
}

export function dispatch(world: World, command: Command): void {
  if (world.paused) return;
  ensureFooting(world, command);
  switch (command.type) {
    case 'move':
      commandMove(world, command);
      return;
    case 'interact':
      commandInteract(world, command);
      return;
    case 'greet':
      commandGreet(world, command);
      return;
    case 'cast':
      commandCast(world, command);
      return;
    case 'steer':
      commandSteer(world, command);
      return;
    case 'halt':
      commandHalt(world);
      return;
    case 'poke':
      commandPoke(world, command);
      return;
    case 'enter-code':
      commandCode(world, command);
      return;
    case 'befriend':
      commandBefriend(world, command);
      return;
  }
}

/** Returns the events since the last call and clears the queue. */
export function drainEvents(world: World): DomainEvent[] {
  const out = world.events;
  world.events = [];
  return out;
}
