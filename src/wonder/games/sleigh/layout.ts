import { type Chrome, chromeOf } from '../../engine/chrome';
import { clamp } from '../../engine/ease';
import { TALLEST, WIDEST } from './shape';

/** How tall the sleigh and the unicorns that pull it are, at the size they are drawn at one. */
export const TEAM_HEIGHT = 80;
/** How far ahead of the sleigh the first unicorn is, and how far apart the unicorns are, at that size. */
export const TEAM_FIRST = 84;
export const TEAM_APART = 64;

/** The seconds it takes to fly from one house to the next, which sets the pace of play. */
const SECONDS_PER_HOUSE = 2.6;

/** Where everything stands on the screen, worked out from its size. */
export interface Plan {
  /** The height of the snow line, where the houses stand. */
  readonly ground: number;
  /** The size houses and trees are drawn at, and the size the sleigh and the unicorns are. */
  readonly scale: number;
  readonly team: number;
  /** The height the sleigh cruises at. */
  readonly flyY: number;
  /** Where on the screen the sleigh is, as a share of its width. */
  readonly sleighAt: number;
  /** How many unicorns pull the sleigh. */
  readonly pullers: number;
  /** Units between one house and the next, and units flown in a second. */
  readonly spacing: number;
  readonly speed: number;
  /** The radius of the loop the team makes in the finale, small enough that the top of it stays on the screen. */
  readonly loop: number;
  /** The bottom of the buttons across the top of the screen, which the sleigh flies under. */
  readonly top: number;
}

const bottomOf = (c: Chrome): number => Math.max(c.wayOut.y1, c.meter.y1, c.corner.y1);

/**
 * Works out the picture from the size of the screen. The houses are as big as the room between the
 * buttons at the top and the snow allows, so that on a phone held sideways the sleigh flies in the
 * clear between the stars of the meter and the chimneys, and on a tall screen the village is
 * bigger and the sky wide.
 */
export function planOf(w: number, h: number, unit: number): Plan {
  const top = bottomOf(chromeOf({ w, h, unit })) + 4;
  const ground = h - clamp(h * 0.1, 34, 64);
  const room = ground - top - 16;
  // The village is as big as the room allows. The sleigh may pass in front of the tallest chimney.
  const scale = clamp((room - 60) / TALLEST, 0.8, 1.3);
  const team = clamp(room / 232, 0.9, 1.25);
  // The sleigh cruises under the buttons, and a little higher in the sky when there is room. On a
  // tall screen the sky is wide, so it comes down toward the village to keep a present's flight short.
  const lowest = top + TEAM_HEIGHT * team + 4;
  const highest = ground - TALLEST * scale - 26;
  const tall = w < h;
  const flyY = Math.round(lowest + clamp((highest - lowest) * (tall ? 0.5 : 0.3), 0, tall ? 150 : 90));
  const spacing = Math.max(190, WIDEST * scale + 56);
  return {
    ground,
    scale,
    team,
    flyY,
    sleighAt: w < h ? 0.3 : 0.28,
    pullers: w < 500 ? 2 : 3,
    spacing,
    speed: spacing / SECONDS_PER_HOUSE,
    loop: clamp((flyY - 18 - 56 * team) / 2, 22, 56),
    top,
  };
}
