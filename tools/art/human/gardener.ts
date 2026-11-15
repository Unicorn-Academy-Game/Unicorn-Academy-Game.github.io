import { hex, type RGB, ramp } from '../core/color';
import { add, applyM, deg, type M3, mulM, rotY, rotZ } from '../core/vec';
import { extrude, lathe, type P2, SIDE } from '../world/arch';
import { blob } from '../world/prims';
import type { SceneBuilder } from '../world/scene';
import { type BodyMats, buildArms, buildHands, buildHead, buildLegs, buildTorso, ROLLED, SLIM } from './body';
import type { FaceStyle } from './face';
import type { Character, Extras } from './frame';
import { attach } from './mesh-util';
import { drawTool } from './props';
import { type HumanPose, type Joints, SIDES, SIGN } from './rig';

const R = (base: string, o: Parameters<typeof ramp>[1] = {}): RGB[] => ramp(hex(base), { steps: 5, ...o });
const SKIN = R('#a8714b', { shadowHue: 14, lightHue: 62, lean: 0.85, lightness: [-0.19, -0.095, 0, 0.065, 0.13] });
const SKIN_OUTLINE: RGB = [74, 40, 42];
const HAIR = R('#e3deef', { shadowHue: 272, lightHue: 90, lean: 0.75, lightness: [-0.24, -0.13, -0.04, 0, 0.05] });
const SHIRT = R('#f4ecdb', { shadowHue: 300, lightHue: 85, lean: 0.8, lightness: [-0.22, -0.11, -0.03, 0, 0.04] });
const CUFF = R('#ead9bb', { shadowHue: 310, lightHue: 80, lean: 0.8 });
const TROUSERS = R('#8a79c9', { shadowHue: 275, lightHue: 340, lean: 0.9 });
const BOOT = R('#33a79f', { shadowHue: 235, lightHue: 130, lean: 1.0 });
const BOOT_TOP = R('#a0e3d6', { shadowHue: 230, lightHue: 120, lean: 0.9 });
const SOLE = R('#463a52', { shadowHue: 280, lightHue: 300, lean: 0.8, lightness: [-0.12, -0.06, 0, 0.05, 0.1] });
const APRON = R('#7cc58a', { shadowHue: 205, lightHue: 105, lean: 1.0 });
const TRIM = R('#f0719f', { shadowHue: 320, lightHue: 60, lean: 0.9 });
const STRAW_A = R('#ecc965', { shadowHue: 335, lightHue: 90, lean: 0.85 });
const STRAW_B = R('#d5a94c', { shadowHue: 335, lightHue: 90, lean: 0.85 });
const PETAL = R('#fff1f4', { shadowHue: 320, lightHue: 80, lean: 0.8, lightness: [-0.18, -0.09, 0, 0.03, 0.06] });
const EYE: RGB = [52, 32, 36];

export const GARDENER_FACE: FaceStyle = {
  iris: EYE,
  white: [255, 250, 244],
  brow: [152, 144, 168],
  lip: [112, 44, 56],
  mouthInside: [98, 36, 50],
  blush: [236, 112, 128],
  blushAlpha: 0.42,
  lid: [52, 32, 36],
  freckles: [128, 78, 56],
  eyeGap: 14.2,
  eyeZ: -3.2,
  cranium: SLIM.head.cranium,
  jaw: { r: SLIM.head.jaw, down: SLIM.head.jawDown, forward: 1.8 },
};

const tilted = (R3: M3, a: number): M3 => mulM(R3, rotY(a));

function material(sb: SceneBuilder, name: string, ramp5: RGB[], outline?: RGB): number {
  return sb.solid(name, sb.variant(name, ramp5, outline ? { outline } : {}));
}

function strawMaterial(sb: SceneBuilder): number {
  const a = sb.variant('straw-a', STRAW_A);
  const b = sb.variant('straw-b', STRAW_B);
  return sb.material({
    name: 'straw',
    shade: (s) => {
      const r = Math.hypot(s.rest[0], s.rest[1]);
      return Math.floor(r / 2.6) % 2 === 0 ? a : b;
    },
    bias: (s) => {
      const r = Math.hypot(s.rest[0], s.rest[1]);
      const f = r / 2.6 - Math.floor(r / 2.6);
      return (f < 0.18 ? -0.06 : 0) + Math.sin(Math.atan2(s.rest[1], s.rest[0]) * 23 + r) * 0.018;
    },
  });
}

/**
 * The straw hat: a gently drooping brim and a soft crown, pushed back so the face shows, with a
 * pink band and a daisy.
 */
function buildHat(sb: SceneBuilder, j: Joints, straw: number, band: number, petal: number, centre: number): void {
  const at = add(j.head, applyM(j.headR, [-2.6, 0, 10.2]));
  const tilt = mulM(j.headR, rotY(deg(-9)));
  const brim: P2[] = [
    [15.8, 0.2],
    [20.5, 0.3],
    [24.5, -0.6],
    [27.2, -2],
    [28, -2.6],
    [28.5, -1.6],
    [27, -0.3],
    [23, 1.3],
    [18.4, 2.5],
    [17.6, 5],
    [17.4, 11.4],
    [16.4, 14.8],
    [12.8, 17.2],
    [6.6, 18.4],
    [0, 18.8],
  ];
  const lit = { noShadow: true };
  attach(sb.mesh(straw, lit), at, tilt, (m) => lathe(m, { c: [0, 0, 0], profile: brim, segs: 28, smooth: true }));
  attach(sb.mesh(band, lit), at, tilt, (m) =>
    lathe(m, {
      c: [0, 0, 0],
      profile: [
        [17.4, 2.8],
        [18.9, 3.2],
        [19, 7.2],
        [17.4, 7.8],
      ],
      segs: 28,
      smooth: true,
    }),
  );
  // A daisy on the band, over the left ear.
  const flower = add(at, applyM(tilt, [3.6, 18.2, 5.4]));
  const face = mulM(tilt, rotZ(deg(80)));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const p = add(flower, applyM(face, [Math.cos(a) * 3.3, 1.4, Math.sin(a) * 3.3]));
    blob(sb.mesh(petal, lit), p, [2.2, 2.2, 2.2], 0, { rings: 6, segs: 8 });
  }
  blob(sb.mesh(centre, lit), add(flower, applyM(face, [0, 2.4, 0])), [2.1, 2.1, 2.1], 0, { rings: 6, segs: 8 });
}

/** Silver curls that frame the face below the brim and gather at the nape. */
function buildHair(sb: SceneBuilder, j: Joints, hair: number): void {
  const part = sb.newPart();
  const place = (x: number, y: number, z: number, r: number): void =>
    blob(sb.mesh(hair, { part }), add(j.head, applyM(j.headR, [x, y, z])), [r, r, r * 0.95], 0, { rings: 7, segs: 10 });
  for (const [z, r] of [
    [8.4, 6.6],
    [2.6, 6.8],
    [-4, 6.6],
    [-10.6, 5.8],
  ] as const) {
    place(-16.4, 0, z, r);
    for (const s of SIDES) place(-12.6, SIGN[s] * 12.2, z, r - 0.4);
  }
  for (const s of SIDES) {
    place(-1.4, SIGN[s] * 19, 5.6, 5);
    place(-3.6, SIGN[s] * 20.4, -1, 5.2);
    place(-5, SIGN[s] * 19.2, -7.4, 4.8);
  }
}

/**
 * The apron: a bib on the chest and a skirt that hangs from the waist and lifts a little when the
 * knees swing forward.
 */
function buildApron(sb: SceneBuilder, j: Joints, apron: number, trim: number): void {
  const bib: P2[] = [
    [-6.6, 21],
    [6.6, 21],
    [8.2, 14],
    [11, 4],
    [11, 0],
    [-11, 0],
    [-11, 4],
    [-8.2, 14],
  ];
  attach(sb.mesh(apron), add(j.pelvis, applyM(j.torsoR, [0, 0, 8])), j.torsoR, (m) =>
    extrude(m, bib, SIDE(6.2, 0, 0), 0, 4, { caps: 'both' }),
  );
  const swing = (j.kneeAt.l[0] + j.kneeAt.r[0]) / 2 - j.pelvis[0];
  const sway = tilted(j.pelvisR, -swing * 0.022);
  const skirt: P2[] = [
    [-11.6, 0],
    [11.6, 0],
    [14.2, -24],
    [13.2, -26.4],
    [11.4, -27.2],
    [-11.4, -27.2],
    [-13.2, -26.4],
    [-14.2, -24],
  ];
  attach(sb.mesh(apron), add(j.pelvis, applyM(j.pelvisR, [0, 0, 6.6])), sway, (m) =>
    extrude(m, skirt, SIDE(6.4, 0, 0), 0, 3.4, { caps: 'both' }),
  );
  const hem: P2[] = [
    [-14, -22.8],
    [14, -22.8],
    [14.2, -24],
    [13.2, -26.4],
    [11.4, -27.2],
    [-11.4, -27.2],
    [-13.2, -26.4],
    [-14.2, -24],
  ];
  attach(sb.mesh(trim), add(j.pelvis, applyM(j.pelvisR, [0, 0, 6.6])), sway, (m) =>
    extrude(m, hem, SIDE(6.4, 0, 0), 0, 3.65, { caps: 'both' }),
  );
  // A pocket on the skirt.
  const pocket: P2[] = [
    [-7, -8.6],
    [7, -8.6],
    [8, -9.6],
    [8, -15.6],
    [7, -17.2],
    [-7, -17.2],
    [-8, -15.6],
    [-8, -9.6],
  ];
  attach(sb.mesh(trim), add(j.pelvis, applyM(j.pelvisR, [0, 0, 6.6])), sway, (m) =>
    extrude(m, pocket, SIDE(6.4, 0, 0), 3.4, 3.9, { caps: 'both' }),
  );
  // Straps over the shoulders.
  for (const s of SIDES) {
    const chest = add(j.pelvis, applyM(j.torsoR, [8.4, SIGN[s] * 5.8, 28]));
    const top = add(j.shoulder[s], applyM(j.torsoR, [-0.8, -SIGN[s] * 2.2, 4.6]));
    const n = 6;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = add(add(chest, [(top[0] - chest[0]) * t, (top[1] - chest[1]) * t, (top[2] - chest[2]) * t]), [0, 0, 0]);
      blob(sb.mesh(apron), p, [2.4, 2.4, 1.8], 0, { rings: 5, segs: 8 });
    }
  }
}

export const gardener: Character = {
  id: 'gardener',
  face: GARDENER_FACE,
  dress(sb: SceneBuilder, j: Joints, pose: HumanPose, extras: Extras): void {
    const mats: BodyMats = {
      skin: material(sb, 'skin', SKIN, SKIN_OUTLINE),
      shirt: material(sb, 'shirt', SHIRT),
      cuff: material(sb, 'cuff', CUFF),
      trousers: material(sb, 'trousers', TROUSERS),
      boot: material(sb, 'boot', BOOT),
      bootTop: material(sb, 'boot-top', BOOT_TOP),
      sole: material(sb, 'sole', SOLE),
      hand: material(sb, 'hands', SKIN, SKIN_OUTLINE),
    };
    buildLegs(sb, j, mats, SLIM);
    buildTorso(sb, j, mats.shirt, mats.trousers, SLIM, mats.skin);
    buildArms(sb, j, mats, ROLLED);
    buildHands(sb, j, pose, mats.hand);
    buildHead(sb, j, mats.skin, SLIM);
    buildApron(sb, j, material(sb, 'apron', APRON), material(sb, 'apron-trim', TRIM));
    buildHair(sb, j, material(sb, 'hair', HAIR));
    buildHat(
      sb,
      j,
      strawMaterial(sb),
      material(sb, 'hat-band', TRIM),
      material(sb, 'petal', PETAL),
      material(sb, 'daisy-eye', STRAW_B),
    );
    drawTool(sb, extras.tool, j, extras.time ?? 0);
  },
};
