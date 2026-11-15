import type { UnicornId } from '../../../shared/ids';
import { COLORS, type RGB } from '../../engine/color';
import type { ShellKind } from '../shells';

/**
 * A shell's colours, from the first to the last along its `tone`, and the colour of the light it
 * throws on the sky.
 */
export interface Scheme {
  readonly colors: readonly RGB[];
  readonly flash: RGB;
}

export const scheme = (flash: RGB, ...colors: RGB[]): Scheme => ({ flash, colors });

/**
 * One of the three nights: how the sky, the lake and the shore are coloured, and what its shells
 * are made of.
 */
export interface Look {
  readonly sky: readonly (readonly [number, RGB])[];
  /** The light of the town beyond the hills. */
  readonly glow: RGB;
  readonly moon: RGB;
  readonly water: readonly [RGB, RGB];
  readonly hills: readonly [RGB, RGB];
  readonly cloud: readonly [RGB, RGB];
  readonly palace: RGB;
  readonly window: RGB;
  /** What a friend's colours are multiplied by to put her in the dark. */
  readonly dark: RGB;
  readonly schemes: readonly Scheme[];
  readonly kinds: readonly ShellKind[];
}

const LOOKS: Readonly<Record<string, Look>> = {
  red: {
    sky: [
      [0, [8, 6, 34]],
      [0.42, [38, 14, 70]],
      [0.78, [122, 40, 104]],
      [1, [226, 100, 120]],
    ],
    glow: [255, 120, 130],
    moon: [255, 236, 214],
    water: [
      [44, 22, 78],
      [14, 8, 38],
    ],
    hills: [
      [44, 20, 74],
      [22, 10, 44],
    ],
    cloud: [
      [96, 54, 120],
      [50, 24, 80],
    ],
    palace: [26, 12, 46],
    window: [255, 214, 130],
    dark: [128, 104, 170],
    schemes: [
      scheme([255, 120, 150], COLORS.rose, COLORS.red, COLORS.coral),
      scheme([255, 190, 110], COLORS.gold, COLORS.amber, COLORS.coral),
      scheme([255, 150, 220], COLORS.pink, COLORS.magenta, COLORS.rose),
      scheme([255, 220, 160], COLORS.cream, COLORS.gold, COLORS.pink),
    ],
    kinds: ['peony', 'heart', 'ring', 'flower', 'spiral', 'butterfly', 'crescent', 'star', 'smiley', 'double-ring'],
  },
  blue: {
    sky: [
      [0, [3, 8, 32]],
      [0.4, [8, 36, 94]],
      [0.78, [26, 90, 156]],
      [1, [96, 190, 224]],
    ],
    glow: [110, 190, 255],
    moon: [226, 240, 255],
    water: [
      [16, 52, 108],
      [6, 20, 58],
    ],
    hills: [
      [10, 38, 84],
      [6, 20, 52],
    ],
    cloud: [
      [46, 92, 152],
      [22, 48, 100],
    ],
    palace: [8, 24, 56],
    window: [255, 238, 170],
    dark: [104, 130, 190],
    schemes: [
      scheme([120, 190, 255], COLORS.sky, COLORS.blue, COLORS.cyan),
      scheme([190, 220, 255], COLORS.white, COLORS.sky, COLORS.blue),
      scheme([170, 150, 255], COLORS.violet, COLORS.indigo, COLORS.sky),
      scheme([150, 240, 220], COLORS.mint, COLORS.cyan, COLORS.white),
    ],
    kinds: ['ring', 'double-ring', 'star', 'crescent', 'rainbow', 'spiral', 'peony', 'butterfly', 'flower', 'heart'],
  },
  gold: {
    sky: [
      [0, [16, 6, 30]],
      [0.4, [44, 16, 72]],
      [0.78, [112, 52, 96]],
      [1, [236, 150, 84]],
    ],
    glow: [255, 180, 90],
    moon: [255, 244, 210],
    water: [
      [70, 34, 82],
      [24, 10, 44],
    ],
    hills: [
      [58, 24, 78],
      [28, 12, 48],
    ],
    cloud: [
      [112, 68, 122],
      [60, 30, 86],
    ],
    palace: [34, 14, 50],
    window: [255, 224, 140],
    dark: [140, 110, 160],
    schemes: [
      scheme([255, 200, 100], COLORS.gold, COLORS.amber, COLORS.cream),
      scheme([255, 170, 90], COLORS.amber, COLORS.orange, COLORS.gold),
      scheme([255, 220, 170], COLORS.cream, COLORS.gold, COLORS.pink),
      scheme([255, 150, 190], COLORS.rose, COLORS.gold, COLORS.cream),
    ],
    kinds: ['willow', 'crackle', 'sun', 'palm', 'heart', 'star', 'peony', 'rainbow', 'ring', 'butterfly'],
  },
};

export const lookOf = (name: string): Look => LOOKS[name] ?? LOOKS.red!;

/** A scheme of golds and creams, for the finale's willows. */
export const GOLDEN = scheme([255, 205, 110], COLORS.gold, COLORS.amber, COLORS.cream);

/** What each friend's own magic looks like in the sky: her shape and her colours. */
export const MAGIC: Readonly<Record<UnicornId, { readonly scheme: Scheme; readonly kind: ShellKind }>> = {
  wildstar: { scheme: scheme([255, 230, 150], COLORS.gold, COLORS.cream, COLORS.white), kind: 'star' },
  leaf: { scheme: scheme([150, 255, 170], COLORS.green, COLORS.lime, COLORS.pink), kind: 'flower' },
  glacier: { scheme: scheme([180, 240, 255], COLORS.white, COLORS.cyan, COLORS.sky), kind: 'double-ring' },
  river: { scheme: scheme([120, 200, 255], COLORS.blue, COLORS.cyan, COLORS.white), kind: 'ring' },
  cinder: { scheme: scheme([255, 160, 90], COLORS.orange, COLORS.red, COLORS.gold), kind: 'sun' },
  storm: { scheme: scheme([200, 170, 255], COLORS.violet, COLORS.gold, COLORS.white), kind: 'spiral' },
};

/**
 * How each kind of shell moves. Every spark in a shell has the same drag, so a shape grows without
 * changing and then holds for a moment, the way a drawing in the air should for a child to see what
 * it is.
 */
export interface Physics {
  /** Per second, the share of its speed a spark loses. */
  readonly drag: number;
  readonly gravity: number;
  /** Seconds a spark lives, from the least to the most. */
  readonly life: readonly [number, number];
  /** How wide a spark is drawn, before the size every spark shares. */
  readonly size: number;
  /** Seconds between the embers a spark drops. 0 drops none. */
  readonly trail: number;
  /** How many sparks, before power and the device's density. */
  readonly count: number;
  /** Seconds the shape takes to grow to full size. */
  readonly grow: number;
  /** The share of its life a spark stays bright. */
  readonly hold: number;
  /** The share of sparks that twinkle. */
  readonly twinkle: number;
  /** Seconds of its own motion drawn behind a spark as a streak. */
  readonly tail: number;
  /**
   * How far toward white a spark starts, from 0 to 1. A rainbow starts barely lightened so its
   * colours stay true.
   */
  readonly lift: number;
  /**
   * How many times a spark's width its halo is. Sparks that sit close together need a small one so
   * their colours stay apart.
   */
  readonly halo: number;
}

const shape = (
  drag: number,
  gravity: number,
  life: readonly [number, number],
  size: number,
  count: number,
  hold: number,
  rest: Partial<Physics> = {},
): Physics => ({
  drag,
  gravity,
  life,
  size,
  count,
  hold,
  trail: 0,
  grow: 1,
  twinkle: 0.35,
  tail: 0.09,
  lift: 0.2,
  halo: 2.2,
  ...rest,
});

export const PHYSICS: Readonly<Record<ShellKind, Physics>> = {
  peony: shape(2.5, 10, [2.0, 2.7], 6, 150, 0.55),
  ring: shape(2.8, 8, [2.2, 2.7], 6.4, 110, 0.62),
  'double-ring': shape(2.8, 8, [2.3, 2.8], 6, 160, 0.62),
  heart: shape(3, 6, [2.5, 3], 6.4, 150, 0.7),
  star: shape(3, 6, [2.5, 3], 6.4, 160, 0.7),
  butterfly: shape(3, 5, [2.6, 3.1], 5.6, 210, 0.7, { grow: 1.1 }),
  flower: shape(3, 6, [2.5, 3], 6, 170, 0.7),
  smiley: shape(3, 6, [2.6, 3.1], 6, 190, 0.72),
  spiral: shape(2.6, 8, [2.6, 3.2], 6, 150, 0.6),
  crescent: shape(3, 6, [2.5, 3], 6.4, 130, 0.7),
  sun: shape(3, 6, [2.5, 3], 6, 170, 0.7),
  rainbow: shape(3, 4, [2.6, 3.2], 4.6, 180, 0.72, { lift: 0.04, halo: 1.7 }),
  willow: shape(1.5, 40, [3.2, 4.2], 6, 64, 0.3, { trail: 0.14, grow: 1.1, twinkle: 0.2, tail: 1.5, lift: 0.18 }),
  palm: shape(1.9, 44, [2.6, 3.2], 6.4, 70, 0.3, { trail: 0.1, twinkle: 0.2, tail: 1.1, lift: 0.25 }),
  crackle: shape(2.1, 16, [1.3, 1.9], 5.4, 100, 0.3, { twinkle: 0.9, tail: 0 }),
};
