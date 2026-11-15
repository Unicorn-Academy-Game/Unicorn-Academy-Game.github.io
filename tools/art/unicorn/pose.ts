import type { V3 } from '../core/vec';
import { deg } from '../core/vec';

export type LegId = 'fl' | 'fr' | 'hl' | 'hr';
export const LEGS: readonly LegId[] = ['fl', 'fr', 'hl', 'hr'];

export interface LegPose {
  /** Hoof ground-contact point in model space (planted feet keep z at 0). */
  foot: V3;
  /** Toe-down pitch of the hoof, radians. */
  hoofPitch: number;
}

/**
 * Everything that varies from frame to frame. Angles are radians; positive pitch tips toward the
 * nose.
 */
export interface Pose {
  /** Root translation (bob, hop). */
  offset: V3;
  pitch: number;
  roll: number;
  yaw: number;
  /** Breathing, 0..1. */
  chest: number;
  /** Extra pitch for each neck segment. */
  neck: [number, number, number];
  /** Total sideways swing of the neck chain. */
  neckYaw: number;
  head: number;
  headYaw: number;
  headRoll: number;
  /** Mouth opening, 0..1. */
  jaw: number;
  /** Ear pitch back (positive) or forward (negative). */
  earL: number;
  earR: number;
  /** Ears splay outward (positive). */
  earSplay: number;
  /** 0 open, 1 closed. */
  blink: number;
  /** Pupil offset, each -1..1 (x toward the muzzle, y up). */
  look: [number, number];
  legs: Record<LegId, LegPose>;
  /** Seconds-like phase for hair secondary motion, in cycles. */
  hairPhase: number;
  /** Strength of the hair sway. */
  hairSway: number;
  /** Backward wind on mane and tail, 0..1. */
  wind: number;
  /** Tail lift (raises the dock), 0..1. */
  tailLift: number;
  /** Horn glow, 0..1. */
  hornGlow: number;
}

/** Hoof reference points relative to the hoof's ground-contact point (unrotated). */
export const HOOF = {
  fetlock: [-1.5, 0, 11] as V3,
  pastern: [0, 0, 7.8] as V3,
  coronet: [1.2, 0, 4.4] as V3,
  base: [1.8, 0, 0.4] as V3,
};

/**
 * Rest-space skeleton landmarks in world units: feet at z = 0, model faces +x, left side is +y.
 * Everything that places a limb, the neck or the tail reads from here.
 */
export const SKELETON = {
  /** Pose pitch, roll and yaw rotate about this point. */
  pivot: [0, 0, 55] as V3,
  neckBase: [22, 0, 60] as V3,
  /** Segment lengths of the neck chain before the neck build factor. */
  neckLen: [14, 13, 11] as const,
  tailDock: [-35, 0, 68] as V3,
  hip: { fl: [24, 9.2, 46], fr: [24, -9.2, 46], hl: [-22, 9, 52], hr: [-22, -9, 52] } as Record<LegId, V3>,
  /** Upper and lower segment lengths, hip to knee and knee to fetlock. */
  legLen: { fore: [18, 17.5], hind: [21, 21] } as { fore: readonly [number, number]; hind: readonly [number, number] },
};

export const FOOT_REST: Record<LegId, V3> = {
  fl: [26.5, 9.2, 0],
  fr: [26.5, -9.2, 0],
  hl: [-24, 9, 0],
  hr: [-24, -9, 0],
};

export function restPose(): Pose {
  const legs = {} as Record<LegId, LegPose>;
  for (const id of LEGS) legs[id] = { foot: FOOT_REST[id], hoofPitch: 0 };
  return {
    offset: [0, 0, 0],
    pitch: 0,
    roll: 0,
    yaw: 0,
    chest: 0,
    neck: [0, 0, 0],
    neckYaw: 0,
    head: 0,
    headYaw: 0,
    headRoll: 0,
    jaw: 0,
    earL: 0,
    earR: 0,
    earSplay: 0,
    blink: 0,
    look: [0, 0],
    legs,
    hairPhase: 0,
    hairSway: 0.5,
    wind: 0.35,
    tailLift: 0,
    hornGlow: 0,
  };
}

export const NECK_REST_DEG = { n0: -66, n1: 10, n2: 10, head: 80 };
export const rad = deg;
