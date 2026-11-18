import { hex, type RGB, ramp } from '../core/color';
import { add, applyM, IDENTITY, type M3, mulM, rotY, type V3 } from '../core/vec';
import { extrude, lathe, type P2, SIDE } from '../world/arch';
import { blob, box, tube } from '../world/prims';
import type { SceneBuilder } from '../world/scene';
import { type BodyMats, buildArms, buildHands, buildHead, buildLegs, buildTorso, ROLLED, SLIM } from './body';
import type { ClipSpec } from './clips';
import type { FaceStyle } from './face';
import { type Character, type Extras, UNIT } from './frame';
import { attach } from './mesh-util';
import { beat, strideOf, WALK, walk } from './motion';
import { type HumanPose, type Joints, restPose, SIDES, SIGN } from './rig';

/**
 * The grown-ups who live in the palace, on the beach, in the witch's hut and at the North Pole.
 * They share the gardener's body and are told apart by what a child can see from a distance: hair,
 * a hat, a garment and something held in the left hand, which says what the person is for. The
 * right hand is left free to wave.
 */

const R = (base: string, o: Parameters<typeof ramp>[1] = {}): RGB[] =>
  ramp(hex(base), { steps: 5, shadowHue: 300, lightHue: 80, lean: 0.9, ...o });
const SOLE = R('#463a52', { shadowHue: 280, lightHue: 300, lean: 0.8, lightness: [-0.12, -0.06, 0, 0.05, 0.1] });
const WHITE = R('#ffffff', { shadowHue: 270, lightHue: 80, lean: 0.6, lightness: [-0.2, -0.1, -0.04, 0, 0.03] });
const STEEL = R('#cfd5e4', { shadowHue: 265, lightHue: 85, lean: 0.7 });
const GOLD = R('#f2c34b', { shadowHue: 30, lightHue: 95, lean: 0.9 });
const WOOD = R('#b27c52', { shadowHue: 320, lightHue: 70, lean: 0.9 });
const RED = R('#d9455f', { shadowHue: 330, lightHue: 50, lean: 0.9 });
const GREEN = R('#4fae5c', { shadowHue: 200, lightHue: 105, lean: 1 });

type HairStyle = 'short' | 'curls' | 'bun' | 'long' | 'braid' | 'bald';
type Beard = 'full' | 'moustache';
type Hat =
  | 'chef'
  | 'helm'
  | 'witch'
  | 'wizard'
  | 'santa'
  | 'elf'
  | 'bonnet'
  | 'beret'
  | 'sun'
  | 'flowers'
  | 'cap'
  | 'tiara'
  | 'sailor';
type Garment = 'apron' | 'robe' | 'dress' | 'vest' | 'sash';
export type Held =
  | 'ladle'
  | 'tray'
  | 'book'
  | 'bouquet'
  | 'wand'
  | 'baton'
  | 'gem'
  | 'pillow'
  | 'present'
  | 'spear'
  | 'staff'
  | 'sack'
  | 'bucket'
  | 'telescope';

export interface FolkLook {
  id: string;
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  beard?: Beard;
  glasses?: boolean;
  shirt: string;
  trousers: string;
  boot: string;
  eye: RGB;
  hat?: { kind: Hat; color: string; band: string };
  garment?: { kind: Garment; color: string; trim: string };
  held?: Held;
  /** How round the belly is, 0 for an ordinary figure and 1 for Father Christmas. */
  belly?: number;
  /** Whether this person has a dance, for the one who is at the ball. */
  dances?: boolean;
}

const mat = (sb: SceneBuilder, name: string, colors: RGB[], outline?: RGB): number =>
  sb.solid(name, sb.variant(name, colors, outline ? { outline } : {}));

const faceOf = (look: FolkLook, skin: RGB[]): FaceStyle => ({
  iris: look.eye,
  white: [255, 250, 244],
  brow: look.hairStyle === 'bald' && !look.beard ? [96, 76, 70] : darker(look.hair),
  lip: [132, 52, 62],
  mouthInside: [98, 36, 50],
  blush: [236, 112, 128],
  blushAlpha: 0.38,
  lid: look.eye,
  freckles: skin[1]!,
  eyeGap: 14.2,
  eyeZ: -3.2,
  cranium: SLIM.head.cranium,
  jaw: { r: SLIM.head.jaw, down: SLIM.head.jawDown, forward: 1.8 },
});

const darker = (base: string): RGB => {
  const c = ramp(hex(base), { steps: 3, lightness: [-0.34, -0.2, -0.1] })[0]!;
  return [c[0], c[1], c[2]];
};

const headAt = (j: Joints, x: number, y: number, z: number): V3 => add(j.head, applyM(j.headR, [x, y, z]));

/** Hair that is a cap over the crown and back, then whatever the style adds. */
function buildHair(sb: SceneBuilder, j: Joints, style: HairStyle, hair: number, sway: number): void {
  if (style === 'bald') {
    const part = sb.newPart();
    for (const s of SIDES)
      blob(sb.mesh(hair, { part }), headAt(j, -9, SIGN[s] * 16, 0), [5, 3.4, 5.6], 0, { rings: 6, segs: 8 });
    return;
  }
  const part = sb.newPart();
  const place = (x: number, y: number, z: number, rx: number, ry = rx, rz = rx): void =>
    blob(sb.mesh(hair, { part }), headAt(j, x, y, z), [rx, ry, rz], 0, { rings: 8, segs: 12 });
  if (style === 'curls') {
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
    place(6, 0, 15.6, 9, 14, 5);
    return;
  }
  place(-2.6, 0, 3.4, 20.6, 20, 17.6);
  place(-6, 0, -3, 18.4, 18.8, 14.4);
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
  if (style === 'bun') place(-12.4, 0, 20.4, 7.6, 7.6, 7);
  if (style === 'long' || style === 'braid') {
    const swing = Math.sin(sway) * 2;
    tube(
      sb.mesh(hair, { part }),
      [
        { p: headAt(j, -14, 0, 6), r: style === 'braid' ? 6.4 : 12 },
        { p: headAt(j, -17.4, swing * 0.4, -8), r: style === 'braid' ? 5.6 : 12.4 },
        { p: headAt(j, -17.4, swing, -26), r: style === 'braid' ? 4.4 : 11 },
        { p: headAt(j, -16.4, swing * 1.4, -40), r: style === 'braid' ? 2.4 : 7 },
      ],
      { segs: 10, n: 14 },
    );
  }
}

/** A beard along the jaw, or a moustache; a full one reaches down over the chest. */
function buildBeard(sb: SceneBuilder, j: Joints, kind: Beard, hair: number, big: boolean): void {
  const part = sb.newPart();
  const place = (x: number, y: number, z: number, rx: number, ry = rx, rz = rx): void =>
    blob(sb.mesh(hair, { part }), headAt(j, x, y, z), [rx, ry, rz], 0, { rings: 7, segs: 10 });
  place(17, 0, -5.6, 3.6, 8.6, 2.4);
  if (kind === 'moustache') return;
  const drop = big ? 1.5 : 1;
  for (const s of SIDES) place(11, SIGN[s] * 11, -11, 8, 6, 8);
  place(14, 0, -15 * drop, 8.4, 11, 8 * drop);
  place(12, 0, -24 * drop, 8, 10, 8 * drop);
  if (big) place(11, 0, -33, 7, 8.6, 8);
}

/** Round spectacles on the nose, so a reader looks like one. */
function buildGlasses(sb: SceneBuilder, j: Joints): void {
  const frame = mat(sb, 'glasses', R('#35304a', { shadowHue: 270, lightHue: 270, lean: 0.8 }));
  for (const s of SIDES) {
    const c = headAt(j, 19.6, SIGN[s] * 7.1, 1.4);
    attach(sb.mesh(frame, { noShadow: true }), c, j.headR, (m) =>
      lathe(m, {
        c: [0, 0, 0],
        profile: [
          [4.2, -0.4],
          [5.4, 0.2],
          [5.4, 1.2],
          [4.2, 1.6],
        ],
        segs: 14,
        smooth: true,
      }),
    );
  }
  tube(
    sb.mesh(frame, { noShadow: true }),
    [
      { p: headAt(j, 20.4, 2.2, 2), r: 0.8 },
      { p: headAt(j, 20.8, 0, 2.4), r: 0.8 },
      { p: headAt(j, 20.4, -2.2, 2), r: 0.8 },
    ],
    { segs: 6, n: 6 },
  );
}

const tilted = (R3: M3, a: number): M3 => mulM(R3, rotY(a));

/** A hat is a solid of revolution on the head, so most of them are a profile and a colour. */
function buildHat(sb: SceneBuilder, j: Joints, hat: NonNullable<FolkLook['hat']>): void {
  const main = mat(sb, 'hat', R(hat.color, { shadowHue: 300, lightHue: 80 }));
  const band = mat(sb, 'hat-band', R(hat.band, { shadowHue: 300, lightHue: 80 }));
  const lit = { noShadow: true };
  const at = headAt(j, -2.4, 0, 9.4);
  const lay = (target: number, R3: M3, origin: V3, profile: P2[], segs = 26): void =>
    attach(sb.mesh(target, lit), origin, R3, (m) => lathe(m, { c: [0, 0, 0], profile, segs, smooth: true }));
  switch (hat.kind) {
    case 'chef':
      lay(band, j.headR, at, [
        [17.4, 0],
        [18.2, 0.4],
        [18.2, 5.6],
        [17.4, 6],
      ]);
      lay(main, j.headR, at, [
        [17.6, 5],
        [21, 9.4],
        [23.4, 16],
        [22.4, 23],
        [17.6, 28.4],
        [9, 31],
        [0, 31.4],
      ]);
      return;
    case 'helm': {
      lay(main, j.headR, at, [
        [18.4, -1],
        [19.4, 4],
        [17.2, 12],
        [11, 18],
        [0, 20.4],
      ]);
      lay(band, j.headR, at, [
        [18.6, 1.6],
        [19.8, 2],
        [19.8, 4.6],
        [18.6, 5],
      ]);
      const plume = mat(sb, 'plume', RED);
      for (let k = 0; k < 5; k++)
        blob(
          sb.mesh(plume, lit),
          add(at, applyM(j.headR, [-3 - k * 3.2, 0, 21 + 3.6 * Math.sin(k * 0.8) - k * 0.2])),
          [4.6, 3.4, 4.6],
          0,
          {
            rings: 6,
            segs: 8,
          },
        );
      return;
    }
    case 'witch':
    case 'wizard': {
      const tip = hat.kind === 'witch' ? 40 : 52;
      const lean = hat.kind === 'witch' ? 0.18 : 0.1;
      lay(main, j.headR, at, [
        [15.4, -1],
        [22, -1.2],
        [27, -2.4],
        [28.4, -2.6],
        [28, -1.4],
        [22, 0.8],
        [16, 2.4],
      ]);
      lay(main, tilted(j.headR, lean), at, [
        [16.6, 1],
        [14, 10],
        [10, tip * 0.55],
        [5, tip * 0.82],
        [0, tip],
      ]);
      lay(band, tilted(j.headR, lean), at, [
        [16.4, 3.4],
        [17.4, 3.8],
        [17, 8],
        [15.6, 8.4],
      ]);
      return;
    }
    case 'santa':
    case 'elf': {
      lay(main, j.headR, at, [
        [18.2, 1],
        [17, 9],
        [13.6, 15],
        [9, 19],
      ]);
      lay(main, tilted(j.headR, -0.75), add(at, applyM(j.headR, [-2, 0, 15.6])), [
        [9.4, 0],
        [7, 7],
        [4.4, 13],
        [2, 17],
        [0, 18],
      ]);
      const fur = mat(sb, 'fur', WHITE);
      lay(band === main ? fur : hat.kind === 'santa' ? fur : band, j.headR, at, [
        [17.8, -0.4],
        [19.8, 0.4],
        [19.8, 4.4],
        [17.8, 5.6],
      ]);
      const tipAt = add(at, applyM(j.headR, [-2, 0, 15.6]));
      const end = add(tipAt, applyM(mulM(j.headR, rotY(-0.75)), [0, 0, 18.4]));
      blob(sb.mesh(hat.kind === 'santa' ? fur : band, lit), end, [3.6, 3.6, 3.6], 0, { rings: 7, segs: 10 });
      return;
    }
    case 'bonnet':
      lay(main, j.headR, at, [
        [18.4, -1.6],
        [20.6, 1],
        [20, 7],
        [15.4, 12.4],
        [0, 14.4],
      ]);
      lay(band, j.headR, add(at, applyM(j.headR, [0, 0, -1])), [
        [18.6, 0],
        [21.4, 0.6],
        [21.4, 3],
        [18.6, 3.6],
      ]);
      return;
    case 'beret':
      lay(main, tilted(j.headR, -0.18), add(at, applyM(j.headR, [-1, 2, -0.6])), [
        [17.6, 0],
        [21.4, 2.4],
        [22.4, 5.6],
        [20, 9],
        [12, 10.8],
        [0, 11.2],
      ]);
      blob(sb.mesh(band, lit), add(at, applyM(j.headR, [0, 2, 10.8])), [1.6, 1.6, 2.2], 0, { rings: 5, segs: 6 });
      return;
    case 'sun':
      lay(main, tilted(j.headR, -0.1), at, [
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
      ]);
      lay(band, tilted(j.headR, -0.1), at, [
        [17.4, 2.8],
        [18.9, 3.2],
        [19, 7.2],
        [17.4, 7.8],
      ]);
      return;
    case 'cap':
      lay(main, j.headR, at, [
        [18.2, -0.4],
        [19, 4],
        [17.2, 9.6],
        [10, 12.6],
        [0, 13.2],
      ]);
      lay(band, j.headR, at, [
        [18.4, 1],
        [19.4, 1.4],
        [19.4, 3.8],
        [18.4, 4.2],
      ]);
      attach(sb.mesh(band, lit), add(at, applyM(j.headR, [14, 0, 0.8])), j.headR, (m) =>
        lathe(m, {
          c: [0, 0, 0],
          profile: [
            [0, 0.2],
            [6.6, 0.4],
            [9.4, 0],
            [9.4, 1],
            [6.6, 1.4],
            [0, 1.6],
          ],
          segs: 14,
          smooth: true,
        }),
      );
      return;
    case 'sailor':
      lay(main, j.headR, at, [
        [17.6, -0.4],
        [19.4, 4],
        [18.4, 8],
        [10, 11.4],
        [0, 11.8],
      ]);
      lay(band, j.headR, at, [
        [17.6, -0.6],
        [18.8, 0],
        [18.8, 2.6],
        [17.6, 3.2],
      ]);
      return;
    case 'tiara': {
      const gem = mat(sb, 'tiara-gem', R(hat.band, { shadowHue: 300, lightHue: 80 }));
      for (let k = -4; k <= 4; k++) {
        const a = (k / 4) * 1.2;
        const p = headAt(j, 15.6 * Math.cos(a), 15.6 * Math.sin(a), 17.6 - Math.abs(k) * 0.9);
        blob(sb.mesh(main, lit), p, [2, 2, 2.6], 0, { rings: 5, segs: 7 });
        if (k % 2 === 0) blob(sb.mesh(gem, lit), add(p, [0, 0, 2.4]), [1.7, 1.7, 1.9], 0, { rings: 5, segs: 7 });
      }
      return;
    }
    case 'flowers': {
      const bloom = [main, band, mat(sb, 'bloom-3', R('#fff2a0')), mat(sb, 'bloom-4', R('#c7a6f4'))];
      const leaf = mat(sb, 'bloom-leaf', GREEN);
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const p = headAt(j, 15.4 * Math.cos(a) - 2, 15.4 * Math.sin(a), 12.6 + 2 * Math.cos(a * 2));
        blob(sb.mesh(k % 2 ? leaf : bloom[(k >> 1) % 4]!, lit), p, [3.4, 3.4, 3.2], 0, { rings: 6, segs: 8 });
      }
      return;
    }
  }
}

/** The apron, with its bib and skirt, in the gardener's cut. */
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
  skirt(sb, j, apron, trim, 27.2, 14.2);
  for (const s of SIDES) {
    const chest = add(j.pelvis, applyM(j.torsoR, [8.4, SIGN[s] * 5.8, 28]));
    const top = add(j.shoulder[s], applyM(j.torsoR, [-0.8, -SIGN[s] * 2.2, 4.6]));
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const p: V3 = [
        chest[0] + (top[0] - chest[0]) * t,
        chest[1] + (top[1] - chest[1]) * t,
        chest[2] + (top[2] - chest[2]) * t,
      ];
      blob(sb.mesh(apron), p, [2.4, 2.4, 1.8], 0, { rings: 5, segs: 8 });
    }
  }
}

/** A skirt that hangs from the waist and lifts a little when the knees swing forward. */
function skirt(sb: SceneBuilder, j: Joints, cloth: number, trim: number, length: number, flare: number): void {
  const swing = (j.kneeAt.l[0] + j.kneeAt.r[0]) / 2 - j.pelvis[0];
  const sway = tilted(j.pelvisR, -swing * 0.022);
  const body: P2[] = [
    [-11.6, 0],
    [11.6, 0],
    [flare, -length * 0.88],
    [flare - 1, -length * 0.97],
    [flare - 3, -length],
    [-(flare - 3), -length],
    [-(flare - 1), -length * 0.97],
    [-flare, -length * 0.88],
  ];
  attach(sb.mesh(cloth), add(j.pelvis, applyM(j.pelvisR, [0, 0, 6.6])), sway, (m) =>
    extrude(m, body, SIDE(6.4, 0, 0), 0, 3.4, { caps: 'both' }),
  );
  const hem: P2[] = [
    [-flare, -length * 0.8],
    [flare, -length * 0.8],
    [flare, -length * 0.88],
    [flare - 1, -length * 0.97],
    [flare - 3, -length],
    [-(flare - 3), -length],
    [-(flare - 1), -length * 0.97],
    [-flare, -length * 0.88],
  ];
  attach(sb.mesh(trim), add(j.pelvis, applyM(j.pelvisR, [0, 0, 6.6])), sway, (m) =>
    extrude(m, hem, SIDE(6.4, 0, 0), 0, 3.65, { caps: 'both' }),
  );
}

/** A waistcoat: the bib of an apron without the skirt, with a row of buttons. */
function buildVest(sb: SceneBuilder, j: Joints, cloth: number, trim: number): void {
  const front: P2[] = [
    [-9.6, 26],
    [9.6, 26],
    [12.6, 14],
    [11.6, 4],
    [11.6, -3],
    [-11.6, -3],
    [-11.6, 4],
    [-12.6, 14],
  ];
  attach(sb.mesh(cloth), add(j.pelvis, applyM(j.torsoR, [0, 0, 8])), j.torsoR, (m) =>
    extrude(m, front, SIDE(6.4, 0, 0), 0, 4.2, { caps: 'both' }),
  );
  for (let k = 0; k < 4; k++)
    blob(sb.mesh(trim), add(j.pelvis, applyM(j.torsoR, [10.6, 0, 11 + k * 5.4])), [1.5, 1.5, 1.5], 0, {
      rings: 5,
      segs: 7,
    });
}

/** A robe or a long dress, which hides the legs, with a coloured hem. */
function buildRobe(sb: SceneBuilder, j: Joints, cloth: number, trim: number, wide: number): void {
  buildVest(sb, j, cloth, trim);
  skirt(sb, j, cloth, trim, 55, wide);
}

/** A sash from one shoulder to the opposite hip, in a colour. */
function buildSash(sb: SceneBuilder, j: Joints, cloth: number, trim: number): void {
  const a = add(j.shoulder.l, applyM(j.torsoR, [1.5, 1, 4]));
  const b = add(j.pelvis, applyM(j.torsoR, [3, -10, 4]));
  const pts = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    p: [a[0] + (b[0] - a[0]) * t + 3.4, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t] as V3,
    r: 3.2,
  }));
  tube(sb.mesh(cloth), pts, { segs: 8, n: 14 });
  blob(sb.mesh(trim), add(b, [4.4, 0, 0]), [3.4, 3.4, 3.4], 0, { rings: 6, segs: 8 });
}

/** A belt about the waist, for a coat that wants one. */
function buildBelt(sb: SceneBuilder, j: Joints, belt: number, wide: number): void {
  tube(
    sb.mesh(belt),
    [
      { p: add(j.pelvis, applyM(j.torsoR, [0, 0, 8.4])), r: wide, rh: wide - 1 },
      { p: add(j.pelvis, applyM(j.torsoR, [0, 0, 10.4])), r: wide + 0.2, rh: wide - 0.8 },
    ],
    { segs: 18, n: 4, up: applyM(j.torsoR, [0, 1, 0]) },
  );
}

/** What is held in the left hand. Built upright in the world, at the hand. */
function buildHeld(sb: SceneBuilder, j: Joints, kind: Held): void {
  const p = j.hand.l.p;
  const wood = mat(sb, 'held-wood', WOOD);
  const gold = mat(sb, 'held-gold', GOLD);
  const steel = mat(sb, 'held-steel', STEEL);
  const rod = (from: V3, to: V3, r: number, m = wood): void =>
    tube(
      sb.mesh(m),
      [
        { p: from, r },
        { p: to, r },
      ],
      { segs: 8, n: 4, capStart: true, capEnd: true },
    );
  const sphere = (c: V3, r: number, m: number): void => blob(sb.mesh(m), c, [r, r, r], 0, { rings: 7, segs: 10 });
  switch (kind) {
    case 'ladle': {
      rod(add(p, [0, 0, -4]), add(p, [4, 0, 22]), 1.1);
      sphere(add(p, [5, 0, 25]), 4.6, steel);
      return;
    }
    case 'tray': {
      const tray = mat(sb, 'held-tray', STEEL);
      attach(sb.mesh(tray), add(p, [9, 0, 3]), IDENTITY, (m) =>
        lathe(m, {
          c: [0, 0, 0],
          profile: [
            [0, -0.6],
            [13, -0.6],
            [14.4, 0.8],
            [13, 1.2],
            [0, 1.2],
          ],
          segs: 20,
          smooth: true,
        }),
      );
      const pot = mat(sb, 'held-pot', WHITE);
      attach(sb.mesh(pot), add(p, [9, 0, 4]), IDENTITY, (m) =>
        lathe(m, {
          c: [0, 0, 0],
          profile: [
            [0, 0],
            [5.4, 0],
            [6.2, 4],
            [4.4, 8.6],
            [2.4, 9.4],
            [0, 9.6],
          ],
          segs: 14,
          smooth: true,
        }),
      );
      tube(
        sb.mesh(pot),
        [
          { p: add(p, [14.4, 0, 8]), r: 1.2 },
          { p: add(p, [9, 0, 7]), r: 1.8 },
        ],
        {
          segs: 6,
          n: 4,
        },
      );
      sphere(add(p, [9, 0, 14]), 1.6, gold);
      return;
    }
    case 'book': {
      const cover = mat(sb, 'held-book', RED);
      const pages = mat(sb, 'held-pages', WHITE);
      box(sb.mesh(cover), add(p, [8, 0, 3]), [11, 14, 2.6]);
      box(sb.mesh(pages), add(p, [8, 0, 4.6]), [10, 12.6, 1.6]);
      return;
    }
    case 'bouquet': {
      const stem = mat(sb, 'held-stem', GREEN);
      rod(add(p, [0, 0, -2]), add(p, [4, 0, 12]), 1.6, stem);
      const blooms = [
        mat(sb, 'held-b1', R('#ff7fb2')),
        mat(sb, 'held-b2', R('#ffd84a')),
        mat(sb, 'held-b3', R('#c7a6f4')),
        mat(sb, 'held-b4', R('#ffffff')),
      ];
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        sphere(add(p, [4 + Math.cos(a) * 5, Math.sin(a) * 5, 15 + (k % 3) * 1.4]), 3.2, blooms[k % 4]!);
      }
      return;
    }
    case 'wand': {
      rod(add(p, [0, 0, -3]), add(p, [6, 0, 21]), 0.9, mat(sb, 'held-wand', R('#7c5ac0')));
      sphere(add(p, [7, 0, 24]), 3.2, gold);
      return;
    }
    case 'baton': {
      rod(add(p, [0, 0, -2]), add(p, [9, 0, 20]), 0.8, mat(sb, 'held-baton', WHITE));
      return;
    }
    case 'gem': {
      sphere(add(p, [6, 0, 5]), 4.6, mat(sb, 'held-gem', R('#7ff0ff', { shadowHue: 240, lightHue: 160 })));
      return;
    }
    case 'pillow': {
      const cloth = mat(sb, 'held-pillow', R('#fff0f6'));
      blob(sb.mesh(cloth), add(p, [8, 0, 3]), [9, 12, 4], 0, { rings: 8, segs: 12 });
      return;
    }
    case 'present': {
      const wrap = mat(sb, 'held-wrap', RED);
      const ribbon = mat(sb, 'held-ribbon', GOLD);
      box(sb.mesh(wrap), add(p, [7, 0, 4]), [10, 10, 10]);
      box(sb.mesh(ribbon), add(p, [7, 0, 4]), [10.4, 2.2, 10.4]);
      box(sb.mesh(ribbon), add(p, [7, 0, 4]), [2.2, 10.4, 10.4]);
      sphere(add(p, [7, 0, 10.6]), 2.6, ribbon);
      return;
    }
    case 'spear': {
      rod(add(p, [1, 0, -34]), add(p, [1, 0, 66]), 1.2);
      attach(sb.mesh(steel), add(p, [1, 0, 66]), IDENTITY, (m) =>
        lathe(m, {
          c: [0, 0, 0],
          profile: [
            [1.2, 0],
            [3.6, 2],
            [2.2, 9],
            [0, 15],
          ],
          segs: 8,
          smooth: true,
        }),
      );
      return;
    }
    case 'staff': {
      rod(add(p, [1, 0, -34]), add(p, [1, 0, 56]), 1.3);
      sphere(add(p, [1, 0, 60]), 4.6, mat(sb, 'held-orb', R('#7ff0ff', { shadowHue: 240, lightHue: 160 })));
      return;
    }
    case 'sack': {
      const cloth = mat(sb, 'held-sack', R('#b8814f', { shadowHue: 330, lightHue: 70 }));
      blob(sb.mesh(cloth), add(p, [-2, 0, -6]), [11, 10, 14], 0, { rings: 8, segs: 12 });
      blob(sb.mesh(cloth), add(p, [-2, 0, 6]), [5, 5, 4], 0, { rings: 6, segs: 8 });
      return;
    }
    case 'bucket': {
      const pail = mat(sb, 'held-pail', R('#e8403f'));
      attach(sb.mesh(pail), add(p, [1, 0, -16]), IDENTITY, (m) =>
        lathe(m, {
          c: [0, 0, 0],
          profile: [
            [0, 0],
            [5.4, 0],
            [7.6, 12],
            [8.4, 12],
            [8.4, 12.8],
            [7.6, 12.8],
          ],
          segs: 14,
          smooth: true,
        }),
      );
      return;
    }
    case 'telescope': {
      rod(add(p, [2, -2, 4]), add(p, [20, 3, 14]), 2.4, gold);
      rod(add(p, [20, 3, 14]), add(p, [27, 4.6, 17]), 3, mat(sb, 'held-tube', R('#6a4a2e')));
      return;
    }
  }
}

/** Where the left hand rests to hold each thing, and what it holds. `side` hangs by the hip. */
const STANCE: Record<Held, 'side' | 'front'> = {
  ladle: 'front',
  tray: 'front',
  book: 'front',
  bouquet: 'front',
  wand: 'front',
  baton: 'front',
  gem: 'front',
  pillow: 'front',
  present: 'front',
  telescope: 'front',
  spear: 'side',
  staff: 'side',
  sack: 'side',
  bucket: 'side',
};

const HAND_FRONT: V3 = [17, 17, 78];
const HAND_SIDE: V3 = [3, 22, 62];

function holdLeft(pose: HumanPose, held: Held | undefined): void {
  if (!held) return;
  const front = STANCE[held] === 'front';
  pose.wrist.l = front ? [...HAND_FRONT] : [...HAND_SIDE];
  pose.elbow.l = front ? [-0.5, 1, 0.1] : [-0.6, 1, 0.1];
  pose.grip.l = 0.85;
}

function dressUp(look: FolkLook): Character['dress'] {
  const skin = R(look.skin, { shadowHue: 14, lightHue: 62, lean: 0.85, lightness: [-0.19, -0.095, 0, 0.065, 0.13] });
  const skinOutline: RGB = [74, 40, 42];
  const hair = R(look.hair, { shadowHue: 290, lightHue: 80, lean: 0.8 });
  const shirt = R(look.shirt);
  const cuff = R(look.shirt, { lightness: [-0.3, -0.18, -0.08, 0, 0.05] });
  const trousers = R(look.trousers);
  const boot = R(look.boot);
  const bootTop = R(look.boot, { lightness: [-0.2, -0.1, 0, 0.1, 0.18] });
  return (sb: SceneBuilder, j: Joints, pose: HumanPose, extras: Extras): void => {
    const mats: BodyMats = {
      skin: mat(sb, 'skin', skin, skinOutline),
      shirt: mat(sb, 'shirt', shirt),
      cuff: mat(sb, 'cuff', cuff),
      trousers: mat(sb, 'trousers', trousers),
      boot: mat(sb, 'boot', boot),
      bootTop: mat(sb, 'boot-top', bootTop),
      sole: mat(sb, 'sole', SOLE),
      hand: mat(sb, 'hands', skin, skinOutline),
    };
    buildLegs(sb, j, mats, SLIM);
    buildTorso(sb, j, mats.shirt, mats.trousers, SLIM, mats.skin);
    buildArms(sb, j, mats, ROLLED);
    buildHands(sb, j, pose, mats.hand);
    buildHead(sb, j, mats.skin, SLIM);
    if (look.belly) {
      const round = look.belly;
      blob(
        sb.mesh(mats.shirt),
        add(j.pelvis, applyM(j.torsoR, [6 + round * 5, 0, 13])),
        [11 + round * 3, 13.6 + round * 4, 14],
        0,
        {
          rings: 10,
          segs: 14,
        },
      );
      const belt = mat(sb, 'belt', R('#2b2430'));
      const buckle = mat(sb, 'buckle', GOLD);
      buildBelt(sb, j, belt, 13.6 + round * 3.4);
      blob(
        sb.mesh(belt),
        add(j.pelvis, applyM(j.torsoR, [6 + round * 5, 0, 9.6])),
        [14.3 + round * 3, 17.8 + round * 4, 1.7],
        0,
        {
          rings: 6,
          segs: 14,
        },
      );
      blob(
        sb.mesh(buckle),
        add(j.pelvis, applyM(j.torsoR, [6 + round * 5 + 14.2 + round * 3, 0, 9.6])),
        [1.8, 4.4, 3.4],
        0,
        {
          rings: 6,
          segs: 8,
        },
      );
    }
    const g = look.garment;
    if (g) {
      const cloth = mat(sb, 'garment', R(g.color));
      const trim = mat(sb, 'garment-trim', R(g.trim));
      if (g.kind === 'apron') buildApron(sb, j, cloth, trim);
      else if (g.kind === 'vest') buildVest(sb, j, cloth, trim);
      else if (g.kind === 'sash') buildSash(sb, j, cloth, trim);
      else buildRobe(sb, j, cloth, trim, g.kind === 'robe' ? 16.4 : 18.6);
    }
    buildHair(sb, j, look.hairStyle, mat(sb, 'hair', hair), extras.sway ?? 0);
    if (look.beard) buildBeard(sb, j, look.beard, mat(sb, 'beard', hair), look.belly !== undefined);
    if (look.glasses) buildGlasses(sb, j);
    if (look.hat) buildHat(sb, j, look.hat);
    if (look.held) buildHeld(sb, j, look.held);
  };
}

export function folk(look: FolkLook): Character {
  const skin = R(look.skin, { shadowHue: 14, lightHue: 62, lean: 0.85, lightness: [-0.19, -0.095, 0, 0.065, 0.13] });
  return { id: look.id, face: faceOf(look, skin), dress: dressUp(look) };
}

/**
 * The four clips every grown-up of the cast has: standing, walking, a wave and busy hands (the
 * right hand working at the waist, head bowed to it), with the left hand holding what the person
 * carries.
 */
export function folkClips(look: FolkLook): Record<string, ClipSpec> {
  const held = look.held;
  return {
    idle: {
      frames: 8,
      fps: 6,
      loop: true,
      at: (t) => {
        const pose = restPose();
        pose.pelvis = [pose.pelvis[0], 0.9 * beat(t, 1, 0.1), pose.pelvis[2]];
        pose.roll = 0.02 * beat(t, 1, 0.1);
        pose.mouth = 0.18;
        pose.look = [0.4 * beat(t, 1, 0.1), 0];
        pose.blink = Math.abs(t - 0.62) < 0.06 ? 1 : 0;
        pose.headYaw = 0.05 * beat(t, 1, 0.3);
        pose.wrist.r = [2 + 1.2 * beat(t, 1, 0.3), -22, 66 + 1.2 * beat(t, 1, 0.3)];
        pose.wrist.l = [2 - 0.8 * beat(t, 1, 0.3), 22, 66 - 0.8 * beat(t, 1, 0.3)];
        holdLeft(pose, held);
        return { pose, extras: { sway: 0.1 * beat(t, 1, 0.35) } };
      },
    },
    walk: {
      frames: 8,
      fps: 12,
      loop: true,
      stride: STRIDE,
      at: (t) => {
        const pose = walk(t);
        pose.headPitch = -0.02 + 0.02 * beat(t, 2, 0.25);
        pose.mouth = 0.2;
        holdLeft(pose, held);
        return { pose, extras: { sway: 0.32 * beat(t, 2, 0.1) } };
      },
    },
    tend: {
      frames: 8,
      fps: 8,
      loop: true,
      at: (t) => {
        const pose = restPose();
        pose.wrist.r = [16 + 4 * beat(t, 1, 0), -12 + 5 * beat(t, 1, 0.25), 50 + 3 * beat(t, 2, 0.1)];
        pose.elbow.r = [-0.3, -1, -0.3];
        pose.grip.r = 0.6;
        pose.handRoll.r = 0.4 * beat(t, 1, 0.5);
        pose.wrist.l = [3, 21.5, 62];
        pose.elbow.l = [-0.6, 1, 0.1];
        pose.grip.l = 0.7;
        holdLeft(pose, held);
        pose.pelvis = [0, 0.5 * beat(t, 1), 61 + 0.6 * (0.5 + 0.5 * beat(t, 2, 0.25))];
        pose.pitch = 0.12 + 0.02 * beat(t, 1, 0.2);
        pose.headPitch = -0.1;
        pose.headYaw = 0.06 * beat(t, 1, 0.5);
        pose.mouth = 0.1;
        pose.blink = Math.abs(t - 0.8) < 0.06 ? 1 : 0;
        return { pose, extras: { sway: 0.12 * beat(t, 1, 0.3) } };
      },
    },
    ...(look.dances
      ? {
          dance: {
            frames: 8,
            fps: 9,
            loop: true,
            at: (t: number): { pose: ReturnType<typeof restPose>; extras: Extras } => {
              const pose = restPose();
              pose.wrist.r = [8, -38 - 4 * beat(t, 1, 0.5), 96 + 6 * beat(t, 2)];
              pose.wrist.l = [8, 38 + 4 * beat(t, 1), 96 - 6 * beat(t, 2)];
              pose.elbow.r = [-0.3, -1, -0.3];
              pose.elbow.l = [-0.3, 1, -0.3];
              pose.grip.r = 0.2;
              pose.grip.l = 0.2;
              pose.pelvis = [3 * beat(t, 1), 0, 61 + 3 * Math.abs(beat(t, 2))];
              pose.roll = 0.12 * beat(t, 1);
              pose.headRoll = 0.14 * beat(t, 1, 0.25);
              pose.mouth = 0.8;
              pose.brow = 0.6;
              pose.blink = Math.abs(t - 0.75) < 0.06 ? 1 : 0;
              return { pose, extras: { sway: 0.5 * beat(t, 1, 0.25) } };
            },
          },
        }
      : {}),
    wave: {
      frames: 8,
      fps: 9,
      loop: true,
      at: (t, facing) => {
        const pose = restPose();
        const across = facing === 'south' || facing === 'north';
        pose.wrist.r = [
          9 + (across ? 0 : 9 * beat(t, 1)),
          -28 + (across ? 9 * beat(t, 1) : 0),
          126 + 1.6 * Math.abs(beat(t, 2)),
        ];
        pose.elbow.r = [-0.3, -1, -0.3];
        pose.grip.r = 0;
        pose.handRoll.r = 0.5 * beat(t, 1, 0.25);
        pose.wrist.l = [3, 21.5, 62];
        pose.elbow.l = [-0.6, 1, 0.1];
        pose.grip.l = 0.7;
        holdLeft(pose, held);
        pose.pelvis = [0, 0.7 * beat(t, 1), 61 + 0.9 * (0.5 + 0.5 * beat(t, 2, 0.25))];
        pose.roll = 0.03 * beat(t, 1, 0.25);
        pose.headRoll = 0.11;
        pose.headYaw = 0.1 * beat(t, 1, 0.2);
        pose.mouth = 0.9;
        pose.brow = 0.7;
        pose.blink = Math.abs(t - 0.7) < 0.06 ? 1 : 0;
        return { pose, extras: { sway: 0.2 * beat(t, 1, 0.25) } };
      },
    },
  };
}

const STRIDE = strideOf(WALK.S, UNIT);
