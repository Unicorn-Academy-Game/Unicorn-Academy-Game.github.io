import { type Mesh, newMesh } from '../core/mesh';
import { add, applyM, axisAngle, cross, IDENTITY, len, type M3, norm, type V3 } from '../core/vec';

/**
 * Builds a part in its own local space, then places it with a rotation and an origin. The part's
 * `rest` coordinates stay local, so a pattern on it (straw weave, stripes) belongs to the object
 * and does not swim when the object turns.
 */
export function attach(target: Mesh, origin: V3, R: M3, build: (local: Mesh) => void): void {
  const local = newMesh(target.mat, target.part, {
    twoSided: target.twoSided,
    noLines: target.noLines,
    noShadow: target.noShadow,
  });
  build(local);
  const base = target.pos.length / 3;
  for (let i = 0; i < local.pos.length; i += 3) {
    const p = add(applyM(R, [local.pos[i]!, local.pos[i + 1]!, local.pos[i + 2]!]), origin);
    const n = applyM(R, [local.nor[i]!, local.nor[i + 1]!, local.nor[i + 2]!]);
    target.pos.push(p[0], p[1], p[2]);
    target.nor.push(n[0], n[1], n[2]);
    target.rest.push(local.rest[i]!, local.rest[i + 1]!, local.rest[i + 2]!);
  }
  for (const uv of local.uv) target.uv.push(uv);
  for (const k of local.idx) target.idx.push(k + base);
}

/** Turns a whole figure about the vertical axis. Rest coordinates are left alone. */
export function yawMeshes(meshes: readonly Mesh[], yaw: number): void {
  const c = Math.cos(yaw),
    s = Math.sin(yaw);
  for (const m of meshes) {
    for (let i = 0; i < m.pos.length; i += 3) {
      const x = m.pos[i]!,
        y = m.pos[i + 1]!;
      m.pos[i] = c * x - s * y;
      m.pos[i + 1] = s * x + c * y;
      const nx = m.nor[i]!,
        ny = m.nor[i + 1]!;
      m.nor[i] = c * nx - s * ny;
      m.nor[i + 1] = s * nx + c * ny;
    }
  }
}

/**
 * The rotation that turns the +z axis onto `dir`, for building an upright part and then leaning it
 * along a limb.
 */
export function alignZ(dir: V3): M3 {
  const d = norm(dir);
  const axis = cross([0, 0, 1], d);
  if (len(axis) < 1e-6) return IDENTITY;
  return axisAngle(axis, Math.acos(Math.max(-1, Math.min(1, d[2]))));
}
