import { ACTIVITIES, type ActivityId, type EffectId } from '../content/activities';
import { allFacings, CLIP_TIMING } from '../shared/clips';
import {
  EAST,
  FACING_COUNT,
  nearestAmong,
  sideOf,
  stepsBetween,
  stepToward,
  turnWay,
  type UnicornFacing,
  unicornFacingFor,
  WEST,
} from '../shared/compass';
import type { ClipName, Facing, UnicornId, Vec2 } from '../shared/ids';
import { CONFIG } from './config';
import { copy, dist, sideToward } from './geometry';
import { pathLength } from './nav/nav';
import { computeSlots } from './slots';
import type {
  DomainEvent,
  Following,
  Performing,
  PropActivity,
  Turned,
  UnicornActor,
  UnicornAnim,
  UnicornState,
  World,
} from './types';

/** Events that may be dropped when nobody is draining the queue. Everything else is kept. */
const DROPPABLE: ReadonlySet<DomainEvent['type']> = new Set([
  'effect',
  'command-accepted',
  'cast-started',
  'activity-started',
]);
const MAX_EVENTS = 512;

export function emit(world: World, event: DomainEvent): void {
  if (world.events.length >= MAX_EVENTS) {
    if (DROPPABLE.has(event.type)) return;
    // Make room for an event that matters by dropping the oldest one that does not.
    const i = world.events.findIndex((e) => DROPPABLE.has(e.type));
    if (i >= 0) world.events.splice(i, 1);
    else world.events.shift();
  }
  world.events.push(event);
}

/**
 * Starts a transient visual effect unless too many are alive. `share` is how much of its usual
 * sparkle it throws, when that is less than all. Returns whether it started.
 */
export function effect(
  world: World,
  id: EffectId,
  at: Vec2,
  seconds = 1.5,
  facing?: Facing,
  lift?: number,
  share = 1,
): boolean {
  world.effects = world.effects.filter((until) => until > world.time);
  if (world.effects.length >= CONFIG.magic.effectCap) return false;
  world.effects.push(world.time + seconds);
  emit(world, {
    type: 'effect',
    effect: id,
    at: copy(at),
    seconds,
    ...(facing ? { facing } : {}),
    ...(lift ? { lift } : {}),
    ...(share < 1 ? { share } : {}),
  });
  return true;
}

/**
 * Starts or restarts a short-lived state on a prop, such as a door swinging open. It is never
 * saved.
 */
export function startTransient(world: World, instanceId: string, kind: string, seconds: number): void {
  world.transient.set(instanceId, { kind, since: world.time, until: world.time + seconds });
}

/** The transient that shows a prop in use, by the activity that uses it. */
const USE_OF: Partial<Record<ActivityId, PropActivity>> = { drink: 'cup-fill', groom: 'brushing' };
/** A cup stays full a moment after the last sip. */
const USE_TAIL = 0.3;

/**
 * A cup fills and a brush station is worked for as long as someone uses them, whoever it is and
 * however the use began, so a companion drinking on its own never drinks from an empty cup.
 */
export function beginPropUse(world: World, st: Performing): void {
  const kind = USE_OF[st.activity];
  if (!kind || !st.anchorId) return;
  const seconds = st.endsAt - world.time + USE_TAIL;
  for (const inst of world.interactables.values()) {
    if (inst.anchor !== st.anchorId) continue;
    startTransient(world, inst.instanceId, kind, seconds);
    emit(world, { type: 'prop-activity', instanceId: inst.instanceId, activity: kind, seconds });
  }
}

/**
 * Whoever was using the props that belong to an anchor has stopped, sooner than expected or on
 * time.
 */
function endPropUse(world: World, anchorId: string): void {
  for (const inst of world.interactables.values()) {
    if (inst.anchor !== anchorId) continue;
    const t = world.transient.get(inst.instanceId);
    if (t && (Object.values(USE_OF) as string[]).includes(t.kind)) t.until = Math.min(t.until, world.time + USE_TAIL);
  }
}

export const unicornList = (world: World): UnicornActor[] =>
  Object.values(world.unicorns).filter((u): u is UnicornActor => u !== undefined);

/** Followers present in this world, nearest Wildstar first. */
export function herdOrder(world: World): UnicornId[] {
  return world.order.filter((id) => world.unicorns[id] !== undefined);
}

/**
 * Where each follower belongs on the trail (see `computeSlots`), kept until the trail or the herd
 * changes.
 */
export function herdSlots(world: World): ReadonlyMap<UnicornId, number> {
  const order = herdOrder(world);
  const key = order.join();
  const cached = world.slots;
  if (cached && cached.revision === world.trail.revision && cached.order === key) return cached.table;
  const table = computeSlots(world.trail, order).at;
  world.slots = { revision: world.trail.revision, order: key, table };
  return table;
}

/** Arc length on the trail where this follower should be. */
export const slotS = (world: World, id: UnicornId): number => herdSlots(world).get(id) ?? world.trail.head;

/** Trail distance from Wildstar to this follower's slot. */
export const slotDistance = (world: World, id: UnicornId): number => world.trail.head - slotS(world, id);

export const slotIndex = (world: World, id: UnicornId): number => Math.max(0, herdOrder(world).indexOf(id));

/**
 * Shows `clip` facing `facing`, or the nearest facing the clip has: a cast has no northwest, so the
 * unicorn casts facing west. The facing is where it means to be turned, and what is drawn goes
 * there. A clip drawn at every step of the ring is turned toward it a few steps a tick, through the
 * facings between, and not in a jump: a turn is not a new pose, so the clip goes on from where it
 * was. A pose drawn at only a few facings cannot show the steps between, so the unicorn turns
 * standing and takes it up once it faces one the pose has. A cast is taken up at once, because the
 * world is waiting on its frames.
 */
export function animate(
  actor: Pick<UnicornActor, 'facing' | 'anim'>,
  world: World,
  clip: ClipName,
  facing: UnicornFacing,
): void {
  const want = nearestAmong(allFacings(clip), facing);
  const shown = actor.anim;
  const turn = turnedToward(shown, want, world.time);
  const standing =
    !drawnAtEveryStep(clip) &&
    drawnAtEveryStep(shown.clip) &&
    turn.facing !== want &&
    CLIP_TIMING[clip].releaseFrame === undefined;
  const drawn: ClipName = standing ? 'idle' : clip;
  const turnable = drawnAtEveryStep(drawn);
  const to = turnable ? turn.facing : want;
  const turned = turnable ? turn.turned : shown.turned;
  if (shown.clip !== drawn) actor.anim = { clip: drawn, facing: to, startedAt: world.time, turned };
  else if (shown.facing !== to) actor.anim = { clip: drawn, facing: to, startedAt: shown.startedAt, turned };
  actor.facing = want;
}

/** Whether a clip is drawn at every step of the ring, and so can be turned through them. */
const drawnAtEveryStep = (clip: ClipName): boolean => allFacings(clip).length === FACING_COUNT;

/**
 * How many steps of the ring a body turns in one tick on its way from one facing to another: more
 * the farther it has to go, and one at a time as it settles.
 */
const turnSteps = (from: UnicornFacing, to: UnicornFacing): number =>
  Math.min(CONFIG.turn.fastest, Math.ceil(stepsBetween(from, to) / CONFIG.turn.settle));

/**
 * Where the picture is turned to this tick on its way to `to`, and the record of the turn. A body
 * does not flick one way and straight back: a turn the other way within `holdBack` of the last is
 * held, unless it takes `farBack` steps or more, which is a real turn. Wherever a heading wobbles
 * across the line between two facings, the unicorn keeps the one it has.
 */
function turnedToward(
  shown: UnicornAnim,
  to: UnicornFacing,
  now: number,
): { facing: UnicornFacing; turned: Turned | undefined } {
  const way = turnWay(shown.facing, to);
  if (way === 0) return { facing: shown.facing, turned: shown.turned };
  const last = shown.turned;
  const flicking =
    last !== undefined &&
    last.way !== way &&
    now - last.at < CONFIG.turn.holdBack &&
    stepsBetween(shown.facing, to) < CONFIG.turn.farBack;
  if (flicking) return { facing: shown.facing, turned: last };
  return { facing: stepToward(shown.facing, to, turnSteps(shown.facing, to)), turned: { way, at: now } };
}

/**
 * Whether a unicorn that moves on its own feet is drawn walking or standing. A follower settling
 * into its place creeps at a speed that hovers near any single cut-off, so the pose keeps to what
 * it was between the two speeds. A change is then held back until the old pose has been shown for a
 * moment: a blip of drift is not a stride, and a stride that lasts a few steps is not a stop.
 */
export function gaitFor(
  world: World,
  actor: { anim: { clip: ClipName; startedAt: number } },
  speed: number,
): 'walk' | 'idle' {
  const now = actor.anim.clip === 'walk' ? 'walk' : 'idle';
  const want = speed > CONFIG.herd.walkAbove ? 'walk' : speed < CONFIG.herd.standBelow ? 'idle' : now;
  if (want === now) return now;
  return world.time - actor.anim.startedAt >= CONFIG.herd.poseHold ? want : now;
}

/**
 * Facing for a clip that exists only in side views. Facing up, down or slantwise, the unicorn looks
 * the way the thing is, and when it is straight above or below, to the side it was already leaning.
 */
export function sideFacing(facing: UnicornFacing, from: Vec2, toward: Vec2): UnicornFacing {
  if (facing === EAST || facing === WEST) return facing;
  return sideToward(from, toward, sideOf(facing));
}

/**
 * How a walker turns to face the way a leg of its path runs: a unicorn among its facings, a person
 * among four.
 */
export type Turn<F> = (heading: Vec2, current: F) => F;

/**
 * Moves along waypoints at `speed`, turning to face each leg. Returns true when the last waypoint
 * has been reached.
 */
export function walkPath<F>(
  a: { pos: Vec2; path: Vec2[] | null; facing: F },
  speed: number,
  dt: number,
  turn: Turn<F>,
  onWaypoint?: (p: Vec2) => void,
): boolean {
  if (!a.path || a.path.length === 0) return true;
  let remaining = speed * dt;
  while (remaining > 1e-6 && a.path.length > 0) {
    const t = a.path[0]!;
    const d = dist(a.pos, t);
    if (d > 1e-6) a.facing = turn({ x: t.x - a.pos.x, y: t.y - a.pos.y }, a.facing);
    if (d <= remaining) {
      a.pos = copy(t);
      remaining -= d;
      a.path.shift();
      onWaypoint?.(a.pos);
    } else {
      a.pos = { x: a.pos.x + ((t.x - a.pos.x) / d) * remaining, y: a.pos.y + ((t.y - a.pos.y) / d) * remaining };
      remaining = 0;
    }
  }
  return a.path.length === 0;
}

/** How much faster a unicorn brakes than it accelerates. */
const BRAKE_RATIO = 3;
/**
 * Speed a stroll still has when it reaches its goal, so the last steps are slow but not a crawl.
 */
const STROLL_ARRIVAL = 24;

/** Eases a speed toward a target, braking faster than it accelerates. */
export function easeSpeed(current: number, target: number, dt: number, accel: number = CONFIG.speed.accel): number {
  const step = (target > current ? accel : accel * BRAKE_RATIO) * dt;
  return target > current ? Math.min(target, current + step) : Math.max(target, current - step);
}

/**
 * Walks a unicorn along its planned route the way a friend strolls to somewhere: easing up to
 * `cap`, then slowing for the last stretch so it settles into place instead of stopping dead.
 * Returns true on arrival.
 */
export function stroll(actor: UnicornActor, cap: number, dt: number): boolean {
  const left = actor.path ? pathLength(actor.pos, actor.path) : 0;
  const slowTo = Math.sqrt(2 * CONFIG.speed.accel * BRAKE_RATIO * left) + STROLL_ARRIVAL;
  actor.speed = easeSpeed(actor.speed, Math.min(cap, slowTo), dt);
  const arrived = walkPath(actor, actor.speed, dt, unicornFacingFor);
  if (arrived) actor.speed = 0;
  return arrived;
}

/**
 * Every state change goes through here so leaving a state always cleans up after it: anchors are
 * released, pending searches are dropped and a partner is freed. This is what keeps reservations
 * from leaking.
 */
export function setState(world: World, actor: UnicornActor, next: UnicornState): void {
  const prev = actor.state;
  // The new state is in place before any exit work runs. Exit work can change a partner, whose own
  // exit work looks back at this actor, and that look must already see the new state or the two
  // would free each other forever.
  actor.state = next;
  actor.decideAt = null;
  actor.stall = { at: world.time, pos: copy(actor.pos) };
  if (prev === next) return;

  // What the next state keeps holding is not released, so approaching an anchor and then using it
  // is one hold.
  const keepsAnchor = next.kind === 'approaching' || next.kind === 'performing' ? next.anchorId : null;
  const keepsPartner =
    next.kind === 'approaching' || next.kind === 'performing' || next.kind === 'waiting' ? next.partner : null;
  switch (prev.kind) {
    case 'approaching':
      if (prev.anchorId && prev.anchorId !== keepsAnchor) world.anchors.release(prev.anchorId, actor.id);
      world.paths.cancel(actor.id);
      actor.path = null;
      if (prev.partner && prev.partner !== keepsPartner) freePartner(world, prev.partner, actor.id);
      break;
    case 'performing':
      if (prev.anchorId && prev.anchorId !== keepsAnchor) {
        world.anchors.release(prev.anchorId, actor.id);
        endPropUse(world, prev.anchorId);
      }
      if (prev.partner && prev.partner !== keepsPartner) freePartner(world, prev.partner, actor.id);
      break;
    case 'waiting':
      if (prev.partner !== keepsPartner) freePartner(world, prev.partner, actor.id);
      break;
    case 'recovering':
    case 'unrecruited-idle':
      world.paths.cancel(actor.id);
      actor.path = null;
      break;
    default:
      break;
  }
}

/** A nuzzle partner whose other half has ended returns to the herd. */
function freePartner(world: World, partnerId: UnicornId, other: UnicornId): void {
  const p = world.unicorns[partnerId];
  if (!p) return;
  const s = p.state;
  const involved =
    (s.kind === 'performing' && s.partner === other) ||
    (s.kind === 'waiting' && s.partner === other) ||
    (s.kind === 'approaching' && s.partner === other);
  if (involved && partnerId !== 'wildstar') rejoinHerd(world, p);
  else if (involved && partnerId === 'wildstar') setState(world, p, { kind: 'leading' });
}

/**
 * A follower on the trail at arc length `s`, standing at `from`, which may be a little off the
 * trail. It eases onto it.
 */
export function followingAt(world: World, s: number, from: Vec2, speed = 0): Following {
  const p = world.trail.pointAt(s);
  return { kind: 'following', s, v: speed, lat: 0, join: { x: from.x - p.x, y: from.y - p.y }, push: { x: 0, y: 0 } };
}

/**
 * Puts a unicorn back into the herd. If it is standing close to the trail and can step onto it, it
 * follows. If not it walks back, which is the "recovering" state.
 */
export function rejoinHerd(world: World, actor: UnicornActor): void {
  const target = slotS(world, actor.id);
  const near = world.trail.nearest(actor.pos, target - 220, target + CONFIG.herd.joinAhead);
  const point = world.trail.pointAt(near.s);
  if (near.d <= CONFIG.herd.joinRadius && world.nav.segmentClear(actor.pos, point)) {
    setState(world, actor, followingAt(world, near.s, actor.pos, actor.speed));
  } else {
    setState(world, actor, { kind: 'recovering', repathAt: world.time, stalls: 0 });
  }
  actor.path = null;
}

/**
 * True once an actor that should be moving has barely moved for the stall time. The window restarts
 * each time it answers true, so a caller that cannot fix the problem is asked again only after
 * another full window.
 */
export function stalled(world: World, actor: UnicornActor, expectMoving: boolean): boolean {
  const reset = (): void => {
    actor.stall = { at: world.time, pos: copy(actor.pos) };
  };
  if (!expectMoving || dist(actor.pos, actor.stall.pos) >= 12) {
    reset();
    return false;
  }
  if (world.time - actor.stall.at >= CONFIG.herd.stalledAfter) {
    reset();
    return true;
  }
  return false;
}

/**
 * Ends a world's life. Nothing it reserved or asked for outlives it, and it takes no further
 * commands or steps.
 */
export function retire(world: World): void {
  for (const u of unicornList(world)) world.anchors.releaseAll(u.id);
  world.paths.clear();
  world.paused = true;
}

/** Records an activity for the repeat limit. */
export function remember(actor: UnicornActor, activity: ActivityId): void {
  actor.history.push(activity);
  if (actor.history.length > 4) actor.history.shift();
}

/** True when `activity` has just been done too many times in a row. */
export function repeatedTooOften(actor: UnicornActor, activity: ActivityId): boolean {
  const h = actor.history;
  const n = CONFIG.idle.repeatLimit;
  if (h.length < n) return false;
  for (let i = 1; i <= n; i++) if (h[h.length - i] !== activity) return false;
  return true;
}

/** Clip and facing for an activity, honoring side-only clips. */
export function activityAnim(
  activity: ActivityId,
  facing: UnicornFacing,
  from: Vec2,
  toward: Vec2,
): { clip: ClipName; facing: UnicornFacing } {
  const def = ACTIVITIES[activity];
  return { clip: def.clip, facing: def.sideOnly ? sideFacing(facing, from, toward) : facing };
}
