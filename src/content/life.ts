import type { LifeKind } from '../shared/life';
import type { EffectId } from './activities';

/**
 * Everyone who lives in the world besides the unicorns and the grown-ups: birds on the grass, frogs
 * by the water, ducks and fish in the ponds, butterflies, bees and the fairies who drift about
 * everywhere. They are all gentle. A tap on one makes it do something delightful, and none of them
 * can be hurt, caught or lost.
 */

/** Where a creature lives: on dry ground, on the water, or in the air above everything. */
type Home = 'ground' | 'water' | 'air';

/** How it gets from one place to the next. Speeds are in world units a second. */
type Gait =
  /** Steadily, along the ground or the water. */
  | { kind: 'walk'; speed: number }
  /**
   * In short hops, crouching before each and after it. `lead` and `tail` are the shares of a hop
   * spent crouching.
   */
  | { kind: 'hop'; speed: number; height: number; crouch: string; lead: number; tail: number }
  /** Takes off, flies low in an arc and lands. */
  | { kind: 'flit'; speed: number; height: readonly [number, number] }
  /** Stays in the air and drifts from place to place. */
  | { kind: 'cruise'; speed: number; altitude: readonly [number, number] };

/** What it does when it is tapped. */
type Reaction =
  /** Jumps on the spot `times` times, in the clip named, each jump `seconds` long. */
  | { kind: 'hop'; times: number; clip: string; height: number; seconds: number }
  /** Flies up and lands a little way off. */
  | { kind: 'flit'; clip: string; speed: number; height: readonly [number, number] }
  /** Stays where it is and does something for a moment. */
  | { kind: 'pose'; clip: string; seconds: number }
  /** Loops the loop in the air. */
  | { kind: 'twirl'; seconds: number };

export interface LifeDef {
  /** Stable name for this kind of thing, for whatever later wants to talk about it. */
  id: string;
  /** What a child would call it. */
  word: string;
  home: Home;
  /** The colours it comes in. Every one has its own pictures. */
  looks: readonly string[];
  gait: Gait;
  /** The clip it plays while it gets about. A flit and a hop name their own. */
  moving: string;
  /** What it does between trips, and how often. */
  rests: readonly { clip: string; weight: number }[];
  /** How long it stays put between trips, in seconds. */
  restFor: readonly [number, number];
  /** How far one trip goes. */
  leg: readonly [number, number];
  /** How close a unicorn comes before it moves off, or 0 for the ones who do not mind. */
  startle: number;
  /** How far away a unicorn is before it comes over to look, for the ones who are curious. */
  curious?: number;
  tapped: Reaction;
  /** What shimmers around it when it is tapped. */
  effect: EffectId;
  /**
   * The area a tap counts for, as half-sizes around its middle, which sits `cy` above its ground
   * point.
   */
  body: { rx: number; ry: number; cy: number };
}

const rests = (...r: readonly [string, number][]): LifeDef['rests'] => r.map(([clip, weight]) => ({ clip, weight }));

export const LIFE: Readonly<Record<LifeKind, LifeDef>> = {
  bird: {
    id: 'life.bird',
    word: 'bird',
    home: 'ground',
    looks: ['blue', 'robin', 'canary', 'rosy'],
    gait: { kind: 'flit', speed: 150, height: [30, 54] },
    moving: 'fly',
    rests: rests(['idle', 3], ['peck', 2]),
    restFor: [1.6, 5],
    leg: [110, 260],
    startle: 130,
    tapped: { kind: 'flit', clip: 'fly', speed: 150, height: [40, 62] },
    effect: 'pip-sparkle',
    body: { rx: 30, ry: 28, cy: 24 },
  },
  frog: {
    id: 'life.frog',
    word: 'frog',
    home: 'ground',
    looks: ['green', 'teal', 'sunny'],
    gait: { kind: 'hop', speed: 80, height: 22, crouch: 'crouch', lead: 0.2, tail: 0.16 },
    moving: 'air',
    rests: rests(['sit', 1]),
    restFor: [2.5, 7],
    leg: [44, 100],
    startle: 90,
    tapped: { kind: 'hop', times: 2, clip: 'air', height: 30, seconds: 0.55 },
    effect: 'pip-hearts',
    body: { rx: 28, ry: 24, cy: 18 },
  },
  duck: {
    id: 'life.duck',
    word: 'duck',
    home: 'water',
    looks: ['white', 'yellow', 'mallard'],
    gait: { kind: 'walk', speed: 24 },
    moving: 'float',
    rests: rests(['float', 1]),
    restFor: [2, 6],
    leg: [44, 150],
    startle: 100,
    tapped: { kind: 'pose', clip: 'quack', seconds: 1 },
    effect: 'splash',
    body: { rx: 38, ry: 26, cy: 16 },
  },
  bunny: {
    id: 'life.bunny',
    word: 'bunny',
    home: 'ground',
    looks: ['white', 'grey', 'caramel'],
    gait: { kind: 'hop', speed: 110, height: 18, crouch: 'sit', lead: 0.12, tail: 0.1 },
    moving: 'hop',
    rests: rests(['sit', 1]),
    restFor: [2, 6],
    leg: [56, 120],
    startle: 130,
    tapped: { kind: 'hop', times: 3, clip: 'hop', height: 24, seconds: 0.46 },
    effect: 'pip-hearts',
    body: { rx: 30, ry: 38, cy: 30 },
  },
  snail: {
    id: 'life.snail',
    word: 'snail',
    home: 'ground',
    looks: ['peach', 'violet', 'mint'],
    gait: { kind: 'walk', speed: 8 },
    moving: 'crawl',
    rests: rests(['crawl', 1]),
    restFor: [1, 4],
    leg: [20, 60],
    startle: 0,
    tapped: { kind: 'pose', clip: 'crawl', seconds: 1.3 },
    effect: 'pip-sparkle',
    body: { rx: 26, ry: 20, cy: 14 },
  },
  ladybug: {
    id: 'life.ladybug',
    word: 'ladybug',
    home: 'ground',
    looks: ['red', 'orange', 'yellow'],
    gait: { kind: 'walk', speed: 22 },
    moving: 'walk',
    rests: rests(['walk', 1]),
    restFor: [0.6, 2.2],
    leg: [18, 60],
    startle: 0,
    tapped: { kind: 'flit', clip: 'fly', speed: 70, height: [24, 40] },
    effect: 'pip-sparkle',
    body: { rx: 20, ry: 16, cy: 8 },
  },
  fish: {
    id: 'life.fish',
    word: 'fish',
    home: 'water',
    looks: ['koi', 'blue', 'gold'],
    gait: { kind: 'walk', speed: 18 },
    moving: 'swim',
    rests: rests(['swim', 1]),
    restFor: [0.5, 2.5],
    leg: [30, 120],
    startle: 70,
    tapped: { kind: 'hop', times: 1, clip: 'leap', height: 36, seconds: 0.95 },
    effect: 'splash',
    body: { rx: 26, ry: 16, cy: 4 },
  },
  butterfly: {
    id: 'life.butterfly',
    word: 'butterfly',
    home: 'air',
    looks: ['monarch', 'morpho', 'swallowtail', 'blossom', 'lilac'],
    gait: { kind: 'cruise', speed: 36, altitude: [34, 70] },
    moving: 'flutter',
    rests: rests(['flutter', 1]),
    restFor: [0.1, 0.7],
    leg: [60, 170],
    startle: 0,
    tapped: { kind: 'twirl', seconds: 1.2 },
    effect: 'pip-sparkle',
    body: { rx: 32, ry: 28, cy: 22 },
  },
  dragonfly: {
    id: 'life.dragonfly',
    word: 'dragonfly',
    home: 'air',
    looks: ['sapphire', 'ruby', 'jade'],
    gait: { kind: 'cruise', speed: 95, altitude: [26, 54] },
    moving: 'hover',
    rests: rests(['hover', 1]),
    restFor: [0.6, 2.2],
    leg: [60, 210],
    startle: 0,
    tapped: { kind: 'twirl', seconds: 0.9 },
    effect: 'pip-sparkle',
    body: { rx: 40, ry: 26, cy: 20 },
  },
  bee: {
    id: 'life.bee',
    word: 'bee',
    home: 'air',
    looks: ['honey'],
    gait: { kind: 'cruise', speed: 62, altitude: [18, 42] },
    moving: 'fly',
    rests: rests(['fly', 1]),
    restFor: [0.5, 1.8],
    leg: [40, 130],
    startle: 0,
    tapped: { kind: 'twirl', seconds: 1 },
    effect: 'pip-hearts',
    body: { rx: 24, ry: 20, cy: 14 },
  },
  fairy: {
    id: 'life.fairy',
    word: 'fairy',
    home: 'air',
    looks: ['pink', 'lilac', 'mint', 'sky', 'sun', 'coral'],
    gait: { kind: 'cruise', speed: 30, altitude: [40, 78] },
    moving: 'fly',
    rests: rests(['fly', 1]),
    restFor: [1.2, 3.5],
    leg: [50, 150],
    startle: 0,
    curious: 300,
    tapped: { kind: 'twirl', seconds: 1.7 },
    effect: 'fairy-dust',
    body: { rx: 46, ry: 48, cy: 46 },
  },
};

/** The most creatures one map may hold at once, so a busy meadow stays light on a phone. */
export const LIFE_CAP = 128;

/** The sprite a creature in a clip is drawn from. */
export const lifeSprite = (kind: LifeKind, look: string, clip: string): string => `${kind}-${look}-${clip}`;

/**
 * Every sprite id the game may ask for, so the art can be checked against what the content
 * promises.
 */
export function lifeSprites(): string[] {
  const clips: Record<LifeKind, readonly string[]> = {
    bird: ['idle', 'peck', 'fly'],
    frog: ['sit', 'crouch', 'air'],
    duck: ['float', 'quack'],
    bunny: ['sit', 'hop'],
    snail: ['crawl'],
    ladybug: ['walk', 'fly'],
    fish: ['leap', 'swim'],
    butterfly: ['flutter'],
    dragonfly: ['hover'],
    bee: ['fly'],
    fairy: ['fly'],
  };
  return (Object.keys(LIFE) as LifeKind[]).flatMap((k) =>
    LIFE[k].looks.flatMap((look) => clips[k].map((c) => lifeSprite(k, look, c))),
  );
}
