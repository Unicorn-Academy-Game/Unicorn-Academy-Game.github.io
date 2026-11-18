/** A rectangle in the game's units. */
export interface Rect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/**
 * The screen in the game's own units, and how many CSS pixels one unit is, which is how big the
 * page's own buttons are in it.
 */
export interface Screen {
  readonly w: number;
  readonly h: number;
  readonly unit: number;
}

/** What the page draws over a game, by name. */
export interface Chrome {
  /** The way out, at the top left. */
  readonly wayOut: Rect;
  /** The five stars of the meter, at the top in the middle. */
  readonly meter: Rect;
  /** The sound and settings buttons, at the top right. */
  readonly corner: Rect;
  /** The again and done buttons, at the bottom right once the finale is over. */
  readonly finish: Rect;
}

/** The width in CSS pixels at or under which the page moves the stars to a row of their own. */
const NARROW = 560;

/**
 * The width in CSS pixels at or under which the buttons in the corner are 44 pixels and not 56
 * (style.css).
 */
const SMALL_BUTTONS = 359;

/**
 * How far in from the right edge the buttons in the corner reach, in CSS pixels: the map, the
 * sound, the full screen and the settings, with their gaps and the margin. A phone that cannot go
 * full screen has one less, and is given the room all the same.
 */
const CORNER_REACH = 276;
const CORNER_REACH_SMALL = 214;

/**
 * What the page draws over a game, in units. The buttons are a fixed size in CSS pixels, so on a
 * big screen they are a small part of the picture and on a phone a big one. A game keeps what must
 * be seen and touched out from under them.
 */
export function chromeOf(s: Screen): Chrome {
  const px = (n: number): number => n / s.unit;
  // On a narrow screen the stars would meet the buttons in the corners, so the page puts them on a
  // row of their own (style.css).
  const narrow = s.w * s.unit <= NARROW;
  return {
    wayOut: { x0: 0, y0: 0, x1: px(76), y1: px(76) },
    meter: { x0: s.w / 2 - px(114), y0: narrow ? px(80) : 0, x1: s.w / 2 + px(114), y1: narrow ? px(136) : px(76) },
    corner: {
      x0: s.w - px(s.w * s.unit <= SMALL_BUTTONS ? CORNER_REACH_SMALL : CORNER_REACH),
      y0: 0,
      x1: s.w,
      y1: px(76),
    },
    finish: { x0: s.w - px(196), y0: s.h - px(100), x1: s.w, y1: s.h },
  };
}

/** The same four rectangles as a list, for a game that only needs to stay clear of all of them. */
export const chrome = (s: Screen): Rect[] => Object.values(chromeOf(s));
