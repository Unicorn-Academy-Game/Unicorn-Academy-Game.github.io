import { lifeSubject, propSubject, SUBJECTS, unicornSubject } from '../../src/content/lexicon';
import type { MapAsset } from '../../src/shared/manifest';
import type { LogicMap } from '../../src/shared/map';

/**
 * What the manifest says about a map apart from its files: the things that stand in it and give a
 * word, and the ways out of it. The game works out the road to a word from this, without loading
 * the maps on the way.
 */
export function factsOf(logic: LogicMap): Pick<MapAsset, 'subjects' | 'exits'> {
  const standing = new Set<string>([
    ...logic.life.map((zone) => lifeSubject(zone.kind)),
    ...logic.interactables.map((prop) => propSubject(prop.definitionId)),
    ...logic.encounters.map((encounter) => unicornSubject(encounter.unicornId)),
  ]);
  return {
    subjects: SUBJECTS.filter((subject) => standing.has(subject)),
    exits: logic.portals.map((portal) => ({ portalId: portal.portalId, mapId: portal.to.mapId })),
  };
}
