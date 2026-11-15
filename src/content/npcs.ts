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
  | 'putdown';

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
};
