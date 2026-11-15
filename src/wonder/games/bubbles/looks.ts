import { LIFE, lifeSprite } from '../../../content/life';
import type { LifeKind } from '../../../shared/life';
import type { RGB } from '../../engine/color';
import { wrap } from '../../engine/ease';
import type { Prize } from './kinds';

/**
 * Which pictures each prize can have. A prize that is a creature is one of the world's own
 * creatures and takes its colours and its sprite names from the world's content, so the garden
 * never keeps a second list of them. Nothing here draws.
 */

/** The creatures the garden holds, and which of the world's creatures each one is. */
const LIFE_OF = {
  butterfly: 'butterfly',
  bird: 'bird',
  fish: 'fish',
  ladybug: 'ladybug',
  bee: 'bee',
  snail: 'snail',
  fairy: 'fairy',
} as const satisfies Partial<Record<Prize, LifeKind>>;

export type Creature = keyof typeof LIFE_OF;

export const isCreature = (p: Prize): p is Creature => p in LIFE_OF;

/** The sprites of the flowers that grow in the meadow, one per look. */
const FLOWERS: readonly string[] = [
  'pg-flowers-pink-1',
  'pg-flowers-yellow-1',
  'pg-flowers-sky-1',
  'pg-flowers-white-1',
  'pg-flowers-lilac-1',
  'pg-flowers-coral-1',
  'pg-flowers-pink-2',
  'pg-flowers-yellow-2',
  'pg-flowers-sky-2',
  'pg-flowers-lilac-2',
  'pg-flowers-coral-2',
  'pg-flowers-white-2',
];

/** The colours a gem can be, one to a bubble, so a bubble of gems is not always the same stone. */
export const GEMS: readonly RGB[] = [
  [236, 70, 96],
  [84, 156, 255],
  [70, 214, 140],
  [182, 112, 255],
  [255, 190, 64],
];

/** How many ways each prize can look. */
export function looksOf(prize: Prize): number {
  if (prize === 'flower') return FLOWERS.length;
  if (prize === 'gem') return GEMS.length;
  return isCreature(prize) ? LIFE[LIFE_OF[prize]].looks.length : 1;
}

/**
 * The name of a creature's sprite in a look and a clip. Any whole number is a look: it wraps round.
 */
export function creatureSprite(creature: Creature, look: number, clip: string): string {
  const kind = LIFE_OF[creature];
  const looks = LIFE[kind].looks;
  return lifeSprite(kind, looks[wrap(look, looks.length)]!, clip);
}

export const flowerSprite = (look: number): string => FLOWERS[wrap(look, FLOWERS.length)]!;
