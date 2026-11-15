import type { StartPlaceId } from '../shared/places';
import type { DeviceSettings } from '../shared/save';
import type { SeasonChoice } from '../shared/seasons';

/**
 * The four choices on the start screen. Each is a device setting under another name: starting from
 * scratch is `startFresh`, learning mode is the spelling `on`, the place is `startPlace`, and the
 * season is `season`. They are kept as settings, so a choice is remembered and the parent's
 * controls show the same one.
 */
export interface StartChoices {
  scratch: boolean;
  learning: boolean;
  place: StartPlaceId;
  season: SeasonChoice;
}

export const choicesOf = (s: DeviceSettings): StartChoices => ({
  scratch: s.startFresh,
  learning: s.learning.on,
  place: s.startPlace,
  season: s.season,
});

/**
 * The settings a change to the choices makes. A choice that is not in the change is not touched.
 */
export function settingsFor(change: Partial<StartChoices>, current: DeviceSettings): Partial<DeviceSettings> {
  const patch: Partial<DeviceSettings> = {};
  if (change.scratch !== undefined) patch.startFresh = change.scratch;
  if (change.learning !== undefined) patch.learning = { ...current.learning, on: change.learning };
  if (change.place !== undefined) patch.startPlace = change.place;
  if (change.season !== undefined) patch.season = change.season;
  return patch;
}
