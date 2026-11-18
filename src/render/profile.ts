import type { LowEndChoice } from '../shared/save';

/**
 * How much the game asks of a device. Standard draws and plays everything. Low-end is for a tablet
 * that can show the game but drops frames when a lot happens at once, such as a Kindle Fire. Every
 * difference between the two is a field here, so what low-end changes is read in one place and the
 * code that draws and plays asks a field and never the name. The one exception is the style sheet:
 * it cannot read a field, so `low-end.css` asks for the id the page carries as `data-profile`.
 */
export type ProfileId = 'standard' | 'low';

/**
 * Whose fine facings a device is given. Each unicorn who is out holds about 18 MiB of graphics
 * memory for hers. `herd` is all of them. `leader` is Wildstar's alone, the one the child steers
 * and watches turn: it is a seventh of the memory, and the followers behind her are drawn at the
 * nearest of the eight they have. `none` is the eight of the first sheet for everyone.
 */
export type FineReach = 'herd' | 'leader' | 'none';

export interface Profile {
  id: ProfileId;
  /**
   * The most framebuffer pixels per CSS pixel the world is drawn at. A sharper screen has the
   * picture stretched to fit by the browser. At 1 on a 1280 by 800 screen the game draws one
   * framebuffer pixel per source pixel and shows 11 percent less of the world each way than at 1.5,
   * because `chooseView` picks a zoom of 1 where it picks 0.9 at 1.5.
   */
  maxDpr: number;
  /** A multisampled canvas, which smooths the edge of anything drawn between pixels. */
  multisample: boolean;
  /**
   * Phaser's shader that keeps pixel art crisp when it is drawn larger than whole pixels. It adds a
   * step to every pixel drawn. At ratio 1 in the garden, turning it off along with multisampling
   * changed 0.3 to 1.7 percent of the pixels in the patches compared, by small amounts at the edges
   * of sprites (measured).
   */
  smoothing: boolean;
  /**
   * Hands the renderer only the scenery the camera can see. The engine draws every object in the
   * scene otherwise, on screen or not. A phone or tablet browser makes one draw call for each run
   * of sprites that share a picture, and the sprites in the scene alternate between pictures, so
   * scenery that is off screen still breaks up the runs of what is on it.
   */
  cull: boolean;
  /** The share of each effect's particles that are thrown. */
  sparkles: number;
  /**
   * Draws additive glows after the other particles, so a burst is two batches and not one per
   * change of blend.
   */
  glowsLast: boolean;
  /**
   * The quality the playground games start at, from 2 down to 0. The highest lays a second canvas
   * of light over the picture so glows trail and bloom, and draws at up to two pixels for each CSS
   * pixel. The lowest draws glows straight onto the picture with no second canvas and no bloom, at
   * one pixel for each CSS pixel, and throws 0.45 of the sparkles. A game also lowers its own
   * quality when its frames run slow, but it times only its own script, and a slow graphics chip
   * does not show there, so a device that is known to be slow starts low.
   */
  wonderQuality: 0 | 1 | 2;
  /**
   * The most nodes the playground games keep sounding at once (`src/audio/synth/budget.ts`). The
   * audio thread visits each one in every 128 samples, so this is a share of the time it has.
   * Measured in Chromium on a fast laptop, 300 nodes took 5 percent of that time and 600 took 10.
   * The 250 for a Fire tablet is a guess: about 4 percent of the laptop's time, which on a tablet
   * ten times slower is under half of its own. Nothing has been heard on one.
   */
  soundBudget: number;
  /**
   * Which unicorns are drawn at every one of their 32 facings. The 26 facings of walking and
   * standing that the first sheet does not draw come in sheets after play has begun, and each
   * unicorn who is out holds about 18 MiB of graphics memory for them. One who does not get them
   * shows the nearest of the eight, as every unicorn did before there were 32. Low-end mode gives
   * them to Wildstar only, so that the unicorn a child steers still turns smoothly on a tablet
   * that is short of memory and of frames, and a device that says it has little memory gets the
   * same (`FINE_HERD_MIN_GB`, `FINE_LEADER_MIN_GB`).
   */
  fineFacings: FineReach;
}

export const PROFILES: Readonly<Record<ProfileId, Profile>> = {
  standard: {
    id: 'standard',
    maxDpr: Infinity,
    multisample: true,
    smoothing: true,
    cull: false,
    sparkles: 1,
    glowsLast: false,
    wonderQuality: 2,
    soundBudget: 600,
    fineFacings: 'herd',
  },
  low: {
    id: 'low',
    maxDpr: 1,
    multisample: false,
    smoothing: false,
    cull: true,
    sparkles: 0.6,
    glowsLast: true,
    wonderQuality: 0,
    soundBudget: 250,
    fineFacings: 'leader',
  },
};

/** Silk is the browser a Fire tablet ships with, and a Fire tablet's model code starts with KF. */
const FIRE_TABLET = /\bSilk\/|\bKF[A-Z]{2,6}\b/;

export const looksLowEnd = (userAgent: string): boolean => FIRE_TABLET.test(userAgent);

/**
 * The least memory, in gigabytes, a device must say it has to be given the fine facings of the
 * whole herd. The fine sheets of all six unicorns are 109 MiB of graphics memory on top of the 143
 * MiB that everything else takes, and a device with under 4 GB is not asked for that. Chromium says
 * how much memory a device has, rounded down to a power of two (0.25, 0.5, 1, 2, 4 or 8). Safari
 * and Firefox do not say, and a device that does not say is given them.
 */
const FINE_HERD_MIN_GB = 4;

/**
 * The least a device must say it has to be given Wildstar's fine facings, 18 MiB. A device with
 * under 2 GB keeps the eight for everyone.
 */
const FINE_LEADER_MIN_GB = 2;

/**
 * The standard picture on a device that says it is short of memory: everything but the fine
 * facings of the followers, and all of them when it is very short.
 */
const shortOfMemory = (fineFacings: FineReach): Profile => ({ ...PROFILES.standard, fineFacings });

/**
 * The parent's choice, with automatic settled by what this device says it is and how much memory it
 * says it has. Only automatic reads the memory. A parent who has turned low-end mode off has asked
 * for the full picture.
 */
export function chooseProfile(choice: LowEndChoice, userAgent: string, memoryGB?: number): Profile {
  if (choice === 'on' || (choice === 'auto' && looksLowEnd(userAgent))) return PROFILES.low;
  if (choice === 'auto' && memoryGB !== undefined && memoryGB < FINE_LEADER_MIN_GB) return shortOfMemory('none');
  if (choice === 'auto' && memoryGB !== undefined && memoryGB < FINE_HERD_MIN_GB) return shortOfMemory('leader');
  return PROFILES.standard;
}
