import { hex, type RGB, ramp } from '../core/color';

/**
 * The shared environment palette. Every ramp runs darkest to lightest and leans the same way as the
 * characters: cool blue-green or lavender shadows, warm yellow highlights, so a unicorn standing in
 * a clearing belongs to it. Ramps are tuned by eye from rendered swatches
 * (`tools/art/world/swatches.ts`), not derived blindly.
 */
const r = (base: string, o: Parameters<typeof ramp>[1] = {}): RGB[] => ramp(hex(base), o);

export const PAL = {
  grass: r('#69bd4f', {
    steps: 6,
    shadowHue: 200,
    lightHue: 108,
    lean: 1.1,
    lightness: [-0.3, -0.19, -0.09, 0, 0.1, 0.19],
  }),
  lawn: r('#6cc455', {
    steps: 6,
    shadowHue: 200,
    lightHue: 108,
    lean: 1.1,
    lightness: [-0.28, -0.18, -0.09, 0, 0.1, 0.19],
  }),
  dirt: r('#c19564', {
    steps: 6,
    shadowHue: 330,
    lightHue: 80,
    lean: 1.0,
    lightness: [-0.3, -0.2, -0.1, 0, 0.09, 0.17],
  }),
  cobble: r('#a9a6c4', {
    steps: 6,
    shadowHue: 285,
    lightHue: 80,
    lean: 0.9,
    lightness: [-0.3, -0.19, -0.09, 0, 0.08, 0.15],
  }),
  water: r('#4aa6cf', {
    steps: 6,
    shadowHue: 270,
    lightHue: 150,
    lean: 1.0,
    lightness: [-0.3, -0.2, -0.1, 0, 0.1, 0.22],
  }),
  sand: r('#e2c98f', { steps: 5, shadowHue: 330, lightHue: 85, lean: 0.9 }),
  wood: r('#a8704a', {
    steps: 6,
    shadowHue: 320,
    lightHue: 70,
    lean: 0.9,
    lightness: [-0.3, -0.2, -0.1, 0, 0.09, 0.17],
  }),
  straw: r('#e6c25e', { steps: 5, shadowHue: 340, lightHue: 90, lean: 0.9 }),
  stone: r('#9a98b8', {
    steps: 6,
    shadowHue: 285,
    lightHue: 85,
    lean: 0.9,
    lightness: [-0.3, -0.2, -0.1, 0, 0.09, 0.17],
  }),
  ember: r('#d9714c', {
    steps: 6,
    shadowHue: 320,
    lightHue: 60,
    lean: 1.0,
    lightness: [-0.3, -0.2, -0.1, 0, 0.09, 0.18],
  }),
  frost: r('#bcd8f0', {
    steps: 6,
    shadowHue: 245,
    lightHue: 190,
    lean: 0.9,
    lightness: [-0.32, -0.21, -0.11, -0.03, 0.04, 0.1],
  }),
  marble: r('#ece8f4', {
    steps: 6,
    shadowHue: 285,
    lightHue: 85,
    lean: 0.8,
    lightness: [-0.28, -0.18, -0.1, -0.04, 0, 0.05],
  }),
} as const;

export type Ramp = readonly RGB[];

/**
 * The Fairy Palace and the garden around it: warm marble, rose and violet roofs, rosewood doors,
 * window glow.
 */
export const PALACE = {
  wall: r('#f6ecdf', {
    steps: 6,
    shadowHue: 300,
    lightHue: 80,
    lean: 0.9,
    lightness: [-0.3, -0.19, -0.08, -0.025, 0, 0.035],
  }),
  roofRose: r('#ee6f9f', {
    steps: 6,
    shadowHue: 325,
    lightHue: 55,
    lean: 1.0,
    lightness: [-0.32, -0.21, -0.1, 0, 0.09, 0.17],
  }),
  roofViolet: r('#8f6edb', {
    steps: 6,
    shadowHue: 285,
    lightHue: 340,
    lean: 0.9,
    lightness: [-0.3, -0.2, -0.1, 0, 0.09, 0.16],
  }),
  roofTeal: r('#4cb9c2', {
    steps: 6,
    shadowHue: 250,
    lightHue: 120,
    lean: 1.0,
    lightness: [-0.3, -0.2, -0.1, 0, 0.09, 0.17],
  }),
  door: r('#b9446a', {
    steps: 6,
    shadowHue: 320,
    lightHue: 60,
    lean: 0.9,
    lightness: [-0.3, -0.2, -0.1, 0, 0.08, 0.16],
  }),
  glass: r('#ffd878', { steps: 5, shadowHue: 25, lightHue: 100, lean: 0.8, lightness: [-0.2, -0.1, 0, 0.07, 0.14] }),
  banner: r('#c8307f', {
    steps: 6,
    shadowHue: 315,
    lightHue: 20,
    lean: 1.0,
    lightness: [-0.3, -0.2, -0.1, 0, 0.08, 0.15],
  }),
  hedge: r('#2f8f4a', {
    steps: 6,
    shadowHue: 205,
    lightHue: 110,
    lean: 1.2,
    lightness: [-0.3, -0.2, -0.1, 0, 0.1, 0.19],
  }),
} as const;

/**
 * Indoors: the treasure house is cream marble, rose carpet and gold; the stable is warm timber,
 * straw and brick.
 */
export const INTERIOR = {
  cream: r('#f1e3cf', {
    steps: 6,
    shadowHue: 320,
    lightHue: 80,
    lean: 0.9,
    lightness: [-0.3, -0.19, -0.1, -0.04, 0, 0.045],
  }),
  carpet: r('#b02f5c', {
    steps: 6,
    shadowHue: 325,
    lightHue: 40,
    lean: 1.0,
    lightness: [-0.3, -0.2, -0.1, 0, 0.07, 0.14],
  }),
  royal: r('#6a46c0', {
    steps: 6,
    shadowHue: 275,
    lightHue: 330,
    lean: 1.0,
    lightness: [-0.3, -0.2, -0.1, 0, 0.07, 0.14],
  }),
  earth: r('#a98a68', {
    steps: 6,
    shadowHue: 320,
    lightHue: 80,
    lean: 0.8,
    lightness: [-0.3, -0.2, -0.1, 0, 0.07, 0.14],
  }),
  brick: r('#a98a7a', {
    steps: 6,
    shadowHue: 310,
    lightHue: 70,
    lean: 0.9,
    lightness: [-0.3, -0.2, -0.1, 0, 0.08, 0.15],
  }),
  plank: r('#b27c52', {
    steps: 6,
    shadowHue: 320,
    lightHue: 70,
    lean: 0.9,
    lightness: [-0.32, -0.21, -0.1, 0, 0.09, 0.17],
  }),
  plaster: r('#efe0c4', {
    steps: 6,
    shadowHue: 315,
    lightHue: 80,
    lean: 0.9,
    lightness: [-0.32, -0.21, -0.1, -0.035, 0, 0.04],
  }),
  night: r('#4a3a6a', {
    steps: 6,
    shadowHue: 280,
    lightHue: 300,
    lean: 0.8,
    lightness: [-0.3, -0.2, -0.1, 0, 0.08, 0.15],
  }),
} as const;

/** Foliage tints. Each is a full ramp so one tree model can be dressed as several species. */
export const FOLIAGE = {
  emerald: r('#3f9a4f', {
    steps: 6,
    shadowHue: 215,
    lightHue: 105,
    lean: 1.2,
    lightness: [-0.3, -0.2, -0.1, 0, 0.1, 0.2],
  }),
  lime: r('#7cc650', {
    steps: 6,
    shadowHue: 190,
    lightHue: 100,
    lean: 1.1,
    lightness: [-0.3, -0.2, -0.1, 0, 0.1, 0.19],
  }),
  spruce: r('#2f7f6a', {
    steps: 6,
    shadowHue: 235,
    lightHue: 120,
    lean: 1.2,
    lightness: [-0.3, -0.2, -0.1, 0, 0.09, 0.18],
  }),
  blossom: r('#f2a3c6', {
    steps: 6,
    shadowHue: 310,
    lightHue: 70,
    lean: 0.9,
    lightness: [-0.3, -0.2, -0.1, 0, 0.08, 0.14],
  }),
  lavender: r('#a98ee0', {
    steps: 6,
    shadowHue: 275,
    lightHue: 330,
    lean: 0.8,
    lightness: [-0.3, -0.2, -0.1, 0, 0.09, 0.16],
  }),
  gold: r('#e8c24a', {
    steps: 6,
    shadowHue: 30,
    lightHue: 95,
    lean: 0.9,
    lightness: [-0.28, -0.19, -0.1, 0, 0.08, 0.15],
  }),
} as const;

export const BARK = r('#8a5a44', {
  steps: 6,
  shadowHue: 310,
  lightHue: 70,
  lean: 1.0,
  lightness: [-0.32, -0.21, -0.1, 0, 0.09, 0.17],
});
export const BIRCH = r('#e8e2dc', {
  steps: 6,
  shadowHue: 285,
  lightHue: 85,
  lean: 0.9,
  lightness: [-0.34, -0.22, -0.12, -0.05, 0, 0.04],
});

/** Flower and gem colors, each a short ramp with its own light and shadow. */
export const BLOOM = {
  pink: r('#f07aa8', { steps: 4 }),
  rose: r('#e04f7e', { steps: 4 }),
  lilac: r('#b88af0', { steps: 4 }),
  sky: r('#6cb4ff', { steps: 4 }),
  yellow: r('#ffd84a', { steps: 4 }),
  white: r('#fff6ec', { steps: 4, shadowHue: 290 }),
  coral: r('#ff8a5c', { steps: 4 }),
  teal: r('#46d3b8', { steps: 4 }),
} as const;

export const GEM = {
  ruby: r('#e8325a', { steps: 5 }),
  sapphire: r('#3a6cf0', { steps: 5 }),
  emerald: r('#2ec27a', { steps: 5 }),
  amethyst: r('#a455e8', { steps: 5 }),
  topaz: r('#ffb330', { steps: 5 }),
  diamond: r('#d6f4ff', { steps: 5, shadowHue: 250, lightness: [-0.2, -0.1, 0, 0.06, 0.1] }),
  gold: r('#f5c332', { steps: 6, shadowHue: 25, lightHue: 95, lightness: [-0.3, -0.2, -0.1, 0, 0.1, 0.2] }),
  silver: r('#c8cde0', { steps: 5, shadowHue: 265 }),
} as const;

export const outlineFor = (c: RGB): RGB => [Math.round(c[0] * 0.38), Math.round(c[1] * 0.34), Math.round(c[2] * 0.46)];
