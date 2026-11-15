import { HERD_LINE, herdIsWhole } from '../../content/unicorns';
import { unicornFacingFor } from '../../shared/compass';
import type { Vec2 } from '../../shared/ids';
import { CONFIG } from '../config';
import { copy, dist, scale, smoothstep } from '../geometry';
import {
  animate,
  easeSpeed,
  effect,
  emit,
  followingAt,
  gaitFor,
  herdOrder,
  setState,
  slotIndex,
  slotS,
  stalled,
  unicornList,
  walkPath,
} from '../ops';
import { CORNER_SPAN, lateralFor, sideOffset } from '../slots';
import type { Bend } from '../trail';
import type { Following, UnicornActor, UnicornState, World } from '../types';

type Recovering = Extract<UnicornState, { kind: 'recovering' }>;

/**
 * How often a recovering unicorn replans toward its slot, which keeps moving as the leader walks.
 */
const REPATH_EVERY = 0.6;
/** How far along the trail, either side of its slot, a relocating follower looks for room. */
const RELOCATE_SEARCH = 480;
/**
 * Straightness of the trail (see `Trail.bendAt`) below which the sideways offset is fading out and
 * the trail direction is not trusted for facing.
 */
const FACE_STRAIGHT = 0.5;

/**
 * How far ahead on the trail a follower must be of the one in front of it in the herd before they
 * swap places. Level is not ahead.
 */
const OVERTAKE = 1;
/**
 * The least trail between a follower and the follower in front of it while both are on the trail.
 * Beyond the slots' own gaps, this is what keeps two catching up together from running side by
 * side.
 */
const TAILGATE = 60;

/**
 * A follower that has got ahead of the one in front of it takes that one's place in the herd. Two
 * that stopped to nuzzle and came back together can return in either order, and when the one behind
 * has the farther slot it would have to push past the other, side by side along a lane that may
 * have room for one.
 */
function settleOrder(world: World): void {
  const order = world.order;
  for (let i = 0; i + 1 < order.length; i++) {
    const front = world.unicorns[order[i]!]?.state;
    const back = world.unicorns[order[i + 1]!]?.state;
    if (front?.kind !== 'following' || back?.kind !== 'following') continue;
    if (back.s > front.s + OVERTAKE) [order[i], order[i + 1]] = [order[i + 1]!, order[i]!];
  }
}

/**
 * How far past its new place a follower must be for the line-up to send it back to it. Its place
 * moves a gap or more when two swap.
 */
const FALL_BACK = 40;

/** What a follower is doing while it is not yet, or not for a moment, part of the line. */
const AWAY: readonly UnicornState['kind'][] = ['greeting', 'casting', 'recovering'];

/**
 * Once all five friends are found, the herd stands in its own order whatever order they were found
 * in. The line forms when nobody is greeting, mid-cast or walking back to the herd, so a friend who
 * has just been found joins first and then the herd shuffles. A follower whose new place is behind
 * it walks back to it, because a follower never walks back along the trail by itself. One whose new
 * place is ahead catches up, and one that is away doing something takes the new place when it comes
 * back.
 */
function lineUp(world: World): void {
  if (HERD_LINE.every((id, i) => world.order[i] === id)) return;
  const members = HERD_LINE.map((id) => world.unicorns[id]).filter((u): u is UnicornActor => u !== undefined);
  if (members.some((u) => AWAY.includes(u.state.kind))) return;
  world.order.splice(0, world.order.length, ...HERD_LINE);
  for (const u of members) {
    const st = u.state;
    if (st.kind === 'following' && slotS(world, u.id) < st.s - FALL_BACK)
      setState(world, u, { kind: 'recovering', repathAt: world.time, stalls: 0 });
  }
}

/** Moves every follower that is following the trail or walking back to it. */
export function stepHerd(world: World, dt: number): void {
  if (herdIsWhole(world.order)) lineUp(world);
  else settleOrder(world);
  for (const id of herdOrder(world)) {
    const actor = world.unicorns[id]!;
    const s = actor.state;
    if (s.kind === 'following') stepFollowing(world, actor, s, dt);
    else if (s.kind === 'recovering') stepRecovering(world, actor, s, dt);
  }
}

function stepFollowing(world: World, actor: UnicornActor, st: Following, dt: number): void {
  const target = slotS(world, actor.id);
  const lag = target - st.s;
  const base = CONFIG.speed.companion[actor.id];
  const want =
    lag <= 0.5
      ? 0
      : base + (CONFIG.speed.catchUpMax - base) * smoothstep(CONFIG.herd.catchUpFrom, CONFIG.herd.catchUpFull, lag);
  st.v = easeSpeed(st.v, want, dt);
  // Never closer than TAILGATE behind the follower in front, when that one is on the trail too.
  const room = roomBehindFront(world, actor, st);
  const advance = Math.min(st.v * dt, Math.max(0, lag), Math.max(0, room));
  st.s += advance;
  // Held back by the slot or by the one in front, not by easing: the speed it was drawn at is gone.
  if (advance < st.v * dt) st.v = advance / dt;

  st.lat += (lateralFor(slotIndex(world, actor.id)) - st.lat) * Math.min(1, dt * 3);
  const decay = Math.exp(-dt * 5);
  st.join = scale(st.join, decay);
  st.push = separation(world, actor, st, dt);

  const { pos, bend } = placeFollower(world, st);
  actor.pos = limitStep(world, actor.prev, pos);

  // The stride follows actual ground speed, lightly smoothed, so the feet match what the body does.
  // Walking or standing is decided by how fast the unicorn is meant to travel, plus any drift that
  // moves it briskly.
  const moved = dist(actor.prev, actor.pos) / dt;
  actor.speed = moved < 4 ? 0 : actor.speed + (moved - actor.speed) * 0.5;
  const creep = actor.anim.clip === 'walk' ? CONFIG.herd.creep : CONFIG.herd.creep * 1.5;
  const gait = gaitFor(world, actor, Math.max(st.v, actor.speed >= creep ? actor.speed : 0));
  if (gait === 'walk' && bend.straight > FACE_STRAIGHT) actor.facing = unicornFacingFor(bend.tangent, actor.facing);
  animate(actor, world, gait, actor.facing);

  // A follower that wants to move and cannot has lost the trail. It walks back instead of standing
  // against a wall. One kept back by the follower in front has not lost anything.
  if (stalled(world, actor, lag > 40 && room > 0))
    setState(world, actor, { kind: 'recovering', repathAt: world.time, stalls: 0 });
}

/**
 * `to`, or the point `maxStep` of the way there when it is farther than that from `from`, kept on
 * ground.
 */
function limitStep(world: World, from: Vec2, to: Vec2): Vec2 {
  const d = dist(from, to);
  if (d <= CONFIG.herd.maxStep) return to;
  const k = CONFIG.herd.maxStep / d;
  return world.nav.slide(from, { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k });
}

/**
 * How much trail a follower may still cover before it is TAILGATE behind the follower in front of
 * it. Unlimited when that one is not on the trail.
 */
function roomBehindFront(world: World, actor: UnicornActor, st: Following): number {
  const order = herdOrder(world);
  const at = order.indexOf(actor.id);
  if (at <= 0) return Infinity;
  const front = world.unicorns[order[at - 1]!]?.state;
  return front?.kind === 'following' ? front.s - TAILGATE - st.s : Infinity;
}

/** Where a follower in state `st` stands, and the shape of the trail there. */
export function placeFollower(world: World, st: Following): { pos: Vec2; bend: Bend } {
  const bend = world.trail.bendAt(st.s, CORNER_SPAN);
  return { pos: placeOnGround(world, world.trail.pointAt(st.s), bend, st), bend };
}

/**
 * The follower's position: the trail point, plus the leftover join offset, plus its sideways offset
 * and the separation push. The join offset was checked as a straight walk when the follower
 * rejoined, so it is trusted while it still lands on ground. The sideways offset is held to the
 * room that spot has to spare: moving a distance d from a point with clearance c leaves at least c
 * - d, so the bound shrinks smoothly beside a wall instead of popping. The push slides along a wall
 * it would take the follower into and is not cut short, so a follower stood against a wall can
 * still be moved along it, out from under the leader who has walked onto it.
 */
function placeOnGround(world: World, trailPoint: Vec2, bend: Bend, st: Following): Vec2 {
  let base = { x: trailPoint.x + st.join.x, y: trailPoint.y + st.join.y };
  // The trail moved on and the join offset no longer lands on ground: let it go, a little at a
  // time.
  while (!world.nav.isWalkable(base) && (st.join.x !== 0 || st.join.y !== 0)) {
    st.join = Math.hypot(st.join.x, st.join.y) < 2 ? { x: 0, y: 0 } : scale(st.join, 0.6);
    base = { x: trailPoint.x + st.join.x, y: trailPoint.y + st.join.y };
  }
  const spare = Math.max(0, world.nav.clearanceAt(base) - world.nav.radius - 1);
  const side = sideOffset(bend, st.lat);
  const len = Math.hypot(side.x, side.y);
  const k = len > spare ? spare / len : 1;
  const lane = { x: base.x + side.x * k, y: base.y + side.y * k };
  return world.nav.slide(lane, { x: lane.x + st.push.x, y: lane.y + st.push.y });
}

/** A meeting this far off, in seconds, is not yet worth stepping aside for. */
const FORESEE = 0.6;

/**
 * Gentle push away from anyone who is, or is about to be, too close. It is bounded and smoothed.
 *
 * "About to be" is the nearest the two come to each other if both keep their present velocity.
 * Standing close is the plain case: push apart. Meeting head on is the one that matters when
 * Wildstar turns back through the herd: the nearest approach is then a sideways miss, so the push
 * goes sideways and the two pass each other instead of one being shoved back along its own way and
 * then forward again. If they are exactly in line, each steps to its own right, so they go round
 * opposite sides and never both to the same one.
 */
function separation(world: World, actor: UnicornActor, st: Following, dt: number): Vec2 {
  let px = 0;
  let py = 0;
  for (const other of unicornList(world)) {
    if (other === actor) continue;
    const rx = other.pos.x - actor.pos.x;
    const ry = other.pos.y - actor.pos.y;
    const vx = other.vel.x - actor.vel.x;
    const vy = other.vel.y - actor.vel.y;
    const vv = vx * vx + vy * vy;
    const closest = vv < 25 ? 0 : -(rx * vx + ry * vy) / vv;
    if (closest > FORESEE) continue;
    const t = Math.max(0, closest);
    const mx = rx + vx * t;
    const my = ry + vy * t;
    const miss = Math.hypot(mx, my);
    if (miss >= CONFIG.herd.personal) continue;
    const k = 1 - miss / CONFIG.herd.personal;
    if (miss >= 0.5) {
      px -= (mx / miss) * k * CONFIG.herd.maxPush;
      py -= (my / miss) * k * CONFIG.herd.maxPush;
    } else if (vv >= 25) {
      // In line. To the right of the way I am going relative to the other, which is the left of the
      // way it is going.
      const speed = Math.sqrt(vv);
      px += (vy / speed) * k * CONFIG.herd.maxPush;
      py += (-vx / speed) * k * CONFIG.herd.maxPush;
    } else {
      // Exactly stacked and still. Each pair separates along a fixed direction so the answer does
      // not flicker.
      const a = (actor.id.charCodeAt(0) * 0.37 + other.id.charCodeAt(0) * 0.11) % (Math.PI * 2);
      px += Math.cos(a) * CONFIG.herd.maxPush;
      py += Math.sin(a) * CONFIG.herd.maxPush;
    }
  }
  const len = Math.hypot(px, py);
  if (len > CONFIG.herd.maxPush) {
    px = (px / len) * CONFIG.herd.maxPush;
    py = (py / len) * CONFIG.herd.maxPush;
  }
  const f = Math.min(1, dt * 4);
  return { x: st.push.x + (px - st.push.x) * f, y: st.push.y + (py - st.push.y) * f };
}

function stepRecovering(world: World, actor: UnicornActor, st: Recovering, dt: number): void {
  const target = slotS(world, actor.id);
  const slot = world.trail.pointAt(target);

  // Back on the trail? Then follow it.
  const near = world.trail.nearest(actor.pos, target - 220, target + CONFIG.herd.joinAhead);
  if (near.d <= CONFIG.herd.joinRadius) {
    const point = world.trail.pointAt(near.s);
    if (world.nav.segmentClear(actor.pos, point)) {
      setState(world, actor, followingAt(world, near.s, actor.pos, actor.speed));
      return;
    }
  }

  if (world.time >= st.repathAt) {
    st.repathAt = world.time + REPATH_EVERY;
    world.paths.request(actor.id, actor.pos, slot, (path) => {
      if (actor.state !== st) return;
      if (path) actor.path = path;
      else st.stalls += 1;
    });
  }

  const lag = dist(actor.pos, slot);
  const base = CONFIG.speed.companion[actor.id];
  const speed =
    base + (CONFIG.speed.catchUpMax - base) * smoothstep(CONFIG.herd.catchUpFrom, CONFIG.herd.catchUpFull, lag);
  if (actor.path) {
    actor.speed = easeSpeed(actor.speed, speed, dt);
    const done = walkPath(actor, actor.speed, dt, unicornFacingFor);
    if (done) actor.path = null;
  } else actor.speed = easeSpeed(actor.speed, 0, dt);
  animate(actor, world, gaitFor(world, actor, actor.speed), actor.facing);

  const far = dist(actor.pos, world.unicorns.wildstar!.pos) > CONFIG.herd.relocateFar;
  if (stalled(world, actor, actor.path !== null || st.stalls > 0)) st.stalls += 1;
  // If there is no free spot right now the count starts over, so the next attempt waits for a fresh
  // stall.
  if ((st.stalls >= 2 || (far && st.stalls >= 1)) && !relocate(world, actor)) st.stalls = 0;
}

/**
 * Last resort for a follower that cannot walk back: appear, with a small sparkle, on the trail as
 * near its slot as there is room. The trail is ground Wildstar has stood on, so a spot on it is
 * always one to stand on, and the follower is already where it follows: there is no offset to ease
 * out and so nothing to cross on the way. Never on top of another unicorn, and only within this
 * map. When the trail has no room, it is a free spot near the leader.
 */
function relocate(world: World, actor: UnicornActor): boolean {
  const target = slotS(world, actor.id);
  const avoid: Vec2[] = unicornList(world)
    .filter((u) => u !== actor)
    .map((u) => u.pos);
  for (const n of world.npcs) avoid.push(n.pos);
  const free = (p: Vec2): boolean => world.nav.isWalkable(p, 2) && !avoid.some((q) => dist(p, q) < 56);

  let s = target;
  let to: Vec2 | null = null;
  for (let d = 0; d <= RELOCATE_SEARCH && !to; d += 8) {
    for (const at of d === 0 ? [target] : [target - d, target + d]) {
      if (at < world.trail.tail || at > world.trail.head) continue;
      const p = world.trail.pointAt(at);
      if (!free(p)) continue;
      s = at;
      to = p;
      break;
    }
  }
  to ??= world.nav.freePointNear(world.unicorns.wildstar!.pos, avoid, 56);
  if (!to) return false;

  const from = copy(actor.pos);
  effect(world, 'relocate', from, 0.8);
  actor.pos = copy(to);
  actor.prev = copy(to);
  actor.speed = 0;
  actor.path = null;
  setState(world, actor, followingAt(world, s, to));
  effect(world, 'relocate', to, 0.8);
  emit(world, { type: 'companion-relocated', unicornId: actor.id, from, to: copy(to) });
  return true;
}
