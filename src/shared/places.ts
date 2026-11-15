import type { MapId } from './ids';

/**
 * The places a visit can begin, one row each. A start place is a spawn: the spot of a map where the
 * herd arrives, with the friends lined up behind Wildstar. The start screen offers these and the
 * device settings remember the choice by id, so a place added here appears on both and nothing else
 * changes. `tests/maps/start-places.test.ts` checks that every spawn named is in its map.
 */
export const START_PLACES = {
  /** Where every new world has always begun, and where the first friend waits. */
  forest: { label: 'Forest', mapId: 'forest', spawnId: 'start' },
  /**
   * The way the herd comes out of the palace door, facing the garden, with the palace behind her.
   */
  palace: { label: 'Palace', mapId: 'palace-garden', spawnId: 'from-palace' },
} as const satisfies Record<string, { label: string; mapId: MapId; spawnId: string }>;

export type StartPlaceId = keyof typeof START_PLACES;

/** In the order the start screen offers them. The first is the default. */
export const START_PLACE_IDS = Object.keys(START_PLACES) as [StartPlaceId, ...StartPlaceId[]];

export const DEFAULT_START_PLACE: StartPlaceId = START_PLACE_IDS[0];
