import {
  add,
  applyM,
  cross,
  dot,
  len,
  type M3,
  mul,
  mulM,
  norm,
  rotX,
  rotY,
  rotZ,
  sub,
  twoBoneIk,
  type V3,
} from '../core/vec';

/**
 * The shared body of the two grown-ups who work in the garden and the stable. Model space: the
 * figure stands on z = 0, faces +x, and its left side is +y. One unit is one pixel across; the
 * picture is foreshortened by the same 27 degree pitch as everything else. The proportions are
 * storybook ones, a large head on a sturdy body, about four heads tall.
 */
export const BODY = {
  hipHalf: 9.2,
  thigh: 26,
  shin: 26,
  /** Sole of the foot to the ankle joint. */
  ankle: 8.5,
  /** Pelvis height standing with the knees a touch soft. */
  pelvisZ: 61,
  pelvisToChest: 20,
  chestToNeck: 17,
  shoulderHalf: 16.2,
  shoulderUp: 12.2,
  upperArm: 19.5,
  forearm: 18,
  headR: 19,
  /** Head centre above the neck base. */
  headUp: 20.5,
} as const;

export type Side = 'l' | 'r';
export const SIDES: readonly Side[] = ['l', 'r'];
const SIGN: Record<Side, number> = { l: 1, r: -1 };

export interface FootPose {
  /** Ankle joint position. A flat planted foot has z = BODY.ankle. */
  ankle: V3;
  /** Toe-down pitch, radians. */
  pitch: number;
}

/** Everything that varies from frame to frame. Angles are radians. */
export interface HumanPose {
  pelvis: V3;
  /** Pelvis twist about the vertical axis. */
  pelvisYaw: number;
  /** Torso lean, relative to the pelvis. Positive pitch tips forward. */
  pitch: number;
  roll: number;
  twist: number;
  headPitch: number;
  headYaw: number;
  headRoll: number;
  wrist: Record<Side, V3>;
  /** Direction each elbow bends toward, in model space. */
  elbow: Record<Side, V3>;
  /** Roll of each hand about its forearm. */
  handRoll: Record<Side, number>;
  /** Fingers curl: 0 open, 1 fist. */
  grip: Record<Side, number>;
  foot: Record<Side, FootPose>;
  knee: V3;
  /** 0 eyes open, 1 shut. */
  blink: number;
  /** 0 a gentle smile, 1 a wide open grin. */
  mouth: number;
  /** -1 worried, 0 neutral, 1 raised. */
  brow: number;
  /** Where the eyes look, each -1..1 (x toward the nose's side, y up). */
  look: [number, number];
}

export interface Joints {
  pelvis: V3;
  pelvisR: M3;
  chest: V3;
  torsoR: M3;
  neckBase: V3;
  headBase: V3;
  head: V3;
  headR: M3;
  shoulder: Record<Side, V3>;
  elbow: Record<Side, V3>;
  wrist: Record<Side, V3>;
  hand: Record<Side, { p: V3; R: M3 }>;
  hip: Record<Side, V3>;
  kneeAt: Record<Side, V3>;
  ankle: Record<Side, V3>;
  foot: Record<Side, { p: V3; R: M3 }>;
}

/** The standing pose every clip departs from. Hands hang by the thighs. */
export function restPose(): HumanPose {
  const side = (s: Side) => ({ ankle: [0, SIGN[s] * 9, BODY.ankle] as V3, pitch: 0 });
  return {
    pelvis: [0, 0, BODY.pelvisZ],
    pelvisYaw: 0,
    pitch: 0,
    roll: 0,
    twist: 0,
    headPitch: 0,
    headYaw: 0,
    headRoll: 0,
    wrist: { l: [1.5, 22, 66], r: [1.5, -22, 66] },
    elbow: { l: [-1, 0.3, 0], r: [-1, -0.3, 0] },
    handRoll: { l: 0, r: 0 },
    grip: { l: 0.25, r: 0.25 },
    foot: { l: side('l'), r: side('r') },
    knee: [1, 0, 0],
    blink: 0,
    mouth: 0,
    brow: 0,
    look: [0, 0],
  };
}

/** Works out where every joint is for a pose. */
export function solve(p: HumanPose): Joints {
  const pelvisR = rotZ(p.pelvisYaw);
  const torsoR = mulM(pelvisR, mulM(rotZ(p.twist), mulM(rotY(p.pitch), rotX(p.roll))));
  const chest = add(p.pelvis, applyM(torsoR, [0, 0, BODY.pelvisToChest]));
  const neckBase = add(chest, applyM(torsoR, [0, 0, BODY.chestToNeck]));
  const headR = mulM(torsoR, mulM(rotZ(p.headYaw), mulM(rotY(p.headPitch), rotX(p.headRoll))));
  const headBase = add(neckBase, applyM(torsoR, [0, 0, 3]));
  const head = add(headBase, applyM(headR, [1.2, 0, BODY.headUp]));

  const shoulder = {} as Record<Side, V3>;
  const elbow = {} as Record<Side, V3>;
  const wrist = {} as Record<Side, V3>;
  const hand = {} as Record<Side, { p: V3; R: M3 }>;
  const hip = {} as Record<Side, V3>;
  const kneeAt = {} as Record<Side, V3>;
  const ankle = {} as Record<Side, V3>;
  const foot = {} as Record<Side, { p: V3; R: M3 }>;

  for (const s of SIDES) {
    shoulder[s] = add(chest, applyM(torsoR, [-0.5, SIGN[s] * BODY.shoulderHalf, BODY.shoulderUp]));
    const arm = twoBoneIk(shoulder[s], p.wrist[s], BODY.upperArm, BODY.forearm, p.elbow[s]);
    elbow[s] = arm.mid;
    wrist[s] = arm.end;
    const along = norm(sub(wrist[s], elbow[s]));
    // Fingers follow the forearm. At zero roll the back of the hand faces away from the body.
    hand[s] = { p: wrist[s], R: mulM(axisRoll(along, p.handRoll[s]), basis(along, [0, SIGN[s], 0])) };

    hip[s] = add(p.pelvis, applyM(pelvisR, [0, SIGN[s] * BODY.hipHalf, -2]));
    const foot3 = p.foot[s];
    const footR = mulM(pelvisR, rotY(foot3.pitch));
    const target = foot3.ankle;
    const leg = twoBoneIk(hip[s], target, BODY.thigh, BODY.shin, applyM(pelvisR, p.knee));
    kneeAt[s] = leg.mid;
    ankle[s] = leg.end;
    foot[s] = { p: leg.end, R: footR };
  }
  return {
    pelvis: p.pelvis,
    pelvisR,
    chest,
    torsoR,
    neckBase,
    headBase,
    head,
    headR,
    shoulder,
    elbow,
    wrist,
    hand,
    hip,
    kneeAt,
    ankle,
    foot,
  };
}

/**
 * A frame whose x axis is `x` and whose z axis is as near `hint` as it can be. Columns are x, y, z.
 */
function basis(x: V3, hint: V3): M3 {
  let z = sub(hint, mul(x, dot(hint, x)));
  if (len(z) < 1e-4) z = sub([0, 0, 1], mul(x, x[2]));
  z = norm(z);
  const y = cross(z, x);
  return [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
}

function axisRoll(axis: V3, a: number): M3 {
  const [x, y, z] = norm(axis);
  const c = Math.cos(a),
    s = Math.sin(a),
    t = 1 - c;
  return [
    t * x * x + c,
    t * x * y - s * z,
    t * x * z + s * y,
    t * x * y + s * z,
    t * y * y + c,
    t * y * z - s * x,
    t * x * z - s * y,
    t * y * z + s * x,
    t * z * z + c,
  ];
}

export { SIGN };
