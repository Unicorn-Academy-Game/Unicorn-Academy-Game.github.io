import {
  EAST,
  NORTH,
  NORTHEAST,
  NORTHWEST,
  SOUTH,
  SOUTHEAST,
  SOUTHWEST,
  UNICORN_FACINGS,
  type UnicornFacing,
  WEST,
} from './compass';
import type { ClipName } from './ids';

/**
 * Timing contract of every unicorn clip. The art tools render exactly these frames, the manifest
 * records them, and the simulation schedules against them, so none of the three can drift from the
 * others.
 */
export interface ClipTiming {
  frames: number;
  /** The facings this clip is drawn in. The art tools render a frame set for each. */
  facings: readonly UnicornFacing[];
  /**
   * Facings that are not drawn but shown by flipping the picture of the facing that mirrors them,
   * which has to be drawn. They cost the art nothing and the atlas nothing, and the manifest says
   * which pictures to flip.
   */
  mirrored?: readonly UnicornFacing[];
  /**
   * More facings this clip is drawn in, into a second set of sheets that a device loads after play
   * has begun, when it can hold them. Where they are loaded they fill in the gaps between the
   * facings of the first sheet and replace the flipped ones with the real thing, so the clip is
   * then drawn at every facing of the ring. Elsewhere the clip is shown in the nearest facing it
   * has.
   */
  fine?: readonly UnicornFacing[];
  /** Playback rate at nominal speed, in frames per second. */
  fps: number;
  loop: boolean;
  /** Per-frame hold in milliseconds when frames are not evenly timed. */
  holdMs?: readonly number[];
  /** Frame on which a spell effect is released. */
  releaseFrame?: number;
  /**
   * World units traveled per loop with the hooves planted. Playback rate in loops per second is
   * speed / strideDistance.
   */
  strideDistance?: number;
}

/** Body travel per step. A walk loop holds two steps, one per diagonal pair of legs. */
export const WALK_STEP = 76;
const WALK_STRIDE = 2 * WALK_STEP;

const FOUR: readonly UnicornFacing[] = [EAST, NORTH, WEST, SOUTH];
const SIDES: readonly UnicornFacing[] = [EAST, WEST];
/**
 * Standing and walking are also drawn toward the northwest and the southwest. The northeast and
 * southeast are those, flipped.
 */
const EIGHT: readonly UnicornFacing[] = [...FOUR, NORTHWEST, SOUTHWEST];
const FLIPPED: readonly UnicornFacing[] = [NORTHEAST, SOUTHEAST];
/**
 * Every facing of the ring that the first sheet does not draw: the 24 between its eight, and the
 * two it flips.
 */
const FINE: readonly UnicornFacing[] = UNICORN_FACINGS.filter((f) => !EIGHT.includes(f));

export const CLIP_TIMING: Record<ClipName, ClipTiming> = {
  idle: { frames: 4, facings: EIGHT, mirrored: FLIPPED, fine: FINE, fps: 5, loop: true, holdMs: [900, 500, 160, 500] },
  walk: { frames: 8, facings: EIGHT, mirrored: FLIPPED, fine: FINE, fps: 12, loop: true, strideDistance: WALK_STRIDE },
  cast: { frames: 6, facings: FOUR, fps: 10, loop: false, releaseFrame: 3 },
  graze: { frames: 6, facings: SIDES, fps: 5, loop: true },
  drink: { frames: 6, facings: SIDES, fps: 5, loop: true },
  'signature-idle': { frames: 8, facings: SIDES, fps: 8, loop: true },
  rest: { frames: 6, facings: SIDES, fps: 4, loop: true },
  stretch: { frames: 6, facings: SIDES, fps: 6, loop: false },
  nuzzle: { frames: 6, facings: SIDES, fps: 6, loop: true },
};

/** Every facing the first sheet shows a clip in, drawn or flipped. */
export const shownFacings = (name: ClipName): readonly UnicornFacing[] => [
  ...CLIP_TIMING[name].facings,
  ...(CLIP_TIMING[name].mirrored ?? []),
];

/**
 * Every facing a clip can be asked for once everything has loaded, which is all of the ring when
 * the clip has fine facings.
 */
export const allFacings = (name: ClipName): readonly UnicornFacing[] =>
  CLIP_TIMING[name].fine ? UNICORN_FACINGS : shownFacings(name);

export const frameMs = (name: ClipName, frame: number): number =>
  CLIP_TIMING[name].holdMs?.[frame] ?? Math.round(1000 / CLIP_TIMING[name].fps);

/** Length of one pass through a clip, in seconds. */
export function clipSeconds(name: ClipName): number {
  let ms = 0;
  for (let i = 0; i < CLIP_TIMING[name].frames; i++) ms += frameMs(name, i);
  return ms / 1000;
}

/** Seconds from the start of a clip to the start of its release frame. */
export function releaseSeconds(name: ClipName): number {
  const f = CLIP_TIMING[name].releaseFrame;
  if (f === undefined) return 0;
  let ms = 0;
  for (let i = 0; i < f; i++) ms += frameMs(name, i);
  return ms / 1000;
}
