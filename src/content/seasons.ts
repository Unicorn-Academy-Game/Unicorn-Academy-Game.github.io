import type { MapId } from '../shared/ids';
import type { LifeKind } from '../shared/life';
import type { SeasonId } from '../shared/seasons';

/**
 * What each season does to the world. The picture of it (recolouring the ground and the scenery,
 * the haze and what falls from the sky) is in `src/render/season`. Summer is the world as it was
 * drawn, so it changes nothing.
 */

/**
 * Whether the sky is over a map. The seasons are for the places that are out of doors. A hall, a
 * house or a cave has its own light and its own weather, so it looks the same all year. A map that
 * is added has to say, which this table makes it do.
 */
export const OPEN_AIR: Readonly<Record<MapId, boolean>> = {
  forest: true,
  'palace-garden': true,
  playground: true,
  'dance-floor': false,
  stable: false,
  'treasure-house': false,
  'palace-hall': false,
  'manor-hall': false,
  'manor-upper': false,
  'crystal-cave': false,
  'palace-dining': false,
  'palace-tea': false,
  'palace-gallery': false,
  'palace-library': false,
  'palace-music': false,
  'palace-ballroom': false,
  'palace-flowers': false,
  'palace-bedroom': false,
  'palace-jewel': false,
};

/** What falls from the sky. */
export type Fall = 'snow' | 'leaves' | 'petals';

/** A veil of colour over the whole picture, as a fraction of how much of its colour shows. */
export interface Haze {
  /** A CSS colour. */
  color: string;
  alpha: number;
}

export interface SeasonFeel {
  /** What falls, or null for a clear sky. */
  fall: Fall | null;
  haze: Haze | null;
  /** The creatures who are asleep or gone for the season, so they are not on the map. */
  away: readonly LifeKind[];
}

export const SEASON_FEEL: Readonly<Record<SeasonId, SeasonFeel>> = {
  spring: { fall: 'petals', haze: { color: '#ffd9f0', alpha: 0.07 }, away: [] },
  summer: { fall: null, haze: null, away: [] },
  autumn: { fall: 'leaves', haze: { color: '#ffb347', alpha: 0.09 }, away: ['dragonfly', 'ladybug'] },
  winter: {
    fall: 'snow',
    haze: { color: '#cfe3ff', alpha: 0.2 },
    away: ['butterfly', 'dragonfly', 'bee', 'ladybug', 'frog', 'snail', 'fish'],
  },
};
