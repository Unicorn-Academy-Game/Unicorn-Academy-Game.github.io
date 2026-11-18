import type { MapId } from '../shared/ids';

/**
 * How a way out looks. A child finds a door by seeing a place that glows and a big arrow hopping
 * over it, so each exit is dressed for where it leads: a colour for the glow and an icon on the
 * arrow that points to it from the edge of the screen. Every map must say how it looks from
 * outside, so a new map cannot be added without its exit being dressed.
 */

export type ExitIcon =
  | 'tree'
  | 'flower'
  | 'gem'
  | 'horseshoe'
  | 'castle'
  | 'star'
  | 'pumpkin'
  | 'door'
  | 'wave'
  | 'shell';

export interface ExitLook {
  /** A content id, so the word can be read out and spelled later. */
  id: string;
  word: string;
  /** The colour of the glow, the beam and the arrow. */
  tint: number;
  icon: ExitIcon;
}

export const EXIT_LOOKS: Readonly<Record<MapId, ExitLook>> = {
  forest: { id: 'exit.forest', word: 'forest', tint: 0x7be36a, icon: 'tree' },
  'palace-garden': { id: 'exit.garden', word: 'garden', tint: 0xff9ad5, icon: 'flower' },
  'treasure-house': { id: 'exit.treasure-house', word: 'treasure house', tint: 0xffd84a, icon: 'gem' },
  'palace-hall': { id: 'exit.palace-hall', word: 'throne room', tint: 0xd59bff, icon: 'castle' },
  stable: { id: 'exit.stable', word: 'stable', tint: 0xffa45c, icon: 'horseshoe' },
  playground: { id: 'exit.playground', word: 'playground', tint: 0x7fd8ff, icon: 'star' },
  'dance-floor': { id: 'exit.dance-floor', word: 'dance floor', tint: 0xff5fd2, icon: 'star' },
  'manor-hall': { id: 'exit.manor-hall', word: 'wonder gallery', tint: 0xff6a1f, icon: 'pumpkin' },
  'manor-upper': { id: 'exit.manor-upper', word: 'sky garden', tint: 0x5fe3c0, icon: 'flower' },
  'crystal-cave': { id: 'exit.crystal-cave', word: 'crystal cave', tint: 0xb98cff, icon: 'gem' },
  'palace-dining': { id: 'exit.palace-dining', word: 'dining room', tint: 0xa6e08a, icon: 'door' },
  'palace-tea': { id: 'exit.palace-tea', word: 'tea room', tint: 0xffb6c9, icon: 'flower' },
  'palace-gallery': { id: 'exit.palace-gallery', word: 'long gallery', tint: 0xffd9a0, icon: 'door' },
  'palace-library': { id: 'exit.palace-library', word: 'library', tint: 0x8fb6ff, icon: 'star' },
  'palace-music': { id: 'exit.palace-music', word: 'music room', tint: 0xc7a2ff, icon: 'star' },
  'palace-ballroom': { id: 'exit.palace-ballroom', word: 'ballroom', tint: 0xff7fd0, icon: 'castle' },
  'palace-flowers': { id: 'exit.palace-flowers', word: 'flower room', tint: 0xff8fb0, icon: 'flower' },
  'palace-bedroom': { id: 'exit.palace-bedroom', word: 'bedroom', tint: 0x9aa2ff, icon: 'castle' },
  'palace-jewel': { id: 'exit.palace-jewel', word: 'jewel room', tint: 0x7ff0ff, icon: 'gem' },
  river: { id: 'exit.river', word: 'magic river', tint: 0x5fd6ff, icon: 'wave' },
  beach: { id: 'exit.beach', word: 'beach', tint: 0xffd98a, icon: 'shell' },
  'magic-hall': { id: 'exit.magic-hall', word: 'magic hall', tint: 0xff8cf0, icon: 'castle' },
  'witch-hut': { id: 'exit.witch-hut', word: 'witch hut', tint: 0xb8f06a, icon: 'door' },
  'santa-grove': { id: 'exit.santa-grove', word: 'Santa grove', tint: 0xff5a5a, icon: 'star' },
  'santa-cabin': { id: 'exit.santa-cabin', word: 'cabin', tint: 0xffb347, icon: 'door' },
};

/**
 * The places whose way in is always pointed to, even when nearer ways are not. The garden is where
 * the game opens out into the palace and everything round it, and the forest has more ways on than
 * there are bubbles, so without this the farthest of them, which is the garden's gate, goes unseen
 * on the first screen.
 */
export const MAIN_WAYS: ReadonlySet<MapId> = new Set<MapId>(['palace-garden']);

/**
 * The three pictures a way out is drawn with, from the effects bundle: the glowing place, the
 * column of light and the arrow.
 */
export const EXIT_SPRITE = { pad: 'fx-exit-pad', beam: 'fx-exit-beam', arrow: 'fx-exit-arrow' } as const;

/**
 * How far above the ground an exit's arrow hovers, in world units. The edge arrow points at this,
 * not at the ground.
 */
export const EXIT_ARROW_HEIGHT = 120;
