import { z } from 'zod';
import { AMBIENCE_IDS } from './audio';
import { FACINGS, MAP_IDS, UNICORN_IDS, type Vec2 } from './ids';
import { LIFE_KINDS } from './life';
import { NPC_IDS } from './npc';
import { Waters } from './waters';

/**
 * The logic half of a compiled map: everything the simulation needs and nothing about how it is
 * drawn. The compile step (tools/maps) normalizes Tiled data into this shape, and the domain never
 * reads Tiled data directly.
 *
 * All coordinates are world units. One unit is one art pixel and tiles are 64 units.
 */

export const TILE = 64;

const Num = z.number().finite();
const Pt = z.object({ x: Num, y: Num });
const FacingEnum = z.enum(FACINGS);
const MapIdEnum = z.enum(MAP_IDS);
const UnicornIdEnum = z.enum(UNICORN_IDS);

/**
 * Authored ids are lower-case words and digits joined by dashes, so they are safe to use in saves
 * and URLs.
 */
const Slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(48);
/** An instance or anchor id qualified by its map, for example `palace-garden/lantern-1`. */
const Qualified = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(80);

export const Obstacle = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('rect'), x: Num, y: Num, w: Num.positive(), h: Num.positive() }),
  z.object({ kind: z.literal('circle'), x: Num, y: Num, r: Num.positive() }),
  z.object({
    kind: z.literal('poly'),
    pts: z
      .array(z.tuple([Num, Num]))
      .min(3)
      .max(64),
  }),
]);
export type Obstacle = z.infer<typeof Obstacle>;

const Bounds = z.object({ x: Num, y: Num, w: Num.positive(), h: Num.positive() });

/**
 * Where a group arrives: the way it came in. `points[0]` is where Wildstar stands. The companions
 * stand along the line through the rest of the points, a gap apart, in the order they were
 * recruited. The map compile step checks that the line holds every herd there can be (see
 * `tools/maps/herd-room.ts`). The game finds its own line where there is none, as when a saved game
 * is loaded.
 */
export const SpawnGroup = z.object({
  spawnId: Slug,
  facing: FacingEnum,
  points: z.array(Pt).min(2).max(24),
});
export type SpawnGroup = z.infer<typeof SpawnGroup>;

export const Portal = z.object({
  portalId: Slug,
  /** Walking into this area, or interacting with `door`, takes the herd through. */
  bounds: Bounds,
  /** Where Wildstar walks when the player taps the door. */
  approach: Pt,
  /** Optional door instance that opens before the transition. */
  door: Qualified.optional(),
  to: z.object({ mapId: MapIdEnum, spawnId: Slug }),
  /**
   * Going through is a ride in a lift, up or down, and not a walk. The screen shows the ride while
   * the next place loads.
   */
  ride: z.enum(['up', 'down']).optional(),
});
export type Portal = z.infer<typeof Portal>;

/**
 * The middle of a way out: where its marker stands, and the place to walk to in order to go through
 * it. Walking to the middle of a gateway always reaches it, because a walk to a place the herd
 * cannot stand ends at the nearest place it can, which is inside the gateway. `approach` is not
 * that place: for a gate with no door it is the place to stand just outside, so that a world saved
 * on the spot does not go through again when it is loaded.
 */
export const portalMark = (p: Portal): Vec2 => ({ x: p.bounds.x + p.bounds.w / 2, y: p.bounds.y + p.bounds.h / 2 });

export const Approach = z.object({ pos: Pt, facing: FacingEnum });
export type Approach = z.infer<typeof Approach>;

export const Interactable = z.object({
  instanceId: Qualified,
  definitionId: Slug,
  /** Ground anchor of the object, which also drives its depth. */
  pos: Pt,
  /** Generous tap region. */
  hit: Bounds,
  /** Places Wildstar can stand to use the object, in order of preference. */
  approach: z.array(Approach).min(1).max(8),
  /**
   * Activity anchor whose slot Wildstar takes while using the object, for cups and the brush
   * station.
   */
  anchor: Qualified.optional(),
  /**
   * Which of the definition's looks this instance wears, when it has more than one: a bed's shape,
   * a heap of coins or of bars.
   */
  look: Slug.optional(),
});
export type Interactable = z.infer<typeof Interactable>;

export const ActivityAnchor = z.object({
  anchorId: Qualified,
  tags: z.array(Slug).min(1).max(8),
  capacity: z.number().int().min(1).max(4),
  pos: Pt,
  /** One standing place per unit of capacity. */
  approach: z.array(Approach).min(1).max(4),
});
export type ActivityAnchor = z.infer<typeof ActivityAnchor>;

export const Encounter = z.object({
  unicornId: UnicornIdEnum,
  /** Where Wildstar is sent when the player taps the unrecruited friend. */
  greeting: Pt,
  home: Pt,
  facing: FacingEnum,
  triggerRadius: Num.positive(),
  /** How far the unrecruited friend strays from `home` while idling. */
  idleRadius: Num.positive(),
});
export type Encounter = z.infer<typeof Encounter>;

export const NpcPlacement = z.object({
  npcId: z.enum(NPC_IDS),
  start: Pt,
  facing: FacingEnum,
});
export type NpcPlacement = z.infer<typeof NpcPlacement>;

/**
 * A patch of the map where some creatures of one kind live. They stay inside it. On the ground they
 * keep to walkable places, on the water a zone is an ellipse inside the pond, and in the air they
 * drift over anything.
 */
export const LifeZone = z.object({
  zoneId: Slug,
  kind: z.enum(LIFE_KINDS),
  area: Bounds,
  /** An ellipse inscribed in `area`, for a pond, or the whole rectangle. */
  shape: z.enum(['rect', 'ellipse']),
  /** How many live here. */
  count: z.number().int().min(1).max(12),
});
export type LifeZone = z.infer<typeof LifeZone>;

const MapAudio = z.object({
  music: z.enum(['forest', 'garden', 'quiet', 'snow']),
  ambience: z.enum(AMBIENCE_IDS),
});

export const LogicMap = z.object({
  schemaVersion: z.literal(1),
  id: MapIdEnum,
  widthTiles: z.number().int().positive().max(128),
  heightTiles: z.number().int().positive().max(128),
  obstacles: z.array(Obstacle).max(2048),
  spawns: z.array(SpawnGroup).min(1).max(16),
  /** Only Wildstar goes in. The rest of the herd waits outside and is there when she comes out. */
  solo: z.boolean().optional(),
  /** Spawn group used when a fresh world starts on this map. Only the forest sets it. */
  start: Slug.optional(),
  portals: z.array(Portal).max(8),
  interactables: z.array(Interactable).max(256),
  anchors: z.array(ActivityAnchor).max(256),
  encounters: z.array(Encounter).max(6),
  npcs: z.array(NpcPlacement).max(4),
  life: z.array(LifeZone).max(64),
  /** How deep the water is, where the herd can go into it. A map with none has dry feet. */
  waters: Waters.optional(),
  audio: MapAudio,
});
export type LogicMap = z.infer<typeof LogicMap>;

/** Pixel size of a map. */
export const mapSize = (m: Pick<LogicMap, 'widthTiles' | 'heightTiles'>): { w: number; h: number } => ({
  w: m.widthTiles * TILE,
  h: m.heightTiles * TILE,
});
