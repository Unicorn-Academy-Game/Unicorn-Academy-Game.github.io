import type { Stop } from './color';

/**
 * The colours of the seasons, each a ramp from the darkest of a thing at 0 to its lightest at 1.
 * Trees are recoloured along these by how light each pixel is among the pixels of its own tree, so
 * a dark tree and a light one come out alike.
 */

/**
 * A tree under snow: the shade stays a cold evergreen, and the lit side of every crown is white.
 */
export const FROSTED: readonly Stop[] = [
  [0, 26, 54, 66],
  [0.3, 50, 90, 100],
  [0.55, 136, 174, 190],
  [0.76, 226, 238, 248],
  [1, 252, 254, 255],
];

/** A conifer holds the dark in more of it, and the snow lies on the tops of its tiers. */
export const FROSTED_CONIFER: readonly Stop[] = [
  [0, 18, 48, 46],
  [0.38, 40, 84, 76],
  [0.62, 116, 158, 160],
  [0.82, 222, 236, 244],
  [1, 252, 254, 255],
];

const AUTUMN_RED: readonly Stop[] = [
  [0, 58, 16, 24],
  [0.35, 138, 30, 36],
  [0.7, 206, 62, 40],
  [1, 246, 124, 72],
];
const AUTUMN_ORANGE: readonly Stop[] = [
  [0, 72, 32, 14],
  [0.35, 164, 70, 20],
  [0.7, 232, 120, 28],
  [1, 255, 186, 82],
];
const AUTUMN_GOLD: readonly Stop[] = [
  [0, 84, 58, 14],
  [0.35, 170, 122, 26],
  [0.7, 236, 184, 48],
  [1, 255, 232, 122],
];
const AUTUMN_LIME: readonly Stop[] = [
  [0, 36, 66, 24],
  [0.35, 88, 118, 32],
  [0.7, 154, 164, 44],
  [1, 212, 220, 94],
];
/**
 * The autumn palettes in the order a leaf turns, so that patches beside each other are neighbours
 * on the ramp of the year.
 */
export const AUTUMN_TURN: readonly (readonly Stop[])[] = [AUTUMN_RED, AUTUMN_ORANGE, AUTUMN_GOLD, AUTUMN_LIME];

export const SPRING_FRESH: readonly Stop[] = [
  [0, 26, 88, 44],
  [0.4, 68, 158, 60],
  [0.75, 140, 214, 84],
  [1, 208, 246, 132],
];
export const SPRING_PINK: readonly Stop[] = [
  [0, 128, 46, 92],
  [0.4, 224, 118, 170],
  [0.75, 250, 190, 220],
  [1, 255, 238, 246],
];
export const SPRING_WHITE: readonly Stop[] = [
  [0, 148, 118, 150],
  [0.4, 234, 212, 230],
  [0.8, 255, 248, 252],
  [1, 255, 255, 255],
];

/** Snow on the ground: a cold blue in the hollows, and white where it is lit. */
export const GROUND_SNOW: readonly Stop[] = [
  [0, 128, 158, 198],
  [0.45, 206, 222, 242],
  [1, 252, 253, 255],
];
/** A path in the snow, trodden grey. */
export const PATH_SNOW: readonly Stop[] = [
  [0, 112, 122, 148],
  [0.5, 164, 174, 196],
  [1, 218, 224, 236],
];
/** Ice where there was water, a clear cold cyan. */
export const ICE: readonly Stop[] = [
  [0, 78, 142, 192],
  [0.5, 148, 200, 232],
  [1, 218, 242, 252],
];

export const MEADOW_AUTUMN: readonly Stop[] = [
  [0, 66, 76, 30],
  [0.5, 144, 136, 44],
  [1, 198, 176, 70],
];
export const MEADOW_SPRING: readonly Stop[] = [
  [0, 28, 118, 54],
  [0.5, 84, 184, 72],
  [1, 152, 228, 98],
];

/**
 * What the snow is made of on a cap: white on top, then a pale blue, and a cold shade at the bottom
 * edge.
 */
export const CAP: readonly Stop[] = [
  [0, 252, 254, 255],
  [0.5, 232, 241, 252],
  [1, 186, 204, 230],
];

/** The fallen leaves and the blossom specks that are scattered over the meadow. */
export const LEAF_LITTER: readonly (readonly [number, number, number])[] = [
  [196, 96, 34],
  [172, 60, 36],
  [222, 160, 50],
];
export const BLOSSOM_SPECKS: readonly (readonly [number, number, number])[] = [
  [255, 250, 250],
  [255, 176, 208],
  [255, 228, 96],
];
