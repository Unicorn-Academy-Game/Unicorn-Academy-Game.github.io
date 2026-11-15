import { fromOklch, type RGB, ramp } from '../core/color';
import type { Rgba } from '../core/image';
import { cutGem } from './rain';

/**
 * The rainbow gem that the rainbow crystals give. It is cut like the others, but each of its facets
 * is a colour of its own, and from one frame to the next every facet takes on the colour of its
 * neighbour, so the whole stone shimmers through the rainbow.
 */
export const RAINBOW_FRAMES = 8;

/**
 * A hue each facet has in the first frame: the table, the two sides of the crown and the three of
 * the pavilion. Six colours that stand well apart.
 */
const FACET_HUES = [95, 22, 330, 150, 215, 275] as const;

const spectrum = (hue: number): readonly RGB[] =>
  ramp(fromOklch(0.74, 0.21, hue), {
    steps: 6,
    shadowHue: hue - 22,
    lightHue: hue + 12,
    lean: 0.8,
    lightness: [-0.26, -0.15, -0.07, 0, 0.07, 0.14],
  });

export function renderRainbowGem(frame: number): Rgba {
  const turn = (360 / RAINBOW_FRAMES) * (frame % RAINBOW_FRAMES);
  return cutGem((i) => spectrum(FACET_HUES[i]! + turn));
}
