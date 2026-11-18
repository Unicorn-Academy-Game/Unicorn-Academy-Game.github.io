import type { MapId } from '../shared/ids';

/**
 * The picture on each place's button. Each is drawn by the page, so a place is known by its shape
 * and its colour and not only by its name.
 */
export type Glyph =
  | 'tree'
  | 'manor'
  | 'cloud'
  | 'crystal'
  | 'garden'
  | 'castle'
  | 'chest'
  | 'horse'
  | 'slide'
  | 'dance'
  | 'river'
  | 'wand'
  | 'shell'
  | 'crown'
  | 'fork'
  | 'teacup'
  | 'frame'
  | 'book'
  | 'note'
  | 'flower'
  | 'moon'
  | 'gem'
  | 'snow'
  | 'cauldron';

/** A place a child can be taken to in one tap, and where the herd comes out. */
export interface Spot {
  readonly id: string;
  /** What the button says and a screen reader reads. */
  readonly label: string;
  readonly glyph: Glyph;
  /** The colour of its button, as a CSS colour. */
  readonly tint: string;
  readonly to: { readonly mapId: MapId; readonly spawnId: string };
}

/** A place on the island, with where its button stands on the picture, in tenths of a percent. */
export interface Pin extends Spot {
  readonly at: { readonly x: number; readonly y: number };
  /** The pin opens the palace's rooms instead of going anywhere itself. */
  readonly opens?: 'palace';
}

/**
 * The island as a child would draw it: the forest and the manor on the west, the palace and its
 * garden in the middle, the magic river running out past the magic hall to the beach on the east, and a patch of snow
 * at the top where Santa lives and the witch's hut in the south below the crystal cave.
 */
export const ISLAND_PINS: readonly Pin[] = [
  {
    id: 'forest',
    label: 'Forest',
    glyph: 'tree',
    tint: '#4fae5b',
    to: { mapId: 'forest', spawnId: 'start' },
    at: { x: 240, y: 560 },
  },
  {
    id: 'manor',
    label: 'Wonder Gallery',
    glyph: 'manor',
    tint: '#9a6ad8',
    to: { mapId: 'manor-hall', spawnId: 'from-forest' },
    at: { x: 150, y: 330 },
  },
  {
    id: 'sky-garden',
    label: 'Sky Garden',
    glyph: 'cloud',
    tint: '#5bb7f0',
    to: { mapId: 'manor-upper', spawnId: 'from-lift' },
    at: { x: 330, y: 250 },
  },
  {
    id: 'cave',
    label: 'Crystal Cave',
    glyph: 'crystal',
    tint: '#7a7ff0',
    to: { mapId: 'crystal-cave', spawnId: 'from-forest' },
    at: { x: 230, y: 800 },
  },
  {
    id: 'garden',
    label: 'Palace Garden',
    glyph: 'garden',
    tint: '#e86fb4',
    to: { mapId: 'palace-garden', spawnId: 'from-forest' },
    at: { x: 520, y: 560 },
  },
  {
    id: 'palace',
    label: 'Palace',
    glyph: 'castle',
    tint: '#f08fc8',
    to: { mapId: 'palace-hall', spawnId: 'from-garden' },
    at: { x: 520, y: 250 },
    opens: 'palace',
  },
  {
    id: 'treasure',
    label: 'Treasure House',
    glyph: 'chest',
    tint: '#f0b43a',
    to: { mapId: 'treasure-house', spawnId: 'from-garden' },
    at: { x: 385, y: 450 },
  },
  {
    id: 'stable',
    label: 'Stable',
    glyph: 'horse',
    tint: '#c98a52',
    to: { mapId: 'stable', spawnId: 'from-garden' },
    at: { x: 670, y: 410 },
  },
  {
    id: 'playground',
    label: 'Playground',
    glyph: 'slide',
    tint: '#ff8a4c',
    to: { mapId: 'playground', spawnId: 'from-garden' },
    at: { x: 430, y: 770 },
  },
  {
    id: 'dance',
    label: 'Dance Floor',
    glyph: 'dance',
    tint: '#c25be6',
    to: { mapId: 'dance-floor', spawnId: 'from-party' },
    at: { x: 600, y: 850 },
  },
  {
    id: 'river',
    label: 'Magic River',
    glyph: 'river',
    tint: '#35c3e8',
    to: { mapId: 'river', spawnId: 'from-garden' },
    at: { x: 720, y: 600 },
  },
  {
    id: 'hall',
    label: 'Magic Hall',
    glyph: 'wand',
    tint: '#a47cf5',
    to: { mapId: 'magic-hall', spawnId: 'from-river' },
    at: { x: 770, y: 250 },
  },
  {
    id: 'beach',
    label: 'Beach',
    glyph: 'shell',
    tint: '#f4a96a',
    to: { mapId: 'beach', spawnId: 'from-river' },
    at: { x: 850, y: 760 },
  },
  {
    id: 'santa',
    label: 'Santa Grove',
    glyph: 'snow',
    tint: '#e8504a',
    to: { mapId: 'santa-grove', spawnId: 'from-forest' },
    at: { x: 500, y: 135 },
  },
  {
    id: 'cabin',
    label: 'Santa Cabin',
    glyph: 'snow',
    tint: '#d9822b',
    to: { mapId: 'santa-cabin', spawnId: 'from-grove' },
    at: { x: 345, y: 135 },
  },
  {
    id: 'hut',
    label: 'Witch Hut',
    glyph: 'cauldron',
    tint: '#2fb59a',
    to: { mapId: 'witch-hut', spawnId: 'from-cave' },
    at: { x: 340, y: 875 },
  },
];

/** The throne room and the rooms beyond it, in the order a child comes to them from the garden. */
export const PALACE_SPOTS: readonly Spot[] = [
  {
    id: 'throne',
    label: 'Throne Room',
    glyph: 'crown',
    tint: '#f0b43a',
    to: { mapId: 'palace-hall', spawnId: 'from-garden' },
  },
  {
    id: 'dining',
    label: 'Dining Room',
    glyph: 'fork',
    tint: '#ee8a4a',
    to: { mapId: 'palace-dining', spawnId: 'from-hall' },
  },
  {
    id: 'tea',
    label: 'Tea Room',
    glyph: 'teacup',
    tint: '#ec6fa6',
    to: { mapId: 'palace-tea', spawnId: 'from-dining' },
  },
  {
    id: 'gallery',
    label: 'Long Gallery',
    glyph: 'frame',
    tint: '#4f9be8',
    to: { mapId: 'palace-gallery', spawnId: 'from-hall' },
  },
  {
    id: 'library',
    label: 'Library',
    glyph: 'book',
    tint: '#5aa86a',
    to: { mapId: 'palace-library', spawnId: 'from-gallery' },
  },
  {
    id: 'music',
    label: 'Music Room',
    glyph: 'note',
    tint: '#9a6ad8',
    to: { mapId: 'palace-music', spawnId: 'from-gallery' },
  },
  {
    id: 'ballroom',
    label: 'Ballroom',
    glyph: 'dance',
    tint: '#d9a53a',
    to: { mapId: 'palace-ballroom', spawnId: 'from-music' },
  },
  {
    id: 'flowers',
    label: 'Flower Room',
    glyph: 'flower',
    tint: '#6fc06a',
    to: { mapId: 'palace-flowers', spawnId: 'from-dining' },
  },
  {
    id: 'bedroom',
    label: 'Bedroom',
    glyph: 'moon',
    tint: '#7d86e8',
    to: { mapId: 'palace-bedroom', spawnId: 'from-tea' },
  },
  {
    id: 'jewel',
    label: 'Jewel Room',
    glyph: 'gem',
    tint: '#2cc6b4',
    to: { mapId: 'palace-jewel', spawnId: 'from-library' },
  },
];

const PALACE_MAPS: ReadonlySet<MapId> = new Set(PALACE_SPOTS.map((s) => s.to.mapId));

/** The pin that says "you are here" for a place, which is the palace's for any of its rooms. */
export function pinFor(mapId: MapId): string | null {
  if (PALACE_MAPS.has(mapId)) return 'palace';
  const own = ISLAND_PINS.find((p) => p.to.mapId === mapId);
  if (own) return own.id;
  return null;
}
