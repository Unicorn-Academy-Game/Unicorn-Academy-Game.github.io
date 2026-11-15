import type { Style } from '../../engine/band';
import { COLORS, type RGB } from '../../engine/color';
import { CANDY, NIGHT } from '../../styles';
import type { ShellKind } from '../shells';
import { type Scheme, scheme } from '../sky/looks';

/**
 * How the star cannon looks in each of its two colours: the night with a gold cannon that wakes
 * stars, and the dusk with a pink one that wakes hearts. Everything that differs between them is a
 * field here, and the game only asks.
 */
export interface Dress {
  /** What the sleepers are made like. */
  readonly figure: 'star' | 'heart';
  /** The sky from the top to the horizon. */
  readonly sky: readonly (readonly [number, RGB])[];
  /** The light along the horizon. */
  readonly horizon: RGB;
  /** The moon, or the low sun. */
  readonly orb: { readonly color: RGB; readonly kind: 'moon' | 'sun' };
  readonly cloud: readonly [RGB, RGB];
  /** Two rows of hills, far then near, each from its top colour to its bottom. */
  readonly hills: readonly [readonly [RGB, RGB], readonly [RGB, RGB]];
  readonly grass: readonly [RGB, RGB];
  readonly flowers: readonly RGB[];
  /** What a friend's colours are multiplied by to put her in the dark. */
  readonly dark: RGB;
  readonly asleep: { readonly body: RGB; readonly rim: RGB };
  readonly awake: { readonly body: RGB; readonly core: RGB; readonly rim: RGB; readonly glow: RGB };
  /** What the picture the stars make is filled with, at its top and at its bottom. */
  readonly pearl: readonly [RGB, RGB];
  /** The colours of the nightcaps, one for each star in turn. */
  readonly caps: readonly RGB[];
  /** The line drawn between two stars that are awake. */
  readonly line: RGB;
  readonly schemes: readonly Scheme[];
  readonly kinds: readonly ShellKind[];
  readonly cannon: {
    readonly body: readonly [RGB, RGB];
    readonly band: RGB;
    readonly wood: readonly [RGB, RGB];
    readonly wheel: RGB;
  };
  readonly style: Style;
}

const STAR: Dress = {
  figure: 'star',
  sky: [
    [0, [6, 8, 38]],
    [0.42, [22, 22, 82]],
    [0.78, [72, 48, 132]],
    [1, [160, 96, 152]],
  ],
  horizon: [255, 168, 140],
  orb: { color: [255, 240, 205], kind: 'moon' },
  cloud: [
    [88, 70, 146],
    [46, 36, 102],
  ],
  hills: [
    [
      [44, 36, 104],
      [26, 20, 68],
    ],
    [
      [32, 48, 96],
      [14, 26, 58],
    ],
  ],
  grass: [
    [40, 84, 100],
    [16, 42, 66],
  ],
  flowers: [
    [255, 226, 150],
    [255, 184, 222],
    [172, 222, 255],
  ],
  dark: [124, 114, 180],
  asleep: { body: [118, 134, 198], rim: [66, 78, 140] },
  awake: { body: [255, 214, 98], core: [255, 247, 196], rim: [255, 152, 56], glow: [255, 208, 110] },
  pearl: [
    [255, 252, 255],
    [208, 198, 246],
  ],
  caps: [
    [255, 150, 190],
    [150, 200, 255],
    [190, 152, 255],
    [150, 240, 202],
    [255, 202, 122],
  ],
  line: [255, 232, 160],
  schemes: [
    scheme([255, 205, 110], COLORS.gold, COLORS.amber, COLORS.cream),
    scheme([150, 200, 255], COLORS.sky, COLORS.blue, COLORS.white),
    scheme([255, 160, 210], COLORS.pink, COLORS.rose, COLORS.cream),
    scheme([150, 240, 210], COLORS.mint, COLORS.cyan, COLORS.white),
  ],
  kinds: ['star', 'ring', 'peony', 'double-ring', 'crescent', 'spiral'],
  cannon: {
    body: [
      [78, 92, 186],
      [30, 36, 100],
    ],
    band: [255, 214, 100],
    wood: [
      [196, 136, 80],
      [122, 78, 46],
    ],
    wheel: [255, 214, 100],
  },
  style: NIGHT,
};

const HEART: Dress = {
  figure: 'heart',
  sky: [
    [0, [46, 18, 88]],
    [0.4, [108, 42, 134]],
    [0.78, [222, 100, 142]],
    [1, [255, 178, 130]],
  ],
  horizon: [255, 196, 150],
  orb: { color: [255, 228, 192], kind: 'sun' },
  cloud: [
    [255, 176, 196],
    [192, 96, 154],
  ],
  hills: [
    [
      [152, 62, 134],
      [98, 38, 108],
    ],
    [
      [100, 42, 116],
      [60, 24, 84],
    ],
  ],
  grass: [
    [82, 56, 114],
    [46, 28, 74],
  ],
  flowers: [
    [255, 204, 228],
    [255, 238, 172],
    [255, 172, 202],
  ],
  dark: [182, 132, 176],
  asleep: { body: [192, 152, 204], rim: [142, 102, 164] },
  awake: { body: [255, 128, 172], core: [255, 228, 238], rim: [234, 66, 122], glow: [255, 152, 192] },
  pearl: [
    [255, 244, 248],
    [255, 176, 208],
  ],
  caps: [
    [255, 238, 172],
    [172, 222, 255],
    [202, 172, 255],
    [255, 192, 152],
    [172, 242, 212],
  ],
  line: [255, 216, 234],
  schemes: [
    scheme([255, 140, 190], COLORS.rose, COLORS.pink, COLORS.coral),
    scheme([255, 212, 162], COLORS.cream, COLORS.gold, COLORS.pink),
    scheme([204, 162, 255], COLORS.violet, COLORS.pink, COLORS.white),
    scheme([255, 170, 150], COLORS.coral, COLORS.amber, COLORS.cream),
  ],
  kinds: ['heart', 'flower', 'peony', 'smiley', 'butterfly', 'ring'],
  cannon: {
    body: [
      [255, 156, 200],
      [212, 78, 142],
    ],
    band: [255, 244, 214],
    wood: [
      [244, 206, 182],
      [176, 122, 104],
    ],
    wheel: [255, 244, 214],
  },
  style: CANDY,
};

const DRESSES: Readonly<Record<string, Dress>> = { star: STAR, heart: HEART };

export const dressOf = (look: string): Dress => DRESSES[look] ?? STAR;
