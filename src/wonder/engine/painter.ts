/**
 * What a game draws on. `ctx` is the picture itself and `light` is a second sheet laid over it by
 * adding its colours, where sparks and glows go so they can leave trails and bloom. Both are scaled
 * so that one unit is one unit of the game's own space, which is 360 units on the short side of the
 * screen whatever the device is.
 */
export interface Painter {
  readonly ctx: CanvasRenderingContext2D;
  readonly light: CanvasRenderingContext2D;
  /** Size of the view in units. */
  readonly w: number;
  readonly h: number;
  /**
   * Device pixels of the picture in one unit, for the rare drawing that has to name pixels, like
   * copying part of the picture.
   */
  readonly k: number;
  /** Seconds since the game began, on its own clock. */
  readonly t: number;
  /** Seconds since the last frame. */
  readonly dt: number;
  /** The parent asked for fewer effects. */
  readonly calm: boolean;
}

/** The size of the screen in the game's own units, and how big a unit is on the page. */
export interface View {
  readonly w: number;
  readonly h: number;
  /** Pixels of the page (not of the device) in one unit. */
  readonly unit: number;
  readonly landscape: boolean;
}

/**
 * The short side of every screen, in units. Games are laid out against this, so they look the same
 * on every device.
 */
export const SHORT_SIDE = 360;

/** The size in units of a screen of this many page pixels. */
export function viewOf(cssWidth: number, cssHeight: number): View {
  const unit = Math.max(1, Math.min(cssWidth, cssHeight)) / SHORT_SIDE;
  return { w: cssWidth / unit, h: cssHeight / unit, unit, landscape: cssWidth >= cssHeight };
}
