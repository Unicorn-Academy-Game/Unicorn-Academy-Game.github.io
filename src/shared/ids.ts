/** Stable identifiers. Saves and assets key off these. */

export const UNICORN_IDS = ['wildstar', 'leaf', 'glacier', 'river', 'cinder', 'storm'] as const;
export type UnicornId = (typeof UNICORN_IDS)[number];

const MAGIC_KINDS = ['light', 'nature', 'ice', 'water', 'fire', 'lightning'] as const;
export type MagicKind = (typeof MAGIC_KINDS)[number];

export const MAP_IDS = [
  'forest',
  'palace-garden',
  'treasure-house',
  'palace-hall',
  'stable',
  'playground',
  'dance-floor',
  'manor-hall',
  'manor-upper',
  'crystal-cave',
  // The rooms of the palace, beyond the throne room.
  'palace-dining',
  'palace-tea',
  'palace-gallery',
  'palace-library',
  'palace-music',
  'palace-ballroom',
  'palace-flowers',
  'palace-bedroom',
  'palace-jewel',
] as const;
export type MapId = (typeof MAP_IDS)[number];

export const FACINGS = ['north', 'south', 'east', 'west'] as const;
export type Facing = (typeof FACINGS)[number];

export interface Vec2 {
  x: number;
  y: number;
}

export const CLIP_NAMES = [
  'idle',
  'walk',
  'cast',
  'graze',
  'drink',
  'signature-idle',
  'rest',
  'stretch',
  'nuzzle',
] as const;
export type ClipName = (typeof CLIP_NAMES)[number];
