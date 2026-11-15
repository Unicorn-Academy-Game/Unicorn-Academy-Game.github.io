import type { ActivityId, EffectId } from '../content/activities';
import type { NpcClip, NpcId } from '../content/npcs';
import type { ProduceId } from '../content/produce';
import type { MinigameId } from '../content/props';
import type { UnicornFacing } from '../shared/compass';
import type { ClipName, Facing, MagicKind, MapId, UnicornId, Vec2 } from '../shared/ids';
import type { LifeKind } from '../shared/life';
import type { ActivityAnchor, Interactable, LifeZone, LogicMap } from '../shared/map';
import type { SavedPropState } from '../shared/save';
import type { AnchorBook } from './anchors';
import type { Nav } from './nav/nav';
import type { PathQueue } from './paths';
import type { Rng } from './rng';
import type { Trail } from './trail';

export type Command =
  | { type: 'move'; commandId: string; destination: Vec2 }
  | { type: 'interact'; commandId: string; instanceId: string }
  | { type: 'greet'; commandId: string; unicornId: UnicornId }
  | { type: 'cast'; commandId: string; unicornId: UnicornId }
  /**
   * Walk the way a held finger or key points, for as long as it is held. A heading of zero length
   * is the same as letting go.
   */
  | { type: 'steer'; commandId: string; heading: Vec2 }
  /** The finger or key was let go. Wildstar slows to a stop. */
  | { type: 'halt'; commandId: string }
  /**
   * A tap on one of the creatures that live in the world. The creature reacts and Wildstar carries
   * on.
   */
  | { type: 'poke'; commandId: string; critterId: string }
  /**
   * A word was typed for a door that wants one. Right, it opens and stays open for the game. Wrong,
   * it says so.
   */
  | { type: 'enter-code'; commandId: string; instanceId: string; code: string }
  /**
   * The game says a friend who is waiting to be asked may join the herd. Joining is the same as
   * when Wildstar walks up, and under the `ask` rule it is the only way in.
   */
  | { type: 'befriend'; commandId: string; unicornId: UnicornId };

/**
 * House rules the game can change while it runs. One object is shared by every world, as `unlocked`
 * is, so a change is seen at once by the world on the screen.
 */
export interface Rules {
  /**
   * How a friend who has not been found joins. `walk-up` is the original rule: the friend joins the
   * moment Wildstar comes near. `ask` is for a game that wants something first: the friend stops,
   * turns toward Wildstar and waits to be told.
   */
  friends: 'walk-up' | 'ask';
}

/**
 * The palace crown. Wildstar wears it from the moment she takes it until she puts it back. It is
 * the same object in every world, so it stays on through the doors, and it is never saved.
 */
export interface Crown {
  worn: boolean;
}

export type SaveReason = 'recruit' | 'prop' | 'map' | 'position';

export type PropActivity =
  | 'door-opening'
  | 'chest-opening'
  | 'chest-closing'
  | 'treasure-bounce'
  | 'treasure-float'
  | 'palace-welcome'
  | 'cup-fill'
  | 'brushing'
  | 'harvest'
  | 'delight';

export type DomainEvent =
  | { type: 'friend-recruited'; unicornId: UnicornId }
  /**
   * Under the `ask` rule: Wildstar came near a friend who has not been found. The friend waits for
   * `befriend`. Said again when the friend is tapped while waiting.
   */
  | { type: 'friend-met'; unicornId: UnicornId; at: Vec2 }
  /**
   * Under the `ask` rule: Wildstar went away from a waiting friend, who goes back to its clearing.
   */
  | { type: 'friend-away'; unicornId: UnicornId }
  | { type: 'cast-released'; castId: string; unicornId: UnicornId; at: Vec2 }
  | { type: 'prop-changed'; instanceId: string }
  | { type: 'map-entered'; mapId: MapId }
  | { type: 'activity-started'; actorId: ActorId; activityId: ActivityId | NpcClip }
  // Everything below is detail for the engine, which draws and sounds it.
  | { type: 'command-accepted'; commandId: string; command: Command['type']; at: Vec2 }
  | { type: 'command-refused'; commandId: string; at: Vec2 }
  | { type: 'cast-started'; castId: string; unicornId: UnicornId }
  | { type: 'greeting-started'; unicornId: UnicornId; at: Vec2 }
  /**
   * `facing` is set when the effect belongs to a creature, so it can appear in front of it. `lift`
   * is how high above `at` a flying creature is.
   */
  | { type: 'effect'; effect: EffectId; at: Vec2; seconds: number; facing?: Facing; lift?: number; share?: number }
  | { type: 'critter-poked'; critterId: string; kind: LifeKind; look: string; at: Vec2; z: number }
  /**
   * Fruit or vegetables fell from a tree or a bed. They lie in `world.pickups` until a unicorn
   * walks over them.
   */
  | { type: 'produce-dropped'; produce: ProduceId; from: Vec2; to: Vec2 }
  /**
   * A unicorn gathered one. `by` is whoever stood closest, or Wildstar when the oldest was gathered
   * by magic to make room.
   */
  | { type: 'produce-collected'; pickupId: string; produce: ProduceId; at: Vec2; by: UnicornId }
  | { type: 'prop-reacted'; instanceId: string; reaction: string; seconds: number }
  /** A tap on something that starts a little game. The screen takes it from here. */
  | { type: 'minigame-started'; game: MinigameId; instanceId: string }
  | { type: 'prop-activity'; instanceId: string; activity: PropActivity; seconds: number }
  | { type: 'portal-entered'; portalId: string; to: { mapId: MapId; spawnId: string }; ride?: 'up' | 'down' }
  /** Wildstar is at a door that wants a word. The screen takes it from here and asks for one. */
  | { type: 'code-wanted'; instanceId: string }
  | { type: 'code-refused'; instanceId: string }
  /** A door that was shut can now be opened. */
  | { type: 'unlocked'; instanceId: string }
  | { type: 'companion-relocated'; unicornId: UnicornId; from: Vec2; to: Vec2 }
  /**
   * Wildstar was put right: she was where no route could begin or no feet fit (`misplaced`, and
   * `at` is where she was put down), or she was meant to be moving and was not (`stalled`).
   * Whatever was held to steer her is forgotten, so a finger or key that is still down has to say
   * so again.
   */
  | { type: 'leader-reset'; why: 'misplaced' | 'stalled'; at: Vec2 }
  | { type: 'npc-waved'; npcId: NpcId }
  | { type: 'save-needed'; reason: SaveReason };

type ActorId = UnicornId | NpcId;

/**
 * The last time a unicorn's picture was turned, which way, and when, so that it is not turned
 * straight back.
 */
export interface Turned {
  /** 1 when the picture went clockwise on the map and -1 when it went the other way. */
  way: 1 | -1;
  at: number;
}

/** What a unicorn is drawn doing. The renderer derives the frame from `startedAt` and `speed`. */
export interface UnicornAnim {
  clip: ClipName;
  facing: UnicornFacing;
  /** Simulation time at which this clip instance began. */
  startedAt: number;
  /**
   * How the picture was last turned. It goes on from one clip to the next, so that stopping does
   * not forget it. Missing until the first turn.
   */
  turned?: Turned | undefined;
}

interface NpcAnim {
  clip: NpcClip;
  facing: Facing;
  startedAt: number;
}

/** What a unicorn does at its anchor or in place, and for how long. */
export interface Performing {
  kind: 'performing';
  activity: ActivityId;
  anchorId: string | null;
  slot: number;
  partner: UnicornId | null;
  endsAt: number;
  /** For look-around, the time of the next head turn. */
  turnAt: number;
  /** A player-directed use may take an anchor from an idle one. */
  priority: 'idle' | 'player';
}

export interface Following {
  kind: 'following';
  /** Arc length along the trail. */
  s: number;
  /**
   * Speed along the trail, eased. The speed that is drawn is measured from actual movement instead.
   */
  v: number;
  /** Smoothed sideways offset from the trail. */
  lat: number;
  /** Offset left over from joining the trail from the side. It decays to zero. */
  join: Vec2;
  /** Soft separation currently applied. */
  push: Vec2;
}

/**
 * A unicorn's state. Every change goes through `setState`, which releases what the old state held.
 * Search results are matched against the state object they were requested for, so a result for a
 * state that has ended is dropped.
 */
export type UnicornState =
  /** Wildstar, free to move. What she is walking toward is held in the leader intent. */
  | { kind: 'leading' }
  | Following
  | { kind: 'recovering'; repathAt: number; stalls: number }
  /**
   * Between activities away from the herd: standing where it is, choosing what to do next, or
   * heading back.
   */
  | { kind: 'seeking'; until: number }
  /**
   * Walking to `to`, the place it will stand: an anchor's standing place, or beside a friend to
   * nuzzle.
   */
  | {
      kind: 'approaching';
      activity: ActivityId;
      anchorId: string | null;
      slot: number;
      partner: UnicornId | null;
      deadline: number;
      to: Vec2;
    }
  | Performing
  | { kind: 'waiting'; partner: UnicornId; deadline: number }
  | { kind: 'casting'; cast: Cast }
  | { kind: 'unrecruited-idle'; nextAt: number }
  | { kind: 'greeting'; castAt: number };

/** A cast or a magical interaction in progress. Its effect happens once, on the release frame. */
export interface Cast {
  castId: string;
  startedAt: number;
  releaseAt: number;
  endsAt: number;
  released: boolean;
  /** A second request made while this one runs. At most one is kept. */
  pending: boolean;
  /** What happens on release. */
  onRelease: ReleaseAction;
  /** State to return to afterward. */
  resume: UnicornState;
}

export type ReleaseAction = { kind: 'spell'; magic: MagicKind } | { kind: 'interact'; instanceId: string };

export interface UnicornActor {
  id: UnicornId;
  pos: Vec2;
  prev: Vec2;
  /**
   * How far this unicorn moved during the step before the current one, per second. Everyone's is
   * from the same step, so two can be compared.
   */
  vel: Vec2;
  facing: UnicornFacing;
  /** Current speed in units per second. Zero when standing. */
  speed: number;
  anim: UnicornAnim;
  /** Remaining waypoints for movement that is not following the trail. */
  path: Vec2[] | null;
  state: UnicornState;
  /** Most recent activities, newest last, for the repeat limit. */
  history: ActivityId[];
  /** Position some time ago, for stall detection. */
  stall: { at: number; pos: Vec2 };
  /**
   * When this unicorn next decides what to do, while the group is stopped. Null when not waiting to
   * decide.
   */
  decideAt: number | null;
}

export interface NpcActor {
  id: NpcId;
  instanceId: string;
  pos: Vec2;
  prev: Vec2;
  facing: Facing;
  speed: number;
  anim: NpcAnim;
  path: Vec2[] | null;
  state: NpcState;
  /** Index into the routine of the step to start next. */
  step: number;
  /** Visit counters per anchor tag, so beds and spots are cycled in order. */
  visits: Record<string, number>;
  /**
   * When the worker last waved hello, so a visitor is greeted now and then rather than constantly.
   */
  lastHello: number;
  /** The groom this worker has already answered, so one groom is answered once. */
  answered: Performing | null;
}

/** A trip to an anchor and what is done there. */
export type NpcErrand =
  | { kind: 'work'; anchorId: string; clip: NpcClip; seconds: readonly [number, number] }
  /** Pick up a load, then carry it to the nearest unused anchor with `dropTag`. */
  | { kind: 'pickup'; anchorId: string; seconds: readonly [number, number]; dropTag: string }
  | { kind: 'putdown'; anchorId: string; seconds: readonly [number, number] }
  /** Hurry to a brush spot and brush the unicorn that is being groomed. */
  | { kind: 'brush'; anchorId: string };

export type NpcState =
  | { kind: 'idle'; until: number }
  /** Walking to an errand's anchor. The worker carries a load while walking to put it down. */
  | { kind: 'walking'; errand: NpcErrand; until: number }
  /** Working in place, then starting the next errand if there is one. */
  | { kind: 'working'; clip: NpcClip; endsAt: number; next: NpcErrand | null }
  | { kind: 'waving'; endsAt: number; resume: NpcState };

/** A trip from one place to another, at the pace and with the hops or the flying of its kind. */
export interface Leg {
  from: Vec2;
  to: Vec2;
  /** Height above the ground at each end, which only differs for things that stay in the air. */
  z0: number;
  z1: number;
  t0: number;
  t1: number;
  /** How high it rises between the ends, in a hop or a flight. Zero for walking and swimming. */
  arc: number;
  /** The clip while it moves. */
  clip: string;
  /**
   * A crouch before and after the move, when the kind has one: the clip, and the shares of the
   * time.
   */
  crouch: { clip: string; lead: number; tail: number } | null;
  /** Hops still to do on the spot after this one. */
  repeat: number;
  /** Eased at both ends, for the ones that drift. */
  ease: boolean;
  /** Set when this is the creature answering a tap, so a second tap does not start it over. */
  react: boolean;
}

type CritterState =
  /**
   * Staying put, in a clip, until `until`. `busy` is set for a pose that answers a tap, which
   * nothing cuts short.
   */
  | { kind: 'rest'; clip: string; until: number; busy?: boolean }
  | ({ kind: 'go' } & Leg)
  /** A loop in the air around `center`, from `t0` to `t1`. */
  | { kind: 'twirl'; center: Vec2; z: number; t0: number; t1: number };

export interface Critter {
  id: string;
  zoneId: string;
  kind: LifeKind;
  look: string;
  pos: Vec2;
  prev: Vec2;
  /** Height above its ground point. Everything that is not flying has none. */
  z: number;
  prevZ: number;
  /** `facing` is only ever east or west: the pictures face east and the view mirrors them. */
  anim: { clip: string; facing: Facing; startedAt: number };
  state: CritterState;
}

interface Life {
  /** Its own stream, so a creature's whim never changes what the unicorns do. */
  rng: Rng;
  critters: Critter[];
  readonly zones: ReadonlyMap<string, LifeZone>;
}

/**
 * One fruit or vegetable. It falls from where it grew, lands, and waits for a unicorn to walk over
 * it.
 */
export interface Pickup {
  id: string;
  produce: ProduceId;
  /** The ground under the tree or the bed it fell from, and how high up it began. */
  from: Vec2;
  lift: number;
  /** Where it lands: a place a unicorn can stand, so it can always be reached. */
  to: Vec2;
  /** When it left. It lands `CONFIG.pickups.fall` seconds later and cannot be gathered before. */
  born: number;
}

export interface Pickups {
  /** Its own stream, so where a fruit lands never changes what a unicorn does. */
  rng: Rng;
  list: Pickup[];
  /** How many have been made, for their ids. */
  made: number;
}

/** Where Wildstar is headed and what she does on arrival. */
export type Arrival =
  | { kind: 'none' }
  | { kind: 'interact'; instanceId: string; facing: Facing; anchorId: string | null; slot: number }
  /**
   * Wildstar is going to meet a friend who has not been found. The friend wanders, so on arrival
   * she may have to go again: `tries` counts the times she did.
   */
  | { kind: 'greet'; unicornId: UnicornId; tries: number };

/** Wildstar walking the way a finger or key points, as opposed to along a route to a place. */
export interface Steering {
  /**
   * The way that is held, as a unit vector, or null once it was let go and she is slowing to a
   * stop.
   */
  want: Vec2 | null;
  /**
   * The way she is travelling, as a unit vector. It turns toward `want` over a moment and does not
   * jump.
   */
  course: Vec2;
  /**
   * The speed she means to go at, easing toward what the turn allows. What she really covers can be
   * less, against a tree.
   */
  pace: number;
}

/** What is kept to notice that Wildstar is meant to be moving and is not. */
interface Watch {
  /**
   * The last place she stood that a route could be set off from, and when that was last looked for.
   */
  good: Vec2;
  checkedAt: number;
  /**
   * Where she was when she was last seen to be moving, or when she was last not meant to be, and
   * the time.
   */
  at: Vec2;
  since: number;
  /**
   * How many times in a row she has been put right and still not moved, and when that last
   * happened. Moving ends the count.
   */
  strikes: number;
  struckAt: number;
}

interface LeaderIntent {
  commandId: string | null;
  phase: 'idle' | 'pathing' | 'walking' | 'steering';
  goal: Vec2 | null;
  onArrival: Arrival;
  /** Incremented on every new command. Path results carry the value they were requested under. */
  gen: number;
  /** A door that is swinging open, and when the herd goes through it. */
  portalAt: { portalId: string; at: number } | null;
  /**
   * The shut door she was last stopped at by walking into it, so standing there does not ask over
   * and over. It is forgotten when she leaves the doorway.
   */
  knocked: string | null;
  /** Set while she is steered. A tap on a place or a thing ends it. */
  steer: Steering | null;
  /**
   * The seat she sits in, by the instance id of the prop. Any new order, a walk or a held finger,
   * ends it.
   */
  seat: string | null;
  watch: Watch;
}

/** Short-lived prop state that is never saved, such as a door swinging open. */
interface TransientProp {
  kind: PropActivity | string;
  /** When it began, so a picture can be drawn from how far in it is. */
  since: number;
  until: number;
}

/**
 * The state that outlives a map. It is exactly what a save holds, plus the identity of the world.
 */
export interface Persistent {
  worldGeneration: string;
  contentVersion: string;
  recruited: UnicornId[];
  visitedMaps: MapId[];
  /** Saved prop state for every map, keyed by map-qualified instance id. */
  props: Record<string, SavedPropState>;
}

export interface World {
  readonly map: LogicMap;
  readonly nav: Nav;
  readonly interactables: ReadonlyMap<string, Interactable>;
  readonly anchorDefs: ReadonlyMap<string, ActivityAnchor>;
  readonly anchors: AnchorBook;
  readonly paths: PathQueue;
  readonly rng: Rng;
  readonly persistent: Persistent;
  time: number;
  tick: number;
  trail: Trail;
  /**
   * Where each follower belongs on the trail, worked out again only when the trail or the herd
   * changes.
   */
  slots: { revision: number; order: string; table: ReadonlyMap<UnicornId, number> } | null;
  /**
   * Who stands where in the herd, nearest Wildstar first. It starts as the order they were
   * recruited and changes when one comes back from what it was doing ahead of another (see
   * `settleOrder`). Once all five friends are found it is the herd's own order, `HERD_LINE` (see
   * `lineUp`). It is never saved: a loaded herd forms up again in that order, or in recruitment
   * order while a friend is still to be found.
   */
  order: UnicornId[];
  leader: LeaderIntent;
  unicorns: Partial<Record<UnicornId, UnicornActor>>;
  npcs: NpcActor[];
  life: Life;
  /** Fruit and vegetables on the ground. Never saved: a world loaded again has none lying about. */
  pickups: Pickups;
  /**
   * When each prop that magic has changed goes back to how it started, in world seconds. Never
   * saved: a world loaded again starts the clock over.
   */
  resets: Map<string, number>;
  transient: Map<string, TransientProp>;
  /**
   * The doors that have been opened by a word or a clue, by instance. It belongs to the game and
   * not to the map, so it is the same set in every world and is never saved.
   */
  readonly unlocked: Set<string>;
  /** How the game wants things to go, shared by every world. */
  readonly rules: Rules;
  /** Whether she has the crown on, shared by every world. */
  readonly crown: Crown;
  /**
   * Friends who have not been found and are waiting beside Wildstar to be told they may join. Only
   * the `ask` rule fills it. It belongs to this world and is never saved.
   */
  readonly met: Set<UnicornId>;
  /** Expiry times of live transient visual effects, bounded by the effect cap. */
  effects: number[];
  events: DomainEvent[];
  castSeq: number;
  idle: { lastLeaderMove: number; stopped: boolean };
  lastAutosave: number;
  /**
   * Set when the herd has gone through a portal. The world then accepts no more commands or steps.
   */
  paused: boolean;
}
