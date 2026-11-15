import type { UnicornId } from '../../../shared/ids';
import { COLORS, type RGB } from '../../engine/color';

/**
 * What goes into the machine and what comes out. There are seven fruit, in the order of the
 * rainbow, and each comes out as a thing of its own colour: a cut stone in the apple machine and a
 * flower in the berry machine. Each also has its own note, so the seven in order are a scale that
 * goes up, and a child who feeds the fruit one after another plays a tune.
 */

export const FRUIT_IDS = ['apple', 'tomato', 'strawberry', 'carrot', 'pumpkin', 'cabbage', 'sky-berry'] as const;
export type FruitId = (typeof FRUIT_IDS)[number];

/** The shapes a flower is drawn in. */
export type Bloom = 'rose' | 'poppy' | 'daisy' | 'marigold' | 'sunflower' | 'pompom' | 'bell';

export interface Fruit {
  readonly id: FruitId;
  /** Its picture, cut from the produce page. */
  readonly sprite: string;
  /** The colour of what it comes out as. */
  readonly color: RGB;
  /** A paler colour, for the light in the middle of a flower and for glints. */
  readonly light: RGB;
  /** Which step of the pentatonic scale it sings, going up as the fruit go along the rainbow. */
  readonly step: number;
  readonly bloom: Bloom;
}

const fruit = (id: FruitId, color: RGB, light: RGB, step: number, bloom: Bloom): Fruit => ({
  id,
  sprite: `produce-${id}`,
  color,
  light,
  step,
  bloom,
});

export const FRUITS: Readonly<Record<FruitId, Fruit>> = {
  apple: fruit('apple', [232, 44, 74], [255, 150, 160], 0, 'rose'),
  tomato: fruit('tomato', [255, 98, 64], [255, 176, 140], 1, 'poppy'),
  strawberry: fruit('strawberry', [255, 104, 176], [255, 190, 224], 2, 'daisy'),
  carrot: fruit('carrot', [255, 150, 36], [255, 214, 140], 3, 'marigold'),
  pumpkin: fruit('pumpkin', [255, 200, 44], [255, 236, 150], 4, 'sunflower'),
  cabbage: fruit('cabbage', [70, 200, 116], [176, 244, 190], 5, 'pompom'),
  'sky-berry': fruit('sky-berry', [84, 140, 255], [176, 210, 255], 6, 'bell'),
};

/** The fruit each friend throws in when she is touched, so that each is a colour of her own. */
export const FRIEND_FRUIT: Readonly<Record<UnicornId, FruitId>> = {
  wildstar: 'pumpkin',
  leaf: 'cabbage',
  glacier: 'strawberry',
  river: 'sky-berry',
  cinder: 'carrot',
  storm: 'apple',
};

export const fruitAt = (i: number): Fruit =>
  FRUITS[FRUIT_IDS[((i % FRUIT_IDS.length) + FRUIT_IDS.length) % FRUIT_IDS.length]!]!;

/** What comes out of the machine of this look. */
export type Product = 'gem' | 'flower';

export const productOf = (look: string): Product => (look === 'berry-flower' ? 'flower' : 'gem');

/**
 * The colour of the machine's body in each look: teal for the stones and violet for the flowers.
 */
export interface Paint {
  readonly body: RGB;
  readonly bodyDark: RGB;
  readonly trim: RGB;
  readonly glass: RGB;
  /** The meadow behind it, from the sky above to the grass below. */
  readonly sky: readonly [RGB, RGB];
  readonly grass: readonly [RGB, RGB];
  readonly hill: RGB;
}

export const PAINTS: Readonly<Record<Product, Paint>> = {
  gem: {
    body: [44, 166, 170],
    bodyDark: [20, 96, 112],
    trim: [255, 208, 96],
    glass: [200, 244, 255],
    sky: [
      [104, 96, 196],
      [255, 190, 170],
    ],
    grass: [
      [96, 188, 120],
      [44, 118, 98],
    ],
    hill: [74, 142, 130],
  },
  flower: {
    body: [150, 94, 210],
    bodyDark: [84, 50, 140],
    trim: [255, 214, 120],
    glass: [255, 232, 250],
    sky: [
      [124, 100, 214],
      [255, 196, 206],
    ],
    grass: [
      [118, 200, 112],
      [52, 128, 84],
    ],
    hill: [112, 150, 160],
  },
};

/**
 * How many things in a row a fruit may be fed before the machine does something special by itself,
 * and the surprises it makes.
 */
export const SURPRISE_EVERY = 5;

/**
 * What comes out by surprise instead of a stone or a flower: a little creature that flies about the
 * workshop from then on.
 */
export interface Creature {
  readonly sprite: string;
  /** How long one turn of its flutter takes, so it is played at its own speed. */
  readonly scale: number;
}

export const CREATURES: Readonly<Record<Product, readonly Creature[]>> = {
  gem: [
    { sprite: 'dragonfly-sapphire-hover', scale: 1.5 },
    { sprite: 'butterfly-morpho-flutter', scale: 1.5 },
    { sprite: 'fairy-sky-fly', scale: 0.62 },
    { sprite: 'bird-blue-fly', scale: 1.3 },
  ],
  flower: [
    { sprite: 'butterfly-blossom-flutter', scale: 1.5 },
    { sprite: 'fairy-pink-fly', scale: 0.62 },
    { sprite: 'butterfly-monarch-flutter', scale: 1.5 },
    { sprite: 'butterfly-lilac-flutter', scale: 1.5 },
  ],
};

/** The colours of the lamps on the machine, chasing along as it works. */
export const LAMPS: readonly RGB[] = [COLORS.red, COLORS.amber, COLORS.gold, COLORS.mint, COLORS.sky];
