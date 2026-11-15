import { clamp } from '../../../src/shared/math';

export type V3 = readonly [number, number, number];
export type M3 = readonly [number, number, number, number, number, number, number, number, number];

export const v3 = (x: number, y: number, z: number): V3 => [x, y, z];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => {
  const l = len(a);
  return l < 1e-9 ? [0, 0, 1] : [a[0] / l, a[1] / l, a[2] / l];
};
export const lerp3 = (a: V3, b: V3, t: number): V3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
export const dist = (a: V3, b: V3): number => len(sub(a, b));

export const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const fract = (x: number): number => x - Math.floor(x);
export const TAU = Math.PI * 2;
export const deg = (d: number): number => (d * Math.PI) / 180;

export const IDENTITY: M3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Rotation about the X axis, right-handed. */
export function rotX(a: number): M3 {
  const c = Math.cos(a),
    s = Math.sin(a);
  return [1, 0, 0, 0, c, -s, 0, s, c];
}
export function rotY(a: number): M3 {
  const c = Math.cos(a),
    s = Math.sin(a);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
}
export function rotZ(a: number): M3 {
  const c = Math.cos(a),
    s = Math.sin(a);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}
export function axisAngle(axis: V3, a: number): M3 {
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
export const applyM = (m: M3, v: V3): V3 => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];
export function mulM(a: M3, b: M3): M3 {
  const r: number[] = [];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) r.push(a[i * 3]! * b[j]! + a[i * 3 + 1]! * b[3 + j]! + a[i * 3 + 2]! * b[6 + j]!);
  return r as unknown as M3;
}

export const transposeM = (m: M3): M3 => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];

/**
 * Builds an orthonormal frame whose X axis is `forward` and whose Z axis is as close to `up` as
 * possible.
 */
export function frameFrom(forward: V3, up: V3): M3 {
  const f = norm(forward);
  let r = cross(up, f);
  if (len(r) < 1e-6) r = cross([0, 1, 0], f);
  r = norm(r);
  const u = cross(f, r);
  // columns: f, r (left), u
  return [f[0], r[0], u[0], f[1], r[1], u[1], f[2], r[2], u[2]];
}

/** Catmull-Rom point on the segment p1..p2 with neighbours p0, p3. */
export function catmull(p0: V3, p1: V3, p2: V3, p3: V3, t: number): V3 {
  const t2 = t * t,
    t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]), f(p0[2], p1[2], p2[2], p3[2])];
}

/** Point on the Catmull-Rom curve through `pts` at parameter t in [0, 1]. */
export function splineAt(pts: readonly V3[], t: number): V3 {
  if (pts.length < 2) throw new Error('spline needs at least two points');
  const segs = pts.length - 1;
  const u = clamp(t, 0, 1) * segs;
  const s = Math.min(segs - 1, Math.floor(u));
  return catmull(pts[Math.max(0, s - 1)]!, pts[s]!, pts[s + 1]!, pts[Math.min(pts.length - 1, s + 2)]!, u - s);
}

/** Samples a smooth curve through the control points at `n` evenly spaced parameter values. */
export function sampleSpline(pts: readonly V3[], n: number): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < n; i++) out.push(splineAt(pts, n === 1 ? 0 : i / (n - 1)));
  return out;
}

/**
 * Two-bone IK in a plane. Returns the middle joint position given root, target, bone lengths and a
 * bend direction hint.
 */
export function twoBoneIk(root: V3, target: V3, l1: number, l2: number, bend: V3): { mid: V3; end: V3 } {
  let d = sub(target, root);
  let dl = len(d);
  const maxReach = (l1 + l2) * 0.999;
  const minReach = Math.abs(l1 - l2) * 1.001 + 1e-3;
  dl = clamp(dl, minReach, maxReach);
  d = mul(norm(d), dl);
  const a = (l1 * l1 - l2 * l2 + dl * dl) / (2 * dl);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const dir = norm(d);
  let perp = sub(bend, mul(dir, dot(bend, dir)));
  if (len(perp) < 1e-6) perp = cross(dir, [0, 1, 0]);
  perp = norm(perp);
  const mid = add(add(root, mul(dir, a)), mul(perp, h));
  return { mid, end: add(root, d) };
}
