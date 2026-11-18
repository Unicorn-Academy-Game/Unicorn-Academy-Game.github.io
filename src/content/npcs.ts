import type { NpcId } from '../shared/npc';

export type { NpcId };

/** Clips each NPC is drawn with. */
export type NpcClip =
  | 'idle'
  | 'walk'
  | 'wave'
  | 'water'
  | 'inspect'
  | 'trim'
  | 'sweep'
  | 'carry'
  | 'brush'
  | 'pickup'
  | 'putdown'
  | 'tend'
  | 'dance';

/** One beat of a routine. A routine loops forever while its map is loaded. */
type NpcStep =
  /** Walk to the next anchor with this tag, in id order, and work there. */
  | { kind: 'work'; tag: string; clip: NpcClip; seconds: readonly [number, number] }
  /** Pick up at one anchor, carry to another, put down. */
  | { kind: 'carry'; from: string; to: string; seconds: readonly [number, number] };

/**
 * A worker who brushes a unicorn that is being groomed, if the unicorn is near enough for the
 * worker to get there.
 */
interface Groomer {
  /** Anchors the worker brushes from. */
  tag: string;
  /** Walking speed while hurrying over, as a multiple of the usual speed. */
  hustle: number;
  /** Seconds of brushing once there. The groom is held this long past the worker's arrival. */
  seconds: readonly [number, number];
  /** The longest walk the worker will make for a groom, in seconds at the hurrying speed. */
  maxWalk: number;
}

export interface NpcDef {
  id: NpcId;
  displayName: string;
  speed: number;
  routine: readonly NpcStep[];
  /** Seconds the friendly wave lasts when tapped. */
  waveSeconds: number;
  groomer?: Groomer;
}

export const NPC_DEFS: Record<NpcId, NpcDef> = {
  gardener: {
    id: 'gardener',
    displayName: 'Gardener',
    speed: 92,
    waveSeconds: 2.2,
    routine: [
      { kind: 'work', tag: 'garden-bed', clip: 'water', seconds: [3.2, 4.4] },
      { kind: 'work', tag: 'garden-bed', clip: 'inspect', seconds: [1.8, 2.6] },
      { kind: 'work', tag: 'garden-bed', clip: 'trim', seconds: [3, 4] },
      { kind: 'work', tag: 'garden-bed', clip: 'water', seconds: [2.8, 3.6] },
      { kind: 'work', tag: 'garden-bed', clip: 'trim', seconds: [2.6, 3.4] },
      { kind: 'work', tag: 'garden-bed', clip: 'inspect', seconds: [1.8, 2.4] },
    ],
  },
  'stable-worker': {
    id: 'stable-worker',
    displayName: 'Stable worker',
    speed: 88,
    waveSeconds: 2.2,
    routine: [
      { kind: 'work', tag: 'sweep-spot', clip: 'sweep', seconds: [5, 7] },
      { kind: 'carry', from: 'fruit-pile', to: 'stall-fruit', seconds: [1.2, 1.6] },
      { kind: 'work', tag: 'sweep-spot', clip: 'sweep', seconds: [4, 6] },
      { kind: 'carry', from: 'fruit-pile', to: 'stall-fruit', seconds: [1.2, 1.6] },
    ],
    groomer: { tag: 'brush-worker', hustle: 1.6, seconds: [2.8, 3.6], maxWalk: 8 },
  },
  steward: {
    id: 'steward',
    displayName: 'Steward',
    speed: 70,
    waveSeconds: 2.2,
    routine: [
      { kind: 'work', tag: 'steward', clip: 'idle', seconds: [4, 6] },
      { kind: 'work', tag: 'steward', clip: 'idle', seconds: [2, 3] },
    ],
  },
  cook: {
    id: 'cook',
    displayName: 'Cook',
    speed: 84,
    waveSeconds: 2.2,
    routine: [
      { kind: 'work', tag: 'cook', clip: 'tend', seconds: [5, 7] },
      { kind: 'work', tag: 'cook', clip: 'idle', seconds: [1.2, 2] },
      { kind: 'work', tag: 'cook', clip: 'tend', seconds: [4, 6] },
      { kind: 'work', tag: 'cook', clip: 'idle', seconds: [1.2, 2] },
    ],
  },
  butler: {
    id: 'butler',
    displayName: 'Butler',
    speed: 78,
    waveSeconds: 2.2,
    routine: [
      { kind: 'work', tag: 'butler', clip: 'tend', seconds: [3, 4] },
      { kind: 'work', tag: 'butler', clip: 'idle', seconds: [1.2, 2] },
      { kind: 'work', tag: 'butler', clip: 'idle', seconds: [2, 3] },
      { kind: 'work', tag: 'butler', clip: 'idle', seconds: [1.2, 2] },
    ],
  },
  librarian: {
    id: 'librarian',
    displayName: 'Librarian',
    speed: 72,
    waveSeconds: 2.2,
    routine: [
      { kind: 'work', tag: 'librarian', clip: 'tend', seconds: [3.5, 5] },
      { kind: 'work', tag: 'librarian', clip: 'idle', seconds: [1.2, 2] },
    ],
  },
  maestro: {
    id: 'maestro',
    displayName: 'Maestro',
    speed: 78,
    waveSeconds: 2.2,
    routine: [
      { kind: 'work', tag: 'maestro', clip: 'tend', seconds: [5, 7] },
      { kind: 'work', tag: 'maestro', clip: 'idle', seconds: [1.2, 2] },
    ],
  },
  dancer: {
    id: 'dancer',
    displayName: 'Dancer',
    speed: 86,
    waveSeconds: 2.2,
    routine: [
      { kind: 'work', tag: 'dancer', clip: 'dance', seconds: [6, 9] },
      { kind: 'work', tag: 'dancer', clip: 'idle', seconds: [0.6, 1.2] },
    ],
  },
  florist: {
    id: 'florist',
    displayName: 'Florist',
    speed: 80,
    waveSeconds: 2.2,
    routine: [
      { kind: 'work', tag: 'florist', clip: 'tend', seconds: [4, 6] },
      { kind: 'work', tag: 'florist', clip: 'idle', seconds: [1.2, 2] },
    ],
  },
  nanny: {
    id: 'nanny',
    displayName: 'Nanny',
    speed: 74,
    waveSeconds: 2.2,
    routine: [
      { kind: 'work', tag: 'nanny', clip: 'tend', seconds: [4, 6] },
      { kind: 'work', tag: 'nanny', clip: 'idle', seconds: [1.2, 2] },
    ],
  },
  jeweller: {
    id: 'jeweller',
    displayName: 'Jeweller',
    speed: 72,
    waveSeconds: 2.2,
    routine: [
      { kind: 'work', tag: 'jeweller', clip: 'tend', seconds: [4, 6] },
      { kind: 'work', tag: 'jeweller', clip: 'idle', seconds: [1.2, 2] },
    ],
  },
  guard: {
    id: 'guard',
    displayName: 'Guard',
    speed: 76,
    waveSeconds: 2.2,
    routine: [
      { kind: 'work', tag: 'guard', clip: 'idle', seconds: [6, 9] },
      { kind: 'work', tag: 'guard', clip: 'idle', seconds: [1, 2] },
    ],
  },
  witch: {
    id: 'witch',
    displayName: 'Witch',
    speed: 80,
    waveSeconds: 2.4,
    routine: [
      { kind: 'work', tag: 'stir', clip: 'tend', seconds: [6, 8] },
      { kind: 'work', tag: 'gaze', clip: 'tend', seconds: [4, 6] },
      { kind: 'work', tag: 'shelf', clip: 'tend', seconds: [3, 4] },
      { kind: 'work', tag: 'shelf', clip: 'idle', seconds: [1.5, 2.5] },
    ],
  },
  wizard: {
    id: 'wizard',
    displayName: 'Wizard',
    speed: 72,
    waveSeconds: 2.4,
    routine: [
      { kind: 'work', tag: 'wizard', clip: 'tend', seconds: [5, 7] },
      { kind: 'work', tag: 'wizard', clip: 'idle', seconds: [1.2, 2] },
      { kind: 'work', tag: 'wizard', clip: 'idle', seconds: [2, 3] },
      { kind: 'work', tag: 'wizard', clip: 'idle', seconds: [1.2, 2] },
    ],
  },
  ranger: {
    id: 'ranger',
    displayName: 'Beach ranger',
    speed: 86,
    waveSeconds: 2.2,
    routine: [
      { kind: 'work', tag: 'shore', clip: 'tend', seconds: [4, 6] },
      { kind: 'work', tag: 'shore', clip: 'idle', seconds: [1.5, 2.5] },
    ],
  },
  skipper: {
    id: 'skipper',
    displayName: 'Skipper',
    speed: 74,
    waveSeconds: 2.2,
    routine: [
      { kind: 'work', tag: 'quay', clip: 'idle', seconds: [3, 5] },
      { kind: 'work', tag: 'quay', clip: 'tend', seconds: [4, 6] },
    ],
  },
  santa: {
    id: 'santa',
    displayName: 'Santa',
    speed: 66,
    waveSeconds: 2.8,
    routine: [
      { kind: 'work', tag: 'sleigh', clip: 'idle', seconds: [4, 6] },
      { kind: 'work', tag: 'tree', clip: 'tend', seconds: [5, 7] },
      { kind: 'work', tag: 'chair', clip: 'idle', seconds: [6, 9] },
    ],
  },
  elf: {
    id: 'elf',
    displayName: 'Elf',
    speed: 100,
    waveSeconds: 2.0,
    routine: [
      { kind: 'work', tag: 'gift', clip: 'tend', seconds: [3, 5] },
      { kind: 'work', tag: 'tree', clip: 'tend', seconds: [4, 6] },
      { kind: 'work', tag: 'gift', clip: 'idle', seconds: [1, 2] },
    ],
  },
};
