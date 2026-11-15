import { ACTIVITIES, type ActivityId } from '../../content/activities';
import { UNICORN_DEFS } from '../../content/unicorns';
import { allFacings } from '../../shared/clips';
import { cardinalOf, EAST, facingOfCardinal, sideOf, stepsBetween, WEST } from '../../shared/compass';
import type { Vec2 } from '../../shared/ids';
import { CONFIG } from '../config';
import { dist, sideToward } from '../geometry';
import { pathLength } from '../nav/nav';
import { claimOn, passesThrough } from '../occupancy';
import {
  activityAnim,
  animate,
  beginPropUse,
  easeSpeed,
  effect,
  emit,
  gaitFor,
  rejoinHerd,
  remember,
  repeatedTooOften,
  setState,
  sideFacing,
  slotS,
  stalled,
  stroll,
  unicornList,
} from '../ops';
import type { Performing, UnicornActor, UnicornState, World } from '../types';

type Approaching = Extract<UnicornState, { kind: 'approaching' }>;
type Waiting = Extract<UnicornState, { kind: 'waiting' }>;

/** Time an approach may take before it is given up. */
const APPROACH_LIMIT = 12;
/** How long a friend who has finished at an anchor may stay out before heading back to the herd. */
const SEEK_FOR = [4, 9] as const;
/** A friend who was asked to nuzzle waits this long for the partner to arrive. */
const WAIT_LIMIT = 10;
/**
 * Within this much walking of the meeting place, a friend going to nuzzle keeps looking at its
 * partner.
 */
const FACE_PARTNER_WITHIN = 80;

/**
 * Called when the leader sets off. Running activities end within the cancel window and approaches
 * are dropped.
 */
export function cancelIdleActivities(world: World): void {
  const cutoff = world.time + CONFIG.idle.cancelWithin;
  const sooner = world.time + CONFIG.idle.makeWayWithin;
  const leader = world.unicorns.wildstar!;
  for (const actor of unicornList(world)) {
    actor.decideAt = null;
    const s = actor.state;
    if (s.kind === 'performing') {
      if (actor.id === 'wildstar') setState(world, actor, { kind: 'leading' });
      // A pose she is still turning to is not on the screen yet, and is dropped at once, so that it
      // is never shown for a blink.
      else if (actor.anim.clip !== ACTIVITIES[s.activity].clip) s.endsAt = world.time;
      // Whoever stands right beside Wildstar as she sets off has to be out of her way before she
      // reaches it. A pose that has only just started is still shown for a moment, so that a
      // unicorn is not drawn twitching into an activity and out again.
      else
        s.endsAt = Math.min(
          s.endsAt,
          Math.max(
            dist(actor.pos, leader.pos) < CONFIG.idle.makeWayRadius ? sooner : cutoff,
            actor.anim.startedAt + CONFIG.herd.poseHold,
          ),
        );
    } else if (s.kind === 'approaching' || s.kind === 'waiting' || s.kind === 'seeking') {
      if (actor.id === 'wildstar') setState(world, actor, { kind: 'leading' });
      else if (recruited(world, actor)) rejoinHerd(world, actor);
      else setState(world, actor, { kind: 'unrecruited-idle', nextAt: world.time + 1 });
    }
  }
}

const recruited = (world: World, actor: UnicornActor): boolean => world.persistent.recruited.includes(actor.id);

function scheduleDecisions(world: World): void {
  const [lo, hi] = CONFIG.idle.stagger;
  for (const actor of unicornList(world)) {
    if (actor.state.kind === 'following') actor.decideAt = world.time + world.rng.range(lo, hi);
    else if (actor.state.kind === 'leading') actor.decideAt = world.time + world.rng.range(1.5, 3.5);
  }
}

/** Advances stopped detection, decisions and activity progress for every unicorn. */
export function stepIdle(world: World, dt: number): void {
  const now = world.time;
  const wasStopped = world.idle.stopped;
  if (world.leader.phase !== 'idle') world.idle.lastLeaderMove = now;
  world.idle.stopped = now - world.idle.lastLeaderMove >= CONFIG.idle.stoppedAfter;
  if (world.idle.stopped && !wasStopped) scheduleDecisions(world);

  for (const actor of unicornList(world)) {
    const s = actor.state;
    switch (s.kind) {
      case 'leading':
        stepLeaderGestures(world, actor);
        break;
      case 'following':
        stepFollowerDecision(world, actor, s.s);
        break;
      case 'approaching':
        stepApproaching(world, actor, s, dt);
        break;
      case 'performing':
        stepPerforming(world, actor, s);
        break;
      case 'waiting':
        stepWaiting(world, actor, s);
        break;
      case 'seeking':
        stepSeeking(world, actor, s);
        break;
      default:
        break;
    }
  }
}

function stepLeaderGestures(world: World, actor: UnicornActor): void {
  // In a seat she stays as she sat, facing the room, and does not get up to graze or turn her side
  // to it.
  if (world.leader.phase !== 'idle' || !world.idle.stopped || world.leader.seat !== null) {
    actor.decideAt = null;
    return;
  }
  if (actor.decideAt === null) {
    actor.decideAt = world.time + world.rng.range(2, 4);
    return;
  }
  if (world.time >= actor.decideAt) decide(world, actor);
}

function stepFollowerDecision(world: World, actor: UnicornActor, s: number): void {
  if (!world.idle.stopped) {
    actor.decideAt = null;
    return;
  }
  const lag = slotS(world, actor.id) - s;
  if (actor.speed > 4 || lag > 6) return;
  if (actor.decideAt === null) {
    actor.decideAt = world.time + world.rng.range(CONFIG.idle.stagger[0], CONFIG.idle.stagger[1]);
    return;
  }
  if (world.time >= actor.decideAt) decide(world, actor);
}

interface Plan {
  activity: ActivityId;
  weight: number;
  anchorId?: string;
  partner?: UnicornActor;
  /** Where the initiator stands to nuzzle. */
  meet?: { x: number; y: number };
  /** The way there, already found and already known to go through nobody. */
  route?: Vec2[];
}

function decide(world: World, actor: UnicornActor): void {
  const def = UNICORN_DEFS[actor.id];
  const plans: Plan[] = [];
  for (const [id, weight] of Object.entries(def.activityWeights) as [ActivityId, number][]) {
    const a = ACTIVITIES[id];
    if (a.anchorTag) {
      const found = bestAnchor(world, actor, a.anchorTag);
      if (found) plans.push({ activity: id, weight, anchorId: found.anchorId, route: found.route });
    } else if (a.paired) {
      const found = findPartner(world, actor);
      if (found) plans.push({ activity: id, weight, partner: found.partner, meet: found.meet, route: found.route });
    } else plans.push({ activity: id, weight });
  }
  const fresh = plans.filter((p) => !repeatedTooOften(actor, p.activity));
  const pick = world.rng.weighted(fresh.length > 0 ? fresh : plans, (p) => p.weight);
  if (!pick) {
    actor.decideAt = world.time + world.rng.range(CONFIG.idle.pause[0], CONFIG.idle.pause[1]);
    return;
  }
  if (pick.anchorId && pick.route) startAnchored(world, actor, pick.activity, pick.anchorId, pick.route);
  else if (pick.partner && pick.meet && pick.route) startNuzzle(world, actor, pick.partner, pick.meet, pick.route);
  else startInPlace(world, actor, pick.activity);
}

/**
 * The way from where `actor` stands to a place it means to settle in, when there is one that goes
 * through nobody. It is worked out before anything is committed to, so a plan that cannot be
 * carried out never changes a unicorn's state.
 */
function routeTo(world: World, actor: UnicornActor, to: Vec2): Vec2[] | null {
  if (!world.nav.sameComponent(actor.pos, to)) return null;
  const route = world.nav.findPath(actor.pos, to);
  return route && !passesThrough(world, actor.pos, route, actor.id) ? route : null;
}

/**
 * The nearest free anchor with a tag, within reach of Wildstar and walkable from where `actor`
 * stands. An anchor whose standing place somebody else is on, is walking to, or is kept for is not
 * free: a friend who has finished at an anchor stays there a while without holding it, and nobody
 * else may walk onto the same spot.
 */
function bestAnchor(world: World, actor: UnicornActor, tag: string): { anchorId: string; route: Vec2[] } | null {
  const leader = world.unicorns.wildstar!;
  const options: { anchorId: string; d: number; standing: Vec2 }[] = [];
  for (const a of world.anchorDefs.values()) {
    if (!a.tags.includes(tag) || !world.anchors.available(a.anchorId, 'idle')) continue;
    if (dist(a.pos, leader.pos) > CONFIG.idle.anchorReach) continue;
    const slot = world.anchors.nextFree(a.anchorId);
    if (slot === null) continue;
    const standing = a.approach[Math.min(slot, a.approach.length - 1)]!.pos;
    if (claimOn(world, standing, [actor.id])) continue;
    options.push({ anchorId: a.anchorId, d: dist(a.pos, actor.pos), standing });
  }
  // The nearest one that can be walked to without walking through a friend.
  for (const o of options.sort((x, y) => x.d - y.d)) {
    const route = routeTo(world, actor, o.standing);
    if (route) return { anchorId: o.anchorId, route };
  }
  return null;
}

/**
 * A nearby settled friend, and a free place for `actor` to stand beside it, nose to nose, with the
 * way to get there.
 */
function findPartner(world: World, actor: UnicornActor): { partner: UnicornActor; meet: Vec2; route: Vec2[] } | null {
  const options: { partner: UnicornActor; d: number }[] = [];
  for (const other of unicornList(world)) {
    if (other === actor || !recruited(world, other)) continue;
    // Being asked is still an activity, so a friend who has just nuzzled twice is not asked again.
    if (repeatedTooOften(other, 'nuzzle')) continue;
    const idleHere =
      other.id === 'wildstar'
        ? other.state.kind === 'leading' && world.leader.phase === 'idle'
        : (other.state.kind === 'following' && other.speed < 4) || other.state.kind === 'seeking';
    if (!idleHere) continue;
    const d = dist(actor.pos, other.pos);
    if (d <= 300) options.push({ partner: other, d });
  }
  for (const o of options.sort((x, y) => x.d - y.d)) {
    const found = meetingSpot(world, actor, o.partner);
    if (found) return { partner: o.partner, ...found };
  }
  return null;
}

function meetingSpot(world: World, actor: UnicornActor, partner: UnicornActor): { meet: Vec2; route: Vec2[] } | null {
  const gap = CONFIG.idle.nuzzleGap;
  const sides = actor.pos.x >= partner.pos.x ? [gap, -gap] : [-gap, gap];
  for (const dx of sides) {
    const spot = { x: partner.pos.x + dx, y: partner.pos.y };
    if (!world.nav.isWalkable(spot, 4) || !world.nav.segmentClear(partner.pos, spot)) continue;
    // Stay clear of everyone else, and of the places the herd keeps for those who are away.
    if (claimOn(world, spot, [actor.id, partner.id])) continue;
    const route = routeTo(world, actor, spot);
    if (route) return { meet: spot, route };
  }
  return null;
}

/** Starts an activity that needs no anchor, where the unicorn stands. */
export function startInPlace(
  world: World,
  actor: UnicornActor,
  activity: ActivityId,
  priority: 'idle' | 'player' = 'idle',
): void {
  const def = ACTIVITIES[activity];
  const leader = world.unicorns.wildstar!;
  const look = activityAnim(activity, actor.facing, actor.pos, leader.pos);
  actor.facing = look.facing;
  begin(world, actor, {
    kind: 'performing',
    activity,
    anchorId: null,
    slot: 0,
    partner: null,
    endsAt: world.time + world.rng.range(def.duration[0], def.duration[1]),
    turnAt: world.time + world.rng.range(0.8, 1.6),
    priority,
  });
}

function begin(world: World, actor: UnicornActor, st: Performing): void {
  setState(world, actor, st);
  actor.speed = 0;
  actor.path = null;
  const def = ACTIVITIES[st.activity];
  animate(actor, world, def.clip, actor.facing);
  remember(actor, st.activity);
  emit(world, { type: 'activity-started', actorId: actor.id, activityId: st.activity });
  if (def.effect) effect(world, def.effect, actor.pos, 2.4, cardinalOf(actor.facing));
  beginPropUse(world, st);
}

/** Reserves an anchor and walks to its standing place along a route that has already been found. */
function startAnchored(world: World, actor: UnicornActor, activity: ActivityId, anchorId: string, route: Vec2[]): void {
  const res = world.anchors.reserve(anchorId, actor.id, 'idle');
  const anchor = world.anchorDefs.get(anchorId);
  if (!res || !anchor) {
    actor.decideAt = world.time + 1;
    return;
  }
  const standing = anchor.approach[Math.min(res.slot, anchor.approach.length - 1)]!;
  const st: Approaching = {
    kind: 'approaching',
    activity,
    anchorId,
    slot: res.slot,
    partner: null,
    deadline: world.time + APPROACH_LIMIT,
    to: { ...standing.pos },
  };
  setState(world, actor, st);
  actor.path = route;
}

function startNuzzle(world: World, actor: UnicornActor, partner: UnicornActor, meet: Vec2, route: Vec2[]): void {
  const waiting: Waiting = { kind: 'waiting', partner: actor.id, deadline: world.time + WAIT_LIMIT };
  setState(world, partner, waiting);
  partner.speed = 0;
  partner.facing = sideToward(partner.pos, meet, sideOf(partner.facing));
  animate(partner, world, 'idle', partner.facing);
  const st: Approaching = {
    kind: 'approaching',
    activity: 'nuzzle',
    anchorId: null,
    slot: 0,
    partner: partner.id,
    deadline: world.time + WAIT_LIMIT,
    to: { ...meet },
  };
  setState(world, actor, st);
  actor.path = route;
}

/**
 * Takes a slot of an anchor because the player asked. A player has priority over idle holders: the
 * one who held the slot is told to yield and goes back to the herd. Returns the slot, or null when
 * there is none to take.
 */
export function claimAnchor(world: World, actor: UnicornActor, anchorId: string): number | null {
  const res = world.anchors.reserve(anchorId, actor.id, 'player');
  if (!res) return null;
  const loser = res.displaced ? world.unicorns[res.displaced] : undefined;
  if (loser) giveUp(world, loser);
  return res.slot;
}

/**
 * Wildstar using an anchor because the player asked. She is already at the standing place, so it
 * begins at once.
 */
export function startPlayerAnchored(
  world: World,
  actor: UnicornActor,
  activity: ActivityId,
  anchorId: string,
  slot: number,
): void {
  const anchor = world.anchorDefs.get(anchorId);
  const def = ACTIVITIES[activity];
  if (!anchor) return;
  const held = claimAnchor(world, actor, anchorId) ?? slot;
  const standing = anchor.approach[Math.min(held, anchor.approach.length - 1)]!;
  actor.facing = def.sideOnly
    ? sideFacing(facingOfCardinal(standing.facing), actor.pos, anchor.pos)
    : facingOfCardinal(standing.facing);
  begin(world, actor, {
    kind: 'performing',
    activity,
    anchorId,
    slot: held,
    partner: null,
    endsAt: world.time + world.rng.range(def.duration[0], def.duration[1]),
    turnAt: Infinity,
    priority: 'player',
  });
}

function stepApproaching(world: World, actor: UnicornActor, st: Approaching, dt: number): void {
  if (world.time > st.deadline || stalled(world, actor, actor.path !== null)) {
    giveUp(world, actor);
    return;
  }
  if (!actor.path) {
    // The route is on its way. The pose it had is kept until the unicorn is nearly still, so a walk
    // is not cut by a blink of standing.
    actor.speed = easeSpeed(actor.speed, 0, dt);
    animate(actor, world, gaitFor(world, actor, actor.speed), actor.facing);
    return;
  }
  const arrived = stroll(actor, CONFIG.speed.companion[actor.id], dt);
  const partner = st.partner ? world.unicorns[st.partner] : undefined;
  // The last steps toward a friend are taken looking at the friend, even when they are a step back,
  // so a short adjustment is not a turn away and a turn back.
  if (partner && pathLength(actor.pos, actor.path ?? []) <= FACE_PARTNER_WITHIN)
    actor.facing = sideToward(actor.pos, partner.pos, sideOf(actor.facing));
  animate(actor, world, arrived ? 'idle' : gaitFor(world, actor, actor.speed), actor.facing);
  if (arrived) arrive(world, actor, st);
}

function giveUp(world: World, actor: UnicornActor): void {
  if (actor.id === 'wildstar') setState(world, actor, { kind: 'leading' });
  else if (recruited(world, actor)) rejoinHerd(world, actor);
  else setState(world, actor, { kind: 'unrecruited-idle', nextAt: world.time + 1.5 });
}

function arrive(world: World, actor: UnicornActor, st: Approaching): void {
  const def = ACTIVITIES[st.activity];
  const endsAt = world.time + world.rng.range(def.duration[0], def.duration[1]);
  if (st.partner) {
    const partner = world.unicorns[st.partner];
    if (partner?.state.kind !== 'waiting' || partner.state.partner !== actor.id) {
      giveUp(world, actor);
      return;
    }
    actor.facing = sideToward(actor.pos, partner.pos, EAST);
    const mine: Performing = {
      kind: 'performing',
      activity: 'nuzzle',
      anchorId: null,
      slot: 0,
      partner: partner.id,
      endsAt,
      turnAt: Infinity,
      priority: 'idle',
    };
    // Each state names the other as partner, so changing state does not release the pair.
    begin(world, actor, mine);
    partner.facing = sideToward(partner.pos, actor.pos, WEST);
    begin(world, partner, { ...mine, partner: actor.id });
    const mid = { x: (actor.pos.x + partner.pos.x) / 2, y: (actor.pos.y + partner.pos.y) / 2 };
    effect(world, 'hearts', mid, 2.4);
    return;
  }
  const anchor = st.anchorId ? world.anchorDefs.get(st.anchorId) : undefined;
  if (!anchor) {
    giveUp(world, actor);
    return;
  }
  const standing = anchor.approach[Math.min(st.slot, anchor.approach.length - 1)]!;
  actor.facing = def.sideOnly
    ? sideFacing(facingOfCardinal(standing.facing), actor.pos, anchor.pos)
    : facingOfCardinal(standing.facing);
  begin(world, actor, {
    kind: 'performing',
    activity: st.activity,
    anchorId: st.anchorId,
    slot: st.slot,
    partner: null,
    endsAt,
    turnAt: Infinity,
    priority: 'idle',
  });
}

function stepWaiting(world: World, actor: UnicornActor, st: Waiting): void {
  actor.speed = 0;
  const other = world.unicorns[st.partner];
  const stillWanted = other && other.state.kind === 'approaching' && other.state.partner === actor.id;
  if (!stillWanted || world.time > st.deadline) giveUp(world, actor);
}

function stepPerforming(world: World, actor: UnicornActor, st: Performing): void {
  actor.speed = 0;
  if (world.time >= st.endsAt) {
    finish(world, actor);
    return;
  }
  if (st.activity === 'look-around' && world.time >= st.turnAt) {
    const others = allFacings(ACTIVITIES[st.activity].clip).filter(
      (f) => stepsBetween(f, actor.facing) >= CONFIG.idle.lookTurnMin,
    );
    actor.facing = world.rng.pick(others);
    st.turnAt = world.time + world.rng.range(0.9, 1.7);
  }
  animate(actor, world, ACTIVITIES[st.activity].clip, actor.facing);
}

/**
 * Stands where it is, away from the herd, choosing what to do next, until it has loitered long
 * enough to go back. This is what lets a friend graze, then wander to the water, instead of walking
 * back to its slot between every activity.
 */
function stepSeeking(world: World, actor: UnicornActor, st: Extract<UnicornState, { kind: 'seeking' }>): void {
  actor.speed = 0;
  animate(actor, world, 'idle', actor.facing);
  if (!world.idle.stopped || world.time >= st.until) {
    rejoinHerd(world, actor);
    actor.decideAt = world.time + world.rng.range(CONFIG.idle.pause[0], CONFIG.idle.pause[1]);
    return;
  }
  if (actor.decideAt !== null && world.time >= actor.decideAt) decide(world, actor);
}

function finish(world: World, actor: UnicornActor): void {
  const was = actor.state;
  if (actor.id === 'wildstar') {
    setState(world, actor, { kind: 'leading' });
    actor.decideAt = world.time + world.rng.range(2.5, 6);
    return;
  }
  if (!recruited(world, actor)) {
    setState(world, actor, { kind: 'unrecruited-idle', nextAt: world.time + world.rng.range(1.5, 3.5) });
    return;
  }
  const pause = world.rng.range(CONFIG.idle.pause[0], CONFIG.idle.pause[1]);
  if (was.kind === 'performing' && was.anchorId && world.idle.stopped) {
    setState(world, actor, { kind: 'seeking', until: world.time + world.rng.range(SEEK_FOR[0], SEEK_FOR[1]) });
  } else rejoinHerd(world, actor);
  actor.decideAt = world.time + pause;
}
