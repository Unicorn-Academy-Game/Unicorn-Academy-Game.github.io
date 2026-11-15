import { ellipsoidAt, type LoftPoint, loft, type Mesh, type RibbonPoint, ribbon } from '../core/mesh';
import { add, axisAngle, IDENTITY, type M3, mulM, rotZ, type V3 } from '../core/vec';

export type { RibbonPoint };
export { ellipsoidAt, ribbon };

/**
 * A tube through points with a radius at each, in world space (no skeleton, so rest and posed
 * agree).
 */
export function tube(
  mesh: Mesh,
  pts: readonly { p: V3; r: number; rh?: number }[],
  opts: { n?: number; segs?: number; capEnd?: boolean; capStart?: boolean; up?: V3 } = {},
): void {
  const lp: LoftPoint[] = pts.map((q) => ({ rest: q.p, posed: q.p, rv: q.r, rh: q.rh ?? q.r }));
  loft(mesh, lp, {
    n: opts.n ?? Math.max(8, pts.length * 4),
    segs: opts.segs ?? 12,
    capEnd: opts.capEnd ?? true,
    capStart: opts.capStart ?? false,
    upRest: opts.up ?? [0, 1, 0],
    upPosed: opts.up ?? [0, 1, 0],
  });
}

/** Ellipsoid with a rotation about the vertical axis. */
export function blob(mesh: Mesh, c: V3, r: V3, yaw = 0, o: { rings?: number; segs?: number } = {}): void {
  ellipsoidAt(mesh, c, r, rotZ(yaw), { rings: o.rings ?? 10, segs: o.segs ?? 14 });
}

/** Ellipsoid tilted so its long axis follows a direction. */
export function blobAlong(
  mesh: Mesh,
  c: V3,
  r: V3,
  axis: V3,
  angle: number,
  o: { rings?: number; segs?: number } = {},
): void {
  const rot: M3 = mulM(axisAngle(axis, angle), IDENTITY);
  ellipsoidAt(mesh, c, r, rot, { rings: o.rings ?? 10, segs: o.segs ?? 14 });
}

export const at = (o: V3, d: V3): V3 => add(o, d);

/**
 * Flat-shaded box with a yaw, for masonry, crates, chests and tables. Faces have their own vertices
 * so edges stay crisp.
 */
export function box(mesh: Mesh, center: V3, size: V3, yaw = 0, bevel = 0): void {
  const [hx, hy, hz] = [size[0] / 2, size[1] / 2, size[2] / 2];
  const rot = rotZ(yaw);
  const corner = (sx: number, sy: number, sz: number): V3 => [sx * hx, sy * hy, sz * hz];
  const faces: { n: V3; v: V3[] }[] = [
    { n: [1, 0, 0], v: [corner(1, -1, -1), corner(1, 1, -1), corner(1, 1, 1), corner(1, -1, 1)] },
    { n: [-1, 0, 0], v: [corner(-1, 1, -1), corner(-1, -1, -1), corner(-1, -1, 1), corner(-1, 1, 1)] },
    { n: [0, 1, 0], v: [corner(1, 1, -1), corner(-1, 1, -1), corner(-1, 1, 1), corner(1, 1, 1)] },
    { n: [0, -1, 0], v: [corner(-1, -1, -1), corner(1, -1, -1), corner(1, -1, 1), corner(-1, -1, 1)] },
    { n: [0, 0, 1], v: [corner(-1, -1, 1), corner(1, -1, 1), corner(1, 1, 1), corner(-1, 1, 1)] },
    { n: [0, 0, -1], v: [corner(-1, 1, -1), corner(1, 1, -1), corner(1, -1, -1), corner(-1, -1, -1)] },
  ];
  void bevel;
  const apply = (v: V3): V3 => [
    rot[0] * v[0] + rot[1] * v[1] + rot[2] * v[2],
    rot[3] * v[0] + rot[4] * v[1] + rot[5] * v[2],
    rot[6] * v[0] + rot[7] * v[1] + rot[8] * v[2],
  ];
  for (const f of faces) {
    const base = mesh.pos.length / 3;
    const n = apply(f.n);
    f.v.forEach((v, i) => {
      const p = apply(v);
      const q: V3 = [p[0] + center[0], p[1] + center[1], p[2] + center[2]];
      mesh.pos.push(q[0], q[1], q[2]);
      mesh.nor.push(n[0], n[1], n[2]);
      mesh.rest.push(q[0], q[1], q[2]);
      mesh.uv.push(i === 1 || i === 2 ? 1 : 0, i >= 2 ? 1 : 0);
    });
    mesh.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

/**
 * Pulls vertex normals toward the direction from a center, so a crown made of many small clumps is
 * still lit like one rounded mass: each clump keeps its own scalloped shading, and the whole gets a
 * clear lit side and shade side.
 */
export function blendNormals(mesh: Mesh, center: V3, radii: V3, weight: number): void {
  for (let i = 0; i < mesh.pos.length; i += 3) {
    const dx = (mesh.pos[i]! - center[0]) / radii[0],
      dy = (mesh.pos[i + 1]! - center[1]) / radii[1],
      dz = (mesh.pos[i + 2]! - center[2]) / radii[2];
    const l = Math.hypot(dx, dy, dz) || 1;
    const nx = mesh.nor[i]! * (1 - weight) + (dx / l) * weight;
    const ny = mesh.nor[i + 1]! * (1 - weight) + (dy / l) * weight;
    const nz = mesh.nor[i + 2]! * (1 - weight) + (dz / l) * weight;
    const nl = Math.hypot(nx, ny, nz) || 1;
    mesh.nor[i] = nx / nl;
    mesh.nor[i + 1] = ny / nl;
    mesh.nor[i + 2] = nz / nl;
  }
}
