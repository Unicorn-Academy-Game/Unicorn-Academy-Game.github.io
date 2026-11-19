import type { UnicornId } from '../shared/ids';
import { UNICORN_IDS } from '../shared/ids';
import type { LifeKind } from '../shared/life';
import type { EffectId } from './activities';
import { SPELLS } from './magic';
import { UNICORN_DEFS } from './unicorns';

/**
 * Everything they can be asked to spell, and where in the world each word comes from. This table is
 * the whole curriculum. The engine reads it and nothing else knows a word. To teach them a new
 * word, add an entry below. To bring words to a new place, add a page to the book. A test checks
 * that every picture exists, that every thing named is in the game, and that every word can be
 * reached in a real place, so a slip here is caught when the tests run and not by a child.
 */

/**
 * A thing in the world that has a name the player can learn, by the content id it already has.
 * Creatures and friends are tapped, and so are the props named here: the fruit trees and beds, the
 * treasure, and the things that answer a tap with a shimmer, like the throne in the palace and the
 * orchid in the sky garden.
 */
export type SubjectId = `life.${LifeKind}` | `unicorn.${UnicornId}` | `prop.${string}`;

export const lifeSubject = (kind: LifeKind): SubjectId => `life.${kind}`;
export const unicornSubject = (id: UnicornId): SubjectId => `unicorn.${id}`;
export const propSubject = (definitionId: string): SubjectId => `prop.${definitionId}`;

/** The bundles that load with the unicorns, so a picture cut from one is there in every place. */
export const PICTURE_BUNDLES = ['life', 'produce'] as const;
type PictureBundle = (typeof PICTURE_BUNDLES)[number];

/** What a word looks like: a picture the world already draws, so the player knows it at once. */
export type Picture =
  /** The first picture of a sprite, from a bundle that loads with the unicorns. */
  | { kind: 'sprite'; bundle: PictureBundle; sprite: string }
  /** A unicorn's portrait. */
  | { kind: 'portrait'; unicorn: UnicornId };

export interface WordDef {
  picture: Picture;
  /**
   * The things in the world that give this word. A thing that gives several offers the easiest
   * first.
   */
  subjects: readonly SubjectId[];
  /** What shimmers where the thing stands when the player has spelled it. */
  celebrate: EffectId;
}

const sprite = (bundle: PictureBundle, name: string): Picture => ({ kind: 'sprite', bundle, sprite: name });
const portrait = (unicorn: UnicornId): Picture => ({ kind: 'portrait', unicorn });

/** A creature that lives in the world. Its word is what a child calls it. */
const creature = (kind: LifeKind, picture: string, celebrate: EffectId): WordDef => ({
  picture: sprite('life', picture),
  subjects: [lifeSubject(kind)],
  celebrate,
});

/** Something that grows. Its trees and beds let it fall when the player has spelled it. */
const crop = (picture: string, props: readonly string[]): WordDef => ({
  picture: sprite('produce', picture),
  subjects: props.map(propSubject),
  celebrate: 'sparkle',
});

/**
 * A heap of something in the treasure house, and for a gem the cluster it grows in, in the cave.
 */
const treasure = (picture: string, props: readonly string[], celebrate: EffectId = 'treasure-sparkle'): WordDef => ({
  picture: sprite('produce', picture),
  subjects: props.map(propSubject),
  celebrate,
});

/** A friend, whose own magic is what celebrates her name. */
const friend = (id: UnicornId): WordDef => ({
  picture: portrait(id),
  subjects: [unicornSubject(id)],
  celebrate: SPELLS[UNICORN_DEFS[id].magic].burst,
});

/**
 * What a word that has a picture drawn for it alone is told by: the things that give it, and what
 * shimmers when it is spelled.
 */
interface Thing {
  subjects: readonly SubjectId[];
  celebrate: EffectId;
}

const thing = (celebrate: EffectId, ...subjects: readonly SubjectId[]): Thing => ({ subjects, celebrate });

/**
 * The words that are not a creature, a crop, a gem or a friend, each with a picture drawn for it.
 * They are in the order that breaks a tie, so of two words as hard as each other the one written
 * first is offered first. A thing that gives several offers the shortest first, as the tables above
 * do.
 */
const things = {
  // What the creatures have and make
  nest: thing('pip-sparkle', 'life.bird'),
  egg: thing('pip-sparkle', 'life.bird'),
  wing: thing('pip-sparkle', 'life.bird', 'life.butterfly'),
  feather: thing('pip-sparkle', 'life.bird'),
  clover: thing('pip-hearts', 'life.bunny'),
  shell: thing('pip-sparkle', 'life.snail', 'prop.dig-spot'),
  hive: thing('pip-sparkle', 'life.bee'),
  honey: thing('pip-sparkle', 'life.bee'),
  // The water the creatures live in
  pond: thing('water-burst', 'life.frog', 'life.duck', 'life.fish'),
  lily: thing('bloom', 'life.frog'),
  fin: thing('water-burst', 'life.fish'),
  wave: thing('splash', 'life.fish'),
  splash: thing('splash', 'life.duck'),
  puddle: thing('splash', 'life.frog', 'life.duck'),
  bubble: thing('bubbles', 'life.dragonfly'),
  // The fairy's magic
  wand: thing('fairy-dust', 'life.fairy', 'prop.crystal-ball'),
  dust: thing('fairy-dust', 'life.fairy'),
  wish: thing('light-burst', 'life.fairy', 'prop.crystal-ball'),
  potion: thing('bubbles', 'life.fairy', 'prop.witch-cauldron'),
  // The palace
  throne: thing('light-burst', 'prop.throne'),
  chair: thing('sparkle', 'prop.throne', 'prop.armchair'),
  table: thing('hearts', 'prop.banquet-table', 'prop.cookie-table'),
  cake: thing('hearts', 'prop.banquet-table'),
  harp: thing('fairy-dust', 'prop.harp'),
  music: thing('fairy-dust', 'prop.harp', 'prop.cave-chimes', 'prop.disco-light'),
  crown: thing('treasure-sparkle', 'prop.crown-stand'),
  jewel: thing('gem-burst', 'prop.crown-stand', 'prop.sky-planter-jewel', 'prop.diamond-vase'),
  book: thing('fairy-dust', 'prop.bookcase'),
  shelf: thing('fairy-dust', 'prop.bookcase', 'prop.toy-shelf'),
  bed: thing('cloud', 'prop.canopy-bed', 'prop.nap-bed', 'prop.cave-bed'),
  pillow: thing('cloud', 'prop.canopy-bed', 'prop.nap-bed', 'prop.cave-bed'),
  // The Spooky Manor
  lantern: thing('embers', 'prop.jack-o-lantern'),
  candle: thing('embers', 'prop.jack-o-lantern'),
  flame: thing('embers', 'prop.jack-o-lantern', 'prop.cabin-hearth'),
  chandelier: thing('sparkle', 'prop.chandelier', 'prop.manor-chandelier'),
  moon: thing('mote', 'prop.moon-window'),
  bat: thing('mote', 'prop.moon-window'),
  cloud: thing('cloud', 'prop.moon-window'),
  // Quoted so the layer test does not take it for the browser's `window`.
  'window': thing('mote', 'prop.moon-window'),
  flower: thing('bloom', 'prop.flower-wall', 'prop.flower-vase'),
  daisy: thing('bloom', 'prop.flower-wall', 'prop.flower-vase'),
  rose: thing('bloom', 'prop.flower-wall', 'prop.flower-vase'),
  petal: thing('bloom', 'prop.flower-wall', 'prop.flower-vase'),
  // The Sky Garden
  orchid: thing('fairy-dust', 'prop.sky-orchid'),
  tulip: thing('treasure-sparkle', 'prop.sky-tulips-crystal', 'prop.flower-vase'),
  lotus: thing('water-burst', 'prop.sky-fountain-lotus'),
  fountain: thing('water-burst', 'prop.sky-fountain-lotus'),
  bonsai: thing('leaf-burst', 'prop.sky-bonsai-jade'),
  tree: thing('leaf-burst', 'prop.sky-bonsai-jade'),
  vase: thing('bloom', 'prop.sky-urn-gold', 'prop.flower-vase', 'prop.diamond-vase'),
  seed: thing('gem-burst', 'prop.sky-planter-jewel'),
  vine: thing('leaf-burst', 'prop.sky-hanging-garden'),
  basket: thing('bloom', 'prop.sky-hanging-garden'),
  // The stable
  horn: thing('hearts', 'prop.boxed-unicorn'),
  hoof: thing('hearts', 'prop.boxed-unicorn'),
  heart: thing('hearts', 'prop.boxed-unicorn', 'prop.heart-crystal'),
  hay: thing('hearts', 'prop.boxed-unicorn'),
  ribbon: thing('hearts', 'prop.boxed-unicorn'),
  // The treasure house
  opal: thing('gem-burst', 'prop.opal-table', 'prop.opal-cluster'),
  pearl: thing('gem-burst', 'prop.pearl-table', 'prop.clam'),
  jade: thing('gem-burst', 'prop.jade-table', 'prop.jade-cluster'),
  onyx: thing('gem-burst', 'prop.onyx-table', 'prop.onyx-cluster'),
  crystal: thing('gem-burst', 'prop.crystal-table', 'prop.rainbow-cluster', 'prop.sleeping-crystals'),
  ring: thing('gem-burst', 'prop.ring-table'),
  sack: thing('treasure-sparkle', 'prop.sack-pile', 'prop.santa-sack'),
  cash: thing('treasure-sparkle', 'prop.cash-desk'),
  // The beach
  castle: thing('pip-sparkle', 'prop.sand-castle'),
  flag: thing('pip-sparkle', 'prop.sand-castle'),
  tower: thing('light-burst', 'prop.sand-castle'),
  bucket: thing('splash', 'prop.sand-castle'),
  spade: thing('pip-sparkle', 'prop.sand-castle'),
  seashell: thing('pip-sparkle', 'prop.seashell'),
  scallop: thing('pip-hearts', 'prop.seashell'),
  lighthouse: thing('light-burst', 'prop.lighthouse'),
  boat: thing('splash', 'prop.lighthouse'),
  ship: thing('water-burst', 'prop.lighthouse'),
  sail: thing('cloud', 'prop.lighthouse'),
  anchor: thing('water-burst', 'prop.lighthouse'),
  gull: thing('cloud', 'prop.lighthouse'),
  // The magic river
  fern: thing('leaf-burst', 'prop.glitter-plant'),
  moss: thing('leaf-burst', 'prop.glitter-plant'),
  reed: thing('leaf-burst', 'prop.glitter-plant'),
  ivy: thing('leaf-burst', 'prop.glitter-plant'),
  willow: thing('glitter', 'prop.glitter-tree'),
  maple: thing('leaf-burst', 'prop.glitter-tree'),
  birch: thing('leaf-burst', 'prop.glitter-tree'),
  acorn: thing('leaf-burst', 'prop.glitter-tree'),
  // The Magic Hall
  charm: thing('fairy-dust', 'prop.spell-book'),
  scroll: thing('fairy-dust', 'prop.spell-book'),
  quill: thing('pip-sparkle', 'prop.spell-book'),
  ink: thing('mote', 'prop.spell-book'),
  star: thing('light-burst', 'prop.star-globe'),
  sun: thing('light-burst', 'prop.star-globe'),
  planet: thing('gem-burst', 'prop.star-globe'),
  comet: thing('sparkle', 'prop.star-globe'),
  glow: thing('light-burst', 'prop.floating-candles'),
  lamp: thing('sparkle', 'prop.floating-candles'),
  torch: thing('embers', 'prop.floating-candles'),
  spark: thing('sparkle', 'prop.floating-candles'),
  brew: thing('bubbles', 'prop.hall-cauldron'),
  spoon: thing('bubbles', 'prop.hall-cauldron'),
  steam: thing('cloud', 'prop.hall-cauldron'),
  water: thing('water-burst', 'prop.hall-fountain'),
  drop: thing('splash', 'prop.hall-fountain'),
  stream: thing('water-burst', 'prop.hall-fountain'),
  glass: thing('sparkle', 'prop.hall-chandelier'),
  prism: thing('rainbow-arc', 'prop.hall-chandelier'),
  wizard: thing('fairy-dust', 'prop.spell-circle'),
  witch: thing('fairy-dust', 'prop.spell-circle'),
  magic: thing('rainbow-arc', 'prop.spell-circle'),
  rune: thing('light-burst', 'prop.spell-circle'),
  cape: thing('hearts', 'prop.spell-circle'),
  hat: thing('fairy-dust', 'prop.spell-circle'),
  owl: thing('mote', 'prop.spell-circle'),
  broom: thing('fairy-dust', 'prop.spell-circle'),
  // The crystal cave and the witch's hut
  pillar: thing('lightning-burst', 'prop.storm-pillar'),
  thunder: thing('lightning-burst', 'prop.storm-pillar'),
  pool: thing('water-burst', 'prop.glow-pool'),
  ripple: thing('splash', 'prop.glow-pool'),
  chime: thing('sparkle', 'prop.cave-chimes'),
  bell: thing('gem-burst', 'prop.cave-chimes'),
  jar: thing('sparkle', 'prop.jar-shelf'),
  bottle: thing('bubbles', 'prop.jar-shelf'),
  cauldron: thing('bubbles', 'prop.witch-cauldron'),
  // Santa's grove
  santa: thing('hearts', 'prop.santa-sack'),
  elf: thing('confetti', 'prop.toy-bench'),
  sleigh: thing('cloud', 'prop.reindeer'),
  sled: thing('ice-burst', 'prop.snow-pile'),
  reindeer: thing('pip-hearts', 'prop.reindeer'),
  antler: thing('pip-sparkle', 'prop.reindeer'),
  snow: thing('ice-burst', 'prop.snow-pile'),
  snowflake: thing('ice-flower', 'prop.snow-pile'),
  snowball: thing('ice-burst', 'prop.snow-pile'),
  igloo: thing('ice-burst', 'prop.snow-pile'),
  icicle: thing('ice-flower', 'prop.snow-pile'),
  snowman: thing('ice-burst', 'prop.snowman'),
  scarf: thing('hearts', 'prop.snowman'),
  mitten: thing('hearts', 'prop.snowman'),
  boot: thing('bounce-puff', 'prop.snowman'),
  coat: thing('hearts', 'prop.snowman'),
  present: thing('confetti', 'prop.present'),
  gift: thing('confetti', 'prop.present'),
  bow: thing('treasure-sparkle', 'prop.present'),
  tag: thing('sparkle', 'prop.present'),
  toy: thing('bounce-puff', 'prop.present', 'prop.toy-shelf', 'prop.toy-bench'),
  teddy: thing('hearts', 'prop.present', 'prop.toy-shelf'),
  drum: thing('music-notes', 'prop.present'),
  train: thing('cloud', 'prop.present', 'prop.toy-bench'),
  doll: thing('hearts', 'prop.present', 'prop.toy-shelf'),
  kite: thing('balloons-away', 'prop.present'),
  robot: thing('screen-wake', 'prop.present', 'prop.toy-bench'),
  candy: thing('confetti', 'prop.candy-lamp'),
  cane: thing('sparkle', 'prop.candy-lamp'),
  mint: thing('ice-flower', 'prop.candy-lamp'),
  cocoa: thing('cloud', 'prop.candy-lamp'),
  bauble: thing('gem-burst', 'prop.room-tree'),
  tinsel: thing('glitter', 'prop.room-tree'),
  garland: thing('leaf-burst', 'prop.room-tree'),
  wreath: thing('leaf-burst', 'prop.cabin-hearth'),
  stocking: thing('hearts', 'prop.cabin-hearth'),
  // The dining room and the tea room
  plate: thing('sparkle', 'prop.banquet-table', 'prop.cookie-table'),
  fork: thing('sparkle', 'prop.banquet-table'),
  knife: thing('sparkle', 'prop.banquet-table'),
  bowl: thing('cloud', 'prop.banquet-table'),
  soup: thing('cloud', 'prop.banquet-table'),
  bread: thing('hearts', 'prop.banquet-table'),
  cheese: thing('pip-sparkle', 'prop.banquet-table'),
  pie: thing('hearts', 'prop.banquet-table'),
  teapot: thing('cloud', 'prop.banquet-table'),
  teacup: thing('cloud', 'prop.banquet-table'),
  saucer: thing('sparkle', 'prop.banquet-table'),
  sugar: thing('sparkle', 'prop.banquet-table'),
  lemon: thing('bubbles', 'prop.banquet-table'),
  scone: thing('hearts', 'prop.banquet-table'),
  jam: thing('hearts', 'prop.banquet-table'),
  cookie: thing('hearts', 'prop.banquet-table', 'prop.cookie-table'),
  // The library and the music room
  mail: thing('fairy-dust', 'prop.bookcase'),
  page: thing('fairy-dust', 'prop.bookcase'),
  story: thing('fairy-dust', 'prop.bookcase'),
  paper: thing('fairy-dust', 'prop.bookcase'),
  pen: thing('pip-sparkle', 'prop.bookcase'),
  desk: thing('sparkle', 'prop.bookcase'),
  map: thing('light-burst', 'prop.bookcase'),
  globe: thing('light-burst', 'prop.bookcase'),
  song: thing('music-notes', 'prop.harp'),
  note: thing('music-notes', 'prop.harp'),
  flute: thing('music-notes', 'prop.harp'),
  violin: thing('music-notes', 'prop.harp'),
  cello: thing('music-notes', 'prop.harp'),
  piano: thing('music-notes', 'prop.harp'),
  trumpet: thing('music-notes', 'prop.harp'),
  tune: thing('music-notes', 'prop.harp'),
  // The ballroom and the long gallery
  dance: thing('confetti', 'prop.chandelier'),
  dress: thing('hearts', 'prop.chandelier'),
  gown: thing('hearts', 'prop.chandelier'),
  slipper: thing('sparkle', 'prop.chandelier'),
  mask: thing('mote', 'prop.chandelier'),
  sash: thing('treasure-sparkle', 'prop.chandelier'),
  fan: thing('cloud', 'prop.chandelier'),
  glove: thing('hearts', 'prop.chandelier'),
  balloon: thing('balloons-away', 'prop.chandelier'),
  painting: thing('sparkle', 'prop.chandelier'),
  frame: thing('treasure-sparkle', 'prop.chandelier'),
  statue: thing('light-burst', 'prop.chandelier'),
  portrait: thing('hearts', 'prop.chandelier'),
  easel: thing('sparkle', 'prop.chandelier'),
  palette: thing('rainbow-arc', 'prop.chandelier'),
  // The jewel room and the flower room
  necklace: thing('gem-burst', 'prop.diamond-vase', 'prop.crown-stand'),
  bracelet: thing('gem-burst', 'prop.diamond-vase', 'prop.crown-stand'),
  brooch: thing('gem-burst', 'prop.diamond-vase', 'prop.crown-stand'),
  locket: thing('gem-burst', 'prop.diamond-vase', 'prop.crown-stand'),
  earring: thing('gem-burst', 'prop.diamond-vase', 'prop.crown-stand'),
  tiara: thing('treasure-sparkle', 'prop.diamond-vase', 'prop.crown-stand'),
  gem: thing('gem-burst', 'prop.diamond-vase'),
  pendant: thing('gem-burst', 'prop.diamond-vase', 'prop.crown-stand'),
  scepter: thing('treasure-sparkle', 'prop.crown-stand'),
  sunflower: thing('bloom', 'prop.flower-vase'),
  violet: thing('bloom', 'prop.flower-vase'),
  poppy: thing('bloom', 'prop.flower-vase'),
  lavender: thing('bloom', 'prop.flower-vase'),
  bouquet: thing('bloom', 'prop.flower-vase'),
  sprout: thing('grow-flower', 'prop.flower-vase'),
  stem: thing('leaf-burst', 'prop.flower-vase'),
  bud: thing('grow-flower', 'prop.flower-vase'),
  // The bedroom
  blanket: thing('cloud', 'prop.nap-bed', 'prop.canopy-bed'),
  quilt: thing('cloud', 'prop.nap-bed', 'prop.canopy-bed'),
  dream: thing('dream', 'prop.nap-bed', 'prop.canopy-bed'),
  sleep: thing('dream', 'prop.nap-bed', 'prop.canopy-bed'),
  mirror: thing('sparkle', 'prop.nap-bed', 'prop.canopy-bed'),
  comb: thing('pip-sparkle', 'prop.nap-bed', 'prop.canopy-bed'),
  // The royal court
  king: thing('treasure-sparkle', 'prop.throne', 'prop.crown-stand'),
  queen: thing('treasure-sparkle', 'prop.throne', 'prop.crown-stand'),
  prince: thing('light-burst', 'prop.throne'),
  princess: thing('light-burst', 'prop.throne'),
  knight: thing('light-burst', 'prop.throne'),
  sword: thing('sparkle', 'prop.throne'),
  shield: thing('sparkle', 'prop.throne'),
  banner: thing('hearts', 'prop.throne'),
  helmet: thing('sparkle', 'prop.throne'),
  // Sand and sea
  sand: thing('dig', 'prop.dig-spot'),
  pebble: thing('dig', 'prop.dig-spot'),
  dune: thing('dig', 'prop.dig-spot'),
  crab: thing('pip-sparkle', 'prop.clam'),
  starfish: thing('pip-sparkle', 'prop.clam'),
  tide: thing('splash', 'prop.seashell'),
  coconut: thing('bounce-puff', 'prop.seashell'),
  net: thing('splash', 'prop.seashell'),
  umbrella: thing('bloom', 'prop.sand-castle'),
  towel: thing('hearts', 'prop.sand-castle'),
  raft: thing('splash', 'prop.lighthouse'),
  swim: thing('wade', 'prop.lighthouse'),
  // The witch's hut, and a few more of the magic places
  toad: thing('pip-sparkle', 'prop.witch-cauldron'),
  spider: thing('mote', 'prop.witch-cauldron'),
  orb: thing('light-burst', 'prop.crystal-ball'),
  cat: thing('pip-hearts', 'prop.crystal-ball'),
  mushroom: thing('grow-flower', 'prop.jar-shelf'),
  key: thing('treasure-sparkle', 'prop.jar-shelf'),
  web: thing('mote', 'prop.sleeping-crystals'),
  bolt: thing('lightning-burst', 'prop.storm-pillar'),
  lightning: thing('lightning-burst', 'prop.storm-pillar'),
  rocket: thing('firework', 'prop.star-globe'),
  telescope: thing('light-burst', 'prop.star-globe'),
  rainbow: thing('rainbow-arc', 'prop.sky-fountain-lotus'),
  ghost: thing('mote', 'prop.jack-o-lantern'),
  costume: thing('fairy-dust', 'prop.jack-o-lantern'),
  night: thing('mote', 'prop.moon-window'),
} satisfies Record<string, Thing>;

/** A word that has a picture drawn for it alone. */
export type DrawnWordId = keyof typeof things;
export const DRAWN_WORD_IDS = Object.keys(things) as readonly DrawnWordId[];

/** The name of a drawn word's picture in the produce bundle. */
export const wordSprite = (id: DrawnWordId): string => `word-${id}`;

const drawn = Object.fromEntries(
  DRAWN_WORD_IDS.map((id) => [id, { ...things[id], picture: sprite('produce', wordSprite(id)) } satisfies WordDef]),
) as Record<DrawnWordId, WordDef>;

/**
 * The words, easiest places first. The order here is the order a tie is broken in, and the book has
 * its own order below. Each word's id is its spelling.
 */
const defs = {
  // The meadow and the pond and the sky
  bird: creature('bird', 'bird-blue-idle', 'pip-sparkle'),
  frog: creature('frog', 'frog-green-sit', 'pip-hearts'),
  bunny: creature('bunny', 'bunny-white-sit', 'pip-hearts'),
  snail: creature('snail', 'snail-peach-crawl', 'pip-sparkle'),
  ladybug: creature('ladybug', 'ladybug-red-walk', 'pip-sparkle'),
  duck: creature('duck', 'duck-white-float', 'splash'),
  fish: creature('fish', 'fish-koi-swim', 'water-burst'),
  dragonfly: creature('dragonfly', 'dragonfly-sapphire-hover', 'bubbles'),
  butterfly: creature('butterfly', 'butterfly-monarch-flutter', 'fairy-dust'),
  bee: creature('bee', 'bee-honey-fly', 'pip-sparkle'),
  fairy: creature('fairy', 'fairy-pink-fly', 'fairy-dust'),
  // The orchard and the farm
  apple: crop('produce-apple', ['apple-tree']),
  berry: crop('produce-sky-berry', ['berry-tree', 'berry-bed']),
  carrot: crop('produce-carrot', ['carrot-bed']),
  tomato: crop('produce-tomato', ['tomato-bed']),
  strawberry: crop('produce-strawberry', ['strawberry-bed']),
  pumpkin: crop('produce-pumpkin', ['pumpkin-bed']),
  cabbage: crop('produce-cabbage', ['cabbage-bed']),
  // The treasure house
  ruby: treasure('rain-ruby', ['ruby-table', 'ruby-cluster'], 'gem-burst'),
  topaz: treasure('rain-topaz', ['topaz-table', 'topaz-cluster'], 'gem-burst'),
  emerald: treasure('rain-emerald', ['emerald-table', 'emerald-cluster'], 'gem-burst'),
  sapphire: treasure('rain-sapphire', ['sapphire-table', 'sapphire-cluster'], 'gem-burst'),
  amethyst: treasure('rain-amethyst', ['amethyst-table', 'amethyst-cluster'], 'gem-burst'),
  diamond: treasure('rain-diamond', ['diamond-table', 'diamond-cluster', 'diamond-vase'], 'gem-burst'),
  gold: treasure('rain-bar', ['gold-bars']),
  coin: treasure('rain-coin', ['coin-pile']),
  money: treasure('rain-note-mint', ['money-desk']),
  // The friends. Her own name comes first, and "unicorn" after it.
  unicorn: { picture: portrait('wildstar'), subjects: UNICORN_IDS.map(unicornSubject), celebrate: 'rainbow-arc' },
  leaf: friend('leaf'),
  glacier: friend('glacier'),
  river: friend('river'),
  cinder: friend('cinder'),
  storm: friend('storm'),
  wildstar: friend('wildstar'),
  ...drawn,
} satisfies Record<string, WordDef>;

/** A word, by its spelling. */
export type WordId = keyof typeof defs;

export const WORDS: Readonly<Record<WordId, WordDef>> = defs;
export const WORD_IDS = Object.keys(defs) as readonly WordId[];

export const isWordId = (text: string): text is WordId => Object.hasOwn(defs, text);

/**
 * A friend's word is her portrait, her head and shoulders, which is drawn in a round frame, so it
 * is told from every other picture at a glance.
 */
export const isPortrait = (word: WordId): boolean => WORDS[word].picture.kind === 'portrait';

/**
 * How hard a word is to spell, by its length: up to four letters, five or six, and seven or more.
 */
export type Tier = 1 | 2 | 3;
export const tierOf = (word: string): Tier => (word.length <= 4 ? 1 : word.length <= 6 ? 2 : 3);

const NONE: readonly WordId[] = [];
const bySubject = new Map<SubjectId, WordId[]>();
for (const id of WORD_IDS) {
  for (const subject of defs[id].subjects) bySubject.set(subject, [...(bySubject.get(subject) ?? NONE), id]);
}
/** A friend's own name is the word that is hers. */
const isHers = (subject: SubjectId, word: string): number => (subject === `unicorn.${word}` ? 1 : 0);
// Easiest first. Among words as hard as each other a friend's own name comes first, and then the
// order of the table.
for (const [subject, words] of bySubject)
  words.sort(
    (a, b) =>
      tierOf(a) - tierOf(b) || isHers(subject, b) - isHers(subject, a) || WORD_IDS.indexOf(a) - WORD_IDS.indexOf(b),
  );

/** The words a thing can give, easiest first. Nothing for a thing that has no word. */
export const wordsOf = (subject: SubjectId): readonly WordId[] => bySubject.get(subject) ?? NONE;

/** Every thing in the world that gives a word. */
export const SUBJECTS: readonly SubjectId[] = [...bySubject.keys()];

/** A chapter of the Spell Book. A new place brings a page, and the words that belong to it. */
export interface PageDef {
  id: string;
  title: string;
  /** The word whose picture stands for the page. */
  emblem: WordId;
  words: readonly WordId[];
}

export const PAGES = [
  {
    id: 'meadow',
    title: 'The Meadow',
    emblem: 'frog',
    words: ['bird', 'frog', 'bunny', 'snail', 'ladybug', 'nest', 'egg', 'wing', 'feather', 'clover', 'shell'],
  },
  {
    id: 'by-the-pond',
    title: 'By the Pond',
    emblem: 'lily',
    words: ['pond', 'lily', 'fin', 'wave', 'splash', 'bubble', 'puddle'],
  },
  {
    id: 'pond-and-sky',
    title: 'Pond and Sky',
    emblem: 'duck',
    words: [
      'duck',
      'fish',
      'dragonfly',
      'butterfly',
      'bee',
      'fairy',
      'hive',
      'honey',
      'wand',
      'dust',
      'wish',
      'potion',
    ],
  },
  {
    id: 'orchard',
    title: 'The Orchard',
    emblem: 'apple',
    words: ['apple', 'berry', 'carrot', 'tomato', 'strawberry', 'pumpkin', 'cabbage'],
  },
  { id: 'stable', title: 'The Stable', emblem: 'horn', words: ['horn', 'hoof', 'hay', 'heart', 'ribbon'] },
  {
    id: 'friends',
    title: 'Unicorn Friends',
    emblem: 'unicorn',
    words: ['leaf', 'glacier', 'river', 'cinder', 'storm', 'wildstar', 'unicorn'],
  },
  {
    id: 'gem-room',
    title: 'The Gem Room',
    emblem: 'diamond',
    words: [
      'ruby',
      'topaz',
      'emerald',
      'sapphire',
      'amethyst',
      'diamond',
      'opal',
      'pearl',
      'jade',
      'onyx',
      'crystal',
      'ring',
    ],
  },
  { id: 'gold', title: 'Gold and Money', emblem: 'coin', words: ['gold', 'coin', 'money', 'sack', 'cash'] },
  {
    id: 'palace',
    title: 'The Palace',
    emblem: 'crown',
    words: ['throne', 'chair', 'table', 'cake', 'harp', 'music', 'crown', 'jewel', 'book', 'shelf', 'bed', 'pillow'],
  },
  {
    id: 'dining-room',
    title: 'The Dining Room',
    emblem: 'soup',
    words: ['plate', 'fork', 'knife', 'bowl', 'soup', 'bread', 'cheese', 'pie'],
  },
  {
    id: 'tea-room',
    title: 'The Tea Room',
    emblem: 'teapot',
    words: ['teapot', 'teacup', 'saucer', 'sugar', 'lemon', 'scone', 'jam', 'cookie'],
  },
  {
    id: 'library',
    title: 'The Library',
    emblem: 'story',
    words: ['mail', 'page', 'story', 'paper', 'pen', 'desk', 'map', 'globe'],
  },
  {
    id: 'music-room',
    title: 'The Music Room',
    emblem: 'violin',
    words: ['song', 'note', 'flute', 'violin', 'cello', 'piano', 'trumpet', 'tune'],
  },
  {
    id: 'ballroom',
    title: 'The Ballroom',
    emblem: 'dance',
    words: ['dance', 'dress', 'gown', 'slipper', 'mask', 'sash', 'fan', 'glove', 'balloon'],
  },
  {
    id: 'gallery',
    title: 'The Long Gallery',
    emblem: 'painting',
    words: ['painting', 'frame', 'statue', 'portrait', 'easel', 'palette'],
  },
  {
    id: 'jewel-room',
    title: 'The Jewel Room',
    emblem: 'tiara',
    words: ['necklace', 'bracelet', 'brooch', 'locket', 'earring', 'tiara', 'gem', 'pendant', 'scepter'],
  },
  {
    id: 'flower-room',
    title: 'The Flower Room',
    emblem: 'sunflower',
    words: ['sunflower', 'violet', 'poppy', 'lavender', 'bouquet', 'sprout', 'stem', 'bud'],
  },
  {
    id: 'bedroom',
    title: 'The Bedroom',
    emblem: 'quilt',
    words: ['blanket', 'quilt', 'dream', 'sleep', 'mirror', 'comb'],
  },
  {
    id: 'royal-court',
    title: 'The Royal Court',
    emblem: 'knight',
    words: ['king', 'queen', 'prince', 'princess', 'knight', 'sword', 'shield', 'banner', 'helmet'],
  },
  {
    id: 'manor',
    title: 'The Spooky Manor',
    emblem: 'moon',
    words: [
      'lantern',
      'candle',
      'flame',
      'chandelier',
      'moon',
      'bat',
      'cloud',
      'window',
      'flower',
      'daisy',
      'rose',
      'petal',
    ],
  },
  {
    id: 'manor-night',
    title: 'Night at the Manor',
    emblem: 'ghost',
    words: ['ghost', 'costume', 'night'],
  },
  {
    id: 'sky-garden',
    title: 'The Sky Garden',
    emblem: 'orchid',
    words: ['orchid', 'tulip', 'lotus', 'bonsai', 'tree', 'vase', 'seed', 'vine', 'basket', 'fountain', 'rainbow'],
  },
  {
    id: 'beach',
    title: 'The Beach',
    emblem: 'seashell',
    words: ['castle', 'flag', 'tower', 'bucket', 'spade', 'seashell', 'scallop'],
  },
  {
    id: 'sand-and-sea',
    title: 'Sand and Sea',
    emblem: 'crab',
    words: [
      'sand',
      'crab',
      'starfish',
      'umbrella',
      'towel',
      'dune',
      'coconut',
      'tide',
      'pebble',
      'raft',
      'net',
      'swim',
    ],
  },
  {
    id: 'harbour',
    title: 'The Harbour',
    emblem: 'lighthouse',
    words: ['lighthouse', 'boat', 'ship', 'sail', 'anchor', 'gull'],
  },
  {
    id: 'magic-river',
    title: 'The Magic River',
    emblem: 'willow',
    words: ['fern', 'moss', 'reed', 'ivy', 'willow', 'maple', 'birch', 'acorn'],
  },
  {
    id: 'spell-books',
    title: 'The Spell Books',
    emblem: 'charm',
    words: ['charm', 'scroll', 'quill', 'ink', 'rune', 'magic', 'wizard', 'witch', 'cape', 'hat', 'owl', 'broom'],
  },
  {
    id: 'star-room',
    title: 'Stars and Lights',
    emblem: 'star',
    words: ['star', 'sun', 'planet', 'comet', 'glow', 'lamp', 'torch', 'spark', 'rocket', 'telescope'],
  },
  {
    id: 'cauldron-hall',
    title: 'Cauldrons and Water',
    emblem: 'brew',
    words: ['brew', 'spoon', 'steam', 'water', 'drop', 'stream', 'glass', 'prism'],
  },
  {
    id: 'crystal-cave',
    title: 'The Crystal Cave',
    emblem: 'cauldron',
    words: ['pillar', 'thunder', 'pool', 'ripple', 'chime', 'bell', 'jar', 'bottle', 'cauldron'],
  },
  {
    id: 'witch-hut',
    title: "The Witch's Hut",
    emblem: 'cat',
    words: ['toad', 'spider', 'orb', 'cat', 'mushroom', 'key', 'web', 'bolt', 'lightning'],
  },
  {
    id: 'santa-grove',
    title: "Santa's Grove",
    emblem: 'santa',
    words: [
      'santa',
      'elf',
      'sleigh',
      'reindeer',
      'antler',
      'snow',
      'snowman',
      'snowflake',
      'snowball',
      'present',
      'gift',
      'candy',
    ],
  },
  {
    id: 'winter-wear',
    title: 'Winter Things',
    emblem: 'scarf',
    words: [
      'scarf',
      'mitten',
      'boot',
      'coat',
      'sled',
      'igloo',
      'icicle',
      'cocoa',
      'cane',
      'mint',
      'stocking',
      'wreath',
    ],
  },
  {
    id: 'christmas-tree',
    title: 'The Christmas Tree',
    emblem: 'bauble',
    words: ['bauble', 'tinsel', 'garland', 'bow', 'tag', 'toy', 'teddy', 'drum', 'train', 'doll', 'kite', 'robot'],
  },
] as const satisfies readonly PageDef[];

export type Page = (typeof PAGES)[number];
export type PageId = Page['id'];
