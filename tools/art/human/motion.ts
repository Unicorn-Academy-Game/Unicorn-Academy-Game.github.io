import { clamp, lerp } from '../../../src/shared/math';
import type { V3 } from '../core/vec';
import { BODY, type HumanPose, restPose, SIDES, SIGN, type Side } from './rig';

export const TAU = Math.PI * 2;
export const smooth = (t: number): number => t * t * (3 - 2 * t);
export const mixV = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** A repeating wave that is 0 at phase 0 and has `n` beats a loop. */
export const beat = (phase: number, n = 1, shift = 0): number => Math.sin(TAU * (phase * n + shift));

/** How much of a loop a foot is on the ground while walking. */
export const STANCE = 0.6;

/** Walking. `S` is how far a foot reaches ahead of and behind the hip, in model units. */
export interface WalkStyle {
  S: number;
  lift: number;
  lean: number;
  swing: number;
}
export const WALK: WalkStyle = { S: 21, lift: 7.5, lean: 0.05, swing: 0.34 };

/** Distance the body travels in one loop with the planted foot not sliding, in drawn pixels. */
export const strideOf = (S: number, unit: number): number => (2 * S * unit) / STANCE;

/**
 * Where a foot is, ahead of the hip, at a point in its own loop. Planted for STANCE, then swung
 * through.
 */
function footX(p: number, S: number): number {
  if (p < STANCE) return S - 2 * S * (p / STANCE);
  const u = (p - STANCE) / (1 - STANCE);
  return -S + 2 * S * smooth(u);
}

function footZ(p: number, lift: number): number {
  if (p < STANCE) return 0;
  const u = (p - STANCE) / (1 - STANCE);
  return lift * Math.sin(Math.PI * u) ** 0.8;
}

function footPitch(p: number): number {
  if (p < 0.08) return -0.28 + (p / 0.08) * 0.28;
  if (p < STANCE - 0.14) return 0;
  if (p < STANCE) return ((p - (STANCE - 0.14)) / 0.14) * 0.5;
  const u = (p - STANCE) / (1 - STANCE);
  return 0.5 - 0.78 * smooth(Math.min(1, u * 1.3));
}

/**
 * A walking pose with the arms swinging against the legs. The pelvis rides at whatever height the
 * planted legs can reach, so the bob falls out of the leg length instead of being tuned.
 */
export function walk(phase: number, w: WalkStyle = WALK): HumanPose {
  const pose = restPose();
  const fx: Record<Side, number> = { l: 0, r: 0 };
  const full = (BODY.thigh + BODY.shin) * 0.985;
  let hip = Infinity;
  for (const s of SIDES) {
    const p = (phase + (s === 'l' ? 0 : 0.5)) % 1;
    const x = footX(p, w.S);
    fx[s] = x;
    const z = BODY.ankle + footZ(p, w.lift) + Math.max(0, footPitch(p)) * 5;
    pose.foot[s] = { ankle: [x, SIGN[s] * 9, z], pitch: footPitch(p) };
    // A planted foot can lie at most this far below the hip: the legs are two bones of fixed
    // length.
    if (p < STANCE) hip = Math.min(hip, z + Math.sqrt(Math.max(4, full ** 2 - x * x)));
  }
  pose.pelvis = [0, 0.8 * beat(phase, 1, 0.25), hip + 2];
  pose.pitch = w.lean;
  pose.twist = 0.1 * beat(phase, 1, 0.5);
  pose.pelvisYaw = -0.06 * beat(phase, 1, 0.5);
  pose.roll = 0.015 * beat(phase, 1);
  for (const s of SIDES) {
    const swing = -w.swing * fx[s];
    pose.wrist[s] = [1.5 + swing, SIGN[s] * 21.5, 66 + Math.max(0, swing) * 0.5];
    pose.elbow[s] = [-1, SIGN[s] * 0.25, 0.2];
    pose.grip[s] = 0.35;
  }
  return pose;
}

/** Breathing and a slow look about, with one blink. Everything else is up to the clip. */
export function breathe(pose: HumanPose, phase: number, o: { look?: number; blinkAt?: number } = {}): void {
  const b = beat(phase, 1);
  pose.pelvis = [pose.pelvis[0], pose.pelvis[1], pose.pelvis[2] + 0.35 * b];
  pose.pitch += 0.012 * b;
  pose.headYaw += (o.look ?? 0.3) * beat(phase, 1, 0.1);
  pose.headPitch += 0.02 * b;
  const at = o.blinkAt ?? 0.62;
  const d = Math.abs(phase - at);
  pose.blink = d < 0.055 ? 1 : d < 0.11 ? 0.5 : 0;
}

/** Eases from 0 to 1 over `[from, to]` and holds. */
export const ramp01 = (t: number, from: number, to: number): number => smooth(clamp((t - from) / (to - from)));

/**
 * A pose with the feet planted at the given offsets, hips lowered by `drop`. For bending and
 * crouching.
 */
export function planted(drop = 0, spread = 9): HumanPose {
  const pose = restPose();
  pose.pelvis = [0, 0, BODY.pelvisZ - drop];
  for (const s of SIDES) pose.foot[s] = { ankle: [0, SIGN[s] * spread, BODY.ankle], pitch: 0 };
  return pose;
}
