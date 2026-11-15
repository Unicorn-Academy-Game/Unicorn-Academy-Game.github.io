/**
 * What a child gathers: the fruit and vegetables of the orchard and the farm, and the gems of the
 * crystal cave. Each kind is one picture and one word, with an id of its own so it can be read out
 * and spelled later. A tree, a bed or a cluster of gems hands them out without end, and the stable
 * keeps the food in crates for the herd. Nothing here is ever used up.
 */
export const FOOD_IDS = ['apple', 'carrot', 'sky-berry', 'tomato', 'strawberry', 'pumpkin', 'cabbage'] as const;
export type FoodId = (typeof FOOD_IDS)[number];

/** The gems that grow in the cave. The rainbow gem is the one that never keeps a colour. */
export const GEM_IDS = [
  'ruby',
  'topaz',
  'emerald',
  'sapphire',
  'amethyst',
  'diamond',
  'opal',
  'jade',
  'onyx',
  'rainbow',
] as const;
export type GemId = (typeof GEM_IDS)[number];

/** The kinds in the order the basket shows them: the food first, then the gems. */
export const PRODUCE_IDS = [...FOOD_IDS, ...GEM_IDS] as const;
export type ProduceId = (typeof PRODUCE_IDS)[number];

export interface ProduceDef {
  /** A content id, so the word can be read out and spelled later. */
  id: string;
  word: string;
  /** The word for more than one, which is not always the word and an s. */
  plural: string;
  /** Whether it grows on a tree, in a bed or out of a rock, which is where a child finds it. */
  grows: 'tree' | 'bed' | 'rock';
  /** A colour that stands for it in the basket, as a 0xRRGGBB number. */
  tint: number;
  /**
   * The picture of one, in the produce bundle. The cut gems of the treasure house are the pictures
   * of the gems that match them.
   */
  sprite: string;
  /**
   * How many pixels above the ground the middle of the picture is drawn when the piece lies there.
   * Food is drawn to stand on its anchor and needs none. A gem is drawn round its middle and hangs
   * a little above the floor, with its shadow under it.
   */
  rest: number;
}

const food = (id: FoodId, word: string, plural: string, grows: 'tree' | 'bed', tint: number): ProduceDef => ({
  id: `produce.${id}`,
  word,
  plural,
  grows,
  tint,
  sprite: `produce-${id}`,
  rest: 0,
});
const gem = (id: GemId, word: string, plural: string, tint: number, sprite: string, rest: number): ProduceDef => ({
  id: `produce.${id}`,
  word,
  plural,
  grows: 'rock',
  tint,
  sprite,
  rest,
});

export const PRODUCE: Readonly<Record<ProduceId, ProduceDef>> = {
  apple: food('apple', 'apple', 'apples', 'tree', 0xe8403f),
  carrot: food('carrot', 'carrot', 'carrots', 'bed', 0xf2862b),
  'sky-berry': food('sky-berry', 'sky berry', 'sky berries', 'tree', 0x6fa8ff),
  tomato: food('tomato', 'tomato', 'tomatoes', 'bed', 0xf0482f),
  strawberry: food('strawberry', 'strawberry', 'strawberries', 'bed', 0xf0457a),
  pumpkin: food('pumpkin', 'pumpkin', 'pumpkins', 'bed', 0xf08a24),
  cabbage: food('cabbage', 'cabbage', 'cabbages', 'bed', 0x7fcf6a),
  ruby: gem('ruby', 'ruby', 'rubies', 0xe0345a, 'rain-ruby', 28),
  topaz: gem('topaz', 'topaz', 'topazes', 0xf2a516, 'rain-topaz', 28),
  emerald: gem('emerald', 'emerald', 'emeralds', 0x27c26a, 'rain-emerald', 28),
  sapphire: gem('sapphire', 'sapphire', 'sapphires', 0x3a6cf0, 'rain-sapphire', 28),
  amethyst: gem('amethyst', 'amethyst', 'amethysts', 0xa35be0, 'rain-amethyst', 28),
  diamond: gem('diamond', 'diamond', 'diamonds', 0xbfe6ff, 'rain-diamond', 28),
  opal: gem('opal', 'opal', 'opals', 0xdcd2f0, 'word-opal', 26),
  jade: gem('jade', 'jade', 'jades', 0x3fb58a, 'word-jade', 32),
  onyx: gem('onyx', 'onyx', 'onyxes', 0x4a4560, 'word-onyx', 27),
  rainbow: gem('rainbow', 'rainbow gem', 'rainbow gems', 0xff7ad9, 'produce-rainbow', 28),
};

/** The picture of one, in the produce bundle. */
export const produceSprite = (id: ProduceId): string => PRODUCE[id].sprite;
