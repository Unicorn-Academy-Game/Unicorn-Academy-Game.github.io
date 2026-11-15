import type { SoundFamilyId } from '../shared/audio';
import { COMPUTER_FPS, COMPUTER_FRAMES } from '../shared/computer';
import { PIANO_FPS, PIANO_FRAMES } from '../shared/piano';
import type { SavedPropState } from '../shared/save';
import type { EffectId } from './activities';
import { ARCH_PIECES, pieceId } from './fountain-rainbow';
import { GEM_IDS, type GemId, type ProduceId } from './produce';
import type { WonderId } from './wonders';

/** What happens when the player taps an object. 'none' objects are only reached by magic. */
type TapKind =
  | 'chest'
  | 'door'
  | 'palace-door'
  | 'cup'
  | 'brush'
  | 'treasure'
  | 'harvest'
  | 'delight'
  | 'minigame'
  | 'clue'
  | 'none';

/** How long the slide of a lift door takes when a clue opens it. */
export const DOOR_REVEAL_SECONDS = 1;

/**
 * What keeps a door shut until something is done: the word is typed in, or a clue somewhere in the
 * room is touched.
 */
export type Lock = 'code' | 'clue';

/**
 * The screens of learning, each opened from a thing in front of the palace: the reading computer's,
 * and the games of the two tables.
 */
export const TABLE_IDS = ['reading', 'memory', 'maths'] as const;
export type TableId = (typeof TABLE_IDS)[number];
export const isTable = (id: string | undefined): id is TableId =>
  (TABLE_IDS as readonly (string | undefined)[]).includes(id);

/**
 * What a tap on a thing can open: a playground toy's full-screen game, the postcard a statue sends,
 * or the screen of a table.
 */
export type MinigameId = WonderId | 'statue-postcard' | TableId;

/**
 * What a thing that is only there to be enjoyed does when she casts at it: it hops, shimmers and
 * sounds. It never changes and is never saved.
 */
interface Delight {
  effect: EffectId;
  sound: SoundFamilyId;
  /** How long the reaction lasts. */
  seconds: number;
  /** How high it hops, in world units. Zero for things that stay put. */
  hop: number;
  /** How high above its ground point the shimmer starts, for things that hang or stand tall. */
  lift: number;
}

/**
 * A thing she can sit in. She walks to it, turns to face the room, and is drawn up on it and sunk
 * into it.
 */
interface Seat {
  /**
   * How far above the prop's ground point the front edge of the seat is drawn, in world units. She
   * is drawn only above this line, so the seat hides her legs.
   */
  edge: number;
  /**
   * How far she is carried up onto the seat from where she stands, in world units, which is how
   * high the seat is off the floor.
   */
  rise: number;
  /**
   * She does not sit up in it but lies down and sleeps, with her eyes shut, for as long as she is
   * left there.
   */
  nap?: true;
}

export interface PropDef {
  id: string;
  tap: TapKind;
  /** Saved state for props whose state persists. Absent for props with no saved state. */
  initial?: SavedPropState;
  /**
   * For treasure, what kind of piece it is. A gem floats and turns when tapped, and gold and money
   * hop.
   */
  treasure?: 'gold' | 'gem' | 'money';
  /**
   * The looks a map must choose between for each instance, when the definition has more than one.
   */
  looks?: readonly string[];
  /**
   * For a tree or a bed that gives fruit and vegetables: what falls, and how many at a time. It
   * never runs out.
   */
  harvest?: {
    produce: readonly ProduceId[];
    count: readonly [number, number] /** How high above the ground it starts to fall, in world units. */;
    height: number;
  };
  /** For something to enjoy: what it does when tapped. */
  delight?: Delight;
  /** For something she can sit in. */
  seat?: Seat;
  /** For something that starts a game: which one. */
  minigame?: MinigameId;
  /**
   * For something that starts a game and has more to show than the usual moment: how long, in
   * seconds, its reaction plays before the game opens from it.
   */
  leadIn?: number;
  /**
   * For a door that starts shut: what opens it. It stays open for as long as the game is open, and
   * is shut again next time.
   */
  lock?: Lock;
  /**
   * For a clue: the definition of the doors in the same room that it opens. A clue also does what a
   * delight does, so it is a pleasure to find.
   */
  opens?: string;
  /**
   * The map's own picture shows it, or it is only a place magic is found from, so the game draws
   * nothing for it. A window or a wall of flowers that can be tapped.
   */
  invisible?: true;
  /**
   * For a crown on its stand: a tap takes it, and she wears it on her head until she puts it back.
   */
  crown?: true;
}

/**
 * The gems the treasure house has a table for, in the order of the Gem Room page of the book. A
 * table holds one gem and no other, and the word it gives is that gem, so what the player sees on
 * the table is what they are asked to spell. The ring is the one that is not a stone.
 */
export const GEM_TABLES = [
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
] as const;
export type GemTable = (typeof GEM_TABLES)[number];

/** The content id of the table that holds a gem, and also the name of its picture. */
export const tableOf = (gem: GemTable): string => `${gem}-table`;

/** The gem that a table holds, or nothing when the definition is not one of the gem tables. */
export const gemOn = (definitionId: string): GemTable | undefined =>
  GEM_TABLES.find((gem) => tableOf(gem) === definitionId);

/**
 * The content id of the cluster of crystals that a gem grows in, and also the name of its picture.
 */
export const clusterOf = (gem: GemId): string => `${gem}-cluster`;

const defs: PropDef[] = [
  { id: 'chest', tap: 'chest', initial: { kind: 'chest', open: false } },
  {
    id: 'door',
    tap: 'door',
    looks: [
      'treasure-out',
      'stable-out',
      'palace-in',
      'palace-room',
      'treasure-in',
      'stable-in',
      'manor-out',
      'manor-in',
    ],
  },
  { id: 'palace-door', tap: 'palace-door' },
  // The Spooky Manor: the front door wants a word, and the lift in the gallery wants a clue found.
  { id: 'manor-door', tap: 'door', lock: 'code', looks: ['manor-out'] },
  { id: 'elevator-door', tap: 'door', lock: 'clue' },
  { id: 'lift-door', tap: 'door' },
  {
    id: 'elevator-clue',
    tap: 'clue',
    opens: 'elevator-door',
    delight: { effect: 'treasure-sparkle', sound: 'gem', seconds: 2.2, hop: 0, lift: 0 },
  },
  // The Wonder Gallery: eight rare creatures from other places and worlds, each carved from a
  // different stone.
  {
    id: 'statue-star-whale',
    tap: 'minigame',
    minigame: 'statue-postcard',
    delight: { effect: 'fairy-dust', sound: 'fx-glow', seconds: 2.4, hop: 4, lift: 150 },
  },
  {
    id: 'statue-crystal-fox',
    tap: 'minigame',
    minigame: 'statue-postcard',
    delight: { effect: 'gem-burst', sound: 'gem', seconds: 2.4, hop: 4, lift: 150 },
  },
  {
    id: 'statue-moon-hare',
    tap: 'minigame',
    minigame: 'statue-postcard',
    delight: { effect: 'mote', sound: 'gem', seconds: 2.4, hop: 6, lift: 140 },
  },
  {
    id: 'statue-ember-drake',
    tap: 'minigame',
    minigame: 'statue-postcard',
    delight: { effect: 'embers', sound: 'spell-fire', seconds: 2.4, hop: 3, lift: 140 },
  },
  {
    id: 'statue-coral-seahorse',
    tap: 'minigame',
    minigame: 'statue-postcard',
    delight: { effect: 'bubbles', sound: 'splash', seconds: 2.4, hop: 3, lift: 140 },
  },
  {
    id: 'statue-cloud-lion',
    tap: 'minigame',
    minigame: 'statue-postcard',
    delight: { effect: 'cloud', sound: 'hop', seconds: 2.4, hop: 4, lift: 130 },
  },
  {
    id: 'statue-storm-bird',
    tap: 'minigame',
    minigame: 'statue-postcard',
    delight: { effect: 'light-burst', sound: 'spell-lightning', seconds: 2.4, hop: 3, lift: 150 },
  },
  {
    id: 'statue-glow-owl',
    tap: 'minigame',
    minigame: 'statue-postcard',
    delight: { effect: 'leaf-burst', sound: 'spell-nature', seconds: 2.4, hop: 4, lift: 150 },
  },
  {
    id: 'manor-chandelier',
    tap: 'delight',
    delight: { effect: 'sparkle', sound: 'gem', seconds: 2.4, hop: 5, lift: 80 },
  },
  {
    id: 'flower-wall',
    tap: 'delight',
    invisible: true,
    delight: { effect: 'bloom', sound: 'fx-bloom', seconds: 2, hop: 0, lift: 0 },
  },
  {
    id: 'jack-o-lantern',
    tap: 'delight',
    looks: ['big', 'mid', 'small'],
    delight: { effect: 'embers', sound: 'fx-brazier', seconds: 1.6, hop: 7, lift: 40 },
  },
  // The Sky Garden: very expensive plants.
  {
    id: 'sky-urn-gold',
    tap: 'delight',
    delight: { effect: 'bloom', sound: 'fx-bloom', seconds: 2.2, hop: 0, lift: 140 },
  },
  {
    id: 'sky-planter-jewel',
    tap: 'delight',
    delight: { effect: 'gem-burst', sound: 'gem', seconds: 2.4, hop: 0, lift: 100 },
  },
  {
    id: 'sky-orchid',
    tap: 'delight',
    delight: { effect: 'fairy-dust', sound: 'fx-glow', seconds: 2.4, hop: 0, lift: 170 },
  },
  {
    id: 'sky-tulips-crystal',
    tap: 'delight',
    delight: { effect: 'treasure-sparkle', sound: 'gem', seconds: 2.4, hop: 0, lift: 190 },
  },
  {
    id: 'sky-bonsai-jade',
    tap: 'delight',
    delight: { effect: 'leaf-burst', sound: 'spell-nature', seconds: 2.2, hop: 0, lift: 150 },
  },
  {
    id: 'sky-fountain-lotus',
    tap: 'delight',
    delight: { effect: 'water-burst', sound: 'splash', seconds: 2, hop: 0, lift: 90 },
  },
  {
    id: 'sky-hanging-garden',
    tap: 'delight',
    delight: { effect: 'bloom', sound: 'fx-bloom', seconds: 2.4, hop: 5, lift: 90 },
  },
  {
    id: 'moon-window',
    tap: 'delight',
    invisible: true,
    delight: { effect: 'mote', sound: 'fx-glow', seconds: 2.6, hop: 0, lift: 0 },
  },
  { id: 'cup', tap: 'cup' },
  { id: 'brush-station', tap: 'brush' },
  // The treasure house. Every pile, desk and table is one kind of treasure, drawn as the sprite of
  // its own name, and gives the one word that it is.
  { id: 'coin-pile', tap: 'treasure', treasure: 'gold' },
  { id: 'gold-bars', tap: 'treasure', treasure: 'gold' },
  { id: 'sack-pile', tap: 'treasure', treasure: 'gold' },
  { id: 'money-desk', tap: 'treasure', treasure: 'money' },
  { id: 'cash-desk', tap: 'treasure', treasure: 'money' },
  ...GEM_TABLES.map((gem): PropDef => ({ id: tableOf(gem), tap: 'treasure', treasure: 'gem' })),
  { id: 'lantern', tap: 'none', initial: { kind: 'lantern', lit: false } },
  { id: 'crystal', tap: 'none', initial: { kind: 'lantern', lit: false } },
  { id: 'flowerbed', tap: 'none', initial: { kind: 'flowerbed', state: 'leafy' }, looks: ['long', 'square', 'round'] },
  {
    id: 'rain-maker',
    tap: 'minigame',
    minigame: 'treasure-rain',
    delight: { effect: 'gem-burst', sound: 'gem', seconds: 2.4, hop: 0, lift: 0 },
  },
  { id: 'brazier', tap: 'none', initial: { kind: 'brazier', lit: false } },
  { id: 'pinwheel', tap: 'none' },
  { id: 'weather-ornament', tap: 'none' },
  { id: 'fountain-spout', tap: 'none' },
  { id: 'fountain-pad', tap: 'none', invisible: true },
  { id: 'fountain-rainbow', tap: 'none', looks: ARCH_PIECES.map(pieceId) },
  { id: 'ice-display', tap: 'none' },
  // The farm and the orchard: a tap lets fruit or vegetables fall, and there are always more.
  { id: 'apple-tree', tap: 'harvest', harvest: { produce: ['apple'], count: [3, 4], height: 150 } },
  { id: 'berry-tree', tap: 'harvest', harvest: { produce: ['sky-berry'], count: [3, 4], height: 150 } },
  { id: 'carrot-bed', tap: 'harvest', harvest: { produce: ['carrot'], count: [3, 4], height: 34 } },
  { id: 'tomato-bed', tap: 'harvest', harvest: { produce: ['tomato'], count: [3, 4], height: 34 } },
  { id: 'strawberry-bed', tap: 'harvest', harvest: { produce: ['strawberry'], count: [3, 4], height: 34 } },
  { id: 'pumpkin-bed', tap: 'harvest', harvest: { produce: ['pumpkin'], count: [2, 3], height: 34 } },
  { id: 'cabbage-bed', tap: 'harvest', harvest: { produce: ['cabbage'], count: [2, 3], height: 34 } },
  { id: 'berry-bed', tap: 'harvest', harvest: { produce: ['sky-berry'], count: [3, 4], height: 34 } },
  // The crystal cave: a cluster for each gem, and what wakes, glows and answers to magic. A cluster
  // gives gems again and again.
  ...GEM_IDS.map(
    (gem): PropDef => ({ id: clusterOf(gem), tap: 'harvest', harvest: { produce: [gem], count: [2, 3], height: 40 } }),
  ),
  { id: 'sleeping-crystals', tap: 'none' },
  { id: 'storm-pillar', tap: 'none' },
  { id: 'glow-pool', tap: 'none' },
  { id: 'cave-bed', tap: 'none', initial: { kind: 'flowerbed', state: 'leafy' }, looks: ['long', 'round'] },
  {
    id: 'heart-crystal',
    tap: 'delight',
    delight: { effect: 'gem-burst', sound: 'gem', seconds: 2.4, hop: 0, lift: 130 },
  },
  {
    id: 'crystal-ball',
    tap: 'delight',
    delight: { effect: 'light-burst', sound: 'fx-glow', seconds: 2.4, hop: 0, lift: 110 },
  },
  { id: 'cave-chimes', tap: 'delight', delight: { effect: 'sparkle', sound: 'gem', seconds: 2.4, hop: 4, lift: 120 } },
  {
    id: 'witch-cauldron',
    tap: 'delight',
    delight: { effect: 'bubbles', sound: 'cup-fill', seconds: 2.4, hop: 0, lift: 70 },
  },
  { id: 'hut-door', tap: 'delight', delight: { effect: 'mote', sound: 'door-open', seconds: 3, hop: 0, lift: 90 } },
  // The stable: a unicorn in each stall, in a coat none of the friends wear. She nuzzles and hearts
  // float up.
  {
    id: 'boxed-unicorn',
    tap: 'delight',
    looks: ['mint', 'orchid', 'sky', 'lilac', 'ocean', 'lagoon'],
    delight: { effect: 'hearts', sound: 'hearts', seconds: 2, hop: 5, lift: 120 },
  },
  // The palace hall: things only there to enjoy. Each one sparkles, sounds and sometimes hops, and
  // never changes.
  {
    id: 'throne',
    tap: 'delight',
    seat: { edge: 3, rise: 22 },
    delight: { effect: 'light-burst', sound: 'palace-welcome', seconds: 2.4, hop: 0, lift: 130 },
  },
  { id: 'chandelier', tap: 'delight', delight: { effect: 'sparkle', sound: 'gem', seconds: 2.4, hop: 5, lift: 80 } },
  {
    id: 'banquet-table',
    tap: 'delight',
    delight: { effect: 'hearts', sound: 'cup-fill', seconds: 2, hop: 0, lift: 70 },
  },
  {
    id: 'bookcase',
    tap: 'delight',
    delight: { effect: 'fairy-dust', sound: 'fx-glow', seconds: 2, hop: 0, lift: 120 },
  },
  { id: 'harp', tap: 'delight', delight: { effect: 'fairy-dust', sound: 'gem', seconds: 2.4, hop: 0, lift: 150 } },
  { id: 'canopy-bed', tap: 'delight', delight: { effect: 'cloud', sound: 'hop', seconds: 1.6, hop: 7, lift: 50 } },
  {
    id: 'crown-stand',
    tap: 'delight',
    crown: true,
    delight: { effect: 'treasure-sparkle', sound: 'gem', seconds: 2.4, hop: 10, lift: 130 },
  },
  // The rooms beyond the hall: vases to enjoy, and a bed that she lies down in and sleeps.
  {
    id: 'flower-vase',
    tap: 'delight',
    looks: ['rose', 'tulip', 'daisy', 'lilac'],
    delight: { effect: 'bloom', sound: 'fx-bloom', seconds: 2, hop: 4, lift: 160 },
  },
  {
    id: 'diamond-vase',
    tap: 'delight',
    looks: ['clear', 'gold', 'spray'],
    delight: { effect: 'treasure-sparkle', sound: 'gem', seconds: 2.2, hop: 4, lift: 160 },
  },
  {
    id: 'nap-bed',
    tap: 'delight',
    seat: { edge: 40, rise: 64, nap: true },
    delight: { effect: 'cloud', sound: 'hearts', seconds: 1.6, hop: 0, lift: 90 },
  },
  // The playground: toys to enjoy. None of them is saved, and none of them can go wrong.
  {
    id: 'gem-fountain',
    tap: 'minigame',
    minigame: 'jewel-fountain',
    delight: { effect: 'gem-burst', sound: 'gem', seconds: 2.4, hop: 0, lift: 0 },
  },
  {
    id: 'rainbow-slide',
    tap: 'minigame',
    minigame: 'rainbow-ride',
    delight: { effect: 'rainbow-arc', sound: 'fx-rainbow', seconds: 1.5, hop: 0, lift: 0 },
  },
  {
    id: 'bouncy-mushroom',
    tap: 'minigame',
    minigame: 'cloud-bounce',
    looks: ['red', 'pink', 'blue'],
    delight: { effect: 'bounce-puff', sound: 'hop', seconds: 0.8, hop: 0, lift: 0 },
  },
  {
    id: 'firework-launcher',
    tap: 'minigame',
    minigame: 'sparkle-sky',
    looks: ['red', 'blue', 'gold'],
    delight: { effect: 'firework', sound: 'spell-lightning', seconds: 2.2, hop: 0, lift: 0 },
  },
  {
    id: 'spell-cannon',
    tap: 'minigame',
    minigame: 'star-cannon',
    looks: ['star', 'heart'],
    delight: { effect: 'cannon-shot', sound: 'spell-light', seconds: 1.6, hop: 4, lift: 0 },
  },
  {
    id: 'morph-machine',
    tap: 'minigame',
    minigame: 'morph-machine',
    looks: ['apple-gem', 'berry-flower'],
    delight: { effect: 'morph-poof', sound: 'relocate', seconds: 1.6, hop: 0, lift: 0 },
  },
  {
    id: 'frog-pond',
    tap: 'minigame',
    minigame: 'lily-hop',
    delight: { effect: 'water-burst', sound: 'splash', seconds: 1.4, hop: 6, lift: 0 },
  },
  {
    id: 'bubble-machine',
    tap: 'minigame',
    minigame: 'bubble-garden',
    delight: { effect: 'bubbles', sound: 'splash', seconds: 2.4, hop: 0, lift: 0 },
  },
  {
    id: 'balloon-stand',
    tap: 'minigame',
    minigame: 'balloon-song',
    looks: ['party', 'warm', 'cool'],
    delight: { effect: 'balloons-away', sound: 'fx-glow', seconds: 3.2, hop: 0, lift: 0 },
  },
  {
    id: 'confetti-popper',
    tap: 'minigame',
    minigame: 'party-time',
    delight: { effect: 'confetti', sound: 'treasure-bounce', seconds: 2, hop: 6, lift: 0 },
  },
  // The dance floor, where the herd goes when the dancing game is done: stage lights that glow in a
  // colour and flare when they are touched.
  {
    id: 'disco-light',
    tap: 'delight',
    looks: ['pink', 'cyan', 'gold', 'rainbow'],
    delight: { effect: 'confetti', sound: 'fx-glow', seconds: 2, hop: 0, lift: 150 },
  },
  // The piano by the palace: a finger runs up its keys with a note flying from each, and the tone
  // matrix opens when the finger has left the last key.
  {
    id: 'piano',
    tap: 'minigame',
    minigame: 'tone-matrix',
    leadIn: (PIANO_FRAMES - 1) / PIANO_FPS,
    delight: { effect: 'music-notes', sound: 'piano-run', seconds: 1.6, hop: 0, lift: 0 },
  },
  // The computer by the palace: its screen wakes and a light runs along its keys, and the reading
  // screen opens when the light has gone.
  {
    id: 'computer',
    tap: 'minigame',
    minigame: 'reading',
    leadIn: (COMPUTER_FRAMES - 1) / COMPUTER_FPS,
    delight: { effect: 'screen-wake', sound: 'computer-wake', seconds: 1.6, hop: 0, lift: 0 },
  },
  // The two tables beside the computer: a round table of cards for the memory game, and an abacus
  // for the maths. A tap sparkles and the game opens from it.
  {
    id: 'memory-table',
    tap: 'minigame',
    minigame: 'memory',
    delight: { effect: 'sparkle', sound: 'fx-glow', seconds: 1.4, hop: 0, lift: 60 },
  },
  {
    id: 'abacus',
    tap: 'minigame',
    minigame: 'maths',
    delight: { effect: 'treasure-sparkle', sound: 'gem', seconds: 1.4, hop: 0, lift: 90 },
  },
];

export const PROP_DEFS: Readonly<Record<string, PropDef>> = Object.fromEntries(defs.map((d) => [d.id, d]));
