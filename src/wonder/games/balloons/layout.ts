import { chromeOf, type Screen } from '../../engine/chrome';
import { clamp } from '../../engine/ease';
import type { Area, Tie } from './field';
import { R_BOUQUET } from './field';

/**
 * Where everything of the balloon game stands on a screen, in units. The screen can be a phone on
 * its side, a tablet, a phone upright or a desktop, so none of this is a number written for one of
 * them: it is all worked out from the size.
 */

export interface Garland {
  /** The middle of the row, sideways. */
  readonly cx: number;
  /**
   * The height of the middle of the balloons of the row, and of the ribbon they are tied to, which
   * sags `SAG` below that in the middle.
   */
  readonly y: number;
  readonly ribbon: number;
  /** The radius of one small balloon, and how far apart the middles of two are. */
  readonly r: number;
  readonly step: number;
}

export interface Plan {
  readonly area: Area;
  /** The top of the near hills, where the friends stand and the gift stands. */
  readonly feet: number;
  /** The line the far hills meet the sky at. */
  readonly horizon: number;
  /**
   * Where the gift stands on the hill, how big it is drawn, and where the strings of the bouquet
   * are tied to it.
   */
  readonly gift: {
    readonly x: number;
    readonly y: number;
    readonly tieY: number;
    readonly scale: number;
    readonly half: number;
    readonly height: number;
  };
  /** The five places on the fan of strings, from the left to the right. */
  readonly ties: readonly Tie[];
  readonly garland: Garland;
  /**
   * The top the rainbow may reach, and the line its feet stand on. The garland is put away while it
   * is up, so it may reach as high as the star meter.
   */
  readonly rainbow: { readonly top: number; readonly baseY: number };
}

/** How far the ribbon of the garland hangs below its ends in the middle. */
export const SAG = 6;

const FAN_ANGLES = [-2, -1, 0, 1, 2] as const;

/**
 * The gift the balloons are tied to, as the picture made for it is: about this wide and this tall
 * before it is scaled.
 */
const GIFT = { wide: 46, tall: 43 } as const;

export function planOf(s: Screen): Plan {
  const chrome = chromeOf(s);
  const feet = s.h * 0.87;
  const horizon = s.h * 0.69;
  const r = clamp(s.w / 40, 9, 12);
  const gy = chrome.meter.y1 + 7 + r;
  const ribbon = gy + r + 5;
  // The gift is as big as the screen allows, and the strings are as long as the room above it
  // leaves: the bouquet reaches up to the garland and no further.
  const scale = clamp(s.h / 245, 1.3, 1.8);
  const room = feet + 2 - (ribbon + SAG + 3 + R_BOUQUET) - (GIFT.tall * scale - 3);
  const length = clamp(Math.min(s.h * 0.31, room), 60, 150);
  // The balloons of the fan are as close as they can be without touching, whatever the length of
  // the strings.
  const step = 2 * Math.asin(Math.min(1, (R_BOUQUET + 1.5) / length));
  // The strings are tied to the top of the gift.
  const tieY = feet + 2 - GIFT.tall * scale + 3;
  const ties: Tie[] = FAN_ANGLES.map((n) => ({ x: s.w / 2, y: tieY, length, angle: n * step }));
  return {
    area: { w: s.w, top: -R_BOUQUET * 3, floor: feet + 2, edge: 30 },
    feet,
    horizon,
    gift: { x: s.w / 2, y: feet + 2, tieY, scale, half: (GIFT.wide * scale) / 2, height: GIFT.tall * scale },
    ties,
    garland: { cx: s.w / 2, y: gy, ribbon, r, step: r * 2.5 },
    // On a tall screen the rainbow stops being as tall as the room, so that it stays a rainbow and
    // not a tower of balloons.
    rainbow: { top: Math.max(chrome.meter.y1 + 8, feet - 4 - s.w * 1.1), baseY: feet - 4 },
  };
}
