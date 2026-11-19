import { MAP_IDS, type MagicKind, UNICORN_IDS } from '../shared/ids';
import { LIFE_KINDS, type LifeKind } from '../shared/life';
import { DIGITS, LETTERS, type WriteKind } from './letters';
import type { WordId } from './lexicon';
import { MAGICS as MAGIC_KINDS } from './magic';
import { FOOD_IDS, GEM_IDS, PRODUCE_IDS } from './produce';
import { isFree, WONDER_IDS, type WonderId } from './wonders';
import { PALACE_SPOTS } from './world-map';

/**
 * The sticker book: a sticker for each good thing the player does, and a page for each kind of
 * thing. Nothing here can be missed or got wrong. A sticker comes by itself as the player plays,
 * and a book that is nearly empty is only a book that is just beginning.
 *
 * A sticker is a name, a picture and the facts that earn it. A fact is a number the game keeps
 * about the player, by name, and a sticker is earned once each of its facts has reached its number.
 * `factNames` lists every name a fact can have, and a test holds the stickers to it, so a rule can
 * never wait on a fact that nothing keeps.
 */

export interface Need {
  readonly fact: string;
  readonly atLeast: number;
}

export interface StickerDef {
  /** Stable, since the album remembers what was earned by it. */
  readonly id: string;
  readonly page: StickerPageId;
  /** The word whose picture is the sticker. */
  readonly emblem: WordId;
  /** What the sticker is called. */
  readonly name: string;
  /** What to do for it, said as an invitation. */
  readonly hint: string;
  readonly needs: readonly Need[];
}

export const STICKER_PAGE_IDS = [
  'friends',
  'palace',
  'places',
  'magic',
  'harvest',
  'critters',
  'seaside',
  'winter',
  'games',
  'shine',
  'learning',
  'writing',
] as const;
export type StickerPageId = (typeof STICKER_PAGE_IDS)[number];

export interface StickerPage {
  readonly id: StickerPageId;
  readonly title: string;
  /** The word whose picture is on the page's tab. */
  readonly emblem: WordId;
}

export const STICKER_PAGES: readonly StickerPage[] = [
  { id: 'friends', title: 'Friends', emblem: 'unicorn' },
  { id: 'palace', title: 'The Palace', emblem: 'crown' },
  { id: 'places', title: 'Far and Wide', emblem: 'map' },
  { id: 'magic', title: 'Magic', emblem: 'wand' },
  { id: 'harvest', title: 'Fruit and Gems', emblem: 'apple' },
  { id: 'critters', title: 'Little Creatures', emblem: 'butterfly' },
  { id: 'seaside', title: 'Sand and Sea', emblem: 'starfish' },
  { id: 'winter', title: 'Winter', emblem: 'snowflake' },
  { id: 'games', title: 'Games', emblem: 'balloon' },
  { id: 'shine', title: 'Shining Moments', emblem: 'star' },
  { id: 'learning', title: 'Learning', emblem: 'book' },
  { id: 'writing', title: 'Writing', emblem: 'pen' },
];

const at = (fact: string, atLeast = 1): Need => ({ fact, atLeast });
const make = (
  id: string,
  page: StickerPageId,
  emblem: WordId,
  name: string,
  hint: string,
  ...needs: Need[]
): StickerDef => ({ id, page, emblem, name, hint, needs });

const MEETINGS = [
  ['leaf', 'Hello, Leaf!', 'Find Leaf in the forest'],
  ['glacier', 'Hello, Glacier!', 'Find Glacier and say hello'],
  ['river', 'Hello, River!', 'Find River and say hello'],
  ['cinder', 'Hello, Cinder!', 'Find Cinder and say hello'],
  ['storm', 'Hello, Storm!', 'Find Storm and say hello'],
] as const satisfies readonly (readonly [(typeof UNICORN_IDS)[number], string, string])[];

const friends: readonly StickerDef[] = [
  make('hello', 'friends', 'wildstar', 'Hello, Wildstar!', 'Press play', at('friend:wildstar')),
  ...MEETINGS.map(([id, name, hint]) => make(`friend-${id}`, 'friends', id, name, hint, at(`friend:${id}`))),
  make(
    'herd',
    'friends',
    'unicorn',
    'The whole herd',
    'Find all the unicorn friends',
    at('friends', UNICORN_IDS.length),
  ),
];

/** The rooms of the palace: the throne room and the ones beyond it. */
const ROOMS = PALACE_SPOTS.map((spot) => spot.to.mapId);

const PLACES = [
  ['palace-garden', 'palace', 'fountain', 'The palace garden', 'Go through the garden gate'],
  ['palace-hall', 'palace', 'throne', 'The throne room', 'Walk into the palace'],
  ['treasure-house', 'palace', 'diamond', 'The treasure house', 'Visit the treasure house'],
  ['stable', 'palace', 'hay', 'The stable', 'Visit the stable'],
  ['playground', 'palace', 'balloon', 'The playground', 'Go to the playground'],
  ['dance-floor', 'palace', 'dance', 'The dance floor', 'Find the dance floor'],
  ['manor-hall', 'places', 'ghost', 'The wonder gallery', 'Go to the big house in the west'],
  ['manor-upper', 'places', 'orchid', 'The sky garden', 'Ride the golden lift up'],
  ['crystal-cave', 'places', 'crystal', 'The crystal cave', 'Find the crystal cave'],
  ['witch-hut', 'places', 'witch', "The witch's hut", 'Find the hut beyond the cave'],
  ['river', 'places', 'willow', 'The magic river', 'Walk to the magic river'],
  ['magic-hall', 'places', 'wizard', 'The magic hall', 'Cross the river to the magic hall'],
  ['beach', 'places', 'starfish', 'The beach', 'Follow the river to the sea'],
  ['santa-grove', 'places', 'snowman', "Santa's grove", 'Find the snow at the top of the island'],
  ['santa-cabin', 'places', 'stocking', "Santa's cabin", "Go inside Santa's cabin"],
] as const satisfies readonly (readonly [(typeof MAP_IDS)[number], StickerPageId, WordId, string, string])[];

const places: readonly StickerDef[] = [
  ...PLACES.map(([map, page, emblem, name, hint]) =>
    make(`visit-${map}`, page, emblem, name, hint, at(`visited:${map}`)),
  ),
  make('rooms', 'palace', 'crown', 'Every room', 'Visit all ten rooms of the palace', at('rooms', ROOMS.length)),
  make('explorer', 'places', 'map', 'Explorer', 'Visit every place on the island', at('places', MAP_IDS.length)),
];

const MAGICS = [
  ['light', 'sun', 'Light magic', "Cast Wildstar's magic ten times"],
  ['nature', 'sprout', 'Garden magic', "Cast Leaf's magic ten times"],
  ['ice', 'snowflake', 'Ice magic', "Cast Glacier's magic ten times"],
  ['water', 'drop', 'Water magic', "Cast River's magic ten times"],
  ['fire', 'flame', 'Fire magic', "Cast Cinder's magic ten times"],
  ['lightning', 'lightning', 'Lightning magic', "Cast Storm's magic ten times"],
] as const satisfies readonly (readonly [MagicKind, WordId, string, string])[];

const magic: readonly StickerDef[] = [
  make('spell', 'magic', 'wand', 'First spell', 'Tap a friend to cast a spell', at('casts')),
  ...MAGICS.map(([kind, emblem, name, hint]) =>
    make(`magic-${kind}`, 'magic', emblem, name, hint, at(`cast:${kind}`, 10)),
  ),
  make(
    'rainbow-magic',
    'magic',
    'rainbow',
    'Rainbow magic',
    'Cast all six kinds of magic',
    at('magics', MAGICS.length),
  ),
  make('spells-100', 'magic', 'magic', 'Spell master', 'Cast a hundred spells', at('casts', 100)),
];

const harvest: readonly StickerDef[] = [
  make('fruit', 'harvest', 'apple', 'First fruit', 'Tap a tree and pick up what falls', at('food')),
  make('fruit-25', 'harvest', 'basket', 'A full basket', 'Gather twenty-five fruits and vegetables', at('food', 25)),
  make('fruit-100', 'harvest', 'pumpkin', 'Harvest time', 'Gather a hundred fruits and vegetables', at('food', 100)),
  make(
    'fruit-all',
    'harvest',
    'strawberry',
    'Rainbow basket',
    'Gather every kind of fruit and vegetable',
    at('foods', FOOD_IDS.length),
  ),
  make('gem', 'harvest', 'ruby', 'First gem', 'Tap a cluster of gems in the cave', at('gems')),
  make('gem-all', 'harvest', 'diamond', 'Gem collector', 'Gather every kind of gem', at('gem-kinds', GEM_IDS.length)),
];

const CRITTERS = [
  ['bunny', 'bunny', 'Hello, bunny!'],
  ['frog', 'frog', 'Hello, frog!'],
  ['duck', 'duck', 'Hello, duck!'],
  ['fish', 'fish', 'Hello, fish!'],
  ['fairy', 'fairy', 'Hello, fairy!'],
  ['butterfly', 'butterfly', 'Hello, butterfly!'],
  ['bee', 'bee', 'Hello, bee!'],
  ['bird', 'bird', 'Hello, birdie!'],
] as const satisfies readonly (readonly [LifeKind, WordId, string])[];

const critters: readonly StickerDef[] = [
  make('critter', 'critters', 'feather', 'Little friend', 'Tap a little creature', at('pokes')),
  make('critter-25', 'critters', 'nest', 'Creature friend', 'Say hello to twenty-five creatures', at('pokes', 25)),
  make('critter-100', 'critters', 'heart', 'Creature whisperer', 'Say hello to a hundred creatures', at('pokes', 100)),
  ...CRITTERS.map(([kind, emblem, name]) =>
    make(`critter-${kind}`, 'critters', emblem, name, `Find a ${kind} and tap it`, at(`poke:${kind}`)),
  ),
  make(
    'critter-all',
    'critters',
    'clover',
    'Friend of all',
    'Meet every kind of creature',
    at('critter-kinds', LIFE_KINDS.length),
  ),
];

const seaside: readonly StickerDef[] = [
  make('shell', 'seaside', 'shell', 'First shell', 'Dig in the sand', at('produce:shell')),
  make('shells-10', 'seaside', 'seashell', 'Shell collector', 'Find ten shells', at('produce:shell', 10)),
  make('pearl', 'seaside', 'pearl', 'A pearl!', 'Open a clam', at('produce:pearl')),
  make('castle', 'seaside', 'castle', 'Sandcastle', 'Build a grand sandcastle', at('castle-grand')),
  make('swim', 'seaside', 'swim', 'Splash!', 'Paddle in the sea', at('swim')),
];

const TOYS: Readonly<Record<WonderId, readonly [WordId, string, string]>> = {
  'sparkle-sky': ['spark', 'Fireworks!', 'Tap the firework launcher'],
  'rainbow-ride': ['rainbow', 'Rainbow ride', 'Tap the rainbow slide'],
  'cloud-bounce': ['cloud', 'Cloud bounce', 'Tap a bouncy mushroom'],
  'star-cannon': ['rocket', 'Star cannon', 'Tap the spell cannon'],
  'balloon-song': ['balloon', 'Balloon song', 'Tap the balloons'],
  'bubble-garden': ['bubble', 'Bubble garden', 'Tap the bubble machine'],
  'party-time': ['mask', 'Dance party', 'Tap the confetti popper'],
  'morph-machine': ['potion', 'Changing machine', 'Tap the changing machine'],
  'jewel-fountain': ['jewel', 'Jewel fountain', 'Tap the jewel fountain'],
  'lily-hop': ['lily', 'Lily hop', 'Tap the frog pond'],
  'treasure-rain': ['coin', 'Treasure rain', 'Tap the treasure rain maker'],
  'tone-matrix': ['piano', 'Light piano', 'Tap the piano of lights'],
  'tree-trim': ['bauble', 'Christmas tree', 'Tap the Christmas tree'],
  'sleigh-run': ['santa', "Santa's sleigh", 'Tap the sleigh'],
};

/** The games played at a toy in the snow keep their stickers on the Winter page. */
const WINTER_GAMES: readonly WonderId[] = ['tree-trim', 'sleigh-run'];

const gameSticker = (id: WonderId, page: StickerPageId): StickerDef => {
  const [emblem, name, hint] = TOYS[id];
  return make(`game-${id}`, page, emblem, name, hint, at(`wonder:${id}`));
};

const games: readonly StickerDef[] = WONDER_IDS.filter((id) => !WINTER_GAMES.includes(id)).map((id) =>
  gameSticker(id, 'games'),
);

/**
 * The things in Santa's grove and cabin that answer a tap with a treat, and the sticker for each.
 * A tap on one is counted as `tap:` and the toy's name.
 */
const WINTER_TAPS = [
  ['snowman', 'snowman', 'Hello, snowman!', 'Tap the snowman'],
  ['reindeer', 'reindeer', 'Hello, reindeer!', 'Tap a reindeer'],
  ['snow-pile', 'snow', 'Soft snow', 'Tap a pile of snow'],
  ['candy-lamp', 'candy', 'Candy lamp', 'Tap a candy lamp'],
  ['cabin-hearth', 'flame', 'Cosy fire', 'Tap the fire in the cabin'],
  ['cookie-table', 'cookie', 'Cookies!', 'Tap the cookie table'],
] as const satisfies readonly (readonly [string, WordId, string, string])[];

/** The toys whose taps the album counts. */
export const TAPPED: readonly string[] = WINTER_TAPS.map(([toy]) => toy);

const winter: readonly StickerDef[] = [
  make('present', 'winter', 'present', 'A present!', 'Open a present', at('presents')),
  make('presents-10', 'winter', 'gift', 'So many presents', 'Open ten presents', at('presents', 10)),
  ...WINTER_TAPS.map(([toy, emblem, name, hint]) => make(`tap-${toy}`, 'winter', emblem, name, hint, at(`tap:${toy}`))),
  gameSticker('tree-trim', 'winter'),
  make('tree', 'winter', 'tinsel', 'The tree is ready', 'Dress the whole Christmas tree', at('finale:tree-trim')),
  gameSticker('sleigh-run', 'winter'),
  make('delivery', 'winter', 'sleigh', 'Special delivery', 'Help Santa deliver the presents', at('finale:sleigh-run')),
];

/** The games that have a finale to reach. A game that is only played has none. */
const FINISHABLE = WONDER_IDS.filter((id) => !isFree(id));

const shine: readonly StickerDef[] = [
  make('finale', 'shine', 'star', 'A shining finish', 'Play a game all the way to its finale', at('finales')),
  make('finales-5', 'shine', 'comet', 'Shooting star', 'Finish five games', at('finales', 5)),
  make('finales-all', 'shine', 'sun', 'Superstar', 'Finish every game', at('finale-kinds', FINISHABLE.length)),
  make('photo', 'shine', 'frame', 'Say cheese!', 'Take a picture with the camera', at('photos')),
  make('photos-5', 'shine', 'portrait', 'Photographer', 'Take five pictures', at('photos', 5)),
  make('photos-20', 'shine', 'painting', 'Picture gallery', 'Take twenty pictures', at('photos', 20)),
  make('doodle', 'shine', 'easel', 'Little artist', 'Draw on a picture and keep it', at('doodles')),
  make('doodles-5', 'shine', 'palette', 'Rainbow artist', 'Keep five drawings', at('doodles', 5)),
];

const learning: readonly StickerDef[] = [
  make('word', 'learning', 'pen', 'First word', 'Spell a word', at('words')),
  make('words-10', 'learning', 'page', 'Ten words', 'Spell ten different words', at('words', 10)),
  make('words-50', 'learning', 'story', 'Fifty words', 'Spell fifty different words', at('words', 50)),
  make('words-100', 'learning', 'scroll', 'A hundred words', 'Spell a hundred different words', at('words', 100)),
  make('words-200', 'learning', 'quill', 'Two hundred words', 'Spell two hundred different words', at('words', 200)),
  make('words-all', 'learning', 'owl', 'Every word', 'Spell every word in the Spell Book', at('words-all')),
  make('sentence', 'learning', 'mail', 'First sentence', 'Read a whole sentence', at('sentences')),
  make('sentences-10', 'learning', 'desk', 'Bookworm', 'Read ten sentences', at('sentences', 10)),
  make('sums', 'learning', 'telescope', 'Number whiz', 'Play the number game', at('maths-rounds')),
  make('sums-10', 'learning', 'globe', 'Number wizard', 'Play the number game ten times', at('maths-rounds', 10)),
  make('memory', 'learning', 'mirror', 'Good memory', 'Play the memory game', at('memory-games')),
  make(
    'memory-big',
    'learning',
    'dream',
    'Memory star',
    'Win the memory game with twelve pairs',
    at('memory-pairs', 12),
  ),
];

const writing: readonly StickerDef[] = [
  make('write', 'writing', 'ink', 'First letter', 'Write a letter', at('letters')),
  make('letters-10', 'writing', 'rune', 'Ten letters', 'Write ten different letters', at('letters', 10)),
  make('abc-big', 'writing', 'charm', 'The big ABC', 'Write every capital letter', at('letters-upper', LETTERS.length)),
  make(
    'abc-small',
    'writing',
    'book',
    'The little abc',
    'Write every small letter',
    at('letters-lower', LETTERS.length),
  ),
  make('write-number', 'writing', 'coin', 'First number', 'Write a number', at('digits')),
  make(
    'numbers-all',
    'writing',
    'crown',
    'Every number',
    'Write every number from 0 to 9',
    at('digits', DIGITS.length),
  ),
];

export const STICKERS: readonly StickerDef[] = [
  ...friends,
  ...places,
  ...magic,
  ...harvest,
  ...critters,
  ...seaside,
  ...winter,
  ...games,
  ...shine,
  ...learning,
  ...writing,
];

/** The stickers of one page, in the order they are drawn. */
export const stickersOf = (page: StickerPageId): readonly StickerDef[] => STICKERS.filter((s) => s.page === page);

const byId = new Map(STICKERS.map((s) => [s.id, s]));
export const stickerOf = (id: string): StickerDef | undefined => byId.get(id);

/** What the game keeps about the player: a number for each name, and none for a name not seen yet. */
export type Facts = Readonly<Record<string, number>>;

/** The name the album counts a letter or a numeral the player wrote under. */
export const writtenName = (kind: WriteKind, symbol: string): string => `${kind}:${symbol}`;

const UPPER_WRITTEN = LETTERS.map((letter) => writtenName('upper', letter));
const LOWER_WRITTEN = LETTERS.map((letter) => writtenName('lower', letter));
const DIGIT_WRITTEN = DIGITS.map((digit) => writtenName('digits', digit));

/** The counts the game keeps as the player plays, which the album stores. */
export const COUNTED = [
  ...MAGIC_KINDS.map((kind) => `cast:${kind}`),
  ...PRODUCE_IDS.map((id) => `produce:${id}`),
  ...LIFE_KINDS.map((kind) => `poke:${kind}`),
  ...WONDER_IDS.flatMap((id) => [`wonder:${id}`, `finale:${id}`]),
  ...TAPPED.map((toy) => `tap:${toy}`),
  'castle-grand',
  'swim',
  'presents',
  'photos',
  'doodles',
  ...UPPER_WRITTEN,
  ...LOWER_WRITTEN,
  ...DIGIT_WRITTEN,
] as const;

/** What the world and the learner's books say, which the album does not keep for itself. */
export interface Standing {
  /** The places the player has been to. */
  visited: readonly string[];
  /** The unicorns in the herd, Wildstar included. */
  recruited: readonly string[];
  words: number;
  /** Every word of the Spell Book has been spelled. */
  allWords: boolean;
  sentences: number;
  mathsRounds: number;
  memoryGames: number;
  /** The most pairs in a memory game the player has won. */
  memoryPairs: number;
}

export const NOTHING_YET: Standing = {
  visited: [],
  recruited: [],
  words: 0,
  allWords: false,
  sentences: 0,
  mathsRounds: 0,
  memoryGames: 0,
  memoryPairs: 0,
};

const sum = (counts: Facts, names: readonly string[]): number => names.reduce((n, name) => n + (counts[name] ?? 0), 0);
const some = (counts: Facts, names: readonly string[]): number =>
  names.filter((name) => (counts[name] ?? 0) > 0).length;

/**
 * Every fact there is: what the album counted, and what the world and the books say, put together
 * into the names the stickers use.
 */
export function factsOf(counts: Facts, standing: Standing): Facts {
  const facts: Record<string, number> = {};
  for (const name of COUNTED) if ((counts[name] ?? 0) > 0) facts[name] = counts[name]!;
  const food = FOOD_IDS.map((id) => `produce:${id}`);
  const gems = GEM_IDS.map((id) => `produce:${id}`);
  const pokes = LIFE_KINDS.map((kind) => `poke:${kind}`);
  const casts = COUNTED.filter((name) => name.startsWith('cast:'));
  const finales = WONDER_IDS.map((id) => `finale:${id}`);
  facts.casts = sum(counts, casts);
  facts.magics = some(counts, casts);
  facts.food = sum(counts, food);
  facts.foods = some(counts, food);
  facts.gems = sum(counts, gems);
  facts['gem-kinds'] = some(counts, gems);
  facts.pokes = sum(counts, pokes);
  facts['critter-kinds'] = some(counts, pokes);
  facts.finales = sum(counts, finales);
  facts['finale-kinds'] = some(counts, finales);
  for (const id of standing.recruited) facts[`friend:${id}`] = 1;
  facts.friends = standing.recruited.length;
  const seen = new Set(standing.visited);
  for (const id of MAP_IDS) if (seen.has(id)) facts[`visited:${id}`] = 1;
  facts.rooms = ROOMS.filter((id) => seen.has(id)).length;
  facts.places = MAP_IDS.filter((id) => seen.has(id)).length;
  facts['letters-upper'] = some(counts, UPPER_WRITTEN);
  facts['letters-lower'] = some(counts, LOWER_WRITTEN);
  facts.digits = some(counts, DIGIT_WRITTEN);
  facts.letters = LETTERS.filter(
    (letter) => (counts[writtenName('upper', letter)] ?? 0) > 0 || (counts[writtenName('lower', letter)] ?? 0) > 0,
  ).length;
  facts.words = standing.words;
  facts['words-all'] = standing.allWords ? 1 : 0;
  facts.sentences = standing.sentences;
  facts['maths-rounds'] = standing.mathsRounds;
  facts['memory-games'] = standing.memoryGames;
  facts['memory-pairs'] = standing.memoryPairs;
  return facts;
}

/** Every name a fact can have. The stickers may wait on these and on nothing else. */
export function factNames(): ReadonlySet<string> {
  const names = new Set<string>(COUNTED);
  for (const name of [
    'casts',
    'magics',
    'food',
    'foods',
    'gems',
    'gem-kinds',
    'pokes',
    'critter-kinds',
    'finales',
    'finale-kinds',
    'friends',
    'rooms',
    'places',
    'letters',
    'letters-upper',
    'letters-lower',
    'digits',
    'words',
    'words-all',
    'sentences',
    'maths-rounds',
    'memory-games',
    'memory-pairs',
  ])
    names.add(name);
  for (const id of UNICORN_IDS) names.add(`friend:${id}`);
  for (const id of MAP_IDS) names.add(`visited:${id}`);
  return names;
}

/** The stickers whose facts have all reached their numbers and that the player does not have yet. */
export function newlyEarned(facts: Facts, got: Readonly<Record<string, number>>): StickerDef[] {
  return STICKERS.filter((s) => !Object.hasOwn(got, s.id) && s.needs.every((n) => (facts[n.fact] ?? 0) >= n.atLeast));
}

/**
 * How far the player is to a sticker that asks for a number of something, as the count so far and
 * the count wanted. Nothing for a sticker that asks for a thing done once.
 */
export function progressOf(sticker: StickerDef, facts: Facts): { have: number; of: number } | null {
  const [only, ...more] = sticker.needs;
  if (!only || more.length > 0 || only.atLeast <= 1) return null;
  return { have: Math.min(facts[only.fact] ?? 0, only.atLeast), of: only.atLeast };
}
