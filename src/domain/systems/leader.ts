import { codeMatches } from '../../content/manor';
import { type Lock, PROP_DEFS } from '../../content/props';
import { facingOfCardinal, unicornFacingFor, vecOf } from '../../shared/compass';
import type { ClipName, Facing, Vec2 } from '../../shared/ids';
import type { Encounter } from '../../shared/map';
import { CONFIG } from '../config';
import { copy, dist, inRect, normalize, smoothstep } from '../geometry';
import { pathLength } from '../nav/nav';
import { animate, easeSpeed, effect, emit, gaitFor, retire, setState, startTransient, walkPath } from '../ops';
import type { Arrival, Command, Steering, UnicornActor, World } from '../types';
import { inReach } from './encounters';
import { cancelIdleActivities, claimAnchor, startPlayerAnchored } from './idle';
import { unlock } from './locks';
import { beginCast, welcomeAt } from './magic';
import { npcWave } from './npcs';

/**
 * How quickly Wildstar speeds up and brakes. Quicker than the herd, since she answers the player's
 * finger.
 */
const LEADER_ACCEL = 1500;
const LEADER_BRAKE = 1100;

const leaderOf = (world: World) => world.unicorns.wildstar!;

/**
 * How often a sleeping Wildstar breathes out a few z's, and how high above the place she stood to
 * lie down her head is once the bed has carried her up.
 */
const DREAM_EVERY = 2.6;
const DREAM_HEIGHT = 156;
/** How far east of her middle her head lies, which is where the z's start. */
const DREAM_REACH = 50;

/** Whether she is lying in a bed, asleep, and not sitting up in a seat. */
export function isNapping(world: World): boolean {
  const seat = world.leader.seat === null ? undefined : world.interactables.get(world.leader.seat);
  return !!seat && PROP_DEFS[seat.definitionId]?.seat?.nap === true;
}

/**
 * The clip she is in while she stands without moving: dozing when she lies in a bed, awake
 * otherwise.
 */
const stillClip = (world: World): ClipName => (isNapping(world) ? 'rest' : 'idle');

/** A sleeper breathes out z's, one small puff every few seconds, from where her head lies. */
function dream(world: World, a: UnicornActor): void {
  if (Math.floor(world.time / DREAM_EVERY) === Math.floor((world.time - CONFIG.step) / DREAM_EVERY)) return;
  const toward = a.facing === 0 ? 1 : -1;
  effect(world, 'dream', { x: a.pos.x + toward * DREAM_REACH, y: a.pos.y - DREAM_HEIGHT }, DREAM_EVERY);
}

export function commandMove(world: World, c: Extract<Command, { type: 'move' }>): void {
  const a = leaderOf(world);
  const target = world.nav.nearestReachable(a.pos, c.destination);
  if (!target) {
    refuse(world, c.commandId, c.destination);
    return;
  }
  emit(world, { type: 'command-accepted', commandId: c.commandId, command: 'move', at: target.point });
  beginTravel(world, c.commandId, target.point, { kind: 'none' });
}

/**
 * How near she stands to a friend she goes to meet. Well inside the distance at which a friend
 * joins, so a step of wandering does not undo it.
 */
const GREET_STAND = 90;
/** How many times she goes again when the friend has wandered off while she walked. */
const GREET_RETRIES = 3;

export function commandGreet(world: World, c: Extract<Command, { type: 'greet' }>): void {
  const friend = world.unicorns[c.unicornId];
  const enc = world.map.encounters.find((e) => e.unicornId === c.unicornId);
  if (!friend || !enc || world.persistent.recruited.includes(c.unicornId)) return;
  // A tap on a friend who is already waiting asks again, so the game can offer whatever it did
  // before.
  if (world.met.has(friend.id)) emit(world, { type: 'friend-met', unicornId: friend.id, at: copy(friend.pos) });
  const target = meetingPlace(world, friend, enc);
  if (!target) {
    refuse(world, c.commandId, friend.pos);
    return;
  }
  emit(world, { type: 'command-accepted', commandId: c.commandId, command: 'greet', at: friend.pos });
  beginTravel(world, c.commandId, target, { kind: 'greet', unicornId: c.unicornId, tries: 0 });
}

/**
 * Where Wildstar should stand to meet a friend: close enough that the friend joins, and in sight of
 * her. The spot the map names is the way in from the open side of the clearing, but a friend who
 * has wandered to the far side of it is out of reach from there, so the spot is used only while the
 * friend is near it. Otherwise she goes to the side she comes from.
 */
function meetingPlace(world: World, friend: UnicornActor, enc: Encounter): Vec2 | null {
  const from = leaderOf(world).pos;
  const reach = enc.triggerRadius * 0.9;
  const toLeader = normalize({ x: from.x - friend.pos.x, y: from.y - friend.pos.y });
  const wishes: Vec2[] = [
    enc.greeting,
    { x: friend.pos.x + toLeader.x * GREET_STAND, y: friend.pos.y + toLeader.y * GREET_STAND },
    friend.pos,
  ];
  let fallback: Vec2 | null = null;
  for (const wish of wishes) {
    const found = world.nav.nearestReachable(from, wish);
    if (!found) continue;
    fallback ??= found.point;
    if (dist(found.point, friend.pos) <= reach && world.nav.lineOfSight(found.point, friend.pos)) return found.point;
  }
  return fallback;
}

export function commandInteract(world: World, c: Extract<Command, { type: 'interact' }>): void {
  const npc = world.npcs.find((n) => n.instanceId === c.instanceId);
  if (npc) {
    emit(world, { type: 'command-accepted', commandId: c.commandId, command: 'interact', at: npc.pos });
    npcWave(world, npc);
    return;
  }
  const inst = world.interactables.get(c.instanceId);
  const def = inst ? PROP_DEFS[inst.definitionId] : undefined;
  if (!inst || !def || def.tap === 'none') return;

  const a = leaderOf(world);
  const anchor = inst.anchor ? world.anchorDefs.get(inst.anchor) : undefined;
  let goal: Vec2 | null = null;
  let facing: Facing = inst.approach[0]!.facing;
  let slot = 0;

  if (anchor) {
    // Take a slot first, so nobody else claims it while she walks over. An idle holder yields.
    const taken = claimAnchor(world, a, anchor.anchorId);
    if (taken !== null) {
      slot = taken;
      const at = anchor.approach[Math.min(slot, anchor.approach.length - 1)]!;
      if (world.nav.sameGround(a.pos, at.pos)) {
        goal = at.pos;
        facing = at.facing;
      } else world.anchors.release(anchor.anchorId, a.id);
    }
  } else {
    for (const ap of inst.approach) {
      if (world.nav.isWalkable(ap.pos) && world.nav.sameGround(a.pos, ap.pos)) {
        goal = ap.pos;
        facing = ap.facing;
        break;
      }
    }
  }
  if (!goal) {
    refuse(world, c.commandId, inst.pos);
    return;
  }
  emit(world, { type: 'command-accepted', commandId: c.commandId, command: 'interact', at: inst.pos });
  beginTravel(world, c.commandId, goal, {
    kind: 'interact',
    instanceId: inst.instanceId,
    facing,
    anchorId: anchor?.anchorId ?? null,
    slot,
  });
}

/**
 * A finger or key is held: she walks the way it points until it is let go. This is how the player
 * moves her, by holding the way she wants to go, so it takes over from any route she was walking
 * and from whatever she was about to do at the end of it. Held headings arrive many times a second
 * and the same one again changes nothing.
 */
export function commandSteer(world: World, c: Extract<Command, { type: 'steer' }>): void {
  const want = normalize(c.heading);
  if (want.x === 0 && want.y === 0) {
    commandHalt(world);
    return;
  }
  const a = leaderOf(world);
  const L = world.leader;
  // A door is swinging open for the herd. A finger still held toward it does not call her away, or
  // the door would never open.
  if (L.portalAt) return;
  if (!L.steer) {
    // Anything she reserved for an older command goes back, and whatever she was doing winds down.
    for (const id of world.anchors.heldBy(a.id)) world.anchors.release(id, a.id);
    cancelIdleActivities(world);
    if (a.state.kind !== 'leading') setState(world, a, { kind: 'leading' });
    L.seat = null;
    L.gen += 1;
    world.paths.cancel(a.id);
    a.path = null;
    L.commandId = c.commandId;
    L.goal = null;
    L.onArrival = { kind: 'none' };
    L.portalAt = null;
    const moving = a.vel.x !== 0 || a.vel.y !== 0 ? normalize(a.vel) : vecOf(a.facing);
    L.steer = { want, course: a.speed < CONFIG.steer.pivotBelow ? want : moving, pace: a.speed };
  } else L.steer.want = want;
  L.phase = 'steering';
  world.idle.lastLeaderMove = world.time;
}

/** The finger or key was let go. She slows to a stop where she is. */
export function commandHalt(world: World): void {
  const S = world.leader.steer;
  if (S) S.want = null;
}

/**
 * She stands where she is with nothing she was told to do: no route, no finger held on her, no
 * place reserved. Whoever sent her has to say again.
 */
export function calm(world: World): void {
  const a = leaderOf(world);
  const L = world.leader;
  for (const id of world.anchors.heldBy(a.id)) world.anchors.release(id, a.id);
  L.gen += 1;
  world.paths.cancel(a.id);
  a.path = null;
  a.speed = 0;
  L.steer = null;
  L.goal = null;
  L.onArrival = { kind: 'none' };
  L.phase = 'idle';
  L.commandId = null;
}

function refuse(world: World, commandId: string, wanted: Vec2): void {
  emit(world, { type: 'command-refused', commandId, at: world.nav.closestEdgePoint(leaderOf(world).pos, wanted) });
}

/**
 * Replaces whatever Wildstar was doing with a walk to `goal`. Idle activities wind down, any anchor
 * she had reserved for an older command is released, and the route search carries this command's
 * generation so a late result for an older command cannot come back to life.
 */
export function beginTravel(world: World, commandId: string, goal: Vec2, arrival: Arrival): void {
  const L = world.leader;
  const a = leaderOf(world);

  // An anchor she reserved for an older interaction goes back, unless the new target is the same
  // anchor.
  const keep = arrival.kind === 'interact' ? arrival.anchorId : null;
  for (const id of world.anchors.heldBy(a.id)) if (id !== keep) world.anchors.release(id, a.id);

  cancelIdleActivities(world);
  if (a.state.kind !== 'leading') setState(world, a, { kind: 'leading' });
  L.seat = null;
  // A route she is already walking is kept until the new one arrives, so a second tap bends her
  // course instead of stopping her. A held finger that is lifted to tap somewhere else has ended
  // its steering: she goes on at the speed she has.
  L.steer = null;

  L.gen += 1;
  const gen = L.gen;
  L.commandId = commandId;
  L.goal = goal;
  L.onArrival = arrival;
  L.phase = 'pathing';
  L.portalAt = null;
  world.idle.lastLeaderMove = world.time;

  world.paths.request(
    a.id,
    a.pos,
    goal,
    (path) => {
      if (L.gen !== gen) return;
      if (!path) {
        a.path = null;
        L.phase = 'idle';
        L.onArrival = { kind: 'none' };
        refuse(world, commandId, goal);
        return;
      }
      a.path = path;
      L.phase = 'walking';
    },
    true,
  );
}

/** Moves Wildstar and records the trail. Runs once per step. */
export function stepLeader(world: World, dt: number): void {
  const a = leaderOf(world);
  const L = world.leader;

  if (L.portalAt && world.time >= L.portalAt.at) {
    enterPortal(world, L.portalAt.portalId);
    return;
  }

  const walking = a.state.kind === 'leading' && (L.phase === 'walking' || L.phase === 'pathing') && a.path !== null;
  if (L.steer && a.state.kind === 'leading') {
    stepSteering(world, dt, L.steer);
  } else if (walking) {
    // Brake toward the end of the route so she settles instead of stopping dead.
    const remaining = pathLength(a.pos, a.path!);
    const brakeCap = Math.sqrt(2 * LEADER_BRAKE * remaining) + 24;
    const want = Math.min(CONFIG.speed.leader, brakeCap);
    a.speed = easeSpeed(a.speed, want, dt, LEADER_ACCEL);
    const arrived = walkPath(a, a.speed, dt, unicornFacingFor, (p) => world.trail.push(p, true));
    world.trail.push(a.pos);
    animate(a, world, 'walk', a.facing);
    if (arrived) {
      a.speed = 0;
      a.path = null;
      animate(a, world, 'idle', a.facing);
      // The old route ended while a new one is still being searched: wait for it, the goal is not
      // this one's.
      if (L.phase === 'walking') {
        L.phase = 'idle';
        emit(world, { type: 'save-needed', reason: 'position' });
        world.lastAutosave = world.time;
        arriveAtGoal(world);
      }
    }
  } else if (a.state.kind === 'leading') {
    a.speed = 0;
    animate(a, world, stillClip(world), a.facing);
    if (isNapping(world)) dream(world, a);
  } else if (a.state.kind !== 'casting') a.speed = 0;
  // A cast stops her where she is, and she sets off again from rest when it ends.
  if (L.steer && a.state.kind !== 'leading') L.steer.pace = 0;

  checkPortals(world);
}

/** The angle from `a` round to `b`, the short way, in radians. Positive turns toward south. */
function angleTo(a: Vec2, b: Vec2): number {
  let d = Math.atan2(b.y, b.x) - Math.atan2(a.y, a.x);
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/** `v` turned toward `to` by at most `by` radians. Both are unit vectors. */
function turnToward(v: Vec2, to: Vec2, by: number): Vec2 {
  const d = angleTo(v, to);
  if (Math.abs(d) <= by) return { x: to.x, y: to.y };
  const n = Math.atan2(v.y, v.x) + Math.sign(d) * by;
  return { x: Math.cos(n), y: Math.sin(n) };
}

/**
 * The way she looks while she is led. She looks the way she really moves, and the less of the step
 * she meant the ground lets her take, the more she keeps looking the way she is headed. A tree she
 * walks into does not spin her round with every nudge it gives her, and a fence she is pressed
 * along turns her only part of the way toward it. Held against something she stands looking where
 * she is pushing.
 */
function looking(course: Vec2, from: Vec2, to: Vec2, meant: number): Vec2 {
  const made = dist(from, to);
  if (made < 1e-6) return course;
  const went = { x: (to.x - from.x) / made, y: (to.y - from.y) / made };
  // A nudge too short to be a direction she went turns her only in proportion, so the ground she is
  // pressed against does not make her look about.
  const kept = (Math.min(made, meant) / Math.max(made, meant)) * smoothstep(0, CONFIG.steer.lookFrom, made);
  return turnToward(course, went, Math.abs(angleTo(course, went)) * kept);
}

/**
 * Walks her the way she is steered. Her course turns toward what is held on a circle of a set size,
 * so a finger that swings round makes her curve and not snap, and the trail the herd follows has no
 * sharper bend than she can run. She slides along a tree or a pond's edge, keeping the part of the
 * move that ran alongside it, and stands still when she walks straight at one. Letting go slows her
 * to a stop, and a door that is swinging open for the herd does the same, so she does not walk off
 * from it.
 */
function stepSteering(world: World, dt: number, S: Steering): void {
  const a = leaderOf(world);
  const L = world.leader;
  const cfg = CONFIG.steer;
  const want = L.portalAt ? null : S.want;

  let target = 0;
  if (want) {
    // On the spot she can face any way at once. Once she is running she turns on her circle.
    S.course = S.pace < cfg.pivotBelow ? want : turnToward(S.course, want, (S.pace * dt) / cfg.turnRadius);
    target = CONFIG.speed.leader;
  }
  const rate = (target > S.pace ? cfg.accel : cfg.brake) * dt;
  S.pace = target > S.pace ? Math.min(target, S.pace + rate) : Math.max(target, S.pace - rate);

  const reach = S.pace * dt;
  const from = a.pos;
  const to = world.nav.slide(from, { x: from.x + S.course.x * reach, y: from.y + S.course.y * reach });
  const made = dist(from, to);
  if (made > 0) {
    a.pos = to;
    world.trail.push(a.pos);
  }
  // Straight at something she cannot cover the ground she means to, so she stops and does not keep
  // trying at speed.
  if (reach > 0 && made < cfg.blockedBelow * reach) S.pace = 0;
  // The picture strides by the ground she really covers, so she stands rather than running on the
  // spot against a tree.
  a.speed = made / dt;

  const clip = gaitFor(world, a, a.speed);
  a.facing = unicornFacingFor(looking(S.course, from, to, reach), a.facing);
  animate(a, world, clip, a.facing);

  // She is done once she stands, and she is drawn standing: a walk that lasted a few steps is shown
  // through to its end.
  if (!want && S.pace === 0 && a.speed === 0 && clip === 'idle') {
    L.steer = null;
    L.phase = 'idle';
    emit(world, { type: 'save-needed', reason: 'position' });
    world.lastAutosave = world.time;
  }
}

function arriveAtGoal(world: World): void {
  const L = world.leader;
  const arrival = L.onArrival;
  L.onArrival = { kind: 'none' };
  L.goal = null;
  if (arrival.kind === 'greet') {
    meetAgain(world, arrival);
    return;
  }
  if (arrival.kind !== 'interact') return;
  const a = leaderOf(world);
  const inst = world.interactables.get(arrival.instanceId);
  const def = inst ? PROP_DEFS[inst.definitionId] : undefined;
  if (!inst || !def) return;
  a.facing = facingOfCardinal(arrival.facing);
  // In a seat she keeps facing the room. She turns to face anything else she casts at.
  if (def.seat) world.leader.seat = inst.instanceId;
  switch (def.tap) {
    case 'chest':
    case 'treasure':
    case 'harvest':
    case 'delight':
    case 'minigame':
    case 'palace-door':
    case 'clue':
      beginCast(world, a, { kind: 'interact', instanceId: inst.instanceId }, def.seat ? undefined : inst.pos);
      break;
    case 'door':
      openDoor(world, inst.instanceId);
      break;
    // The cup fills and the brush works for as long as someone uses them, which
    // `startPlayerAnchored` records.
    case 'cup':
      if (arrival.anchorId) startPlayerAnchored(world, a, 'drink', arrival.anchorId, arrival.slot);
      effect(world, 'sparkle', inst.pos, 2.4);
      break;
    case 'brush':
      if (arrival.anchorId) startPlayerAnchored(world, a, 'groom', arrival.anchorId, arrival.slot);
      break;
    case 'none':
      break;
  }
}

/**
 * She reached the place she chose to meet a friend. If the friend moved on while she walked, she
 * goes to where the friend is now.
 */
function meetAgain(world: World, arrival: Extract<Arrival, { kind: 'greet' }>): void {
  const friend = world.unicorns[arrival.unicornId];
  const enc = world.map.encounters.find((e) => e.unicornId === arrival.unicornId);
  if (!friend || !enc || world.persistent.recruited.includes(arrival.unicornId)) return;
  // Where the game asks first, standing beside a friend who is waiting is what she came for.
  if (world.rules.friends === 'ask' && (world.met.has(friend.id) || inReach(world, friend, enc))) return;
  const L = world.leader;
  const commandId = L.commandId ?? `greet-${arrival.unicornId}`;
  const target = arrival.tries < GREET_RETRIES ? meetingPlace(world, friend, enc) : null;
  if (!target || dist(target, leaderOf(world).pos) < 8) {
    refuse(world, commandId, friend.pos);
    return;
  }
  beginTravel(world, commandId, target, { kind: 'greet', unicornId: arrival.unicornId, tries: arrival.tries + 1 });
}

/**
 * A word was typed for a door. The right one opens it and takes her through. The wrong one only
 * says no.
 */
export function commandCode(world: World, c: Extract<Command, { type: 'enter-code' }>): void {
  const door = world.interactables.get(c.instanceId);
  if (!door || PROP_DEFS[door.definitionId]?.lock !== 'code' || world.unlocked.has(c.instanceId)) return;
  if (!codeMatches(c.code)) {
    emit(world, { type: 'code-refused', instanceId: c.instanceId });
    return;
  }
  unlock(world, c.instanceId);
  effect(world, 'door-glow', door.pos, 1.4);
  openDoor(world, c.instanceId);
}

const DOOR_SECONDS = 0.7;

/**
 * The door swings open for a moment before the herd goes through. A door that is still shut for
 * want of a word or a clue asks for it instead.
 */
function openDoor(world: World, doorInstanceId: string, walkedIn = false): void {
  const portal = world.map.portals.find((p) => p.door === doorInstanceId);
  if (!portal || world.leader.portalAt) return;
  const lock = PROP_DEFS[world.interactables.get(doorInstanceId)?.definitionId ?? '']?.lock;
  if (lock && !world.unlocked.has(doorInstanceId)) {
    stayShut(world, doorInstanceId, lock, walkedIn);
    return;
  }
  // The palace greets her with a glow and a rainbow, and takes a little longer to let her in.
  if (PROP_DEFS[world.interactables.get(doorInstanceId)?.definitionId ?? '']?.tap === 'palace-door') {
    welcomeAt(world, doorInstanceId);
    return;
  }
  startTransient(world, doorInstanceId, 'door-opening', DOOR_SECONDS + 0.5);
  emit(world, {
    type: 'prop-activity',
    instanceId: doorInstanceId,
    activity: 'door-opening',
    seconds: DOOR_SECONDS + 0.5,
  });
  world.leader.portalAt = { portalId: portal.portalId, at: world.time + DOOR_SECONDS };
}

/**
 * A shut door. One that wants a word asks the screen for it. One that wants a clue shows where the
 * clue is. Standing in the doorway asks once, and she has to step out and back in, or tap the door,
 * to be asked again.
 */
function stayShut(world: World, doorInstanceId: string, lock: Lock, walkedIn: boolean): void {
  if (walkedIn && world.leader.knocked === doorInstanceId) return;
  world.leader.knocked = doorInstanceId;
  if (lock === 'code') {
    emit(world, { type: 'code-wanted', instanceId: doorInstanceId });
    return;
  }
  const opens = world.interactables.get(doorInstanceId)?.definitionId;
  const clue = [...world.interactables.values()].find((i) => PROP_DEFS[i.definitionId]?.opens === opens);
  if (clue) effect(world, 'pip-sparkle', { x: clue.pos.x, y: clue.pos.y - 30 }, 1.4);
}

/** Walking into a portal's area takes the herd through, through its door if it has one. */
function checkPortals(world: World): void {
  const a = leaderOf(world);
  if (world.leader.portalAt || world.paused) return;
  const into = world.map.portals.find((p) => inRect(a.pos, p.bounds));
  if (!into) {
    world.leader.knocked = null;
    return;
  }
  if (into.door) openDoor(world, into.door, true);
  else enterPortal(world, into.portalId);
}

function enterPortal(world: World, portalId: string): void {
  const p = world.map.portals.find((q) => q.portalId === portalId);
  world.leader.portalAt = null;
  if (!p || world.paused) return;
  emit(world, { type: 'save-needed', reason: 'map' });
  emit(world, { type: 'portal-entered', portalId, to: p.to, ...(p.ride ? { ride: p.ride } : {}) });
  retire(world);
}
