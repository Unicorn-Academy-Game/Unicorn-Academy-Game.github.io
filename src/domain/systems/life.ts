import { LIFE, LIFE_CAP, type LifeDef } from '../../content/life';
import type { Vec2 } from '../../shared/ids';
import type { LifeZone } from '../../shared/map';
import { clamp } from '../../shared/math';
import { CONFIG } from '../config';
import { copy, dist } from '../geometry';
import type { Nav } from '../nav/nav';
import { effect, emit, unicornList } from '../ops';
import type { Rng } from '../rng';
import type { Command, Critter, Leg, UnicornActor, World } from '../types';

/**
 * Everything a creature of the world does: settle in its zone, rest, wander, keep out of the way
 * and answer a tap.
 */

const TAU = Math.PI * 2;

/**
 * What mixes the world's seed into the creatures' own stream, so they never draw from the
 * unicorns'. It spells "life".
 */
export const LIFE_SEED = 0x6c696665;

/**
 * Whether a point is in a zone: its rectangle, or the ellipse drawn inside it. `slack` widens it,
 * for the checks that allow a little spill.
 */
export function inZone(zone: LifeZone, p: Vec2, slack = 0): boolean {
  const { x, y, w, h } = zone.area;
  if (zone.shape === 'rect')
    return p.x >= x - slack && p.x <= x + w + slack && p.y >= y - slack && p.y <= y + h + slack;
  const nx = (p.x - (x + w / 2)) / (w / 2 + slack);
  const ny = (p.y - (y + h / 2)) / (h / 2 + slack);
  return nx * nx + ny * ny <= 1;
}

/**
 * Whether a creature on the ground can be at a point: clear of trees, walls and water by a margin
 * its own size.
 */
export const roomFor = (nav: Nav, p: Vec2): boolean => nav.clearanceAt(p) >= CONFIG.life.clearance;

/** Whether a creature on the ground can go straight from one place to another. */
function pathClear(nav: Nav, a: Vec2, b: Vec2): boolean {
  const steps = Math.max(1, Math.ceil(dist(a, b) / 12));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (!roomFor(nav, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) return false;
  }
  return true;
}

/** Where a creature may be: inside its zone and, if it lives on the ground, with room to stand. */
const usable = (world: World, def: LifeDef, zone: LifeZone, p: Vec2): boolean =>
  inZone(zone, p) && (def.home !== 'ground' || roomFor(world.nav, p));

const randomIn = (zone: LifeZone, rng: Rng): Vec2 => ({
  x: zone.area.x + rng.next() * zone.area.w,
  y: zone.area.y + rng.next() * zone.area.h,
});

const pickRest = (rng: Rng, def: LifeDef): string => rng.weighted(def.rests, (r) => r.weight)!.clip;

function findSpot(
  world: World,
  def: LifeDef,
  zone: LifeZone,
  taken: readonly Vec2[],
  herd: readonly Vec2[],
): Vec2 | null {
  const rng = world.life.rng;
  for (let i = 0; i < 40; i++) {
    const p = randomIn(zone, rng);
    if (!usable(world, def, zone, p)) continue;
    if (taken.some((t) => dist(t, p) < CONFIG.life.apart)) continue;
    if (def.home !== 'air' && herd.some((h) => dist(h, p) < CONFIG.life.fromHerd)) continue;
    return p;
  }
  return null;
}

/**
 * Puts every zone's creatures down where they live. Run once, after the unicorns have been placed,
 * so no one starts on top of the herd.
 */
export function populateLife(world: World): void {
  const rng = world.life.rng;
  const herd = unicornList(world).map((u) => u.pos);
  for (const zone of world.map.life) {
    const def = LIFE[zone.kind];
    const here: Vec2[] = [];
    for (let i = 0; i < zone.count && world.life.critters.length < LIFE_CAP; i++) {
      const at = findSpot(world, def, zone, here, herd);
      if (!at) continue;
      here.push(at);
      const clip = pickRest(rng, def);
      const z = def.gait.kind === 'cruise' ? rng.range(def.gait.altitude[0], def.gait.altitude[1]) : 0;
      world.life.critters.push({
        id: `${zone.zoneId}-${i + 1}`,
        zoneId: zone.zoneId,
        kind: zone.kind,
        look: rng.pick(def.looks),
        pos: copy(at),
        prev: copy(at),
        z,
        prevZ: z,
        anim: { clip, facing: rng.next() < 0.5 ? 'east' : 'west', startedAt: world.time - rng.range(0, 8) },
        state: { kind: 'rest', clip, until: world.time + rng.range(0, def.restFor[1]) },
      });
    }
  }
}

function setClip(world: World, c: Critter, clip: string): void {
  if (c.anim.clip !== clip) c.anim = { clip, facing: c.anim.facing, startedAt: world.time };
}

function begin(world: World, c: Critter, leg: Leg): void {
  if (Math.abs(leg.to.x - leg.from.x) > 3) c.anim.facing = leg.to.x > leg.from.x ? 'east' : 'west';
  c.state = { kind: 'go', ...leg };
  setClip(world, c, leg.crouch ? leg.crouch.clip : leg.clip);
}

function rest(world: World, c: Critter, def: LifeDef, within?: readonly [number, number]): void {
  const rng = world.life.rng;
  const [lo, hi] = within ?? def.restFor;
  const clip = pickRest(rng, def);
  c.state = { kind: 'rest', clip, until: world.time + rng.range(lo, hi) };
  setClip(world, c, clip);
}

/** A trip to `to` in the way of this kind, at `pace` times its usual speed. */
function legTo(world: World, c: Critter, def: LifeDef, to: Vec2, pace: number): Leg {
  const rng = world.life.rng;
  const g = def.gait;
  const d = dist(c.pos, to);
  const leg: Leg = {
    from: copy(c.pos),
    to: copy(to),
    z0: c.z,
    z1: 0,
    t0: world.time,
    t1: world.time,
    arc: 0,
    clip: def.moving,
    crouch: null,
    repeat: 0,
    ease: false,
    react: false,
  };
  switch (g.kind) {
    case 'walk':
      leg.t1 += Math.max(0.3, d / (g.speed * pace));
      break;
    case 'hop':
      // The speed is that of the part in the air, so a hop with a long crouch is still as quick
      // across the ground.
      leg.t1 += Math.max(0.36, d / (g.speed * pace) / (1 - g.lead - g.tail));
      leg.arc = g.height;
      leg.crouch = { clip: g.crouch, lead: g.lead, tail: g.tail };
      break;
    case 'flit':
      leg.t1 += Math.max(0.4, d / (g.speed * pace));
      leg.arc = rng.range(g.height[0], g.height[1]);
      break;
    case 'cruise':
      leg.t1 += Math.max(0.5, d / (g.speed * pace));
      leg.z1 = rng.range(g.altitude[0], g.altitude[1]);
      leg.ease = true;
      break;
  }
  return leg;
}

interface Want {
  /** Somewhere far from this point: the creature is getting out of the way. */
  away?: Vec2;
  /** Somewhere near this point: the creature has come over to look. */
  near?: Vec2;
  range?: readonly [number, number];
}

/**
 * A place worth going to, or null when nothing nearby will do and the creature should stay put a
 * moment longer.
 */
function pickSpot(world: World, c: Critter, def: LifeDef, zone: LifeZone, want: Want): Vec2 | null {
  const rng = world.life.rng;
  const [lo, hi] = want.range ?? def.leg;
  let best: Vec2 | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < CONFIG.life.tries; i++) {
    let p: Vec2;
    if (want.near) {
      const a = rng.range(0, TAU);
      const d = rng.range(CONFIG.life.fairyLeast, CONFIG.life.fairyMost);
      p = { x: want.near.x + Math.cos(a) * d, y: want.near.y + Math.sin(a) * d * 0.6 };
    } else {
      const a = want.away
        ? Math.atan2(c.pos.y - want.away.y, c.pos.x - want.away.x) + rng.range(-1.1, 1.1)
        : rng.range(0, TAU);
      const d = rng.range(lo, hi);
      p = { x: c.pos.x + Math.cos(a) * d, y: c.pos.y + Math.sin(a) * d };
    }
    if (!usable(world, def, zone, p)) continue;
    if (def.home === 'ground' && !pathClear(world.nav, c.pos, p)) continue;
    if (!want.away) return p;
    const score = dist(p, want.away);
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  return best;
}

const nearest = (unicorns: readonly UnicornActor[], p: Vec2, within: number): UnicornActor | null => {
  let best: UnicornActor | null = null;
  let bestD = within;
  for (const u of unicorns) {
    const d = dist(u.pos, p);
    if (d < bestD) {
      best = u;
      bestD = d;
    }
  }
  return best;
};

export function stepLife(world: World): void {
  const critters = world.life.critters;
  if (critters.length === 0) return;
  const unicorns = unicornList(world);
  for (const c of critters) {
    c.prev.x = c.pos.x;
    c.prev.y = c.pos.y;
    c.prevZ = c.z;
    const def = LIFE[c.kind];
    const zone = world.life.zones.get(c.zoneId)!;
    const s = c.state;
    switch (s.kind) {
      case 'rest':
        stepRest(world, c, def, zone, s.busy === true, s.until, unicorns);
        break;
      case 'go':
        stepGo(world, c, def, s);
        break;
      case 'twirl':
        stepTwirl(world, c, def, s);
        break;
    }
  }
}

function stepRest(
  world: World,
  c: Critter,
  def: LifeDef,
  zone: LifeZone,
  busy: boolean,
  until: number,
  unicorns: readonly UnicornActor[],
): void {
  if (!busy && def.startle > 0) {
    const close = nearest(unicorns, c.pos, def.startle);
    if (close) {
      const to = pickSpot(world, c, def, zone, { away: close.pos, range: [def.leg[1] * 0.7, def.leg[1] * 1.2] });
      if (to) {
        begin(world, c, legTo(world, c, def, to, CONFIG.life.startleSpeed));
        return;
      }
    }
  }
  if (world.time < until) return;
  const visitor = def.curious ? nearest(unicorns, c.pos, def.curious) : null;
  const wantsToLook = visitor && dist(visitor.pos, c.pos) > CONFIG.life.fairyLeast;
  const to = pickSpot(world, c, def, zone, wantsToLook ? { near: visitor.pos } : {});
  if (to) begin(world, c, legTo(world, c, def, to, 1));
  else rest(world, c, def, [0.6, 1.4]);
}

function stepGo(world: World, c: Critter, def: LifeDef, s: Leg): void {
  const p = clamp((world.time - s.t0) / (s.t1 - s.t0), 0, 1);
  const crouch = s.crouch;
  const moving = crouch ? clamp((p - crouch.lead) / (1 - crouch.lead - crouch.tail), 0, 1) : p;
  const m = s.ease ? moving * moving * (3 - 2 * moving) : moving;
  c.pos.x = s.from.x + (s.to.x - s.from.x) * m;
  c.pos.y = s.from.y + (s.to.y - s.from.y) * m;
  c.z = s.z0 + (s.z1 - s.z0) * m + s.arc * 4 * moving * (1 - moving);
  setClip(world, c, crouch && (p < crouch.lead || p > 1 - crouch.tail) ? crouch.clip : s.clip);
  if (p < 1) return;
  c.pos.x = s.to.x;
  c.pos.y = s.to.y;
  c.z = s.z1;
  // A fish coming down breaks the water again.
  if (def.home === 'water' && s.arc > 0) effect(world, 'splash', c.pos, 1);
  if (s.repeat > 0) {
    begin(world, c, {
      ...s,
      from: copy(s.to),
      z0: s.z1,
      t0: world.time,
      t1: world.time + (s.t1 - s.t0),
      repeat: s.repeat - 1,
    });
    return;
  }
  rest(world, c, def);
}

function stepTwirl(
  world: World,
  c: Critter,
  def: LifeDef,
  s: { center: Vec2; z: number; t0: number; t1: number },
): void {
  const p = clamp((world.time - s.t0) / (s.t1 - s.t0), 0, 1);
  const a = p * TAU;
  const side = c.anim.facing === 'east' ? 1 : -1;
  // A loop standing on its end: up and over and back to where it started.
  c.pos.x = s.center.x + Math.sin(a) * CONFIG.life.loop * side;
  c.z = s.z + (1 - Math.cos(a)) * CONFIG.life.loop;
  if (p < 1) return;
  c.pos.x = s.center.x;
  c.z = s.z;
  rest(world, c, def);
}

const reacting = (c: Critter): boolean =>
  c.state.kind === 'twirl' ||
  (c.state.kind === 'go' && c.state.react) ||
  (c.state.kind === 'rest' && c.state.busy === true);

export function commandPoke(world: World, command: Extract<Command, { type: 'poke' }>): void {
  const c = world.life.critters.find((x) => x.id === command.critterId);
  if (!c) return;
  const def = LIFE[c.kind];
  const zone = world.life.zones.get(c.zoneId)!;
  // A tap on one that is already answering still gets its shimmer and its sound, and does not start
  // the answer over.
  if (!reacting(c)) answer(world, c, def, zone);
  effect(world, def.effect, c.pos, 1.4, undefined, c.z);
  emit(world, { type: 'critter-poked', critterId: c.id, kind: c.kind, look: c.look, at: copy(c.pos), z: c.z });
}

function answer(world: World, c: Critter, def: LifeDef, zone: LifeZone): void {
  const rng = world.life.rng;
  const react = def.tapped;
  const inPlace = (seconds: number, clip: string, arc: number, repeat: number): Leg => ({
    from: copy(c.pos),
    to: copy(c.pos),
    z0: c.z,
    z1: c.z,
    t0: world.time,
    t1: world.time + seconds,
    arc,
    clip,
    crouch: def.gait.kind === 'hop' ? { clip: def.gait.crouch, lead: def.gait.lead, tail: def.gait.tail } : null,
    repeat,
    ease: false,
    react: true,
  });
  switch (react.kind) {
    case 'hop':
      begin(world, c, inPlace(react.seconds, react.clip, react.height, react.times - 1));
      break;
    case 'flit': {
      const to = pickSpot(world, c, def, zone, { range: [80, 170] });
      if (!to) {
        begin(world, c, inPlace(0.7, react.clip, react.height[0], 0));
        break;
      }
      const leg = inPlace(
        Math.max(0.5, dist(c.pos, to) / react.speed),
        react.clip,
        rng.range(react.height[0], react.height[1]),
        0,
      );
      begin(world, c, { ...leg, to: copy(to), crouch: null });
      break;
    }
    case 'pose':
      c.state = { kind: 'rest', clip: react.clip, until: world.time + react.seconds, busy: true };
      setClip(world, c, react.clip);
      break;
    case 'twirl':
      c.state = { kind: 'twirl', center: copy(c.pos), z: c.z, t0: world.time, t1: world.time + react.seconds };
      break;
  }
}
