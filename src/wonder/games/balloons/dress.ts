import type { Style } from '../../engine/band';
import type { RGB } from '../../engine/color';
import type { VoiceName } from '../../sound';
import { DUSK, EVENING, PARTY } from '../../styles';

/**
 * How the balloon game looks and sounds in each of its three skies: a bright party in the park, a
 * golden evening with lanterns, and a blue dusk with the first stars. Everything that differs
 * between them is a field here, and the game only asks.
 */
export interface Dress {
  readonly name: 'party' | 'warm' | 'cool';
  /** The sky from the top to the horizon. */
  readonly sky: readonly (readonly [number, RGB])[];
  /** The light along the horizon. */
  readonly horizon: RGB;
  /** The sun or the moon, where it is as a share of the width and height, and how big. */
  readonly orb: {
    readonly kind: 'sun' | 'moon' | 'low-sun';
    readonly color: RGB;
    readonly x: number;
    readonly y: number;
    readonly r: number;
  };
  readonly cloud: readonly [RGB, RGB];
  /** Two rows of hills, far then near, each from its top colour to its bottom. */
  readonly hills: readonly [readonly [RGB, RGB], readonly [RGB, RGB]];
  readonly grass: readonly [RGB, RGB];
  readonly flowers: readonly RGB[];
  /** What a friend's colours are multiplied by to be in this light. */
  readonly tint: RGB;
  /** The string of a balloon, which has to show against this sky. */
  readonly string: RGB;
  /** What hangs along the strand between the two poles. */
  readonly strand: 'bunting' | 'lanterns' | 'lights';
  /** The colours of what drifts in the air, and how much of it there is. */
  readonly motes: {
    readonly colors: readonly RGB[];
    readonly kind: 'confetti' | 'glints' | 'fireflies';
    readonly rate: number;
  };
  /** Whether stars come out. */
  readonly stars: number;
  readonly style: Style;
  /** The instrument the player's notes are played on. */
  readonly voice: VoiceName;
  /** How loud the player's note is next to the others, from the instrument's own level. */
  readonly voiceGain: number;
}

const PARTY_DRESS: Dress = {
  name: 'party',
  sky: [
    [0, [74, 182, 255]],
    [0.5, [138, 214, 255]],
    [1, [226, 248, 255]],
  ],
  horizon: [255, 246, 206],
  orb: { kind: 'sun', color: [255, 224, 108], x: 0.8, y: 0.3, r: 33 },
  cloud: [
    [255, 255, 255],
    [208, 230, 255],
  ],
  hills: [
    [
      [132, 218, 178],
      [86, 190, 146],
    ],
    [
      [104, 206, 112],
      [56, 164, 90],
    ],
  ],
  grass: [
    [116, 216, 96],
    [58, 162, 74],
  ],
  flowers: [
    [255, 120, 160],
    [255, 226, 90],
    [255, 255, 255],
    [196, 156, 255],
  ],
  tint: [255, 255, 255],
  string: [255, 255, 255],
  strand: 'bunting',
  motes: {
    colors: [
      [255, 110, 150],
      [255, 214, 70],
      [90, 190, 255],
      [150, 230, 120],
      [190, 140, 255],
    ],
    kind: 'confetti',
    rate: 1.1,
  },
  stars: 0,
  style: PARTY,
  voice: 'marimba',
  voiceGain: 1,
};

const WARM_DRESS: Dress = {
  name: 'warm',
  sky: [
    [0, [112, 96, 206]],
    [0.34, [214, 124, 192]],
    [0.7, [255, 172, 150]],
    [1, [255, 224, 164]],
  ],
  horizon: [255, 206, 126],
  orb: { kind: 'low-sun', color: [255, 216, 120], x: 0.7, y: 0.66, r: 46 },
  cloud: [
    [255, 222, 208],
    [220, 134, 176],
  ],
  hills: [
    [
      [194, 108, 156],
      [136, 74, 134],
    ],
    [
      [100, 140, 100],
      [54, 96, 84],
    ],
  ],
  grass: [
    [112, 152, 92],
    [62, 102, 78],
  ],
  flowers: [
    [255, 204, 124],
    [255, 150, 172],
    [255, 238, 196],
  ],
  tint: [255, 228, 204],
  string: [255, 250, 236],
  strand: 'lanterns',
  motes: {
    colors: [
      [255, 226, 140],
      [255, 190, 110],
      [255, 244, 200],
    ],
    kind: 'glints',
    rate: 0.8,
  },
  stars: 0,
  style: EVENING,
  voice: 'harp',
  voiceGain: 1.05,
};

const COOL_DRESS: Dress = {
  name: 'cool',
  sky: [
    [0, [32, 36, 112]],
    [0.4, [74, 72, 172]],
    [0.75, [152, 112, 204]],
    [1, [238, 172, 202]],
  ],
  horizon: [255, 172, 204],
  orb: { kind: 'moon', color: [255, 244, 214], x: 0.2, y: 0.3, r: 27 },
  cloud: [
    [202, 192, 240],
    [108, 100, 180],
  ],
  hills: [
    [
      [74, 88, 174],
      [44, 54, 124],
    ],
    [
      [46, 96, 132],
      [22, 54, 88],
    ],
  ],
  grass: [
    [54, 116, 134],
    [26, 68, 94],
  ],
  flowers: [
    [190, 232, 255],
    [255, 222, 250],
    [172, 255, 232],
  ],
  tint: [204, 212, 246],
  string: [236, 240, 255],
  strand: 'lights',
  motes: {
    colors: [
      [210, 255, 150],
      [170, 255, 220],
      [255, 244, 170],
    ],
    kind: 'fireflies',
    rate: 0.9,
  },
  stars: 1,
  style: DUSK,
  voice: 'glass',
  voiceGain: 1,
};

const DRESSES: Readonly<Record<string, Dress>> = { party: PARTY_DRESS, warm: WARM_DRESS, cool: COOL_DRESS };

export const dressOf = (look: string): Dress => DRESSES[look] ?? PARTY_DRESS;
