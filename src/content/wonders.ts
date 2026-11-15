/**
 * The full-screen games that open from the playground toys. A tap on a toy walks Wildstar to it,
 * she casts, and its game takes the whole screen. Which game a toy opens, and which of its looks
 * plays which way, is written down here so the map authoring, the world and the games all read one
 * answer.
 */

import type { MapId } from '../shared/ids';

export const WONDER_IDS = [
  'sparkle-sky',
  'rainbow-ride',
  'cloud-bounce',
  'star-cannon',
  'balloon-song',
  'bubble-garden',
  'party-time',
  'morph-machine',
  'jewel-fountain',
  'lily-hop',
  'treasure-rain',
  'tone-matrix',
] as const;
export type WonderId = (typeof WONDER_IDS)[number];

export interface WonderDef {
  id: WonderId;
  /** The definition of the prop that opens it. */
  toy: string;
  /**
   * The looks of that prop, in the order the game reads them. Empty for a toy that has only one.
   */
  looks: readonly string[];
  /** What a screen reader says the screen is. */
  label: string;
  /**
   * The game makes only the sounds it makes itself. The world's music is turned off under it, and
   * the screen around it opens and closes without a sound.
   */
  quiet?: true;
  /**
   * A game to play in and nothing to earn. It has no stars, no finale and no pointing hand, and the
   * screen around it shows no meter.
   */
  free?: true;
  /**
   * Where the herd goes on from the screen when the player has seen the game through to its finale,
   * instead of back to the toy.
   */
  continueTo?: { mapId: MapId; spawnId: string };
}

export const WONDERS: Readonly<Record<WonderId, WonderDef>> = {
  'sparkle-sky': {
    id: 'sparkle-sky',
    toy: 'firework-launcher',
    looks: ['red', 'blue', 'gold'],
    label: 'Fireworks over the lake',
  },
  'rainbow-ride': { id: 'rainbow-ride', toy: 'rainbow-slide', looks: [], label: 'A ride down the rainbow' },
  'cloud-bounce': {
    id: 'cloud-bounce',
    toy: 'bouncy-mushroom',
    looks: ['red', 'pink', 'blue'],
    label: 'Bouncing up through the clouds',
  },
  'star-cannon': {
    id: 'star-cannon',
    toy: 'spell-cannon',
    looks: ['star', 'heart'],
    label: 'Waking the stars with a cannon',
  },
  'balloon-song': {
    id: 'balloon-song',
    toy: 'balloon-stand',
    looks: ['party', 'warm', 'cool'],
    label: 'Balloons that play a song',
  },
  'bubble-garden': { id: 'bubble-garden', toy: 'bubble-machine', looks: [], label: 'Bubbles with surprises inside' },
  'party-time': {
    id: 'party-time',
    toy: 'confetti-popper',
    looks: [],
    label: 'A dance party',
    continueTo: { mapId: 'dance-floor', spawnId: 'from-party' },
  },
  'morph-machine': {
    id: 'morph-machine',
    toy: 'morph-machine',
    looks: ['apple-gem', 'berry-flower'],
    label: 'The magic changing machine',
  },
  'jewel-fountain': { id: 'jewel-fountain', toy: 'gem-fountain', looks: [], label: 'A fountain that plays jewels' },
  'lily-hop': { id: 'lily-hop', toy: 'frog-pond', looks: [], label: 'A frog hopping on lily pads' },
  'treasure-rain': {
    id: 'treasure-rain',
    toy: 'rain-maker',
    looks: [],
    label: 'Catching treasure that rains from the sky',
  },
  'tone-matrix': {
    id: 'tone-matrix',
    toy: 'piano',
    looks: [],
    label: 'A piano of lights that plays a song',
    quiet: true,
    free: true,
  },
};

export const isWonder = (id: string): id is WonderId => (WONDER_IDS as readonly string[]).includes(id);

/**
 * A game that is to be heard on its own: no music of the world under it and no sounds from the
 * screen around it.
 */
export const isQuiet = (id: string): boolean => isWonder(id) && WONDERS[id].quiet === true;

/**
 * A game with nothing to earn: the screen around it hides the five stars, and the game never starts
 * a finale.
 */
export const isFree = (id: string): boolean => isWonder(id) && WONDERS[id].free === true;

/**
 * The scenes that are not played but watched: they open over the world at a big moment, run for a
 * few seconds, and give the screen back by themselves. They have no stars and nothing to touch but
 * the way out. The statues each open the postcard, and the lift is played by the ride that carries
 * the player between two floors, so none of these is the game of a toy.
 */
export const CINEMA_IDS = ['manor-word', 'manor-lift', 'statue-postcard', 'finder-finale'] as const;
export type CinemaId = (typeof CINEMA_IDS)[number];

export const CINEMAS: Readonly<Record<CinemaId, { id: CinemaId; label: string }>> = {
  'manor-word': { id: 'manor-word', label: 'The secret word opens the manor door' },
  'manor-lift': { id: 'manor-lift', label: 'A ride in the golden lift' },
  'statue-postcard': { id: 'statue-postcard', label: 'A postcard from the statue' },
  'finder-finale': { id: 'finder-finale', label: 'All the unicorns are together' },
};

export const isCinema = (id: string): id is CinemaId => (CINEMA_IDS as readonly string[]).includes(id);

/**
 * Anything that takes the whole screen and is drawn by a stage: a toy's game, or a scene to watch.
 */
export type ScreenId = WonderId | CinemaId;
export const isScreen = (id: string): id is ScreenId => isWonder(id) || isCinema(id);
export const labelOf = (id: ScreenId): string => (isCinema(id) ? CINEMAS[id].label : WONDERS[id].label);
