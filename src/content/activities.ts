import type { ClipName } from '../shared/ids';

/**
 * Everything a companion can do on its own. Each activity names the clip that animates it, the
 * anchor it needs (if any), and the effect it starts with. Companions weight these by personality.
 */
export const ACTIVITY_IDS = [
  'stand',
  'look-around',
  'rest',
  'stretch',
  'graze',
  'drink',
  'nuzzle',
  'mote-gaze',
  'flower-sniff',
  'hoof-stamp',
  'splash',
  'mane-toss',
  'hop',
  'groom',
] as const;
export type ActivityId = (typeof ACTIVITY_IDS)[number];

/** Ids of transient visual effects. The renderer owns what each looks like. */
export const EFFECT_IDS = [
  'tap',
  'hearts',
  'sparkle',
  'refusal',
  'bloom',
  'mote',
  'ice-flower',
  'bubbles',
  'embers',
  'cloud',
  'grow-flower',
  'splash',
  'relocate',
  'light-burst',
  'leaf-burst',
  'ice-burst',
  'water-burst',
  'fire-burst',
  'lightning-burst',
  'trim-sparkle',
  'treasure-sparkle',
  'door-glow',
  'water-spray',
  'rainbow-arc',
  // The light around the rainbow over the palace garden's fountain.
  'fountain-rainbow',
  // The little shimmers that come with a creature being tapped.
  'pip-sparkle',
  'pip-hearts',
  'fairy-dust',
  // The playground's toys.
  'gem-burst',
  'bounce-puff',
  'firework',
  'cannon-shot',
  'morph-poof',
  'balloons-away',
  'confetti',
  'music-notes',
  'screen-wake',
  // The palace bedroom: z's float up from Wildstar while she sleeps.
  'dream',
] as const;
export type EffectId = (typeof EFFECT_IDS)[number];

export interface ActivityDef {
  id: ActivityId;
  clip: ClipName;
  /** Clip exists only in side views, so the actor faces east or west while doing it. */
  sideOnly: boolean;
  /** Tag of the anchor this needs. Null means it can be done in place. */
  anchorTag: string | null;
  duration: readonly [number, number];
  /** Effect started when the activity begins. */
  effect?: EffectId;
  /** Needs a partner. */
  paired?: boolean;
}

export const ACTIVITIES: Record<ActivityId, ActivityDef> = {
  stand: { id: 'stand', clip: 'idle', sideOnly: false, anchorTag: null, duration: [2.4, 4.4] },
  'look-around': { id: 'look-around', clip: 'idle', sideOnly: false, anchorTag: null, duration: [3, 5] },
  rest: { id: 'rest', clip: 'rest', sideOnly: true, anchorTag: null, duration: [3.4, 5.6] },
  stretch: { id: 'stretch', clip: 'stretch', sideOnly: true, anchorTag: null, duration: [1.2, 1.2] },
  graze: { id: 'graze', clip: 'graze', sideOnly: true, anchorTag: 'graze', duration: [3.6, 5.6] },
  drink: { id: 'drink', clip: 'drink', sideOnly: true, anchorTag: 'drink', duration: [3, 4.6] },
  nuzzle: {
    id: 'nuzzle',
    clip: 'nuzzle',
    sideOnly: true,
    anchorTag: null,
    duration: [3, 4.4],
    effect: 'hearts',
    paired: true,
  },
  'mote-gaze': {
    id: 'mote-gaze',
    clip: 'signature-idle',
    sideOnly: true,
    anchorTag: null,
    duration: [3.4, 5],
    effect: 'mote',
  },
  'flower-sniff': {
    id: 'flower-sniff',
    clip: 'signature-idle',
    sideOnly: true,
    anchorTag: null,
    duration: [3, 4.4],
    effect: 'grow-flower',
  },
  'hoof-stamp': {
    id: 'hoof-stamp',
    clip: 'signature-idle',
    sideOnly: true,
    anchorTag: null,
    duration: [2.4, 3.4],
    effect: 'ice-flower',
  },
  splash: {
    id: 'splash',
    clip: 'signature-idle',
    sideOnly: true,
    anchorTag: null,
    duration: [2.8, 4],
    effect: 'bubbles',
  },
  'mane-toss': {
    id: 'mane-toss',
    clip: 'signature-idle',
    sideOnly: true,
    anchorTag: null,
    duration: [2.4, 3.4],
    effect: 'embers',
  },
  hop: { id: 'hop', clip: 'signature-idle', sideOnly: true, anchorTag: null, duration: [2.4, 3.4], effect: 'cloud' },
  groom: { id: 'groom', clip: 'rest', sideOnly: true, anchorTag: 'groom', duration: [4.2, 4.2], effect: 'hearts' },
};
