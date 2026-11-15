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
  shell: thing('pip-sparkle', 'life.snail'),
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
  wand: thing('fairy-dust', 'life.fairy', 'prop.hut-door'),
  dust: thing('fairy-dust', 'life.fairy'),
  wish: thing('light-burst', 'life.fairy', 'prop.crystal-ball'),
  potion: thing('bubbles', 'life.fairy', 'prop.witch-cauldron'),
  // The palace
  throne: thing('light-burst', 'prop.throne'),
  chair: thing('sparkle', 'prop.throne'),
  table: thing('hearts', 'prop.banquet-table'),
  cake: thing('hearts', 'prop.banquet-table'),
  harp: thing('fairy-dust', 'prop.harp'),
  music: thing('fairy-dust', 'prop.harp', 'prop.cave-chimes', 'prop.disco-light'),
  crown: thing('treasure-sparkle', 'prop.crown-stand'),
  jewel: thing('gem-burst', 'prop.crown-stand', 'prop.sky-planter-jewel', 'prop.diamond-vase'),
  book: thing('fairy-dust', 'prop.bookcase'),
  shelf: thing('fairy-dust', 'prop.bookcase'),
  bed: thing('cloud', 'prop.canopy-bed', 'prop.nap-bed'),
  pillow: thing('cloud', 'prop.canopy-bed', 'prop.nap-bed'),
  // The Spooky Manor
  lantern: thing('embers', 'prop.jack-o-lantern'),
  candle: thing('embers', 'prop.jack-o-lantern'),
  flame: thing('embers', 'prop.jack-o-lantern'),
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
  pearl: thing('gem-burst', 'prop.pearl-table'),
  jade: thing('gem-burst', 'prop.jade-table', 'prop.jade-cluster'),
  onyx: thing('gem-burst', 'prop.onyx-table', 'prop.onyx-cluster'),
  crystal: thing('gem-burst', 'prop.crystal-table', 'prop.rainbow-cluster'),
  ring: thing('gem-burst', 'prop.ring-table'),
  sack: thing('treasure-sparkle', 'prop.sack-pile'),
  cash: thing('treasure-sparkle', 'prop.cash-desk'),
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
    id: 'sky-garden',
    title: 'The Sky Garden',
    emblem: 'orchid',
    words: ['orchid', 'tulip', 'lotus', 'bonsai', 'tree', 'vase', 'seed', 'vine', 'basket', 'fountain'],
  },
] as const satisfies readonly PageDef[];

export type Page = (typeof PAGES)[number];
export type PageId = Page['id'];
