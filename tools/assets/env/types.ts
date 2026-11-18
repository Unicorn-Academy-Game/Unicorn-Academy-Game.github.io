import type { ShadowSpec } from '../../../src/shared/manifest';
import type { Rgba } from '../../art/core/image';

export type BundleId =
  | 'forest'
  | 'garden'
  | 'treasure-house'
  | 'palace-hall'
  | 'stable'
  | 'playground'
  | 'manor'
  | 'cave'
  | 'shore'
  | 'magic'
  | 'hut'
  | 'grove'
  | 'shared'
  | 'ui'
  | 'fx'
  | 'life'
  | 'produce';

interface Canvas {
  w: number;
  h: number;
  /** Ground anchor inside the canvas. */
  ox: number;
  oy: number;
}

/**
 * One sprite of the environment kit. `render` draws a frame and may be 3D, 2D or both. Everything
 * that decides what the pixels look like lives in the files named by `source`, so a sprite is
 * redrawn exactly when one of them changes.
 */
export interface Recipe {
  id: string;
  bundle: BundleId;
  canvas: Canvas;
  /** More than one frame makes an animation. */
  anim?: { frames: number; fps: number; loop: boolean };
  render: (frame: number) => Rgba;
  /** Paths under tools/ whose content affects the pixels. */
  source: readonly string[];
  shadow?: ShadowSpec;
  /** Region that fades when someone stands behind it, relative to the anchor. */
  canopy?: { x: number; y: number; w: number; h: number };
  /** Authoring hints that never reach the game: the circle a map author blocks for this object. */
  footprint?: { r: number };
}
