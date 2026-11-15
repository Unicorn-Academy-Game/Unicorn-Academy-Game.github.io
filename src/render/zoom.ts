/**
 * How the canvas maps to the screen. `dpr` is the backing-store pixels per CSS pixel and `zoom` is
 * CSS pixels per world unit, so the camera zooms by `zoom * dpr` framebuffer pixels per source
 * pixel.
 */
export interface ViewScale {
  dpr: number;
  zoom: number;
}

/**
 * A side-on unicorn body is 114 source pixels tall, so 0.9 draws it about 103 CSS pixels tall,
 * inside the 80 to 112 target.
 */
const IDEAL_ZOOM = 0.9;
/**
 * The framebuffer budget. Beyond this the backing ratio drops, which only softens the picture a
 * little.
 */
export const MAX_BACKING_PIXELS = 8_000_000;
const MAX_DPR = 3;
/**
 * How far from the ideal size a whole number of framebuffer pixels per source pixel may land and
 * still be preferred.
 */
const SNAP_TOLERANCE = 0.16;
/**
 * Large displays show more world and draw characters a little larger so the view stays a sensible
 * width.
 */
const WIDE_SCREEN = 1500;

/**
 * `closeness` is the parent's setting on top of what the game picks: 1.5 draws everything half as
 * large again. It is applied after the choice of whole pixels, so every step is a real change on
 * every screen, and a step that is not a whole number of pixels is softened by the renderer's
 * pixel-art smoothing.
 */
export function chooseView(cssWidth: number, cssHeight: number, devicePixelRatio: number, closeness = 1): ViewScale {
  const base = pickView(cssWidth, cssHeight, devicePixelRatio);
  return { dpr: base.dpr, zoom: base.zoom * closeness };
}

function pickView(cssWidth: number, cssHeight: number, devicePixelRatio: number): ViewScale {
  const area = Math.max(1, cssWidth * cssHeight);
  const dpr = Math.max(1, Math.min(devicePixelRatio || 1, MAX_DPR, Math.sqrt(MAX_BACKING_PIXELS / area)));
  const growth = Math.max(1, Math.min(cssWidth, cssHeight * 1.8) / WIDE_SCREEN);
  const ideal = IDEAL_ZOOM * growth;
  const whole = Math.round(ideal * dpr);
  if (whole >= 1) {
    const zoom = whole / dpr;
    if (Math.abs(zoom / ideal - 1) <= SNAP_TOLERANCE) return { dpr, zoom };
  }
  return { dpr, zoom: ideal };
}

/** The size of the canvas backing store for a CSS size. */
export const backingSize = (cssWidth: number, cssHeight: number, dpr: number): { w: number; h: number } => ({
  w: Math.max(1, Math.round(cssWidth * dpr)),
  h: Math.max(1, Math.round(cssHeight * dpr)),
});
