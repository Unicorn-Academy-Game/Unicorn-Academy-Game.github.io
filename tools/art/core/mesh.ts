import {
  add,
  applyM,
  cross,
  dot,
  IDENTITY,
  len,
  type M3,
  mul,
  mulM,
  norm,
  sampleSpline,
  sub,
  TAU,
  type V3,
} from './vec';

/**
 * A triangle mesh in posed (world) space. `rest` holds the same vertices in the unposed model
 * space. Marking decals read `rest`, so a star on a shoulder stays on the shoulder in every
 * animation frame.
 */
export interface Mesh {
  pos: number[];
  nor: number[];
  rest: number[];
  uv: number[];
  idx: number[];
  /** Material id (index into the scene's material table). */
  mat: number;
  /** Part id, used for inner outlines and per-part debugging. */
  part: number;
  /** Flip normals toward the viewer (flat hair locks, leaves). */
  twoSided: boolean;
  /** Skip the inner-line pass for edges of this mesh (decals riding on a surface, tiny details). */
  noLines: boolean;
  /** Excluded from casting shadows. */
  noShadow: boolean;
}

export function newMesh(
  mat: number,
  part: number,
  opts: Partial<Pick<Mesh, 'twoSided' | 'noLines' | 'noShadow'>> = {},
): Mesh {
  return {
    pos: [],
    nor: [],
    rest: [],
    uv: [],
    idx: [],
    mat,
    part,
    twoSided: opts.twoSided ?? false,
    noLines: opts.noLines ?? false,
    noShadow: opts.noShadow ?? false,
  };
}

export interface Xf {
  readonly o: V3;
  readonly r: M3;
}
export const XF_ID: Xf = { o: [0, 0, 0], r: IDENTITY };
export const xfPoint = (x: Xf, p: V3): V3 => add(applyM(x.r, p), x.o);
export const xfDir = (x: Xf, d: V3): V3 => applyM(x.r, d);

/** A bone carries the same local frame in the rest pose and in the current pose. */
export interface Bone {
  readonly rest: Xf;
  readonly posed: Xf;
}

export function pushVertex(m: Mesh, p: V3, n: V3, rest: V3, u: number, v: number): number {
  const i = m.pos.length / 3;
  m.pos.push(p[0], p[1], p[2]);
  m.nor.push(n[0], n[1], n[2]);
  m.rest.push(rest[0], rest[1], rest[2]);
  m.uv.push(u, v);
  return i;
}

export interface RingFrame {
  /** Ring center. */
  c: V3;
  /** Axis scaled by `rv`. Unit length. */
  n: V3;
  /** Axis scaled by `rh`. Unit length. */
  b: V3;
}

export interface SweepRing {
  rest: RingFrame;
  posed: RingFrame;
  rv: number;
  rh: number;
}

export interface SweepOpts {
  segs?: number;
  capStart?: boolean;
  capEnd?: boolean;
  capRings?: number;
  /** Start angle offset (radians) of the first vertex around each ring. */
  phase?: number;
}

/**
 * Builds a closed tube through ellipse rings. Normals include the taper term so cone-like parts
 * shade correctly.
 */
export function sweep(mesh: Mesh, rings: readonly SweepRing[], opts: SweepOpts = {}): void {
  const segs = opts.segs ?? 14;
  const capRings = opts.capRings ?? 4;
  const all: SweepRing[] = [...rings];
  const first = rings[0]!;
  const last = rings[rings.length - 1]!;

  const tangentAt = (list: readonly SweepRing[], i: number, space: 'rest' | 'posed'): V3 => {
    const a = list[Math.max(0, i - 1)]![space].c;
    const b = list[Math.min(list.length - 1, i + 1)]![space].c;
    return norm(sub(b, a));
  };

  if (opts.capStart) {
    const t = mul(tangentAt(rings, 0, 'posed'), -1);
    const tr = mul(tangentAt(rings, 0, 'rest'), -1);
    const cap: SweepRing[] = [];
    const capLen = Math.min(first.rv, first.rh);
    for (let k = 1; k <= capRings; k++) {
      const a = (k / capRings) * (Math.PI / 2);
      const s = Math.sin(a),
        c = Math.cos(a);
      cap.push({
        rest: { c: add(first.rest.c, mul(tr, capLen * s)), n: first.rest.n, b: first.rest.b },
        posed: { c: add(first.posed.c, mul(t, capLen * s)), n: first.posed.n, b: first.posed.b },
        rv: Math.max(1e-3, first.rv * c),
        rh: Math.max(1e-3, first.rh * c),
      });
    }
    all.unshift(...cap.reverse());
  }
  if (opts.capEnd) {
    const t = tangentAt(rings, rings.length - 1, 'posed');
    const tr = tangentAt(rings, rings.length - 1, 'rest');
    const capLen = Math.min(last.rv, last.rh);
    for (let k = 1; k <= capRings; k++) {
      const a = (k / capRings) * (Math.PI / 2);
      const s = Math.sin(a),
        c = Math.cos(a);
      all.push({
        rest: { c: add(last.rest.c, mul(tr, capLen * s)), n: last.rest.n, b: last.rest.b },
        posed: { c: add(last.posed.c, mul(t, capLen * s)), n: last.posed.n, b: last.posed.b },
        rv: Math.max(1e-3, last.rv * c),
        rh: Math.max(1e-3, last.rh * c),
      });
    }
  }

  const base = mesh.pos.length / 3;
  const phase = opts.phase ?? 0;
  const total = all.length;
  for (let i = 0; i < total; i++) {
    const ring = all[i]!;
    const tp = tangentAt(all, i, 'posed');
    const prev = all[Math.max(0, i - 1)]!;
    const next = all[Math.min(total - 1, i + 1)]!;
    const span = Math.max(1e-6, len(sub(next.posed.c, prev.posed.c)));
    const slope = ((next.rv + next.rh) / 2 - (prev.rv + prev.rh) / 2) / span;
    for (let s = 0; s <= segs; s++) {
      const phi = phase + (s / segs) * TAU;
      const cp = Math.cos(phi),
        sp = Math.sin(phi);
      const p = add(ring.posed.c, add(mul(ring.posed.n, ring.rv * cp), mul(ring.posed.b, ring.rh * sp)));
      const r = add(ring.rest.c, add(mul(ring.rest.n, ring.rv * cp), mul(ring.rest.b, ring.rh * sp)));
      const radial = norm(
        add(mul(ring.posed.n, cp / Math.max(ring.rv, 1e-3)), mul(ring.posed.b, sp / Math.max(ring.rh, 1e-3))),
      );
      const nrm = norm(sub(radial, mul(tp, slope)));
      pushVertex(mesh, p, nrm, r, i / (total - 1), s / segs);
    }
  }
  const stride = segs + 1;
  for (let i = 0; i < total - 1; i++) {
    for (let s = 0; s < segs; s++) {
      const a = base + i * stride + s;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      mesh.idx.push(a, c, b, b, c, d);
    }
  }
}

export interface LoftPoint {
  /** Position in the unposed model space (drives decals). */
  rest: V3;
  /** Position in the current pose. */
  posed: V3;
  /** Radius along the ring's `up` axis. */
  rv: number;
  /** Radius across it. */
  rh: number;
  /** Optional per-point up vector in posed space (twists the section). */
  upPosed?: V3;
}

export interface LoftOpts extends SweepOpts {
  /** Ring count after spline resampling. */
  n?: number;
  upRest?: V3;
  upPosed?: V3;
}

/** Lofts a smooth tube through control points with per-point elliptical radii. */
export function loft(mesh: Mesh, pts: readonly LoftPoint[], o: LoftOpts = {}): void {
  if (pts.length < 2) throw new Error('loft needs two control points');
  const n = o.n ?? Math.max(8, pts.length * 4);
  const rest = sampleSpline(
    pts.map((p) => p.rest),
    n,
  );
  const posed = sampleSpline(
    pts.map((p) => p.posed),
    n,
  );
  const radii = sampleSpline(
    pts.map((p) => [p.rv, p.rh, 0] as const),
    n,
  );
  const ups = pts.some((p) => p.upPosed)
    ? sampleSpline(
        pts.map((p) => p.upPosed ?? o.upPosed ?? ([0, 0, 1] as const)),
        n,
      )
    : null;
  const upRest = o.upRest ?? ([0, 0, 1] as const);
  const upPosed = o.upPosed ?? ([0, 0, 1] as const);
  const rings: SweepRing[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1),
      b = Math.min(n - 1, i + 1);
    const tr = sub(rest[b]!, rest[a]!);
    const tp = sub(posed[b]!, posed[a]!);
    rings.push({
      rest: frameRing(rest[i]!, tr, upRest),
      posed: frameRing(posed[i]!, tp, ups ? ups[i]! : upPosed),
      rv: Math.max(0.3, radii[i]![0]),
      rh: Math.max(0.3, radii[i]![1]),
    });
  }
  sweep(mesh, rings, o);
}

/**
 * Convenience: a ring built from a center, a "vertical" axis and a tangent, completing the frame
 * automatically.
 */
export function frameRing(c: V3, tangent: V3, up: V3): RingFrame {
  const t = norm(tangent);
  let n = sub(up, mul(t, dot(up, t)));
  if (len(n) < 1e-5) n = cross(t, [0, 1, 0]);
  n = norm(n);
  return { c, n, b: norm(cross(t, n)) };
}

export interface EllipsoidOpts {
  rings?: number;
  segs?: number;
}

/**
 * An ellipsoid placed on a bone. `local` is the center in the bone's local frame, `rot` an extra
 * local rotation. Radii are along the local x (forward), y (left), z (up) axes after `rot`.
 */
export function ellipsoid(
  mesh: Mesh,
  bone: Bone,
  local: V3,
  radii: V3,
  rot: M3 = IDENTITY,
  opts: EllipsoidOpts = {},
): void {
  const rings = opts.rings ?? 10;
  const segs = opts.segs ?? 14;
  const base = mesh.pos.length / 3;
  const restRot = mulM(bone.rest.r, rot);
  const posedRot = mulM(bone.posed.r, rot);
  const restC = xfPoint(bone.rest, local);
  const posedC = xfPoint(bone.posed, local);
  for (let i = 0; i <= rings; i++) {
    const th = (i / rings) * Math.PI;
    const st = Math.sin(th),
      ct = Math.cos(th);
    for (let s = 0; s <= segs; s++) {
      const ph = (s / segs) * TAU;
      const unit: V3 = [st * Math.cos(ph), st * Math.sin(ph), ct];
      const lp: V3 = [unit[0] * radii[0], unit[1] * radii[1], unit[2] * radii[2]];
      const p = add(posedC, applyM(posedRot, lp));
      const r = add(restC, applyM(restRot, lp));
      const ln: V3 = norm([unit[0] / radii[0], unit[1] / radii[1], unit[2] / radii[2]]);
      pushVertex(mesh, p, norm(applyM(posedRot, ln)), r, s / segs, i / rings);
    }
  }
  const stride = segs + 1;
  for (let i = 0; i < rings; i++) {
    for (let s = 0; s < segs; s++) {
      const a = base + i * stride + s;
      mesh.idx.push(a, a + stride, a + 1, a + 1, a + stride, a + stride + 1);
    }
  }
}

/** A free ellipsoid in world space (no bone), used for props and dynamic details. */
export function ellipsoidAt(mesh: Mesh, center: V3, radii: V3, rot: M3 = IDENTITY, opts: EllipsoidOpts = {}): void {
  ellipsoid(mesh, { rest: XF_ID, posed: XF_ID }, center, radii, rot, opts);
}

export interface RibbonPoint {
  p: V3;
  /** Half width at this point. */
  w: number;
  /** Half thickness (defaults to w * 0.35). */
  t?: number;
}

/**
 * A flat tapered lock: an elliptical tube with a strongly flattened cross-section, facing `facing`.
 * Used for hair, tails, leaves, banners and flames.
 */
export function ribbon(mesh: Mesh, pts: readonly RibbonPoint[], facing: V3 | readonly V3[], segs = 6): void {
  const rings: SweepRing[] = pts.map((pt, i) => {
    const a = pts[Math.max(0, i - 1)]!.p;
    const b = pts[Math.min(pts.length - 1, i + 1)]!.p;
    const tangent = norm(sub(b, a));
    const f = (typeof facing[0] === 'number' ? facing : (facing as readonly V3[])[i]!) as V3;
    const fr = frameRing(pt.p, tangent, f);
    return { rest: fr, posed: fr, rv: Math.max(0.2, pt.t ?? pt.w * 0.35), rh: Math.max(0.2, pt.w) };
  });
  sweep(mesh, rings, { segs, capEnd: true, capRings: 3 });
}
