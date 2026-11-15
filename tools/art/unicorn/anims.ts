import { CLIP_TIMING, type ClipTiming, WALK_STEP } from '../../../src/shared/clips';
import { EAST, type UnicornFacing } from '../../../src/shared/compass';
import type { ClipName } from '../../../src/shared/ids';
import { clamp, lerp } from '../../../src/shared/math';
import { add, applyM, deg, mulM, rotX, rotY, rotZ, sub } from '../core/vec';
import { makeRig, muzzleAnchor } from './model';
import { FOOT_REST, HOOF, LEGS, type LegId, NECK_REST_DEG, type Pose, restPose, SKELETON } from './pose';
import type { Build, SignatureKind, UnicornSpec } from './spec';

export type ClipDef = ClipTiming;

export const CLIPS: Record<ClipName, ClipDef> = CLIP_TIMING;

const TAU = Math.PI * 2;
const smooth = (x: number): number => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};
const frac = (x: number): number => x - Math.floor(x);
/** 0..1..0 bump over [a, b]. */
const bump = (u: number, a: number, b: number): number =>
  u <= a || u >= b ? 0 : Math.sin(((u - a) / (b - a)) * Math.PI);

/**
 * Absolute pitch in degrees of neck segments n0, n1, n2 and the head, measured down from
 * horizontal.
 */
type NeckAngles = readonly [number, number, number, number];
const NECK_REST: NeckAngles = [
  NECK_REST_DEG.n0,
  NECK_REST_DEG.n0 + NECK_REST_DEG.n1,
  NECK_REST_DEG.n0 + NECK_REST_DEG.n1 + NECK_REST_DEG.n2,
  NECK_REST_DEG.n0 + NECK_REST_DEG.n1 + NECK_REST_DEG.n2 + NECK_REST_DEG.head,
];
function setNeck(p: Pose, abs: NeckAngles): void {
  const rel0 = abs[0],
    rel1 = abs[1] - abs[0],
    rel2 = abs[2] - abs[1],
    relH = abs[3] - abs[2];
  p.neck = [deg(rel0 - NECK_REST_DEG.n0), deg(rel1 - NECK_REST_DEG.n1), deg(rel2 - NECK_REST_DEG.n2)];
  p.head = deg(relH - NECK_REST_DEG.head);
}

const blendNeck = (a: NeckAngles, b: NeckAngles, t: number): NeckAngles => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
  lerp(a[3], b[3], t),
];

/**
 * A neck that swings forward and down by `swing` degrees, curling a little more toward the head,
 * with the head at `head`.
 */
const swungNeck = (swing: number, head: number): NeckAngles => [
  NECK_REST[0] + swing,
  NECK_REST[1] + swing * 1.3,
  NECK_REST[2] + swing * 1.6,
  head,
];

/**
 * Neck angles that put the muzzle tip at (x, z) in rest-space coordinates with the face pitched
 * near `headAim`. Solved per build because neck length and head size differ between unicorns.
 */
function reachNeck(build: Build, x: number, z: number, headAim: number): NeckAngles {
  const p = restPose();
  const cost = (swing: number, head: number): number => {
    setNeck(p, swungNeck(swing, head));
    const m = muzzleAnchor(makeRig(build, p));
    return (m[0] - x) ** 2 + (m[2] - z) ** 2 + 0.02 * (head - headAim) ** 2;
  };
  let best = { swing: 0, head: headAim, c: Infinity };
  for (let swing = -20; swing <= 70; swing += 1) {
    for (let head = headAim - 30; head <= headAim + 30; head += 2) {
      const c = cost(swing, head);
      if (c < best.c) best = { swing, head, c };
    }
  }
  for (let step = 0.5; step >= 0.0625; step /= 2) {
    for (const [ds, dh] of [
      [step, 0],
      [-step, 0],
      [0, step],
      [0, -step],
    ] as const) {
      const c = cost(best.swing + ds, best.head + dh);
      if (c < best.c) best = { swing: best.swing + ds, head: best.head + dh, c };
    }
  }
  return swungNeck(best.swing, best.head);
}

/**
 * Lowers the head toward a muzzle target. `amount` blends from the upright neck (0) to the solved
 * one (1).
 */
function lowerHead(p: Pose, build: Build, x: number, z: number, headAim: number, amount = 1): void {
  setNeck(p, blendNeck(NECK_REST, reachNeck(build, x, z, headAim), amount));
}

function setFoot(p: Pose, id: LegId, dx: number, lift: number, pitch = 0): void {
  const rest = FOOT_REST[id];
  p.legs[id] = { foot: [rest[0] + dx, rest[1], lift], hoofPitch: pitch };
}

const LEG_REACH = (id: LegId): number => {
  const [l1, l2] = id[0] === 'h' ? SKELETON.legLen.hind : SKELETON.legLen.fore;
  return (l1 + l2) * 0.985;
};

/**
 * Highest root offset at which every hoof is still within reach, honoring the pose's pitch, roll
 * and yaw. Legs are nearly straight at rest, so a stride needs the hips to dip: this is what makes
 * the body bob.
 */
function rootHeightFor(p: Pose): number {
  const R = mulM(rotZ(p.yaw), mulM(rotY(p.pitch), rotX(p.roll)));
  const pivot = SKELETON.pivot;
  let off = 0.4;
  for (const id of LEGS) {
    const lg = p.legs[id];
    const fetlock = add(lg.foot, applyM(rotY(lg.hoofPitch), HOOF.fetlock));
    const hip = SKELETON.hip[id];
    const rel = applyM(R, sub(hip, pivot));
    const hx = pivot[0] + rel[0] + p.offset[0],
      hy = pivot[1] + rel[1] + p.offset[1],
      hz = pivot[2] + rel[2];
    const dx = fetlock[0] - hx,
      dy = fetlock[1] - hy;
    const room = LEG_REACH(id) ** 2 - dx * dx - dy * dy;
    off = Math.min(off, fetlock[2] - hz + Math.sqrt(Math.max(0, room)));
  }
  return off;
}

function baseFor(): Pose {
  return restPose();
}

function idle(frame: number): Pose {
  const p = baseFor();
  const t = frame / 4;
  p.chest = 0.5 - 0.5 * Math.cos(TAU * t);
  p.head = deg(1.2) * Math.sin(TAU * t);
  p.neck = [0, deg(1.4) * Math.sin(TAU * t + 0.6), 0];
  if (frame === 1) {
    p.earL = deg(16);
    p.earR = deg(-3);
  }
  if (frame === 3) p.earR = deg(8);
  p.blink = frame === 2 ? 1 : 0;
  p.hairPhase = t;
  p.hairSway = 0.55;
  p.wind = 0.12;
  p.tailLift = 0.04 * Math.sin(TAU * t);
  return p;
}

const LEG_PHASE: Record<LegId, number> = { fl: 0, hr: 0.04, fr: 0.5, hl: 0.54 };
const DUTY = 0.44;
const LIFT: Record<'fore' | 'hind', number> = { fore: 11, hind: 9 };

function walk(frame: number): Pose {
  const p = baseFor();
  const t = frame / 8;
  const travel = WALK_STEP * DUTY;
  for (const id of LEGS) {
    const u = frac(2 * t + LEG_PHASE[id]);
    const lift = id[0] === 'h' ? LIFT.hind : LIFT.fore;
    if (u < DUTY) {
      const s = u / DUTY;
      setFoot(p, id, travel * (0.5 - s), 0, -0.14 * (1 - s) * (1 - s) + 0.5 * s * s * s);
    } else {
      const w = (u - DUTY) / (1 - DUTY);
      setFoot(p, id, travel * (-0.5 + smooth(w)), lift * Math.sin(Math.PI * w) ** 0.75, lerp(0.55, -0.14, smooth(w)));
    }
  }
  p.pitch = deg(0.7) * Math.sin(TAU * 2 * t + 0.4);
  p.roll = deg(1.3) * Math.sin(TAU * 2 * t);
  p.offset = [0, 0, rootHeightFor(p)];
  p.head = deg(2.2) * Math.sin(TAU * 4 * t + 1.1);
  p.neck = [deg(1.2) * Math.sin(TAU * 2 * t + 0.5), deg(1.5) * Math.sin(TAU * 4 * t + 0.9), 0];
  p.earL = deg(5) * Math.sin(TAU * t + 0.6);
  p.earR = deg(5) * Math.sin(TAU * t + 2.1);
  p.hairPhase = t;
  p.hairSway = 0.8;
  p.wind = 0.6;
  p.tailLift = 0.16 + 0.05 * Math.sin(TAU * 2 * t);
  return p;
}

/** Cast: gather, thrust the horn forward, release on frame 3, settle. */
function cast(frame: number): Pose {
  const p = baseFor();
  const keys: { dip: number; thrust: number; glow: number; rear: number; stomp: number; ears: number }[] = [
    { dip: 0.5, thrust: 0, glow: 0.1, rear: 0, stomp: 0, ears: 0.3 },
    { dip: 1, thrust: 0, glow: 0.3, rear: 0, stomp: 0.6, ears: 0.6 },
    { dip: 0, thrust: 0.7, glow: 0.7, rear: 0.4, stomp: 0, ears: -0.4 },
    { dip: 0, thrust: 1, glow: 1, rear: 0.8, stomp: 0, ears: -0.7 },
    { dip: 0, thrust: 0.7, glow: 0.75, rear: 0.4, stomp: 0, ears: -0.3 },
    { dip: 0, thrust: 0.2, glow: 0.3, rear: 0.1, stomp: 0, ears: 0 },
  ];
  const k = keys[frame]!;
  const neck = blendNeck(NECK_REST, [-84, -62, -50, 24], k.thrust * 0.55);
  setNeck(p, [neck[0] + 10 * k.dip, neck[1] + 6 * k.dip, neck[2] + 12 * k.dip, neck[3] + 14 * k.dip]);
  p.pitch = -deg(5) * k.rear + deg(1.5) * k.dip;
  p.chest = k.thrust * 0.6;
  p.hornGlow = k.glow;
  p.earL = deg(14) * k.ears;
  p.earR = deg(14) * k.ears;
  p.tailLift = 0.15 + 0.5 * k.thrust;
  p.hairSway = 0.9;
  p.hairPhase = frame / 6;
  p.wind = 0.3 + 0.4 * k.thrust;
  if (k.stomp > 0) setFoot(p, 'fr', 3, 8 * k.stomp, 0.5);
  if (frame === 3) setFoot(p, 'fl', 5, 0, -0.1);
  p.offset = [0, 0, rootHeightFor(p)];
  return p;
}

function graze(spec: UnicornSpec, frame: number): Pose {
  const p = baseFor();
  const u = frame / 6;
  lowerHead(p, spec.build, 60, 4, 84);
  p.head += deg(3) * Math.sin(TAU * u * 2);
  p.jaw = [0.15, 0.55, 0.2, 0.6, 0.15, 0.05][frame]!;
  p.earL = deg(-4);
  p.earR = deg(10) * (frame === 4 ? 1 : 0);
  p.blink = frame === 3 ? 1 : 0;
  setFoot(p, 'fl', 7, 0, 0.1);
  setFoot(p, 'fr', -3, 0, 0);
  p.pitch = deg(2.5);
  p.chest = 0.3;
  p.hairPhase = u;
  p.hairSway = 0.3;
  p.wind = 0;
  p.tailLift = 0.05 + (frame === 4 ? 0.25 : 0);
  p.offset = [0, 0, rootHeightFor(p)];
  return p;
}

function drink(spec: UnicornSpec, frame: number): Pose {
  const p = baseFor();
  const u = frame / 6;
  lowerHead(p, spec.build, 62, 26, 78);
  p.head += deg(2.5) * Math.sin(TAU * u);
  p.neck = [p.neck[0], p.neck[1] + deg(2.5) * bump(u, 0.2, 0.8), p.neck[2]];
  p.jaw = [0.1, 0.35, 0.1, 0.35, 0.1, 0.05][frame]!;
  p.earL = deg(-6);
  p.earR = deg(-6);
  p.blink = frame === 5 ? 1 : 0;
  setFoot(p, 'fl', 4, 0, 0.05);
  setFoot(p, 'fr', -2, 0, 0);
  p.pitch = deg(1.5);
  p.hairPhase = u;
  p.hairSway = 0.3;
  p.wind = 0;
  p.offset = [0, 0, rootHeightFor(p)];
  return p;
}

/**
 * Dozing on three legs: head hung low, eyes closed, one hind hoof resting on its toe, slow
 * breathing.
 */
function rest(spec: UnicornSpec, frame: number): Pose {
  const p = baseFor();
  const u = frame / 6;
  lowerHead(p, spec.build, 54, 44, 84, 1);
  p.head += deg(1.5) * Math.sin(TAU * u);
  p.chest = 0.5 - 0.5 * Math.cos(TAU * u);
  p.blink = 1;
  p.earL = deg(-8) + (frame === 3 ? deg(14) : 0);
  p.earR = deg(-8);
  setFoot(p, 'hl', -2, 1.2, 0.5);
  p.pitch = deg(0.8);
  p.hairPhase = u;
  p.hairSway = 0.25;
  p.wind = 0;
  p.tailLift = 0.05 + 0.08 * Math.sin(TAU * u);
  p.offset = [0, 0, rootHeightFor(p)];
  return p;
}

/** A long reach forward and up with the chin raised, a yawn at the top, then back to standing. */
function stretch(frame: number): Pose {
  const p = baseFor();
  const keys = [0, 0.35, 0.8, 1, 0.6, 0.1];
  const k = keys[frame]!;
  setNeck(p, blendNeck(NECK_REST, [-46, -34, -18, 70], k));
  p.jaw = frame === 3 ? 0.7 : frame === 2 || frame === 4 ? 0.3 : 0;
  p.blink = k > 0.5 ? 1 : 0;
  p.earL = -deg(14) * k;
  p.earR = -deg(14) * k;
  p.pitch = -deg(3.5) * k;
  p.chest = k;
  setFoot(p, 'fl', 5 * k, 0, 0.1 * k);
  setFoot(p, 'fr', 3 * k, 0, 0);
  p.hairPhase = frame / 6;
  p.hairSway = 0.5;
  p.wind = 0.15 * k;
  p.tailLift = 0.15 + 0.35 * k;
  p.offset = [0, 0, rootHeightFor(p)];
  return p;
}

/**
 * Head stretched forward and down toward a friend, rocking gently side to side with eyes closed.
 */
function nuzzle(spec: UnicornSpec, frame: number): Pose {
  const p = baseFor();
  const u = frame / 6;
  lowerHead(p, spec.build, 86, 72, 58, 1);
  p.headYaw = deg(9) * Math.sin(TAU * u);
  p.headRoll = deg(5) * Math.sin(TAU * u + 1);
  p.head += deg(2) * Math.sin(TAU * u * 2);
  p.blink = frame === 1 || frame === 2 || frame === 4 ? 1 : 0;
  p.earL = -deg(10);
  p.earR = -deg(6);
  p.pitch = deg(1.5);
  setFoot(p, 'fl', 4, 0, 0.05);
  p.hairPhase = u;
  p.hairSway = 0.35;
  p.wind = 0;
  p.tailLift = 0.1 + 0.1 * Math.sin(TAU * u);
  p.offset = [0, 0, rootHeightFor(p)];
  return p;
}

/** The hoof that faces the camera in a side view: east shows the right side, west the left. */
const nearFore = (facing: UnicornFacing): LegId => (facing === EAST ? 'fr' : 'fl');

const SIGNATURES: Record<SignatureKind, (spec: UnicornSpec, frame: number, facing: UnicornFacing) => Pose> = {
  'mote-gaze': (_spec, frame) => {
    const p = baseFor();
    const u = frame / 8;
    p.head = -deg(7 + 6 * Math.sin(TAU * u));
    p.neck = [deg(-3), deg(-2 * Math.sin(TAU * u)), 0];
    p.look = [0.8 * Math.cos(TAU * u), 0.55 * Math.sin(TAU * u)];
    p.earL = -deg(10);
    p.earR = -deg(10);
    p.blink = frame === 6 ? 1 : 0;
    p.chest = 0.35 + 0.2 * Math.sin(TAU * u);
    p.hornGlow = [0.1, 0.3, 0.5, 0.3, 0.1, 0.3, 0.5, 0.3][frame]!;
    p.hairSway = 1;
    p.hairPhase = u * 2;
    p.wind = 0.2;
    p.tailLift = 0.1;
    return p;
  },
  'flower-sniff': (spec, frame) => {
    const p = baseFor();
    const u = frame / 8;
    lowerHead(p, spec.build, 56, 12, 82, 0.8 * (0.5 - 0.5 * Math.cos(TAU * u)));
    p.head += deg(3) * Math.sin(TAU * u * 3) * bump(u, 0.2, 0.8);
    p.jaw = 0.05;
    p.earL = deg(-6) * bump(u, 0.1, 0.9);
    p.earR = deg(-6) * bump(u, 0.1, 0.9);
    p.blink = frame === 7 ? 1 : 0;
    p.hairPhase = u;
    p.hairSway = 0.4;
    p.wind = 0.05;
    return p;
  },
  'hoof-stamp': (_spec, frame, facing) => {
    const p = baseFor();
    const lift = [0, 7, 0, 0, 0, 7, 0, 0][frame]!;
    const fwd = [0, 4, 4, 0, 0, 4, 4, 0][frame]!;
    setFoot(p, nearFore(facing), fwd, lift, lift > 0 ? 0.5 : 0);
    p.head = -deg(10) - deg(6) * (frame === 2 || frame === 6 ? 1 : 0);
    p.neck = [deg(-3), 0, 0];
    p.chest = 0.5;
    p.pitch = -deg(1.5);
    p.earL = -deg(6);
    p.earR = -deg(6);
    p.blink = frame === 4 ? 1 : 0;
    p.hairSway = 0.7;
    p.hairPhase = frame / 8;
    p.wind = 0.1;
    p.tailLift = 0.2;
    p.offset = [0, 0, rootHeightFor(p)];
    return p;
  },
  splash: (spec, frame, facing) => {
    const p = baseFor();
    const u = frame / 8;
    lowerHead(p, spec.build, 54, 30, 76, 0.85);
    p.headRoll = deg(8) * Math.sin(TAU * u);
    p.headYaw = deg(10);
    const sweep = Math.sin(TAU * u * 2);
    setFoot(p, nearFore(facing), 6 + 5 * sweep, Math.max(0, 6 * Math.cos(TAU * u * 2)), 0.45);
    p.earL = -deg(4);
    p.earR = deg(6);
    p.blink = frame === 3 ? 1 : 0;
    p.hairSway = 0.8;
    p.hairPhase = u;
    p.wind = 0.1;
    p.tailLift = 0.1 + 0.15 * Math.max(0, sweep);
    p.offset = [0, 0, rootHeightFor(p)];
    return p;
  },
  'mane-toss': (_spec, frame) => {
    const p = baseFor();
    const u = frame / 8;
    const toss = bump(u, 0.15, 0.6);
    p.pitch = -deg(3) - deg(2) * toss;
    p.chest = 0.6;
    setNeck(p, blendNeck(NECK_REST, [-84, -58, -44, 30], 0.35 + 0.65 * toss));
    p.earL = -deg(4) + deg(14) * toss;
    p.earR = -deg(4) + deg(14) * toss;
    p.blink = frame === 6 ? 1 : 0;
    p.hairPhase = u * 2;
    p.hairSway = 1;
    p.wind = 0.2 + 0.7 * toss;
    p.tailLift = 0.2 + 0.4 * toss;
    return p;
  },
  hop: (_spec, frame) => {
    const p = baseFor();
    const hopHeights = [0, 0, 7, 10, 7, 0, -1.4, 0];
    const h = hopHeights[frame]!;
    const air = Math.max(0, h);
    for (const id of LEGS)
      setFoot(
        p,
        id,
        id[0] === 'f' ? 3 * (air / 10) : -3 * (air / 10),
        air > 0 ? air * 1.1 + 0.5 : 0,
        air > 0 ? 0.5 : 0,
      );
    p.offset = [0, 0, h];
    p.pitch = -deg(6) * (air / 10);
    p.head = -deg(8) * (air / 10);
    p.earL = deg(10) * (air / 10);
    p.earR = deg(10) * (air / 10);
    p.blink = frame === 7 ? 1 : 0;
    p.hairPhase = frame / 8;
    p.hairSway = 0.9;
    p.wind = 0.05 + 0.4 * (air / 10);
    p.tailLift = 0.5 * (air / 10);
    p.chest = frame === 6 ? 0 : 0.4;
    return p;
  },
};

/** The pose for one frame of one clip. Deterministic, and independent of rendering. */
export function clipPose(spec: UnicornSpec, clip: ClipName, frame: number, facing: UnicornFacing): Pose {
  switch (clip) {
    case 'idle':
      return idle(frame);
    case 'walk':
      return walk(frame);
    case 'cast':
      return cast(frame);
    case 'graze':
      return graze(spec, frame);
    case 'drink':
      return drink(spec, frame);
    case 'signature-idle':
      return SIGNATURES[spec.signature](spec, frame, facing);
    case 'rest':
      return rest(spec, frame);
    case 'stretch':
      return stretch(frame);
    case 'nuzzle':
      return nuzzle(spec, frame);
  }
}
