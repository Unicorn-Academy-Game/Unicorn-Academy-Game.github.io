import {
  EAST,
  NORTH,
  NORTHEAST,
  NORTHWEST,
  SOUTH,
  SOUTHEAST,
  SOUTHWEST,
  type UnicornFacing,
  WEST,
} from '../../../src/shared/compass';
import { clamp, lerp } from '../../../src/shared/math';
import {
  type Bone,
  ellipsoid,
  ellipsoidAt,
  frameRing,
  type LoftPoint,
  loft,
  type Mesh,
  newMesh,
  type RibbonPoint,
  ribbon,
  type Xf,
} from '../core/mesh';
import { mulberry32 } from '../core/rng';
import {
  add,
  applyM,
  cross,
  deg,
  IDENTITY,
  len,
  lerp3,
  type M3,
  mul,
  mulM,
  norm,
  rotX,
  rotY,
  rotZ,
  splineAt,
  sub,
  transposeM,
  twoBoneIk,
  type V3,
} from '../core/vec';
import type { Kit } from './kit';
import { PART } from './parts';
import { FOOT_REST, HOOF, LEGS, type LegId, NECK_REST_DEG, type Pose, SKELETON } from './pose';
import { xfAbout, xfMul } from './skeleton';
import type { Build } from './spec';

/**
 * How far each diagonal view is turned from the side view beside it, toward the front or the back.
 * An even eighth of a turn keeps the eight named views evenly spaced: turned further, a diagonal
 * reads as the front or the back view it is next to.
 */
export const DIAGONAL_LEAN = Math.PI / 4;

/**
 * The eight named views exactly as they were first drawn, so that adding facings between them
 * leaves every one of them as it was.
 */
const NAMED_YAW: Readonly<Record<number, number>> = {
  [EAST]: 0,
  [NORTH]: Math.PI / 2,
  [WEST]: Math.PI,
  [SOUTH]: -Math.PI / 2,
  [NORTHEAST]: DIAGONAL_LEAN,
  [NORTHWEST]: Math.PI - DIAGONAL_LEAN,
  [SOUTHWEST]: -(Math.PI - DIAGONAL_LEAN),
  [SOUTHEAST]: -DIAGONAL_LEAN,
};

/**
 * One step of the ring of 32 facings, in radians. It is written out here and not read from the
 * compass, because it decides what every frame looks like and so belongs to the art version, which
 * hashes this file and does not hash the compass. A test holds the two together.
 */
const RING_STEP = (2 * Math.PI) / 32;

/**
 * How far the model is turned about the vertical axis to be drawn facing `f`. The map's facings run
 * clockwise as seen from above and the model's yaw runs the other way, so a facing is its own angle
 * turned back. Every step of the ring is the same 11.25 degrees, which is what makes a unicorn
 * turning through them look like one body turning.
 */
export const facingYaw = (f: UnicornFacing): number =>
  NAMED_YAW[f] ?? (f <= 16 ? -f * RING_STEP : (32 - f) * RING_STEP);

export interface FacePoint {
  pos: V3;
  normal: V3;
}

export interface FaceFeatures {
  /** Left (+y) then right (-y). */
  eyes: [FacePoint, FacePoint];
  nostrils: [FacePoint, FacePoint];
  mouthTip: FacePoint;
  mouthCorners: [FacePoint, FacePoint];
}

export interface Anchors {
  horn: V3;
  muzzle: V3;
  back: V3;
}

export interface UnicornModel {
  meshes: Mesh[];
  anchors: Anchors;
  face: FaceFeatures;
}

export interface Rig {
  root: Bone;
  neck: [Bone, Bone, Bone];
  head: Bone;
  jaw: Bone;
  earL: Bone;
  earR: Bone;
  hs: number;
}

const xf = (o: V3, r: M3 = IDENTITY): Xf => ({ o, r });
type Space = 'rest' | 'posed';
const pt = (b: Bone, local: V3, space: Space): V3 => add(applyM(b[space].r, local), b[space].o);
const dirOf = (b: Bone, local: V3, space: Space): V3 => applyM(b[space].r, local);

export function makeRig(build: Build, pose: Pose): Rig {
  const pivot = SKELETON.pivot;
  const R = mulM(rotZ(pose.yaw), mulM(rotY(pose.pitch), rotX(pose.roll)));
  const root: Bone = { rest: xf([0, 0, 0]), posed: xfAbout(pivot, R, pose.offset) };
  const nk = build.neck;
  const hs = build.head;
  const yawShare = [0.4, 0.3, 0.2] as const;
  const link = (parent: Bone, o: V3, restDeg: number, extra: number, yaw: number, roll = 0): Bone => ({
    rest: xfMul(parent.rest, xf(o, rotY(deg(restDeg)))),
    posed: xfMul(parent.posed, xf(o, mulM(rotZ(yaw), mulM(rotY(deg(restDeg) + extra), rotX(roll))))),
  });
  const [l0, l1, l2] = SKELETON.neckLen;
  const n0 = link(root, SKELETON.neckBase, NECK_REST_DEG.n0, pose.neck[0], pose.neckYaw * yawShare[0]);
  const n1 = link(n0, [l0 * nk, 0, 0], NECK_REST_DEG.n1, pose.neck[1], pose.neckYaw * yawShare[1]);
  const n2 = link(n1, [l1 * nk, 0, 0], NECK_REST_DEG.n2, pose.neck[2], pose.neckYaw * yawShare[2]);
  const head = link(n2, [l2 * nk, 0, 0], NECK_REST_DEG.head, pose.head, pose.headYaw, pose.headRoll);
  const jaw: Bone = {
    rest: xfMul(head.rest, xf([3 * hs, 0, -7 * hs])),
    posed: xfMul(head.posed, xf([3 * hs, 0, -7 * hs], rotY(pose.jaw * 0.42))),
  };
  const earOut = deg(12);
  const earTilt = deg(34);
  const earL: Bone = {
    rest: xfMul(head.rest, xf([-2 * hs, 4.8 * hs, 7.0 * hs], mulM(rotX(-earOut), rotY(-earTilt)))),
    posed: xfMul(
      head.posed,
      xf([-2 * hs, 4.8 * hs, 7.0 * hs], mulM(rotX(-(earOut + pose.earSplay)), rotY(-earTilt - pose.earL))),
    ),
  };
  const earR: Bone = {
    rest: xfMul(head.rest, xf([-2 * hs, -4.8 * hs, 7.0 * hs], mulM(rotX(earOut), rotY(-earTilt)))),
    posed: xfMul(
      head.posed,
      xf([-2 * hs, -4.8 * hs, 7.0 * hs], mulM(rotX(earOut + pose.earSplay), rotY(-earTilt - pose.earR))),
    ),
  };
  return { root, neck: [n0, n1, n2], head, jaw, earL, earR, hs };
}

/**
 * Head profile in head-local space, unscaled: x along the face line from the poll, then top z,
 * bottom z and half width. UPPER is the skull and upper jaw geometry. OUTER is the union with the
 * lower jaw, used for the halter and anchors.
 */
const HEAD_UPPER: readonly (readonly [number, number, number, number])[] = [
  [-7, 4.6, -4.8, 4.5],
  [-2, 7.2, -9.0, 6.4],
  [4, 8.3, -11.5, 7.4],
  [10, 7.8, -9.6, 6.8],
  [15, 6.2, -5.0, 5.4],
  [20, 5.1, -3.8, 4.6],
  [25, 4.6, -3.2, 4.0],
  [29.5, 4.2, -3.0, 3.9],
  [33.5, 3.2, -2.2, 3.0],
];
const HEAD_OUTER: readonly (readonly [number, number, number, number])[] = [
  [-7, 4.6, -4.8, 4.5],
  [-2, 7.2, -9.0, 6.4],
  [4, 8.3, -11.5, 7.4],
  [10, 7.8, -10.0, 6.8],
  [15, 6.2, -8.2, 5.4],
  [20, 5.1, -6.6, 4.6],
  [25, 4.6, -5.2, 4.0],
  [29.5, 4.2, -4.2, 3.9],
  [33.5, 3.2, -2.8, 3.0],
];

/**
 * Muzzle tip in world space for a rig, used by anchors and by pose solvers that reach for the
 * ground.
 */
export function muzzleAnchor(rig: Rig): V3 {
  return pt(rig.head, [31 * rig.hs, 0, -1.2 * rig.hs], 'posed');
}

/**
 * Hip to fetlock distance as a fraction of the leg's reach, per leg. Above 1 the foot target cannot
 * be met.
 */
export function legStretch(rig: Rig, pose: Pose): Record<LegId, number> {
  const out = {} as Record<LegId, number>;
  for (const id of LEGS) {
    const hind = id[0] === 'h';
    const [l1, l2] = hind ? SKELETON.legLen.hind : SKELETON.legLen.fore;
    const lg = pose.legs[id];
    const fetlock = add(lg.foot, applyM(rotY(lg.hoofPitch), HOOF.fetlock));
    const hip = pt(rig.root, SKELETON.hip[id], 'posed');
    out[id] = len(sub(fetlock, hip)) / (l1 + l2);
  }
  return out;
}

interface Section {
  zc: number;
  rv: number;
  rh: number;
}
function headSection(x: number): Section {
  const t = HEAD_OUTER;
  const cx = clamp(x, t[0]![0], t[t.length - 1]![0]);
  let i = 0;
  while (i < t.length - 2 && cx > t[i + 1]![0]) i++;
  const a = t[i]!,
    b = t[i + 1]!;
  const f = (cx - a[0]) / (b[0] - a[0]);
  const top = lerp(a[1], b[1], f),
    bot = lerp(a[2], b[2], f),
    rh = lerp(a[3], b[3], f);
  return { zc: (top + bot) / 2, rv: (top - bot) / 2, rh };
}

/**
 * Point on the head surface, pushed outward by `off`, in head-local coordinates. theta runs from
 * the top, toward `side`.
 */
function headSurface(x: number, theta: number, side: number, off: number): { p: V3; n: V3 } {
  const s = headSection(x);
  const st = Math.sin(theta),
    ct = Math.cos(theta);
  return {
    p: [x, side * (s.rh + off) * st, s.zc + (s.rv + off) * ct],
    n: norm([0, (side * st) / (s.rh + off), ct / (s.rv + off)]),
  };
}

interface NeckRing {
  c: V3;
  n: V3;
  tan: V3;
  rv: number;
  rh: number;
}

function ringAt(ctl: readonly LoftPoint[], t: number, space: Space, up: V3): NeckRing {
  const pts = ctl.map((p) => p[space]);
  const rad = ctl.map((p) => [p.rv, p.rh, 0] as V3);
  const tc = clamp(t, 0, 1);
  const e = 0.015;
  const tan = norm(sub(splineAt(pts, clamp(tc + e, 0, 1)), splineAt(pts, clamp(tc - e, 0, 1))));
  const c = splineAt(pts, tc);
  const r = splineAt(rad, tc);
  return { c, n: frameRing(c, tan, up).n, tan, rv: r[0], rh: r[1] };
}

/**
 * Integrates a curve in the x/z plane from `root`, turning according to `angleAt(s)` (radians,
 * counterclockwise from +x).
 */
function curve2D(root: V3, steps: number, length: number, angleAt: (s: number) => number): V3[] {
  const out: V3[] = [root];
  let x = root[0],
    z = root[2];
  const ds = length / (steps - 1);
  for (let i = 1; i < steps; i++) {
    const a = angleAt((i - 0.5) / (steps - 1));
    x += Math.cos(a) * ds;
    z += Math.sin(a) * ds;
    out.push([x, root[1], z]);
  }
  return out;
}

/** Half-width profile of a lock: full near the root, a gentle belly, a pointed tip. */
const lockWidth = (s: number, half: number): number =>
  Math.max(0.2, half * (0.78 + 0.22 * Math.sin(Math.PI * Math.min(1, s * 1.25))) * (1 - 0.95 * s ** 2.4));

function legChain(hip: V3, foot: V3, pitch: number, hind: boolean): V3[] {
  const [l1, l2] = hind ? SKELETON.legLen.hind : SKELETON.legLen.fore;
  const R = rotY(pitch);
  const fetlock = add(foot, applyM(R, HOOF.fetlock));
  const ik = twoBoneIk(hip, fetlock, l1, l2, hind ? [-1, 0, 0] : [1, 0, 0]);
  const knee = ik.mid;
  return [
    hip,
    lerp3(hip, knee, 0.55),
    knee,
    lerp3(knee, ik.end, 0.5),
    ik.end,
    add(foot, applyM(R, HOOF.pastern)),
    add(foot, applyM(R, HOOF.coronet)),
    add(foot, applyM(R, HOOF.base)),
  ];
}

const FORE_R: readonly (readonly [number, number])[] = [
  [6.8, 5.9],
  [5.4, 4.9],
  [4.6, 4.4],
  [3.5, 3.5],
  [3.9, 3.7],
  [3.1, 3.1],
  [3.9, 3.7],
  [4.7, 4.3],
];
const HIND_R: readonly (readonly [number, number])[] = [
  [8.4, 7.0],
  [6.4, 5.4],
  [4.9, 4.4],
  [3.5, 3.4],
  [3.9, 3.7],
  [3.1, 3.1],
  [3.9, 3.7],
  [4.7, 4.3],
];

interface Ctx {
  kit: Kit;
  pose: Pose;
  rig: Rig;
  meshes: Mesh[];
  upWorld: V3;
  upBody: V3;
  lp: (b: Bone, local: V3, rv: number, rh: number, upPosed?: V3) => LoftPoint;
}

function buildBody(c: Ctx): void {
  const { kit, rig, pose } = c;
  const root = rig.root;
  const body = newMesh(kit.mat.coat, PART.body);
  const bk = kit.spec.build.bulk;
  const br = 1 + 0.032 * pose.chest;
  loft(
    body,
    [
      c.lp(root, [-36, 0, 62], 8, 7.5 * bk),
      c.lp(root, [-29, 0, 59], 15.5, 11.5 * bk),
      c.lp(root, [-17, 0, 56], 18 * br, 12.8 * bk * br),
      c.lp(root, [-3, 0, 54.5], 18 * br, 12.6 * bk * br),
      c.lp(root, [12, 0, 54.5], 18.6 * br, 12.8 * bk * br),
      c.lp(root, [24, 0, 55.5], 19 * br, 12.4 * bk),
      c.lp(root, [29, 0, 54], 16, 11 * bk),
      c.lp(root, [33, 0, 52], 10.5, 8.2 * bk),
    ],
    { n: 26, segs: 20, upRest: c.upWorld, upPosed: c.upBody, capStart: true, capEnd: true },
  );
  for (const side of [1, -1]) {
    ellipsoid(body, root, [-23, side * 9.2 * bk, 54], [12.5, 7.2, 15], undefined, { rings: 12, segs: 16 });
    ellipsoid(body, root, [21, side * 9.4 * bk, 50], [8.5, 5.6, 13], rotY(deg(-8)), { rings: 12, segs: 16 });
  }
  c.meshes.push(body);
}

function buildLegs(c: Ctx): void {
  const { kit, rig, pose } = c;
  for (const id of LEGS) {
    const hind = id[0] === 'h';
    const partId = id === 'fl' ? PART.foreL : id === 'fr' ? PART.foreR : id === 'hl' ? PART.hindL : PART.hindR;
    const hipLocal = SKELETON.hip[id];
    const rest = legChain(hipLocal, FOOT_REST[id], 0, hind);
    const lg = pose.legs[id];
    const posed = legChain(pt(rig.root, hipLocal, 'posed'), lg.foot, lg.hoofPitch, hind);
    const radii = hind ? HIND_R : FORE_R;
    const pts = (from: number, to: number): LoftPoint[] => {
      const out: LoftPoint[] = [];
      for (let i = from; i <= to; i++)
        out.push({ rest: rest[i]!, posed: posed[i]!, rv: radii[i]![0], rh: radii[i]![1] });
      return out;
    };
    const leg = newMesh(kit.mat.coat, partId);
    loft(leg, pts(0, 6), { n: 20, segs: 14, upRest: [1, 0, 0], upPosed: [1, 0, 0], capStart: true });
    c.meshes.push(leg);
    const hoof = newMesh(kit.mat.hoof, partId);
    loft(hoof, pts(6, 7), { n: 4, segs: 14, upRest: [1, 0, 0], upPosed: [1, 0, 0] });
    c.meshes.push(hoof);
  }
}

function buildHair(c: Ctx, neckCtl: readonly LoftPoint[]): void {
  const { kit, pose, rig } = c;
  const spec = kit.spec;
  const head = rig.head,
    root = rig.root;
  const hs = rig.hs;
  const hairColors = kit.mat.hair.length;
  const lockMat = (i: number): number => kit.mat.hair[((i % hairColors) + hairColors) % hairColors]!;
  const rng = mulberry32(0x5eed + spec.id.length * 977);
  const mane = spec.mane;
  const wind = clamp(pose.wind, 0, 1);
  const sway = pose.hairSway;
  const ph = pose.hairPhase;

  const flowers = mane.flowers;
  const petals = flowers ? newMesh(kit.mat.flat[flowers.petal]!, PART.accent, { noLines: true }) : null;
  const hearts = flowers ? newMesh(kit.mat.flat[flowers.heart]!, PART.accent, { noLines: true }) : null;
  const flowerStride = flowers ? Math.max(1, Math.round((2 * mane.locks) / flowers.count)) : 0;

  for (const side of [-1, 1]) {
    for (const layer of [0, 1]) {
      const count = layer === 0 ? mane.locks : Math.max(3, Math.round(mane.locks * 0.75));
      for (let i = 0; i < count; i++) {
        const f = count === 1 ? 0.5 : i / (count - 1);
        const t0 = (layer === 0 ? 0.98 : 0.94) - f * (layer === 0 ? 0.8 : 0.66);
        const length = lerp(mane.length[0], mane.length[1], rng()) * (layer === 0 ? 1.2 : 0.82);
        const width = lerp(mane.width[0], mane.width[1], rng()) * (layer === 0 ? 1 : 0.85);
        const ring = ringAt(neckCtl, t0, 'posed', c.upBody);
        const left = norm(cross(ring.n, ring.tan));
        const rootPos = add(add(ring.c, mul(ring.n, ring.rv * 0.94)), mul(left, side * ring.rh * 0.5));
        const neckAngle = Math.atan2(ring.tan[2], ring.tan[0]);
        const aUp = neckAngle + Math.PI / 2 + 0.35;
        const aFlow = lerp(deg(262), deg(188), wind * mane.flow) + 0.14 * (rng() - 0.5);
        const waveAmp = 0.3 + 0.18 * rng();
        const phase = ph - 0.07 * i + (side > 0 ? 0.31 : 0) + layer * 0.17;
        const path = curve2D(
          rootPos,
          12,
          length,
          (s) =>
            aFlow +
            (aUp - aFlow) * Math.exp(-s * 6.5) +
            sway * waveAmp * Math.sin(2 * Math.PI * (1.2 * s - phase)) * Math.min(1, s * 2),
        );
        const pts: RibbonPoint[] = [];
        const facings: V3[] = [];
        path.forEach((p, k) => {
          const s = k / (path.length - 1);
          // Hug the neck near the root, then drape outside the shoulder.
          const lateral =
            side *
            (ring.rh * (0.5 + 0.62 * Math.min(1, s * 2.2)) + 2 * s + Math.max(0, 80 - p[2]) * 0.07 * s + layer * 1.8);
          pts.push({
            p: [p[0], rootPos[1] + lateral, p[2]],
            w: lockWidth(s, width / 2),
            t: Math.max(0.5, width * 0.14),
          });
          facings.push(norm([0, side, 0.25]));
        });
        const colorIdx = Math.round((1 - f) * (hairColors - 1.6));
        const mesh = newMesh(lockMat(colorIdx), PART.maneBase + (side > 0 ? 30 : 0) + layer * 12 + i, {
          twoSided: true,
        });
        ribbon(mesh, pts, facings, 6);
        c.meshes.push(mesh);
        if (petals && hearts && layer === 0 && i % flowerStride === 0) {
          // A daisy tucked against the lock, facing out from the neck.
          const at = pts[3 + (i % 3)]!;
          const center: V3 = [at.p[0], at.p[1] + side * ((at.t ?? 0.6) + 0.9), at.p[2]];
          ellipsoidAt(petals, center, [2.6, 0.7, 2.6], undefined, { rings: 6, segs: 10 });
          ellipsoidAt(hearts, [center[0], center[1] + side * 0.55, center[2]], [1.1, 0.7, 1.1], undefined, {
            rings: 5,
            segs: 8,
          });
        }
      }
    }
  }
  if (petals && hearts) c.meshes.push(petals, hearts);

  // Forelock: side-swept locks that part around the horn and drape over the face contour, ending
  // behind the eye.
  const perSide = Math.ceil(mane.forelock / 2);
  for (let k = 0; k < mane.forelock; k++) {
    const side = k % 2 === 0 ? 1 : -1;
    const rank = Math.floor(k / 2);
    const f = perSide === 1 ? 0.5 : rank / (perSide - 1);
    const y0 = lerp(2.0, 4.4, f);
    const length = lerp(8.5, 12, rng()) * (1 - 0.15 * f);
    const start: V3 = [lerp(3.5, -1.5, f), y0, 8.6];
    const flick = 0.06 * sway;
    const local = curve2D(
      start,
      9,
      length,
      (s) => deg(25) + (deg(-135) - deg(25)) * s ** 0.8 + flick * Math.sin(2 * Math.PI * (s - ph) + k),
    );
    const pts: RibbonPoint[] = [];
    const facings: V3[] = [];
    local.forEach((p, q) => {
      const s = q / (local.length - 1);
      const sec = headSection(p[0]);
      const u = clamp((p[2] - sec.zc) / sec.rv, -1, 1);
      const surfaceY = sec.rh * Math.sqrt(1 - u * u);
      const y = Math.max(y0, surfaceY + 0.9 + 0.8 * s);
      pts.push({ p: pt(head, [p[0] * hs, side * y * hs, p[2] * hs], 'posed'), w: lockWidth(s, 2.9 * hs), t: 0.6 });
      facings.push(dirOf(head, [0, side, 0.35], 'posed'));
    });
    const mesh = newMesh(
      lockMat(Math.round(clamp(0.1 + f * 0.3, 0, 1) * (hairColors - 1)) + k),
      PART.forelockBase + k,
      { twoSided: true },
    );
    ribbon(mesh, pts, facings, 6);
    c.meshes.push(mesh);
  }

  // Tail.
  const tail = spec.tail;
  for (let j = 0; j < tail.locks; j++) {
    const f = tail.locks === 1 ? 0.5 : j / (tail.locks - 1);
    const length = lerp(tail.length[0], tail.length[1], rng());
    const width = lerp(tail.width[0], tail.width[1], rng());
    const yj = (f - 0.5) * 8;
    const dock: V3 = [SKELETON.tailDock[0], yj, SKELETON.tailDock[2]];
    const lift = pose.tailLift;
    const a0 = deg(178) - lift * deg(45) + 0.18 * (f - 0.5);
    const a1 = lerp(deg(266), deg(228), wind) - lift * deg(30);
    const phase = ph - 0.06 * j;
    const path = curve2D(
      dock,
      12,
      length,
      (s) =>
        a0 +
        (a1 - a0) * s ** 0.7 +
        sway * (0.12 + 0.1 * Math.sin(j * 2.1)) * Math.sin(2 * Math.PI * (1.1 * s - phase)) * Math.min(1, s * 1.4),
    );
    const pts: RibbonPoint[] = [];
    const facings: V3[] = [];
    path.forEach((p, k) => {
      const s = k / (path.length - 1);
      const swayY = sway * Math.sin(2 * Math.PI * (ph - 0.5 * s) + j * 0.5) * 3.2 * s ** 1.1;
      pts.push({
        p: pt(root, [p[0], yj * (1 + 1.4 * s) + swayY, p[2]], 'posed'),
        w: lockWidth(s, width / 2),
        t: Math.max(0.5, width * 0.14),
      });
      facings.push(norm(applyM(root.posed.r, [0, 1, 0.1])));
    });
    const mesh = newMesh(lockMat(Math.round(f * (hairColors - 1))), PART.tailBase + j, { twoSided: true });
    ribbon(mesh, pts, facings, 6);
    c.meshes.push(mesh);
  }
}

function buildHead(c: Ctx): { hornTip: V3 } {
  const { kit, rig } = c;
  const { head, jaw } = rig;
  const hs = rig.hs;
  const spec = kit.spec;
  const upHead = applyM(head.posed.r, [0, 0, 1]);

  const headMesh = newMesh(kit.mat.coat, PART.head);
  const upper = HEAD_UPPER.map((row) =>
    c.lp(head, [row[0] * hs, 0, ((row[1] + row[2]) / 2) * hs], ((row[1] - row[2]) / 2) * hs, row[3] * hs),
  );
  loft(headMesh, upper, {
    n: 22,
    segs: 20,
    upRest: c.upWorld,
    upPosed: upHead,
    capStart: true,
    capEnd: true,
    capRings: 4,
  });
  // A soft brow ridge and cheek give the eye a socket to sit in.
  for (const side of [1, -1]) {
    ellipsoid(headMesh, head, [8 * hs, side * 5.6 * hs, 3.4 * hs], [4.8 * hs, 2.2 * hs, 3.2 * hs], undefined, {
      rings: 8,
      segs: 12,
    });
    ellipsoid(headMesh, head, [4 * hs, side * 4.8 * hs, -6 * hs], [6.5 * hs, 3.0 * hs, 4.6 * hs], undefined, {
      rings: 10,
      segs: 14,
    });
  }
  c.meshes.push(headMesh);

  const jawMesh = newMesh(kit.mat.coat, PART.jaw);
  // The jaw hinges at head-local (3, 0, -7); control points are authored in head-local terms and
  // re-based here.
  const jl = (x: number, z: number): V3 => [(x - 3) * hs, 0, (z + 7) * hs];
  loft(
    jawMesh,
    [
      c.lp(jaw, jl(8, -7), 3.0 * hs, 4.8 * hs),
      c.lp(jaw, jl(13, -6), 2.6 * hs, 4.0 * hs),
      c.lp(jaw, jl(18, -5), 2.2 * hs, 3.6 * hs),
      c.lp(jaw, jl(24, -4.4), 1.9 * hs, 3.3 * hs),
      c.lp(jaw, jl(29.5, -3.9), 1.6 * hs, 3.0 * hs),
    ],
    { n: 12, segs: 14, upRest: c.upWorld, upPosed: upHead, capEnd: true, capRings: 3 },
  );
  c.meshes.push(jawMesh);

  for (const [bone, part, innerPart] of [
    [rig.earL, PART.earL, PART.earInnerL],
    [rig.earR, PART.earR, PART.earInnerR],
  ] as const) {
    const ear = newMesh(kit.mat.coat, part);
    const fwd = applyM(bone.posed.r, [1, 0, 0]);
    loft(
      ear,
      [
        c.lp(bone, [0, 0, -1.5], 3.1 * hs, 2.6 * hs),
        c.lp(bone, [0, 0, 2.5 * hs], 3.1 * hs, 2.7 * hs),
        c.lp(bone, [0.1 * hs, 0, 5.5 * hs], 2.5 * hs, 2.3 * hs),
        c.lp(bone, [0.4 * hs, 0, 8 * hs], 1.6 * hs, 1.5 * hs),
        c.lp(bone, [0.7 * hs, 0, 10.2 * hs], 0.5 * hs, 0.5 * hs),
      ],
      { n: 12, segs: 12, upRest: [1, 0, 0], upPosed: fwd, capEnd: true, capRings: 2 },
    );
    c.meshes.push(ear);
    const inner = newMesh(kit.mat.earInner, innerPart, { noLines: true });
    loft(
      inner,
      [
        c.lp(bone, [1.4 * hs, 0, 0.3 * hs], 1.4 * hs, 1.8 * hs),
        c.lp(bone, [1.8 * hs, 0, 3.5 * hs], 1.4 * hs, 1.8 * hs),
        c.lp(bone, [1.8 * hs, 0, 6.2 * hs], 1.1 * hs, 1.3 * hs),
        c.lp(bone, [1.5 * hs, 0, 8.6 * hs], 0.5 * hs, 0.6 * hs),
      ],
      { n: 10, segs: 10, upRest: [1, 0, 0], upPosed: fwd, capEnd: true, capRings: 2 },
    );
    c.meshes.push(inner);
  }

  // The horn keeps a fixed world direction at rest, so it keeps its angle to the skull.
  const hornDirLocal = applyM(transposeM(head.rest.r), norm([0.42, 0, 0.91] as V3));
  const hornBase: V3 = [10 * hs, 0, 4.6 * hs];
  const hornPt = (t: number): V3 => add(hornBase, mul(hornDirLocal, spec.horn.length * t));
  const hr = spec.horn.baseRadius;
  const hornUp = applyM(head.posed.r, [0, 1, 0]);
  const glowLevel = c.pose.hornGlow < 0.15 ? 0 : c.pose.hornGlow < 0.6 ? 1 : 2;
  const horn = newMesh(glowLevel === 0 ? kit.mat.horn : kit.mat.hornGlow[glowLevel - 1]!, PART.horn);
  loft(
    horn,
    [
      c.lp(head, hornPt(-0.05), hr * 1.02, hr * 1.02, hornUp),
      c.lp(head, hornPt(0.25), hr * 0.82, hr * 0.82, hornUp),
      c.lp(head, hornPt(0.55), hr * 0.55, hr * 0.55, hornUp),
      c.lp(head, hornPt(0.82), hr * 0.3, hr * 0.3, hornUp),
      c.lp(head, hornPt(1), 0.25, 0.25, hornUp),
    ],
    { n: 16, segs: 14, upRest: [0, 1, 0], upPosed: hornUp, capEnd: true, capRings: 2 },
  );
  c.meshes.push(horn);
  return { hornTip: pt(head, hornPt(1), 'posed') };
}

export function buildUnicorn(kit: Kit, pose: Pose, yaw: number): UnicornModel {
  const spec = kit.spec;
  const rig = makeRig(spec.build, pose);
  const { root, head, jaw } = rig;
  const hs = rig.hs;
  const upWorld: V3 = [0, 0, 1];
  const c: Ctx = {
    kit,
    pose,
    rig,
    meshes: [],
    upWorld,
    upBody: applyM(root.posed.r, upWorld),
    lp: (b, local, rv, rh, upPosed) => {
      const p: LoftPoint = { rest: pt(b, local, 'rest'), posed: pt(b, local, 'posed'), rv, rh };
      if (upPosed) p.upPosed = upPosed;
      return p;
    },
  };
  const bk = spec.build.bulk;

  buildBody(c);
  buildLegs(c);

  const [n0, n1, n2] = rig.neck;
  const neckCtl: LoftPoint[] = [
    c.lp(n0, [-8, 0, 0], 15, 11.2 * bk),
    c.lp(n0, [0, 0, 0], 13.4, 10.2 * bk),
    c.lp(n1, [0, 0, 0], 12, 8.8 * bk),
    c.lp(n2, [0, 0, 0], 10.4, 7.8 * bk),
    c.lp(head, [-1, 0, 0], 9.6, 7.6),
  ];
  const neck = newMesh(kit.mat.coat, PART.neck);
  loft(neck, neckCtl, { n: 18, segs: 18, upRest: upWorld, upPosed: c.upBody });
  c.meshes.push(neck);

  const { hornTip } = buildHead(c);
  buildHair(c, neckCtl);
  c.meshes.push(...buildHalter(kit, rig));

  const nHead = (v: V3): V3 => norm(dirOf(head, v, 'posed'));
  const face: FaceFeatures = {
    eyes: [
      { pos: pt(head, [10.5 * hs, 6.5 * hs, 2.0 * hs], 'posed'), normal: nHead([0.3, 1, 0.2]) },
      { pos: pt(head, [10.5 * hs, -6.5 * hs, 2.0 * hs], 'posed'), normal: nHead([0.3, -1, 0.2]) },
    ],
    nostrils: [
      { pos: pt(head, [28.5 * hs, 3.0 * hs, -0.7 * hs], 'posed'), normal: nHead([0.55, 1, 0.1]) },
      { pos: pt(head, [28.5 * hs, -3.0 * hs, -0.7 * hs], 'posed'), normal: nHead([0.55, -1, 0.1]) },
    ],
    mouthTip: { pos: pt(jaw, [27 * hs, 0, 3.6 * hs], 'posed'), normal: nHead([1, 0, 0]) },
    mouthCorners: [
      { pos: pt(head, [17 * hs, 4.7 * hs, -3.8 * hs], 'posed'), normal: nHead([0, 1, 0]) },
      { pos: pt(head, [17 * hs, -4.7 * hs, -3.8 * hs], 'posed'), normal: nHead([0, -1, 0]) },
    ],
  };
  const anchors: Anchors = {
    horn: hornTip,
    muzzle: muzzleAnchor(rig),
    back: pt(root, [0, 0, 80], 'posed'),
  };

  // Face the requested world direction.
  const R = rotZ(yaw);
  for (const m of c.meshes) {
    for (let i = 0; i < m.pos.length; i += 3) {
      const p = applyM(R, [m.pos[i]!, m.pos[i + 1]!, m.pos[i + 2]!]);
      m.pos[i] = p[0];
      m.pos[i + 1] = p[1];
      m.pos[i + 2] = p[2];
      const n = applyM(R, [m.nor[i]!, m.nor[i + 1]!, m.nor[i + 2]!]);
      m.nor[i] = n[0];
      m.nor[i + 1] = n[1];
      m.nor[i + 2] = n[2];
    }
  }
  const turn = (p: V3): V3 => applyM(R, p);
  const turnFp = (f: FacePoint): FacePoint => ({ pos: turn(f.pos), normal: turn(f.normal) });
  return {
    meshes: c.meshes,
    anchors: { horn: turn(anchors.horn), muzzle: turn(anchors.muzzle), back: turn(anchors.back) },
    face: {
      eyes: [turnFp(face.eyes[0]), turnFp(face.eyes[1])],
      nostrils: [turnFp(face.nostrils[0]), turnFp(face.nostrils[1])],
      mouthTip: turnFp(face.mouthTip),
      mouthCorners: [turnFp(face.mouthCorners[0]), turnFp(face.mouthCorners[1])],
    },
  };
}

function buildHalter(kit: Kit, rig: Rig): Mesh[] {
  const { head } = rig;
  const hs = rig.hs;
  const hal = kit.spec.halter;
  const meshes: Mesh[] = [];
  const meshFor = (key: string): Mesh => {
    const m = newMesh(kit.mat.flat[key]!, PART.halter, { noLines: true });
    meshes.push(m);
    return m;
  };
  const strapMesh = meshFor(hal.strap);
  const noseMesh = hal.noseband ? meshFor(hal.noseband) : strapMesh;
  const trimMesh = meshFor(hal.trim);
  const gemMesh = meshFor(hal.gem);
  const toLoft = (pts: { p: V3; n: V3 }[], thick: number, width: number): LoftPoint[] =>
    pts.map(({ p, n }) => ({
      rest: pt(head, mul(p, hs), 'rest'),
      posed: pt(head, mul(p, hs), 'posed'),
      rv: thick,
      rh: width,
      upPosed: applyM(head.posed.r, n),
    }));
  const surf = (x: number, thetaDeg: number, side: number, off: number): { p: V3; n: V3 } =>
    headSurface(x, deg(thetaDeg), side, off);
  const strapOpts = { segs: 8, upRest: [0, 0, 1] as V3, upPosed: applyM(head.posed.r, [0, 0, 1]) };
  const bead = (mesh: Mesh, at: V3, r: number): void =>
    ellipsoid(mesh, head, mul(at, hs), [r * hs, r * hs, r * hs], undefined, { rings: 6, segs: 8 });

  // Noseband: a ring around the muzzle.
  const ring: { p: V3; n: V3 }[] = [];
  for (let k = 0; k <= 20; k++) {
    const th = (k / 20) * 360;
    ring.push(surf(20.5, th <= 180 ? th : 360 - th, th <= 180 ? 1 : -1, 0.5));
  }
  loft(noseMesh, toLoft(ring, 0.55 * hs, 1.25 * hs), { ...strapOpts, n: 30 });

  const cheek: readonly (readonly [number, number])[] = [
    [20.5, 92],
    [14, 102],
    [7, 84],
    [1, 56],
    [-2.5, 36],
  ];
  for (const side of [1, -1]) {
    loft(
      strapMesh,
      toLoft(
        cheek.map(([x, th]) => surf(x, th, side, 0.5)),
        0.5 * hs,
        0.8 * hs,
      ),
      { ...strapOpts, n: 14 },
    );
    loft(
      strapMesh,
      toLoft([surf(-2.5, 36, side, 0.5), surf(-4, 90, side, 0.5), surf(-4, 140, side, 0.5)], 0.5 * hs, 0.8 * hs),
      { ...strapOpts, n: 8 },
    );
    for (const [x, th] of [
      [20.5, 92],
      [-2.5, 36],
    ] as const)
      bead(trimMesh, surf(x, th, side, 1.1).p, 1.5);
    ellipsoid(gemMesh, head, mul(surf(13, 102, side, 1.0).p, hs), [1.4 * hs, 1.4 * hs, 1.4 * hs], undefined, {
      rings: 6,
      segs: 8,
    });
  }
  const crown: { p: V3; n: V3 }[] = [];
  for (let k = 0; k <= 8; k++) {
    const th = -52 + (104 * k) / 8;
    crown.push(surf(-6, Math.abs(th), th >= 0 ? 1 : -1, 0.5));
  }
  loft(strapMesh, toLoft(crown, 0.5 * hs, 0.85 * hs), { ...strapOpts, n: 12 });
  bead(trimMesh, surf(20.5, 2, 1, 1.1).p, 1.8);

  if (hal.studs) {
    const studs = meshFor(hal.studs);
    for (let deg0 = 0; deg0 < 360; deg0 += 40)
      bead(studs, surf(20.5, deg0 <= 180 ? deg0 : 360 - deg0, deg0 <= 180 ? 1 : -1, 0.9).p, 0.9);
    for (const side of [1, -1]) for (const [x, th] of cheek.slice(1, 4)) bead(studs, surf(x, th, side, 0.9).p, 0.85);
  }

  if (hal.leaves) {
    const leaves = meshFor(hal.leaves);
    for (const side of [1, -1]) {
      [
        [18, 98],
        [12.5, 102],
        [7, 88],
        [2, 62],
      ].forEach(([x, th], i) => {
        const p = surf(x!, th!, side, 1.3).p;
        const swing = (i % 2 === 0 ? 1 : -1) * side * 0.7;
        ellipsoid(leaves, head, mul(p, hs), [2.8 * hs, 0.55 * hs, 1.3 * hs], rotZ(swing), { rings: 6, segs: 10 });
        ellipsoid(leaves, head, mul(add(p, [1.4, 0, 1.4]), hs), [2.2 * hs, 0.5 * hs, 1.1 * hs], rotZ(-swing * 0.8), {
          rings: 6,
          segs: 10,
        });
      });
    }
  }

  if (hal.plate) {
    const plate = meshFor(hal.plate);
    for (const side of [1, -1]) {
      const c = surf(6.5, 80, side, 0.6).p;
      ellipsoid(plate, head, mul(c, hs), [6.4 * hs, 1.25 * hs, 5.2 * hs], rotY(deg(-6)), { rings: 10, segs: 16 });
      ellipsoid(
        plate,
        head,
        mul(add(c, [-5.6, side * 0.2, -4.2]), hs),
        [4.4 * hs, 0.8 * hs, 1.5 * hs],
        rotY(deg(-32)),
        { rings: 6, segs: 10 },
      );
    }
  }

  if (hal.charm) {
    const charm = meshFor(hal.charm.paint);
    for (const side of [1, -1]) {
      if (hal.charm.kind === 'flame') {
        const c = surf(-1.5, 40, side, 1.5).p;
        ellipsoid(charm, head, mul(c, hs), [1.9 * hs, 1.0 * hs, 1.9 * hs], undefined, { rings: 8, segs: 10 });
        ellipsoid(charm, head, mul(add(c, [-0.6, 0, 1.7]), hs), [1.4 * hs, 0.9 * hs, 2.0 * hs], rotY(deg(-10)), {
          rings: 8,
          segs: 10,
        });
        ellipsoid(charm, head, mul(add(c, [-1.4, 0, 3.6]), hs), [0.8 * hs, 0.7 * hs, 1.6 * hs], rotY(deg(-24)), {
          rings: 6,
          segs: 8,
        });
      } else {
        const spiral: { p: V3; n: V3 }[] = [];
        for (let k = 0; k <= 22; k++) {
          const t = k / 22;
          const a = t * 3.6 * Math.PI;
          const r = 3.6 - 2.8 * t;
          spiral.push(surf(3 + r * Math.cos(a), 96 - (r * Math.sin(a) * 57.3) / 8, side, 1.1));
        }
        loft(charm, toLoft(spiral, 0.5 * hs, 0.5 * hs), { ...strapOpts, n: 26, segs: 6 });
      }
    }
  }
  return meshes;
}
