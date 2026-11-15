import type { MagicKind, MapId, UnicornId } from '../shared/ids';
import type { ActivityId } from './activities';

export interface UnicornDefinition {
  id: UnicornId;
  displayName: string;
  canonicalRider: string;
  magic: MagicKind;
  /** The name of the magic, as the game shows it. */
  magicLabel: string;
  assetBundle: string;
  /** The map where the friend waits to be discovered. Wildstar starts recruited and has none. */
  encounter: { mapId: MapId } | null;
  /** Relative preference for each activity this unicorn does on its own. Absent means never. */
  activityWeights: Partial<Record<ActivityId, number>>;
  signatureActivity: ActivityId;
}

export const UNICORN_DEFS: Record<UnicornId, UnicornDefinition> = {
  wildstar: {
    id: 'wildstar',
    displayName: 'Wildstar',
    canonicalRider: 'Sophia Mendoza',
    magic: 'light',
    magicLabel: 'Light',
    assetBundle: 'unicorn-wildstar',
    encounter: null,
    activityWeights: { stand: 3, 'look-around': 2, 'mote-gaze': 4, rest: 1 },
    signatureActivity: 'mote-gaze',
  },
  leaf: {
    id: 'leaf',
    displayName: 'Leaf',
    canonicalRider: 'Ava Banji',
    magic: 'nature',
    magicLabel: 'Nature',
    assetBundle: 'unicorn-leaf',
    encounter: { mapId: 'forest' },
    activityWeights: { graze: 3, drink: 2, rest: 2, 'flower-sniff': 4, nuzzle: 3, stand: 1 },
    signatureActivity: 'flower-sniff',
  },
  glacier: {
    id: 'glacier',
    displayName: 'Glacier',
    canonicalRider: 'Layla Fletcher',
    magic: 'ice',
    magicLabel: 'Ice',
    assetBundle: 'unicorn-glacier',
    encounter: { mapId: 'forest' },
    activityWeights: { graze: 3, drink: 2, stretch: 2, 'hoof-stamp': 4, stand: 1, 'look-around': 1 },
    signatureActivity: 'hoof-stamp',
  },
  river: {
    id: 'river',
    displayName: 'River',
    canonicalRider: 'Isabel Armstrong',
    magic: 'water',
    magicLabel: 'Water',
    assetBundle: 'unicorn-river',
    encounter: { mapId: 'forest' },
    activityWeights: { graze: 2, drink: 3, nuzzle: 3, splash: 4, stand: 1 },
    signatureActivity: 'splash',
  },
  cinder: {
    id: 'cinder',
    displayName: 'Cinder',
    canonicalRider: 'Valentina Furi',
    magic: 'fire',
    magicLabel: 'Fire',
    assetBundle: 'unicorn-cinder',
    encounter: { mapId: 'forest' },
    activityWeights: { graze: 2, drink: 2, 'mane-toss': 4, stand: 1, 'look-around': 1, rest: 1 },
    signatureActivity: 'mane-toss',
  },
  storm: {
    id: 'storm',
    displayName: 'Storm',
    canonicalRider: 'Rory Carmichael',
    magic: 'lightning',
    magicLabel: 'Lightning',
    assetBundle: 'unicorn-storm',
    encounter: { mapId: 'forest' },
    activityWeights: { graze: 2, drink: 2, hop: 4, 'look-around': 3, stand: 1 },
    signatureActivity: 'hop',
  },
};

/** The order the whole herd follows Wildstar in, nearest first, however the friends were found. */
export const HERD_LINE: readonly UnicornId[] = ['leaf', 'glacier', 'river', 'cinder', 'storm'];

/** Whether every friend has been found. */
export const herdIsWhole = (found: readonly UnicornId[]): boolean => HERD_LINE.every((id) => found.includes(id));

/**
 * Who follows Wildstar, nearest first. Friends stand in the order they were found until all five
 * have been, and then they stand in the herd's own order.
 */
export const lineOf = (found: readonly UnicornId[]): UnicornId[] =>
  herdIsWhole(found) ? [...HERD_LINE] : found.filter((id) => id !== 'wildstar');
