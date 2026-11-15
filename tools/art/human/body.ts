import { ellipsoidAt } from '../core/mesh';
import { add, applyM, lerp3, type M3, mul, norm, sub, type V3 } from '../core/vec';
import { lathe } from '../world/arch';
import { blob, tube } from '../world/prims';
import type { SceneBuilder } from '../world/scene';
import { alignZ, attach } from './mesh-util';
import { BODY, type HumanPose, type Joints, SIDES, SIGN } from './rig';

/** The part of a figure's body a piece of clothing sits over, as material ids from the scene. */
export interface BodyMats {
  skin: number;
  /** Torso, and the upper arms when sleeves are worn. */
  shirt: number;
  /** The rolled cuff at the elbow. */
  cuff: number;
  trousers: number;
  boot: number;
  /** Boot sole and rim. */
  sole: number;
  /** Boot top, for a different colour cuff. */
  bootTop: number;
  /** Gloves, or the skin again when hands are bare. */
  hand: number;
}

export interface BodyShape {
  /** Radius of the trouser legs at hip, knee and ankle. */
  leg: readonly [number, number, number];
  /** How tall the boot shaft stands above the ankle. */
  shaft: number;
  /** The torso's half widths and half depths at the hips, waist, chest, shoulders. */
  torso: readonly [number, number][];
  head: { cranium: V3; jaw: V3; jawDown: number };
}

export const SLIM: BodyShape = {
  leg: [8.4, 7.0, 6.0],
  shaft: 21,
  torso: [
    [12.4, 9.2],
    [11.0, 8.4],
    [13.6, 9.8],
    [14.4, 9.2],
  ],
  head: { cranium: [19, 18.4, 18.8], jaw: [16.2, 16.4, 12.4], jawDown: 7.6 },
};

const local = (R: M3, o: V3, p: V3): V3 => add(applyM(R, p), o);

export function buildLegs(sb: SceneBuilder, j: Joints, m: BodyMats, shape: BodyShape): void {
  for (const s of SIDES) {
    const hip = j.hip[s],
      knee = j.kneeAt[s],
      ankle = j.ankle[s];
    tube(
      sb.mesh(m.trousers),
      [
        { p: hip, r: shape.leg[0] },
        { p: lerp3(hip, knee, 0.55), r: (shape.leg[0] + shape.leg[1]) / 2 },
        { p: knee, r: shape.leg[1] },
        { p: ankle, r: shape.leg[2] },
      ],
      { segs: 12, n: 18, capStart: true, capEnd: true },
    );
    const R = j.foot[s].R;
    const at = (x: number, y: number, z: number): V3 => local(R, ankle, [x, y, z]);
    // The boot: a shaft that follows the shin, a rolled top, a rounded foot and a toe cap on a thin
    // sole.
    const up = norm(sub(knee, ankle));
    const along = (d: number): V3 => add(ankle, mul(up, d));
    tube(
      sb.mesh(m.boot),
      [
        { p: along(-2), r: 6.8 },
        { p: along(shape.shaft / 2), r: 6.9 },
        { p: along(shape.shaft), r: 7.1 },
      ],
      { segs: 12, n: 8, capEnd: false },
    );
    attach(sb.mesh(m.bootTop), along(shape.shaft - 3.2), alignZ(up), (l) =>
      lathe(l, {
        c: [0, 0, 0],
        profile: [
          [6.6, 0],
          [7.9, 0.7],
          [7.9, 3.9],
          [6.6, 4.6],
        ],
        segs: 14,
        smooth: true,
      }),
    );
    ellipsoidAt(sb.mesh(m.boot), at(4.6, 0, -3.6), [11.4, 6.8, 5.4], R, { rings: 9, segs: 14 });
    ellipsoidAt(sb.mesh(m.boot), at(11.2, 0, -4.8), [6.8, 6.0, 4.2], R, { rings: 8, segs: 12 });
    ellipsoidAt(sb.mesh(m.sole), at(5.6, 0, -7.2), [13.6, 7.0, 1.7], R, { rings: 6, segs: 14 });
  }
}

/**
 * Hips in the trousers' cloth, then a shirt over them that runs to the shoulders, with a short neck
 * on top.
 */
export function buildTorso(
  sb: SceneBuilder,
  j: Joints,
  shirt: number,
  trousers: number,
  shape: BodyShape,
  skin: number,
): void {
  const R = j.torsoR;
  const up = applyM(R, [0, 1, 0]);
  const t = shape.torso;
  const at = (z: number): V3 =>
    z < 0
      ? local(j.pelvisR, j.pelvis, [0, 0, z])
      : z <= BODY.pelvisToChest
        ? local(R, j.pelvis, [0, 0, z])
        : local(R, j.chest, [0, 0, z - BODY.pelvisToChest]);
  const top = BODY.pelvisToChest + BODY.chestToNeck;
  tube(
    sb.mesh(trousers),
    [
      { p: at(-6), r: t[0]![0] - 0.4, rh: t[0]![1] - 0.4 },
      { p: at(-1), r: t[0]![0], rh: t[0]![1] },
      { p: at(5), r: t[1]![0] - 0.3, rh: t[1]![1] - 0.3 },
    ],
    { segs: 16, n: 10, capStart: true, capEnd: true, up },
  );
  tube(
    sb.mesh(shirt),
    [
      { p: at(1.5), r: t[0]![0] + 0.5, rh: t[0]![1] + 0.5 },
      { p: at(6), r: t[1]![0] + 0.4, rh: t[1]![1] + 0.4 },
      { p: at(BODY.pelvisToChest), r: t[2]![0], rh: t[2]![1] },
      { p: at(top - 4), r: t[3]![0], rh: t[3]![1] },
      { p: at(top - 1.2), r: 10.6, rh: 7.4 },
      { p: at(top + 1.4), r: 6.8, rh: 6.0 },
    ],
    { segs: 16, n: 22, capStart: true, capEnd: true, up },
  );
  tube(
    sb.mesh(skin),
    [
      { p: at(top - 1), r: 5.4 },
      { p: j.headBase, r: 5.2 },
      { p: add(j.headBase, applyM(j.headR, [0.6, 0, 6])), r: 5.4 },
    ],
    { segs: 10, n: 6, capEnd: true },
  );
}

export interface ArmStyle {
  /**
   * The upper arm is clothed to the elbow, where a cuff is rolled. Otherwise the whole arm is the
   * sleeve.
   */
  rolled: boolean;
  /** Radii of the sleeve at the shoulder and elbow. */
  sleeve: readonly [number, number];
  /** Radii of the bare forearm at the elbow and wrist. */
  forearm: readonly [number, number];
}

export const ROLLED: ArmStyle = { rolled: true, sleeve: [5.8, 5.2], forearm: [4.5, 3.8] };

export function buildArms(sb: SceneBuilder, j: Joints, m: BodyMats, style: ArmStyle): void {
  for (const s of SIDES) {
    const sh = j.shoulder[s],
      el = j.elbow[s],
      wr = j.wrist[s];
    blob(sb.mesh(m.shirt), sh, [6.2, 6.2, 6.2], 0, { rings: 8, segs: 12 });
    const upper = [
      { p: sh, r: style.sleeve[0] },
      { p: lerp3(sh, el, 0.5), r: (style.sleeve[0] + style.sleeve[1]) / 2 },
      { p: el, r: style.sleeve[1] },
    ];
    tube(sb.mesh(m.shirt), upper, { segs: 12, n: 10, capEnd: !style.rolled });
    if (style.rolled) {
      const back = norm(sub(sh, el));
      tube(
        sb.mesh(m.cuff),
        [
          { p: add(el, mul(back, 3.4)), r: style.sleeve[1] + 0.9 },
          { p: add(el, mul(back, -1.6)), r: style.sleeve[1] + 0.9 },
        ],
        { segs: 12, n: 4, capEnd: true, capStart: true },
      );
      tube(
        sb.mesh(m.skin),
        [
          { p: add(el, mul(back, -0.5)), r: style.forearm[0] },
          { p: lerp3(el, wr, 0.5), r: (style.forearm[0] + style.forearm[1]) / 2 },
          { p: wr, r: style.forearm[1] },
        ],
        { segs: 10, n: 8, capEnd: true },
      );
    } else {
      tube(
        sb.mesh(m.shirt),
        [
          { p: el, r: style.sleeve[1] },
          { p: wr, r: style.forearm[1] + 0.4 },
        ],
        { segs: 10, n: 8, capEnd: true },
      );
    }
  }
}

/** A mitten hand with a thumb. `grip` shortens the palm toward a fist. */
export function buildHands(sb: SceneBuilder, j: Joints, pose: HumanPose, mat: number): void {
  for (const s of SIDES) {
    const { p, R } = j.hand[s];
    const g = pose.grip[s];
    const at = (x: number, y: number, z: number): V3 => local(R, p, [x, y, z]);
    ellipsoidAt(sb.mesh(mat), at(4.6 - g * 0.7, 0, 0), [5.3 - g * 0.9, 4.3, 3.2 + g * 0.5], R, { rings: 8, segs: 12 });
    ellipsoidAt(sb.mesh(mat), at(3.6, -SIGN[s] * 4.1, -0.7 - g * 0.6), [3.1, 1.9, 2.1], R, { rings: 6, segs: 8 });
  }
}

/** A round, friendly head: a cranium, cheeks that fill out the lower face, a nose and two ears. */
export function buildHead(sb: SceneBuilder, j: Joints, skin: number, shape: BodyShape): void {
  const R = j.headR;
  const at = (x: number, y: number, z: number): V3 => local(R, j.head, [x, y, z]);
  const m = sb.mesh(skin);
  ellipsoidAt(m, j.head, shape.head.cranium, R, { rings: 14, segs: 20 });
  ellipsoidAt(sb.mesh(skin, { part: m.part }), at(1.8, 0, -shape.head.jawDown), shape.head.jaw, R, {
    rings: 12,
    segs: 18,
  });
  ellipsoidAt(sb.mesh(skin, { part: m.part }), at(18.2, 0, -2.4), [2.7, 2.6, 3.1], R, { rings: 6, segs: 8 });
  for (const s of SIDES)
    ellipsoidAt(sb.mesh(skin), at(-1.6, SIGN[s] * 18.1, -1.8), [2.6, 2.2, 4.4], R, { rings: 6, segs: 8 });
}
