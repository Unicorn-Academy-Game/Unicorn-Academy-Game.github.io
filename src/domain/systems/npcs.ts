import { NPC_DEFS, type NpcClip, type NpcId } from '../../content/npcs';
import { facingFor, facingOfCardinal, vecOf } from '../../shared/compass';
import type { Facing, Vec2 } from '../../shared/ids';
import type { ActivityAnchor } from '../../shared/map';
import { copy, dist } from '../geometry';
import { effect, emit, unicornList, walkPath } from '../ops';
import type { NpcActor, NpcErrand, NpcState, Performing, UnicornActor, World } from '../types';

/**
 * A walk that takes longer than this is abandoned and the routine moves on, so a worker is never
 * stuck for good.
 */
const WALK_LIMIT = 30;
/** A visitor this close makes a worker wave hello, at most this often. */
const HELLO_RANGE = 260;
const HELLO_EVERY = 28;

export function placeNpc(world: World, npcId: NpcId, start: Vec2, facing: Facing): NpcActor {
  return {
    id: npcId,
    instanceId: `${world.map.id}/${npcId}`,
    pos: copy(start),
    prev: copy(start),
    facing,
    speed: 0,
    anim: { clip: 'idle', facing, startedAt: world.time },
    path: null,
    state: { kind: 'idle', until: world.time + 1 },
    step: 0,
    visits: {},
    lastHello: world.time,
    answered: null,
  };
}

export function stepNpcs(world: World, dt: number): void {
  for (const npc of world.npcs) stepNpc(world, npc, dt);
}

function show(npc: NpcActor, world: World, clip: NpcClip, facing: Facing = npc.facing): void {
  npc.facing = facing;
  if (npc.anim.clip !== clip || npc.anim.facing !== facing) npc.anim = { clip, facing, startedAt: world.time };
}

function stepNpc(world: World, npc: NpcActor, dt: number): void {
  const st = npc.state;
  if (st.kind !== 'waving') {
    maybeGreet(world, npc);
    answerGroom(world, npc);
  }
  switch (npc.state.kind) {
    case 'idle':
      npc.speed = 0;
      show(npc, world, 'idle');
      if (world.time >= npc.state.until) startStep(world, npc);
      break;
    case 'walking':
      stepWalking(world, npc, npc.state, dt);
      break;
    case 'working': {
      npc.speed = 0;
      const w = npc.state;
      // A brush is put down as soon as the unicorn walks off.
      if (world.time >= w.endsAt || (w.clip === 'brush' && !groomed(world))) {
        finishWork(world, npc, w.next);
        show(npc, world, 'idle');
      } else show(npc, world, w.clip);
      break;
    }
    case 'waving':
      npc.speed = 0;
      show(npc, world, 'wave');
      if (world.time >= npc.state.endsAt) resumeAfterWave(npc, npc.state);
      break;
  }
}

/** A tap, or a visitor arriving, makes the worker wave. Work picks up again afterward. */
export function npcWave(world: World, npc: NpcActor): void {
  const resume = npc.state.kind === 'waving' ? npc.state.resume : npc.state;
  const leader = world.unicorns.wildstar!;
  const facing = facingFor({ x: leader.pos.x - npc.pos.x, y: leader.pos.y - npc.pos.y }, npc.facing, 0);
  npc.state = { kind: 'waving', endsAt: world.time + NPC_DEFS[npc.id].waveSeconds, resume };
  npc.speed = 0;
  npc.lastHello = world.time;
  show(npc, world, 'wave', facing);
  emit(world, { type: 'npc-waved', npcId: npc.id });
  const f = vecOf(facingOfCardinal(facing));
  effect(world, 'sparkle', { x: npc.pos.x + f.x * 44, y: npc.pos.y + f.y * 44 }, 1.2);
}

function resumeAfterWave(npc: NpcActor, st: Extract<NpcState, { kind: 'waving' }>): void {
  const lost = NPC_DEFS[npc.id].waveSeconds;
  const r = st.resume;
  // Time spent waving does not eat into the work that was underway.
  if (r.kind === 'working') r.endsAt += lost;
  else if (r.kind !== 'waving') r.until += lost;
  npc.state = r;
}

function maybeGreet(world: World, npc: NpcActor): void {
  if (world.time - npc.lastHello < HELLO_EVERY) return;
  const leader = world.unicorns.wildstar!;
  if (dist(leader.pos, npc.pos) > HELLO_RANGE || !world.nav.lineOfSight(leader.pos, npc.pos)) return;
  npcWave(world, npc);
}

function rest(world: World, npc: NpcActor, seconds: number): void {
  npc.state = { kind: 'idle', until: world.time + seconds };
  npc.path = null;
}

/** Starts the next beat of the routine. A beat that cannot happen right now is skipped. */
function startStep(world: World, npc: NpcActor): void {
  const routine = NPC_DEFS[npc.id].routine;
  for (let tries = 0; tries < routine.length; tries++) {
    const step = routine[npc.step % routine.length]!;
    npc.step = (npc.step + 1) % routine.length;
    let errand: NpcErrand | null = null;
    if (step.kind === 'work') {
      const a = nextAnchor(world, npc, step.tag);
      if (a) errand = { kind: 'work', anchorId: a.anchorId, clip: step.clip, seconds: step.seconds };
    } else if (step.kind === 'carry') {
      const a = nextAnchor(world, npc, step.from);
      if (a) errand = { kind: 'pickup', anchorId: a.anchorId, seconds: step.seconds, dropTag: step.to };
    }
    if (errand) {
      walkTo(world, npc, errand);
      return;
    }
  }
  rest(world, npc, 2);
}

/**
 * The next anchor with this tag, cycling through them in id order and skipping any that cannot be
 * reached.
 */
function nextAnchor(world: World, npc: NpcActor, tag: string): ActivityAnchor | null {
  const all = world.map.anchors.filter((a) => a.tags.includes(tag)).sort((a, b) => (a.anchorId < b.anchorId ? -1 : 1));
  for (let i = 0; i < all.length; i++) {
    const n = npc.visits[tag] ?? 0;
    npc.visits[tag] = n + 1;
    const a = all[n % all.length]!;
    if (world.nav.sameComponent(npc.pos, a.approach[0]!.pos)) return a;
  }
  return null;
}

/** The unicorn being groomed right now, if any. */
function groomed(world: World): { unicorn: UnicornActor; state: Performing } | null {
  for (const u of unicornList(world)) {
    const s = u.state;
    if (s.kind === 'performing' && s.activity === 'groom') return { unicorn: u, state: s };
  }
  return null;
}

/**
 * A groomer who is not carrying a load hurries over to brush a unicorn that is being groomed, as
 * long as the walk is short. The groom is held until the worker has been there a few seconds, so
 * the brushing always has someone to brush.
 */
function answerGroom(world: World, npc: NpcActor): void {
  const groomer = NPC_DEFS[npc.id].groomer;
  if (!groomer) return;
  const g = groomed(world);
  if (!g || npc.answered === g.state) return;
  const s = npc.state;
  const free =
    s.kind === 'idle' ||
    (s.kind === 'working' && s.next === null && s.clip !== 'brush') ||
    (s.kind === 'walking' && (s.errand.kind === 'work' || s.errand.kind === 'pickup'));
  if (!free) return;
  npc.answered = g.state;
  const spots = world.map.anchors
    .filter((a) => a.tags.includes(groomer.tag) && world.nav.sameComponent(npc.pos, a.approach[0]!.pos))
    .sort((a, b) => dist(npc.pos, a.approach[0]!.pos) - dist(npc.pos, b.approach[0]!.pos));
  const spot = spots[0];
  if (spot) walkTo(world, npc, { kind: 'brush', anchorId: spot.anchorId });
}

const pathLength = (from: Vec2, path: readonly Vec2[]): number =>
  path.reduce((sum, p, i) => sum + dist(i === 0 ? from : path[i - 1]!, p), 0);

function walkTo(world: World, npc: NpcActor, errand: NpcErrand): void {
  const anchor = world.anchorDefs.get(errand.anchorId);
  if (!anchor) {
    rest(world, npc, 1);
    return;
  }
  const st: NpcState = { kind: 'walking', errand, until: world.time + WALK_LIMIT };
  npc.state = st;
  npc.path = null;
  world.paths.request(npc.instanceId, npc.pos, anchor.approach[0]!.pos, (path) => {
    // The worker may have started waving since asking. The walk is then waiting inside the wave.
    const current = npc.state === st || (npc.state.kind === 'waving' && npc.state.resume === st);
    if (!current) return;
    if (!path) return rest(world, npc, 1.5);
    if (errand.kind === 'brush' && !holdGroomFor(world, npc, pathLength(npc.pos, path))) return rest(world, npc, 0.6);
    npc.path = path;
  });
}

/**
 * Whether the walk is short enough to answer. If it is, the groom is held until a few seconds after
 * the worker arrives.
 */
function holdGroomFor(world: World, npc: NpcActor, distance: number): boolean {
  const groomer = NPC_DEFS[npc.id].groomer;
  const g = groomed(world);
  if (!groomer || !g) return false;
  const eta = distance / (NPC_DEFS[npc.id].speed * groomer.hustle);
  if (eta > groomer.maxWalk) return false;
  g.state.endsAt = Math.max(g.state.endsAt, world.time + eta + world.rng.range(groomer.seconds[0], groomer.seconds[1]));
  return true;
}

function stepWalking(world: World, npc: NpcActor, st: Extract<NpcState, { kind: 'walking' }>, dt: number): void {
  const carrying = st.errand.kind === 'putdown';
  if (world.time > st.until) {
    rest(world, npc, 1);
    return;
  }
  if (st.errand.kind === 'brush' && !groomed(world)) {
    rest(world, npc, 0.6);
    return;
  }
  if (!npc.path) {
    npc.speed = 0;
    show(npc, world, carrying ? 'carry' : 'idle');
    return;
  }
  const def = NPC_DEFS[npc.id];
  const speed = def.speed * (st.errand.kind === 'brush' ? (def.groomer?.hustle ?? 1) : 1);
  const arrived = walkPath(npc, speed, dt, facingFor);
  npc.speed = arrived ? 0 : speed;
  show(npc, world, arrived ? 'idle' : carrying ? 'carry' : 'walk');
  if (arrived) arrive(world, npc, st.errand);
}

function arrive(world: World, npc: NpcActor, errand: NpcErrand): void {
  npc.path = null;
  const anchor = world.anchorDefs.get(errand.anchorId);
  if (!anchor) {
    rest(world, npc, 1);
    return;
  }
  npc.facing = anchor.approach[0]!.facing;
  const span = (s: readonly [number, number]): number => world.time + world.rng.range(s[0], s[1]);
  switch (errand.kind) {
    case 'work':
      npc.state = { kind: 'working', clip: errand.clip, endsAt: span(errand.seconds), next: null };
      emit(world, { type: 'activity-started', actorId: npc.id, activityId: errand.clip });
      break;
    case 'pickup': {
      const drop = nextAnchor(world, npc, errand.dropTag);
      const next: NpcErrand | null = drop
        ? { kind: 'putdown', anchorId: drop.anchorId, seconds: errand.seconds }
        : null;
      npc.state = { kind: 'working', clip: 'pickup', endsAt: span(errand.seconds), next };
      break;
    }
    case 'putdown':
      npc.state = { kind: 'working', clip: 'putdown', endsAt: span(errand.seconds), next: null };
      break;
    case 'brush': {
      const g = groomed(world);
      if (!g) {
        rest(world, npc, 0.6);
        return;
      }
      npc.facing = facingFor({ x: g.unicorn.pos.x - npc.pos.x, y: g.unicorn.pos.y - npc.pos.y }, npc.facing, 0);
      npc.state = { kind: 'working', clip: 'brush', endsAt: g.state.endsAt, next: null };
      emit(world, { type: 'activity-started', actorId: npc.id, activityId: 'brush' });
      effect(world, 'hearts', g.unicorn.pos, 2.4);
      break;
    }
  }
}

function finishWork(world: World, npc: NpcActor, next: NpcErrand | null): void {
  if (next) walkTo(world, npc, next);
  else rest(world, npc, world.rng.range(0.4, 1));
}
