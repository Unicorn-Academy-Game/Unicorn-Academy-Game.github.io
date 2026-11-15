import { REACTIONS, type Reaction, SPELLS } from '../../content/magic';
import { PROP_DEFS } from '../../content/props';
import { UNICORN_DEFS } from '../../content/unicorns';
import { clipSeconds, releaseSeconds } from '../../shared/clips';
import { straightFacingFor } from '../../shared/compass';
import type { MagicKind } from '../../shared/ids';
import { CONFIG } from '../config';
import { dist } from '../geometry';
import { animate, effect, emit, rejoinHerd, setState, startTransient, unicornList } from '../ops';
import type { Cast, Command, ReleaseAction, UnicornActor, UnicornState, World } from '../types';
import { foundClue } from './locks';
import { dropProduce } from './pickups';
import { engage } from './rainbow';

/** The palace door's welcome lasts this long, and the herd goes in a little before it ends. */
const WELCOME_SECONDS = 2.4;
const WELCOME_GO_IN = 1.6;

/**
 * Starts a cast animation on `actor`. The gameplay effect happens once, on the release frame, so
 * interrupting a cast before it releases does nothing and interrupting it afterward cannot repeat
 * it.
 */
export function beginCast(
  world: World,
  actor: UnicornActor,
  onRelease: ReleaseAction,
  faceToward?: { x: number; y: number },
): void {
  const now = world.time;
  const wasFollowing = actor.state.kind === 'following' ? actor.state : null;
  const resume: UnicornState =
    actor.id === 'wildstar' ? { kind: 'leading' } : (wasFollowing ?? { kind: 'recovering', repathAt: now, stalls: 0 });
  const cast: Cast = {
    castId: `c${++world.castSeq}`,
    startedAt: now,
    releaseAt: now + releaseSeconds('cast'),
    endsAt: now + clipSeconds('cast'),
    released: false,
    pending: false,
    onRelease,
    resume,
  };
  setState(world, actor, { kind: 'casting', cast });
  actor.speed = 0;
  // Wildstar keeps her route and picks it up again after the cast, since a cast does not replace
  // her destination.
  if (actor.id !== 'wildstar') actor.path = null;
  if (faceToward && dist(actor.pos, faceToward) > 4)
    actor.facing = straightFacingFor({ x: faceToward.x - actor.pos.x, y: faceToward.y - actor.pos.y }, actor.facing, 0);
  animate(actor, world, 'cast', actor.facing);
  emit(world, { type: 'cast-started', castId: cast.castId, unicornId: actor.id });
}

/**
 * A tap on a recruited unicorn. Always acknowledged; at most one recast is kept while one is
 * running.
 */
export function commandCast(world: World, c: Extract<Command, { type: 'cast' }>): void {
  const actor = world.unicorns[c.unicornId];
  if (!actor || !world.persistent.recruited.includes(c.unicornId)) return;
  emit(world, { type: 'command-accepted', commandId: c.commandId, command: 'cast', at: actor.pos });
  if (actor.state.kind === 'casting') {
    actor.state.cast.pending = true;
    return;
  }
  const magic = UNICORN_DEFS[c.unicornId].magic;
  const target = findReactions(world, actor, magic)[0];
  beginCast(world, actor, { kind: 'spell', magic }, target?.instance.pos);
}

interface Found {
  instance: { instanceId: string; definitionId: string; pos: { x: number; y: number } };
  reaction: Reaction;
  distance: number;
}

/**
 * What a spell touches: the compatible props within reach that the caster can see, nearest first.
 * Being near a thing is enough, and a spell may touch several. A reaction touches at most `each`
 * props and a spell at most `most`, so a unicorn near a row of lanterns lights them together and a
 * crowded garden does not all light at once. Ties are broken by name so the same world always
 * answers the same way.
 */
export function findReactions(world: World, actor: UnicornActor, magic: MagicKind): Found[] {
  const seen: Found[] = [];
  for (const inst of world.interactables.values()) {
    for (const r of REACTIONS) {
      if (r.magic !== magic || !r.targets.includes(inst.definitionId)) continue;
      const d = dist(actor.pos, inst.pos);
      if (d > (r.reach ?? CONFIG.magic.reach) || !world.nav.lineOfSight(actor.pos, inst.pos)) continue;
      seen.push({ instance: inst, reaction: r, distance: d });
    }
  }
  seen.sort(
    (a, b) =>
      a.distance - b.distance ||
      (a.reaction.id < b.reaction.id ? -1 : a.reaction.id > b.reaction.id ? 1 : 0) ||
      (a.instance.instanceId < b.instance.instanceId ? -1 : 1),
  );
  const taken = new Map<string, number>();
  const touched: Found[] = [];
  for (const f of seen) {
    const count = taken.get(f.reaction.id) ?? 0;
    if (count >= (f.reaction.each ?? CONFIG.magic.each)) continue;
    taken.set(f.reaction.id, count + 1);
    touched.push(f);
    if (touched.length === CONFIG.magic.most) break;
  }
  return touched;
}

function applySpell(world: World, actor: UnicornActor, magic: MagicKind): void {
  effect(world, SPELLS[magic].burst, actor.pos, 1.8);
  findReactions(world, actor, magic).forEach((f, nearest) => {
    applyReaction(world, f, nearest < CONFIG.magic.shown ? 1 : CONFIG.magic.lesser);
  });
}

function applyReaction(world: World, f: Found, share: number): void {
  const { instance, reaction } = f;
  const id = instance.instanceId;
  if (reaction.persist) {
    const before = JSON.stringify(world.persistent.props[id]);
    world.persistent.props[id] = reaction.persist;
    if (before !== JSON.stringify(reaction.persist)) {
      emit(world, { type: 'prop-changed', instanceId: id });
      emit(world, { type: 'save-needed', reason: 'prop' });
    }
    // Casting again while it is still lit starts the count again, so a child who keeps playing
    // keeps the glow.
    world.resets.set(id, world.time + CONFIG.magic.hold);
  }
  const seconds = reaction.seconds ?? 2;
  if (reaction.seconds) startTransient(world, id, reaction.id, reaction.seconds);
  emit(world, { type: 'prop-reacted', instanceId: id, reaction: reaction.id, seconds });
  effect(world, reaction.effect, instance.pos, seconds, undefined, undefined, share);
  if (reaction.host) engage(world, reaction.id, reaction.host);
}

/** Whether a prop with remembered state is anything other than how it starts. */
const changed = (world: World, instanceId: string): boolean => {
  const initial = PROP_DEFS[world.interactables.get(instanceId)?.definitionId ?? '']?.initial;
  const now = world.persistent.props[instanceId];
  return !!initial && !!now && JSON.stringify(now) !== JSON.stringify(initial);
};

/**
 * A saved game can hold a lantern that was lit. It goes out the same ten seconds after the world
 * starts, so nothing stays on for good.
 */
export function scheduleResets(world: World): void {
  for (const id of world.interactables.keys())
    if (changed(world, id)) world.resets.set(id, world.time + CONFIG.magic.hold);
}

/**
 * Lanterns, braziers and flower beds that magic changed go back to how they were, so they can be
 * lit and bloomed again.
 */
export function stepResets(world: World): void {
  for (const [id, at] of world.resets) {
    if (at > world.time) continue;
    world.resets.delete(id);
    const initial = PROP_DEFS[world.interactables.get(id)?.definitionId ?? '']?.initial;
    if (!initial || !changed(world, id)) continue;
    world.persistent.props[id] = { ...initial };
    emit(world, { type: 'prop-changed', instanceId: id });
    emit(world, { type: 'save-needed', reason: 'prop' });
  }
}

/**
 * The palace door's welcome: a glow and a rainbow over the door, and then, if it leads inside, the
 * herd goes in with the music.
 */
export function welcomeAt(world: World, instanceId: string): void {
  const inst = world.interactables.get(instanceId);
  if (!inst) return;
  startTransient(world, instanceId, 'palace-welcome', WELCOME_SECONDS);
  emit(world, { type: 'prop-activity', instanceId, activity: 'palace-welcome', seconds: WELCOME_SECONDS });
  effect(world, 'door-glow', inst.pos, WELCOME_SECONDS);
  effect(world, 'rainbow-arc', inst.pos, WELCOME_SECONDS);
  const portal = world.map.portals.find((p) => p.door === instanceId);
  if (portal && !world.leader.portalAt)
    world.leader.portalAt = { portalId: portal.portalId, at: world.time + WELCOME_GO_IN };
}

/** How high above her feet the dust falls from, which is where the crown sits when she wears it. */
const CROWN_DUST_HEIGHT = 120;

/**
 * She takes the crown off its stand and puts it on, or takes it off and puts it back. A little dust
 * falls from her head either way.
 */
function crownChanges(world: World): void {
  world.crown.worn = !world.crown.worn;
  const head = world.unicorns.wildstar?.pos;
  if (head) effect(world, 'fairy-dust', { x: head.x, y: head.y - CROWN_DUST_HEIGHT }, 1.4);
}

/**
 * What happens when a magical interaction (chest, treasure, palace door) reaches its release frame.
 */
function applyInteraction(world: World, instanceId: string): void {
  const inst = world.interactables.get(instanceId);
  if (!inst) return;
  const def = PROP_DEFS[inst.definitionId];
  if (!def) return;
  switch (def.tap) {
    case 'chest': {
      const cur = world.persistent.props[instanceId];
      const open = cur?.kind === 'chest' ? !cur.open : true;
      world.persistent.props[instanceId] = { kind: 'chest', open };
      emit(world, { type: 'prop-changed', instanceId });
      startTransient(world, instanceId, open ? 'chest-opening' : 'chest-closing', 0.8);
      emit(world, {
        type: 'prop-activity',
        instanceId,
        activity: open ? 'chest-opening' : 'chest-closing',
        seconds: 0.8,
      });
      emit(world, { type: 'save-needed', reason: 'prop' });
      effect(world, 'treasure-sparkle', inst.pos, 1.6);
      break;
    }
    case 'treasure': {
      const floating = def.treasure === 'gem';
      const seconds = floating ? 2.6 : 1;
      startTransient(world, instanceId, floating ? 'treasure-float' : 'treasure-bounce', seconds);
      emit(world, {
        type: 'prop-activity',
        instanceId,
        activity: floating ? 'treasure-float' : 'treasure-bounce',
        seconds,
      });
      effect(world, 'treasure-sparkle', inst.pos, seconds);
      break;
    }
    case 'harvest': {
      dropProduce(world, inst, def);
      emit(world, { type: 'prop-activity', instanceId, activity: 'harvest', seconds: 0.8 });
      effect(world, 'sparkle', inst.pos, 1.2);
      break;
    }
    case 'delight': {
      const d = def.delight;
      if (!d) break;
      startTransient(world, instanceId, 'delight', d.seconds);
      emit(world, { type: 'prop-activity', instanceId, activity: 'delight', seconds: d.seconds });
      effect(world, d.effect, { x: inst.pos.x, y: inst.pos.y - d.lift }, d.seconds);
      if (def.crown) crownChanges(world);
      break;
    }
    case 'minigame': {
      if (!def.minigame) break;
      emit(world, { type: 'minigame-started', game: def.minigame, instanceId });
      // A toy that has a way of reacting does it as its game opens, so the game seems to start from
      // the toy.
      const d = def.delight;
      if (d) {
        startTransient(world, instanceId, 'delight', d.seconds);
        emit(world, { type: 'prop-activity', instanceId, activity: 'delight', seconds: d.seconds });
        effect(world, d.effect, { x: inst.pos.x, y: inst.pos.y - d.lift }, d.seconds);
      } else effect(world, 'treasure-sparkle', inst.pos, 1.6);
      break;
    }
    case 'palace-door':
      welcomeAt(world, instanceId);
      break;
    case 'clue': {
      const d = def.delight;
      if (d) {
        startTransient(world, instanceId, 'delight', d.seconds);
        emit(world, { type: 'prop-activity', instanceId, activity: 'delight', seconds: d.seconds });
        effect(world, d.effect, { x: inst.pos.x, y: inst.pos.y - d.lift }, d.seconds);
      }
      foundClue(world, instanceId);
      break;
    }
    default:
      break;
  }
}

/** Advances every cast: releases on the release frame, and finishes or repeats once at the end. */
export function stepCasts(world: World): void {
  for (const actor of unicornList(world)) {
    if (actor.state.kind !== 'casting') continue;
    const cast = actor.state.cast;
    if (!cast.released && world.time >= cast.releaseAt) {
      cast.released = true;
      emit(world, { type: 'cast-released', castId: cast.castId, unicornId: actor.id, at: actor.pos });
      if (cast.onRelease.kind === 'spell') applySpell(world, actor, cast.onRelease.magic);
      else applyInteraction(world, cast.onRelease.instanceId);
    }
    if (world.time >= cast.endsAt) {
      if (cast.pending && cast.onRelease.kind === 'spell') {
        const magic = cast.onRelease.magic;
        const resume = cast.resume;
        // The recast replaces the finished one; the original resume target is kept.
        const target = findReactions(world, actor, magic)[0];
        const next: Cast = {
          ...cast,
          castId: `c${++world.castSeq}`,
          startedAt: world.time,
          releaseAt: world.time + releaseSeconds('cast'),
          endsAt: world.time + clipSeconds('cast'),
          released: false,
          pending: false,
          resume,
        };
        setState(world, actor, { kind: 'casting', cast: next });
        if (target && dist(actor.pos, target.instance.pos) > 4)
          actor.facing = straightFacingFor(
            { x: target.instance.pos.x - actor.pos.x, y: target.instance.pos.y - actor.pos.y },
            actor.facing,
            0,
          );
        actor.anim = { clip: 'cast', facing: actor.facing, startedAt: world.time };
        emit(world, { type: 'cast-started', castId: next.castId, unicornId: actor.id });
      } else {
        finishCast(world, actor, cast.resume);
      }
    }
  }
}

function finishCast(world: World, actor: UnicornActor, resume: UnicornState): void {
  if (resume.kind === 'leading') setState(world, actor, resume);
  else if (resume.kind === 'following') {
    // Resume exactly where it stood on the trail.
    setState(world, actor, resume);
  } else rejoinHerd(world, actor);
}
