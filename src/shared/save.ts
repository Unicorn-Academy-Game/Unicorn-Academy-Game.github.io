import { z } from 'zod';
import { FACINGS, MAP_IDS, UNICORN_IDS } from './ids';
import { DEFAULT_LEARNING, LearningSettings } from './learning';
import { DEFAULT_START_PLACE, START_PLACE_IDS } from './places';
import { SEASON_CHOICES } from './seasons';

/**
 * Schemas for the saved world and for what a device keeps of its settings. Everything read back
 * from storage or from a file goes through these.
 */

const Num = z.number().finite();
/** Generous bound on a world coordinate. The largest map is 5120 units wide. */
const Coord = Num.min(-64).max(8192);

export const SavedPropState = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('chest'), open: z.boolean() }),
  z.object({ kind: z.literal('flowerbed'), state: z.enum(['leafy', 'flowering']) }),
  z.object({ kind: z.literal('lantern'), lit: z.boolean() }),
  z.object({ kind: z.literal('brazier'), lit: z.boolean() }),
  // A place on the beach where a castle is built: bare sand, a mound, a small castle, a grand one.
  z.object({ kind: z.literal('castle'), stage: z.number().int().min(0).max(3) }),
]);
export type SavedPropState = z.infer<typeof SavedPropState>;

const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const InstanceId = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(80);

const MAX_PROPS = 128;

export const WorldSaveV1 = z
  .object({
    schemaVersion: z.literal(1),
    contentVersion: z.string().min(1).max(32),
    /** New only for an explicit parent reset, restore or import. */
    worldGeneration: Uuid,
    /** New for every locally committed snapshot. */
    snapshotId: Uuid,
    mapId: z.enum(MAP_IDS),
    wildstar: z.object({
      position: z.object({ x: Coord, y: Coord }),
      facing: z.enum(FACINGS),
    }),
    recruited: z.array(z.enum(UNICORN_IDS)).min(1).max(UNICORN_IDS.length),
    visitedMaps: z.array(z.enum(MAP_IDS)).min(1).max(MAP_IDS.length),
    props: z.record(InstanceId, SavedPropState).refine((p) => Object.keys(p).length <= MAX_PROPS, 'too many props'),
    rngState: z.number().int().min(0).max(0xffffffff),
  })
  .superRefine((s, ctx) => {
    if (new Set(s.recruited).size !== s.recruited.length)
      ctx.addIssue({ code: 'custom', path: ['recruited'], message: 'duplicate unicorn' });
    if (!s.recruited.includes('wildstar'))
      ctx.addIssue({ code: 'custom', path: ['recruited'], message: 'wildstar is always recruited' });
    if (new Set(s.visitedMaps).size !== s.visitedMaps.length)
      ctx.addIssue({ code: 'custom', path: ['visitedMaps'], message: 'duplicate map' });
    if (!s.visitedMaps.includes(s.mapId))
      ctx.addIssue({ code: 'custom', path: ['visitedMaps'], message: 'current map must be visited' });
  });
export type WorldSaveV1 = z.infer<typeof WorldSaveV1>;

/** A save of any version, only enough to tell whether this build can read it. */
export const SaveEnvelope = z.object({ schemaVersion: z.number().int() }).passthrough();

/**
 * How much closer or farther than usual the world is drawn, a parent's choice. 1 is the size the
 * game picks for the screen.
 */
export const ZOOM_STEPS = [0.75, 1, 1.25, 1.5, 2] as const;
export type ZoomStep = (typeof ZOOM_STEPS)[number];

/**
 * The step nearest to a number, so a stored value from somewhere else still lands on one the
 * controls can show.
 */
export const nearestZoom = (value: number): ZoomStep => {
  const v = Number.isFinite(value) ? value : 1;
  return ZOOM_STEPS.reduce((best, step) => (Math.abs(step - v) < Math.abs(best - v) ? step : best), ZOOM_STEPS[1]);
};

/**
 * Whether the game draws itself lighter for a device that misses frames. Automatic goes by what the
 * device says it is.
 */
const LOW_END_CHOICES = ['auto', 'on', 'off'] as const;
export type LowEndChoice = (typeof LOW_END_CHOICES)[number];

/**
 * What a parent has chosen on one device. A setting added after a device first stored its settings
 * has a default here, so the stored record still reads and the choices already made on the device
 * are not thrown away.
 */
export const DeviceSettings = z.object({
  musicVolume: Num.min(0).max(1),
  effectsVolume: Num.min(0).max(1),
  muted: z.boolean(),
  reducedEffects: z.boolean(),
  /**
   * Each time the game is opened the player starts from the beginning and finds the unicorns again.
   * The saved world is left alone.
   */
  startFresh: z.boolean().default(false),
  /**
   * Where a new opening of the game begins. A place this version does not know reads as the first
   * one, so a record from another version keeps the rest of its settings.
   */
  startPlace: z.enum(START_PLACE_IDS).catch(DEFAULT_START_PLACE),
  /**
   * How close the world is drawn. Any number is read, so one stored by another version cannot reset
   * the rest; the settings land it on a step.
   */
  zoom: Num.default(1),
  /**
   * A choice this version does not know reads as automatic, so a record from another version keeps
   * the rest of its settings.
   */
  lowEnd: z.enum(LOW_END_CHOICES).catch('auto'),
  /**
   * Which season the world shows. Automatic follows the calendar. A choice this version does not
   * know reads as automatic, so a record from another version keeps the rest of its settings.
   */
  season: z.enum(SEASON_CHOICES).catch('auto'),
  /**
   * Learning to spell. On unless a parent turned it off. A record from before it existed, or one
   * this version cannot read, reads as on.
   */
  learning: LearningSettings.catch(DEFAULT_LEARNING),
});
export type DeviceSettings = z.infer<typeof DeviceSettings>;

export const DEFAULT_SETTINGS: DeviceSettings = {
  musicVolume: 0.7,
  effectsVolume: 0.8,
  muted: false,
  reducedEffects: false,
  startFresh: false,
  startPlace: DEFAULT_START_PLACE,
  zoom: 1,
  lowEnd: 'auto',
  season: 'auto',
  learning: DEFAULT_LEARNING,
};

/**
 * What a device stored, read as this version's settings, or null when nothing in it can be read. A
 * record with no `startPlace` was written before the start screen, when each opening began from the
 * start and spelling was off. Nobody had chosen those two, they were the defaults, so the new
 * defaults replace them once. A record that has `startPlace` is the start screen's own and keeps
 * what was chosen on it.
 */
export function readSettings(stored: unknown): DeviceSettings | null {
  const parsed = DeviceSettings.safeParse(stored);
  if (!parsed.success) return null;
  if (typeof stored === 'object' && stored !== null && 'startPlace' in stored) return parsed.data;
  return {
    ...parsed.data,
    startFresh: DEFAULT_SETTINGS.startFresh,
    learning: { ...parsed.data.learning, on: DEFAULT_LEARNING.on },
  };
}

/** Serialized size above which a snapshot is refused. Normal saves are well under 64 KiB. */
export const MAX_SAVE_BYTES = 256 * 1024;
