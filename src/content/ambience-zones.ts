import type { AmbienceId } from '../shared/audio';
import type { MapId, Vec2 } from '../shared/ids';

/**
 * Places inside a map that sound different from the rest of it. The forest sings with birds, but by
 * the Spooky Manor it is night: a low wind, an owl, a creaking gate and tiny wisps. The ambience
 * crosses over as the leader walks in.
 */
export interface AmbienceZone {
  mapId: MapId;
  at: Vec2;
  radius: number;
  ambience: AmbienceId;
}

/** The manor's door is at (2688, 1318). The zone is centred on the yard in front of it. */
export const AMBIENCE_ZONES: readonly AmbienceZone[] = [
  { mapId: 'forest', at: { x: 2688, y: 1460 }, radius: 560, ambience: 'manor-yard' },
];

/**
 * How much farther out a zone is left than it was entered, so standing at its edge does not flicker
 * between two sounds.
 */
const ZONE_EXIT_MARGIN = 160;

/**
 * The ambience for where the leader stands. `heard` is what plays now, and a zone already heard is
 * left only past the margin.
 */
export function ambienceAt(mapId: MapId, at: Vec2, heard: AmbienceId, mapAmbience: AmbienceId): AmbienceId {
  for (const zone of AMBIENCE_ZONES) {
    if (zone.mapId !== mapId) continue;
    const reach = zone.radius + (heard === zone.ambience ? ZONE_EXIT_MARGIN : 0);
    if (Math.hypot(at.x - zone.at.x, at.y - zone.at.y) < reach) return zone.ambience;
  }
  return mapAmbience;
}
