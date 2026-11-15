import { hex, type RGB, ramp } from '../core/color';
import { add, applyM, type V3 } from '../core/vec';
import { extrude, type P2, SIDE } from '../world/arch';
import { blob, tube } from '../world/prims';
import type { SceneBuilder } from '../world/scene';
import { type ArmStyle, type BodyMats, buildArms, buildHands, buildHead, buildLegs, buildTorso, SLIM } from './body';
import type { FaceStyle } from './face';
import type { Character, Extras } from './frame';
import { attach } from './mesh-util';
import { drawTool } from './props';
import { type HumanPose, type Joints, SIDES, SIGN } from './rig';

const R = (base: string, o: Parameters<typeof ramp>[1] = {}): RGB[] => ramp(hex(base), { steps: 5, ...o });
const SKIN = R('#e9b690', { shadowHue: 18, lightHue: 70, lean: 0.8, lightness: [-0.17, -0.085, 0, 0.055, 0.1] });
const SKIN_OUTLINE: RGB = [122, 70, 62];
const HAIR = R('#c8582f', { shadowHue: 335, lightHue: 70, lean: 0.9 });
const SHIRT = R('#eab640', { shadowHue: 15, lightHue: 90, lean: 0.9 });
const CUFF = R('#cf9b30', { shadowHue: 15, lightHue: 80, lean: 0.9 });
const DENIM = R('#547cbc', { shadowHue: 265, lightHue: 205, lean: 0.9 });
const DENIM_PATCH = R('#3f67a6', { shadowHue: 265, lightHue: 205, lean: 0.9 });
const BOOT = R('#80563a', { shadowHue: 320, lightHue: 70, lean: 0.9 });
const BOOT_TOP = R('#5c3b29', { shadowHue: 320, lightHue: 70, lean: 0.9 });
const SOLE = R('#3d3040', { shadowHue: 280, lightHue: 300, lean: 0.8, lightness: [-0.12, -0.06, 0, 0.05, 0.1] });
const KERCHIEF = R('#e0475f', { shadowHue: 330, lightHue: 50, lean: 0.9 });
const BRASS = R('#f2c34b', { steps: 4, shadowHue: 30, lightHue: 95, lean: 0.9 });

export const WORKER_FACE: FaceStyle = {
  iris: [38, 62, 52],
  white: [255, 250, 244],
  brow: [150, 66, 40],
  lip: [150, 56, 66],
  mouthInside: [104, 38, 50],
  blush: [240, 118, 120],
  blushAlpha: 0.4,
  lid: [38, 62, 52],
  freckles: [188, 112, 80],
  eyeGap: 14.2,
  eyeZ: -3.2,
  cranium: SLIM.head.cranium,
  jaw: { r: SLIM.head.jaw, down: SLIM.head.jawDown, forward: 1.8 },
};

/** Sleeves rolled to the elbow, like the gardener's but a little slimmer. */
const WORK_SLEEVES: ArmStyle = { rolled: true, sleeve: [5.6, 5.0], forearm: [4.3, 3.7] };

function material(sb: SceneBuilder, name: string, colors: RGB[], outline?: RGB): number {
  return sb.solid(name, sb.variant(name, colors, outline ? { outline } : {}));
}

/** Auburn hair: a cap over the crown and back, a side-swept fringe, and a ponytail that swings. */
function buildHair(sb: SceneBuilder, j: Joints, hair: number, tie: number, sway: number): void {
  const part = sb.newPart();
  const at = (x: number, y: number, z: number): V3 => add(j.head, applyM(j.headR, [x, y, z]));
  const place = (x: number, y: number, z: number, rx: number, ry = rx, rz = rx): void =>
    blob(sb.mesh(hair, { part }), at(x, y, z), [rx, ry, rz], 0, { rings: 8, segs: 12 });
  place(-2.6, 0, 3.4, 20.6, 20, 17.6);
  place(-6, 0, -3, 18.4, 18.8, 14.4);
  // The fringe sweeps across the brow, longer on the left.
  for (const [y, z, r] of [
    [-12.4, 11.6, 4.8],
    [-7.2, 14.2, 5.2],
    [-1.4, 15.2, 5.4],
    [4.6, 14.4, 5.4],
    [10, 12.4, 5.2],
    [14.6, 8.4, 5],
    [17, 2.4, 4.6],
  ] as const)
    place(12 - Math.abs(y) * 0.12, y, z, r, r, r * 0.9);
  for (const s of SIDES) place(-3, SIGN[s] * 17, 2.4, 4.4, 4, 5.6);
  // The ponytail leaves the crown, flares back and hangs, lifting and swinging with the sway.
  const root = at(-17.6, 0, 9.6);
  const tail = (a: number, len: number): V3 => {
    const lift = a - sway * 0.55 * (len / 25);
    return add(root, applyM(j.headR, [-Math.cos(lift) * len, Math.sin(sway) * len * 0.45, -Math.sin(lift) * len]));
  };
  tube(
    sb.mesh(hair, { part }),
    [
      { p: root, r: 4.8 },
      { p: tail(0.25, 8), r: 5.8 },
      { p: tail(0.6, 17), r: 5.4 },
      { p: tail(0.95, 25), r: 3.4 },
      { p: tail(1.05, 30), r: 1.1 },
    ],
    { segs: 10, n: 14 },
  );
  blob(sb.mesh(tie), add(root, applyM(j.headR, [-3.6, 0, -0.9])), [3.2, 5.6, 3.2], 0, { rings: 6, segs: 8 });
}

/** A red neckerchief with a knot at the front of the throat. */
function buildKerchief(sb: SceneBuilder, j: Joints, cloth: number): void {
  const at = (x: number, y: number, z: number): V3 => add(j.neckBase, applyM(j.torsoR, [x, y, z]));
  tube(
    sb.mesh(cloth),
    [
      { p: at(-3.4, -7.4, 2.4), r: 3.4 },
      { p: at(3.4, -7.2, 1.6), r: 3.4 },
      { p: at(7, -3.4, 1.2), r: 3.4 },
      { p: at(7.6, 3.4, 1.2), r: 3.4 },
      { p: at(3.4, 7.2, 1.6), r: 3.4 },
      { p: at(-3.4, 7.4, 2.4), r: 3.4 },
    ],
    { segs: 8, n: 16 },
  );
  const tri: P2[] = [
    [-5.6, 0],
    [5.6, 0],
    [0, -11],
  ];
  attach(sb.mesh(cloth), at(8.4, 0, 1.8), j.torsoR, (m) => extrude(m, tri, SIDE(0, 0, 0), 0, 2.2, { caps: 'both' }));
  blob(sb.mesh(cloth), at(9, 0, 1.4), [3.4, 3.6, 3], 0, { rings: 6, segs: 8 });
}

/**
 * Dungarees: a denim bib on the chest with a patch pocket and brass buttons, and straps over the
 * shoulders.
 */
function buildDungarees(sb: SceneBuilder, j: Joints, denim: number, patch: number, brass: number): void {
  const bib: P2[] = [
    [-8, 25.8],
    [8, 25.8],
    [8.8, 21],
    [11.6, 13],
    [12, 0],
    [-12, 0],
    [-11.6, 13],
    [-8.8, 21],
  ];
  attach(sb.mesh(denim), add(j.pelvis, applyM(j.torsoR, [0, 0, 1.6])), j.torsoR, (m) =>
    extrude(m, bib, SIDE(6.2, 0, 0), 0, 4, { caps: 'both' }),
  );
  const pocket: P2[] = [
    [-5.2, 17],
    [5.2, 17],
    [5.2, 9.4],
    [-5.2, 9.4],
  ];
  attach(sb.mesh(patch), add(j.pelvis, applyM(j.torsoR, [0, 0, 1.6])), j.torsoR, (m) =>
    extrude(m, pocket, SIDE(6.2, 0, 0), 4, 4.6, { caps: 'both' }),
  );
  for (const s of SIDES) {
    const chest = add(j.pelvis, applyM(j.torsoR, [9.8, SIGN[s] * 6.4, 26.6]));
    const top = add(j.shoulder[s], applyM(j.torsoR, [-0.8, -SIGN[s] * 2.4, 5.2]));
    const back = add(j.shoulder[s], applyM(j.torsoR, [-8.6, -SIGN[s] * 2.2, 2.4]));
    tube(
      sb.mesh(denim),
      [
        { p: chest, r: 2.3, rh: 1.4 },
        { p: top, r: 2.4, rh: 1.4 },
        { p: back, r: 2.3, rh: 1.4 },
      ],
      { segs: 8, n: 12 },
    );
    blob(sb.mesh(brass), add(chest, applyM(j.torsoR, [1, 0, 0])), [1.7, 1.7, 1.7], 0, { rings: 5, segs: 8 });
  }
}

export const stableWorker: Character = {
  id: 'stable-worker',
  face: WORKER_FACE,
  dress(sb: SceneBuilder, j: Joints, pose: HumanPose, extras: Extras): void {
    const mats: BodyMats = {
      skin: material(sb, 'skin', SKIN, SKIN_OUTLINE),
      shirt: material(sb, 'shirt', SHIRT),
      cuff: material(sb, 'cuff', CUFF),
      trousers: material(sb, 'trousers', DENIM),
      boot: material(sb, 'boot', BOOT),
      bootTop: material(sb, 'boot-top', BOOT_TOP),
      sole: material(sb, 'sole', SOLE),
      hand: material(sb, 'hands', SKIN, SKIN_OUTLINE),
    };
    buildLegs(sb, j, mats, SLIM);
    buildTorso(sb, j, mats.shirt, mats.trousers, SLIM, mats.skin);
    buildArms(sb, j, mats, WORK_SLEEVES);
    buildHands(sb, j, pose, mats.hand);
    buildHead(sb, j, mats.skin, SLIM);
    buildDungarees(sb, j, mats.trousers, material(sb, 'patch', DENIM_PATCH), material(sb, 'brass', BRASS));
    buildKerchief(sb, j, material(sb, 'kerchief', KERCHIEF));
    buildHair(sb, j, material(sb, 'hair', HAIR), material(sb, 'hair-tie', KERCHIEF), extras.sway ?? 0);
    drawTool(sb, extras.tool, j, extras.time ?? 0);
  },
};
