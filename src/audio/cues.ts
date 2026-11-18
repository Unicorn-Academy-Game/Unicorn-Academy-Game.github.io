import type { ActivityId } from '../content/activities';
import { MAGICS, reactionOf } from '../content/magic';
import type { NpcClip } from '../content/npcs';
import { PROP_DEFS } from '../content/props';
import { UNICORN_DEFS } from '../content/unicorns';
import type { DomainEvent, PropActivity, World } from '../domain';
import type { SoundFamilyId } from '../shared/audio';
import { UNICORN_IDS, type UnicornId, type Vec2 } from '../shared/ids';
import type { LifeKind } from '../shared/life';

/**
 * What the simulation's events sound like. This is the whole mapping from what happened to what is
 * heard; the service only schedules and plays. Pure, so the table can be tested without any audio.
 */

export interface Cue {
  sound: SoundFamilyId;
  /**
   * Where in the world it comes from. Without a place the sound is centred and not softened by
   * distance.
   */
  at?: Vec2 | undefined;
  /** Level on top of the sound's own, 0 to 1. */
  gain?: number | undefined;
  /** Seconds after the event, so the sound lands on the moment in the animation that causes it. */
  delay?: number | undefined;
}

/** One sound for the reaction a thing has to each friend's magic. */
const forEachMagic = (prefix: string, sound: SoundFamilyId): Record<string, SoundFamilyId> =>
  Object.fromEntries(MAGICS.map((magic): [string, SoundFamilyId] => [reactionOf(prefix, magic), sound]));

const REACTION_SOUND: Record<string, SoundFamilyId> = {
  'light-lantern': 'fx-lantern',
  'bloom-bed': 'fx-bloom',
  'ice-ornament': 'fx-ice',
  spout: 'fx-spray',
  'water-bed': 'splash',
  'light-brazier': 'fx-brazier',
  'spin-pinwheel': 'fx-pinwheel',
  'glow-ornament': 'fx-glow',
  'light-rainbow': 'fx-rainbow',
  // The crystal cave: crystals chime when they wake and when the chimes ring, and hum when the
  // Heart answers.
  ...forEachMagic('wake', 'gem'),
  ...forEachMagic('heart', 'fx-glow'),
  'freeze-pool': 'fx-ice',
  'ripple-pool': 'fx-spray',
  'stoke-cauldron': 'fx-brazier',
  'charge-pillar': 'fx-glow',
  'ring-chimes': 'gem',
};

/**
 * What a prop doing something sounds like. Brushing is voiced by the worker doing it, which is what
 * the strokes follow.
 */
const ACTIVITY_SOUND: Partial<Record<PropActivity, SoundFamilyId>> = {
  'door-opening': 'door-open',
  'chest-opening': 'chest-open',
  'chest-closing': 'chest-close',
  'treasure-bounce': 'treasure-bounce',
  'treasure-float': 'treasure-float',
  'palace-welcome': 'palace-welcome',
  'cup-fill': 'cup-fill',
};

/**
 * Effects that have a sound of their own. Spell bursts and prop reactions are voiced by their own
 * events.
 */
const EFFECT_SOUND: Partial<Record<string, SoundFamilyId>> = {
  hearts: 'hearts',
  'treasure-sparkle': 'gem',
  relocate: 'relocate',
  bubbles: 'splash',
  wade: 'splash',
  dive: 'splash',
  'stone-glint': 'gem',
  dig: 'hay',
  glitter: 'fx-glow',
  cloud: 'hop',
  'rainbow-arc': 'fx-rainbow',
};

/**
 * Unicorn activities with a sound of their own, and how long after the activity begins it happens.
 */
const UNICORN_ACTIVITY: Partial<
  Record<ActivityId, (id: UnicornId) => { sound: SoundFamilyId; delay: number; gain?: number }>
> = {
  drink: () => ({ sound: 'drink', delay: 0.5 }),
  'hoof-stamp': () => ({ sound: 'stomp', delay: 0.7 }),
  nuzzle: (id) => ({ sound: `nicker-${id}`, delay: 0.3, gain: 0.7 }),
  'mane-toss': (id) => ({ sound: `nicker-${id}`, delay: 0.25, gain: 0.7 }),
};

/** Grown-ups at work: the sounds of the job, spaced like the strokes of it. */
const WORK_SOUNDS: Partial<Record<NpcClip, readonly { sound: SoundFamilyId; delay: number }[]>> = {
  water: [{ sound: 'water-pour', delay: 0.5 }],
  trim: [
    { sound: 'shears', delay: 0.6 },
    { sound: 'shears', delay: 1.9 },
  ],
  sweep: [
    { sound: 'broom', delay: 0.3 },
    { sound: 'broom', delay: 1.2 },
    { sound: 'broom', delay: 2.1 },
  ],
  pickup: [{ sound: 'hay', delay: 0.4 }],
  putdown: [{ sound: 'hay', delay: 0.3 }],
  brush: [
    { sound: 'brush', delay: 0.5 },
    { sound: 'brush', delay: 1.4 },
    { sound: 'brush', delay: 2.3 },
  ],
};

/**
 * What each kind of creature sounds like when it is tapped. Every one is gentle: a chime, a splash,
 * a hop.
 */
const CRITTER_SOUND: Record<LifeKind, { sound: SoundFamilyId; gain: number }> = {
  bird: { sound: 'gem', gain: 0.6 },
  frog: { sound: 'hop', gain: 0.9 },
  duck: { sound: 'splash', gain: 0.8 },
  bunny: { sound: 'hop', gain: 0.7 },
  snail: { sound: 'tap', gain: 0.7 },
  ladybug: { sound: 'gem', gain: 0.5 },
  fish: { sound: 'splash', gain: 0.9 },
  butterfly: { sound: 'gem', gain: 0.45 },
  dragonfly: { sound: 'gem', gain: 0.5 },
  bee: { sound: 'hearts', gain: 0.6 },
  fairy: { sound: 'gem', gain: 0.9 },
};

const isUnicorn = (id: string): id is UnicornId => (UNICORN_IDS as readonly string[]).includes(id);

/**
 * Cues for everything that happened in one drain of the event queue. The same sound at the same
 * moment is played once, so two relocation flashes or a recruit's hearts do not stack.
 */
export function cuesFor(events: readonly DomainEvent[], world: World): Cue[] {
  const cues: Cue[] = [];
  const seen = new Set<string>();
  const add = (cue: Cue): void => {
    const key = `${cue.sound}@${cue.delay ?? 0}`;
    if (seen.has(key)) return;
    seen.add(key);
    cues.push(cue);
  };
  const propAt = (instanceId: string): Vec2 | undefined => world.interactables.get(instanceId)?.pos;
  const recruited = events.some((e) => e.type === 'friend-recruited');

  for (const e of events) {
    switch (e.type) {
      case 'command-accepted':
        add({ sound: 'tap', at: e.at, gain: 0.8 });
        break;
      case 'command-refused':
        add({ sound: 'refusal', at: e.at });
        break;
      case 'friend-recruited':
        add({ sound: 'recruit' });
        break;
      case 'greeting-started':
        add({ sound: `voice-${e.unicornId}`, at: e.at, delay: 0.35 });
        break;
      case 'cast-released':
        add({ sound: `spell-${UNICORN_DEFS[e.unicornId].magic}`, at: e.at });
        break;
      case 'critter-poked': {
        const heard = CRITTER_SOUND[e.kind];
        add({ sound: heard.sound, at: e.at, gain: heard.gain });
        break;
      }
      case 'produce-collected':
        add({ sound: 'gem', at: e.at, gain: 0.7 });
        break;
      case 'prop-reacted': {
        const sound = REACTION_SOUND[e.reaction];
        if (sound) add({ sound, at: propAt(e.instanceId), gain: 0.9 });
        break;
      }
      case 'prop-activity': {
        const def = PROP_DEFS[world.interactables.get(e.instanceId)?.definitionId ?? ''];
        const sound = e.activity === 'delight' ? def?.delight?.sound : ACTIVITY_SOUND[e.activity];
        if (sound) add({ sound, at: propAt(e.instanceId) });
        break;
      }
      case 'effect': {
        const sound = EFFECT_SOUND[e.effect];
        // A new friend has its own fanfare, so the hearts that come with it stay quiet.
        if (sound && !(e.effect === 'hearts' && recruited))
          add({ sound, at: e.at, gain: e.effect === 'hearts' ? 0.8 : 1 });
        break;
      }
      case 'activity-started': {
        if (isUnicorn(e.actorId)) {
          const unicorn = world.unicorns[e.actorId];
          const heard = UNICORN_ACTIVITY[e.activityId as ActivityId]?.(e.actorId);
          if (unicorn && heard) add({ sound: heard.sound, at: unicorn.pos, delay: heard.delay, gain: heard.gain });
        } else {
          const npc = world.npcs.find((n) => n.id === e.actorId);
          for (const s of WORK_SOUNDS[e.activityId as NpcClip] ?? [])
            add({ sound: s.sound, at: npc?.pos, delay: s.delay });
        }
        break;
      }
      case 'npc-waved':
        add({ sound: 'hello', at: world.npcs.find((n) => n.id === e.npcId)?.pos });
        break;
      case 'portal-entered': {
        add({ sound: 'transition' });
        // A door that opened for the herd closes behind it.
        const door = world.map.portals.find((p) => p.portalId === e.portalId)?.door;
        if (door) add({ sound: 'door-close', at: propAt(door), gain: 0.8, delay: 0.5 });
        break;
      }
      default:
        break;
    }
  }
  return cues;
}
