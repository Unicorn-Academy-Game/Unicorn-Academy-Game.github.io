import { LIFE } from '../content/life';
import { allFacings } from '../shared/clips';
import { facingLabel } from '../shared/compass';
import { CONFIG } from './config';
import { dist, isFiniteVec } from './geometry';
import { unicornList } from './ops';
import { inZone, roomFor } from './systems/life';
import type { Critter, UnicornActor, World } from './types';

/**
 * The most an actor may travel in one step and still be drawn sliding. Walking tops out near 16
 * units a step, so more than this is a stale previous position or a jump that should have been a
 * relocation, and it shows as a ghost flickering between two spots.
 */
const MAX_SLIDE = 24;

/**
 * The most a creature may travel in one step. The quickest, a bird getting out of the way, covers
 * about nine.
 */
const MAX_CRITTER_SLIDE = 14;

/**
 * Structural truths that must hold after every step. Tests run this after each step of long
 * scenarios, and a debug build can run it live. Each violation is a sentence that names the actor
 * or anchor, so a failure explains itself.
 */
export function checkInvariants(world: World): string[] {
  const out: string[] = [];
  const unicorns = unicornList(world);

  if (!world.unicorns.wildstar) out.push('Wildstar is missing');
  // Where only Wildstar may go, the others are outside and not in this world at all.
  const alone = world.map.solo === true;
  for (const id of world.persistent.recruited)
    if (!world.unicorns[id] && !(alone && id !== 'wildstar')) out.push(`recruited ${id} has no actor`);
  if (new Set(world.persistent.recruited).size !== world.persistent.recruited.length)
    out.push('duplicate recruited ids');
  if (!world.persistent.recruited.includes('wildstar')) out.push('Wildstar is not recruited');
  if (new Set(world.order).size !== world.order.length) out.push('duplicate ids in the herd order');
  for (const id of world.order)
    if (!world.persistent.recruited.includes(id) || id === 'wildstar')
      out.push(`${id} is in the herd order but is not a recruited follower`);
  for (const id of world.persistent.recruited)
    if (id !== 'wildstar' && !alone && !world.order.includes(id))
      out.push(`recruited ${id} is missing from the herd order`);
  // A friend waiting to be told to join has not joined, and stands waiting.
  for (const id of world.met) {
    const state = world.unicorns[id]?.state.kind;
    if (state === undefined || world.persistent.recruited.includes(id))
      out.push(`${id} is waiting to be found but is ${state === undefined ? 'not here' : 'already found'}`);
    else if (state !== 'unrecruited-idle') out.push(`${id} is waiting to be found but is ${state}`);
  }

  for (const u of unicorns) {
    const where = `${u.id} at (${u.pos.x.toFixed(1)}, ${u.pos.y.toFixed(1)})`;
    if (!isFiniteVec(u.pos) || !isFiniteVec(u.prev)) out.push(`${u.id} has a non finite position`);
    else if (!world.nav.isWalkable(u.pos, -CONFIG.nav.standSlack)) out.push(`${where} is not standable`);
    else if (dist(u.prev, u.pos) > MAX_SLIDE)
      out.push(`${where} would be drawn sliding ${dist(u.prev, u.pos).toFixed(0)} units in one step`);
    if (!Number.isFinite(u.speed) || u.speed < 0) out.push(`${u.id} has speed ${u.speed}`);
    // A clip has the facings it was drawn in. Asked for another, the view would pick one itself and
    // the drawing would not say what the unicorn is doing.
    if (!allFacings(u.anim.clip).includes(u.anim.facing))
      out.push(`${u.id} is drawn ${u.anim.clip} facing ${facingLabel(u.anim.facing)}, which that clip does not have`);
    const recruited = world.persistent.recruited.includes(u.id);
    if (!recruited && !['unrecruited-idle', 'performing'].includes(u.state.kind))
      out.push(`unrecruited ${u.id} is ${u.state.kind}`);
    if (recruited && u.state.kind === 'unrecruited-idle') out.push(`recruited ${u.id} is still unrecruited-idle`);
    if (u.id !== 'wildstar' && u.state.kind === 'leading') out.push(`${u.id} is leading`);
    if (u.id === 'wildstar' && ['following', 'recovering'].includes(u.state.kind))
      out.push(`Wildstar is ${u.state.kind}`);
    checkHolds(world, u, out);
  }

  for (const a of world.anchors.snapshot()) {
    if (a.holders.length > a.capacity) out.push(`anchor ${a.anchorId} holds ${a.holders.length} of ${a.capacity}`);
    if (new Set(a.holders).size !== a.holders.length) out.push(`anchor ${a.anchorId} has a holder twice`);
    for (const h of a.holders) {
      const actor = world.unicorns[h];
      const s = actor?.state;
      const uses = s && (s.kind === 'performing' || s.kind === 'approaching') && s.anchorId === a.anchorId;
      const travelling =
        h === 'wildstar' &&
        world.leader.onArrival.kind === 'interact' &&
        world.leader.onArrival.anchorId === a.anchorId;
      if (!uses && !travelling) out.push(`anchor ${a.anchorId} is held by ${h}, who is ${s?.kind ?? 'absent'}`);
    }
  }

  if (world.events.length > 512) out.push(`event queue holds ${world.events.length}`);
  if (world.effects.filter((until) => until > world.time).length > CONFIG.magic.effectCap)
    out.push('too many live effects');
  if (!Number.isFinite(world.trail.head)) out.push('trail head is not finite');
  const leader = world.unicorns.wildstar;
  if (leader && Math.hypot(world.trail.headPoint.x - leader.pos.x, world.trail.headPoint.y - leader.pos.y) > 1)
    out.push('trail head is not at Wildstar');

  for (const n of world.npcs) {
    if (!isFiniteVec(n.pos) || !world.nav.isWalkable(n.pos, -CONFIG.nav.standSlack))
      out.push(`${n.id} is not standable`);
    else if (dist(n.prev, n.pos) > MAX_SLIDE)
      out.push(`${n.id} would be drawn sliding ${dist(n.prev, n.pos).toFixed(0)} units in one step`);
  }
  for (const c of world.life.critters) checkCritter(world, c, out);
  checkPickups(world, out);
  return out;
}

/**
 * Fruit and vegetables lie where a unicorn can stand, so each can always be reached, and there are
 * never more than the cap.
 */
function checkPickups(world: World, out: string[]): void {
  const { list } = world.pickups;
  if (list.length > CONFIG.pickups.cap)
    out.push(`${list.length} pieces of produce lie about and the cap is ${CONFIG.pickups.cap}`);
  if (new Set(list.map((p) => p.id)).size !== list.length) out.push('two pieces of produce share an id');
  for (const p of list) {
    const where = `${p.id} (${p.produce}) at (${p.to.x.toFixed(1)}, ${p.to.y.toFixed(1)})`;
    if (!isFiniteVec(p.to) || !isFiniteVec(p.from) || !Number.isFinite(p.lift))
      out.push(`${where} has a non finite position`);
    else if (!world.nav.isWalkable(p.to, 0)) out.push(`${where} lies where a unicorn cannot stand`);
  }
}

/** A creature is where it lives, with room to be there, and is not drawn flying across the map. */
function checkCritter(world: World, c: Critter, out: string[]): void {
  const zone = world.life.zones.get(c.zoneId);
  if (!zone) {
    out.push(`${c.id} belongs to zone ${c.zoneId}, which does not exist`);
    return;
  }
  const where = `${c.id} (${c.kind}) at (${c.pos.x.toFixed(1)}, ${c.pos.y.toFixed(1)})`;
  if (!isFiniteVec(c.pos) || !isFiniteVec(c.prev) || !Number.isFinite(c.z)) {
    out.push(`${where} has a non finite position`);
    return;
  }
  if (c.z < -0.01) out.push(`${where} is below the ground`);
  // A loop in the air may swing a little past the edge of its zone.
  if (!inZone(zone, c.pos, c.state.kind === 'twirl' ? CONFIG.life.loop + 1 : 0.5))
    out.push(`${where} is outside its zone ${zone.zoneId}`);
  if (LIFE[c.kind].home === 'ground' && c.state.kind === 'rest' && !roomFor(world.nav, c.pos))
    out.push(`${where} rests where there is no room for it`);
  if (dist(c.prev, c.pos) > MAX_CRITTER_SLIDE)
    out.push(`${where} would be drawn sliding ${dist(c.prev, c.pos).toFixed(0)} units in one step`);
}

/**
 * An actor in an anchor state holds that anchor, and a nuzzle names a partner who names it back.
 */
function checkHolds(world: World, u: UnicornActor, out: string[]): void {
  const s = u.state;
  if ((s.kind === 'performing' || s.kind === 'approaching') && s.anchorId) {
    if (!world.anchors.holdersOf(s.anchorId).some((h) => h.holder === u.id))
      out.push(`${u.id} uses ${s.anchorId} without holding it`);
  }
  if (s.kind === 'performing' || s.kind === 'approaching' || s.kind === 'waiting') {
    const partnerId = s.partner;
    if (partnerId) {
      const p = world.unicorns[partnerId]?.state;
      const named =
        p && (p.kind === 'performing' || p.kind === 'approaching' || p.kind === 'waiting') && p.partner === u.id;
      if (!named) out.push(`${u.id} has partner ${partnerId}, who does not have ${u.id}`);
    }
  }
}
