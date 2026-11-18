import type { MapId } from '../shared/ids';

/**
 * A button that takes the herd out of where she is in one tap, wherever in the place she stands.
 * A child who is lost in the long gallery or has had enough of the throne room does not have to
 * find a door: the button is always on the screen. Walking out by a door is still how a place
 * leads on, and this is for the child who wants to be somewhere else at once.
 */
export interface WayOut {
  /** What the button says, and what a screen reader says it does. */
  readonly label: string;
  /** Where the herd comes out. */
  readonly to: { readonly mapId: MapId; readonly spawnId: string };
}

/** The throne room and the nine rooms beyond it. */
export const PALACE_ROOMS = [
  'palace-hall',
  'palace-dining',
  'palace-tea',
  'palace-gallery',
  'palace-library',
  'palace-music',
  'palace-ballroom',
  'palace-flowers',
  'palace-bedroom',
  'palace-jewel',
] as const satisfies readonly MapId[];

/** On the lawn in front of the palace door, facing the garden, as when she walks out of it. */
const OUT_OF_THE_PALACE: WayOut = {
  label: 'Go outside',
  to: { mapId: 'palace-garden', spawnId: 'from-palace' },
};

const wayOuts: Partial<Record<MapId, WayOut>> = {};
for (const room of PALACE_ROOMS) wayOuts[room] = OUT_OF_THE_PALACE;

/** The way out of each place that has one. */
export const WAY_OUT: Readonly<Partial<Record<MapId, WayOut>>> = wayOuts;
