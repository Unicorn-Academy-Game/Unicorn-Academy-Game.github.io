import { type Mesh, pushVertex } from '../core/mesh';
import { cross, norm, TAU, type V3 } from '../core/vec';

/**
 * Architecture for the 3D lever: solids of revolution (towers, domes, columns, finials) and flat
 * shapes pushed into a volume (arches, gables, pediments). Everything is built in world space with
 * z up and +y away from the camera, so a wall facing the player faces -y. Normals are part of the
 * model because the renderer never culls: a hard edge is two normals at one corner, a rounded
 * surface is one.
 */

export type P2 = readonly [number, number];

/** Signed area of a polygon, positive when it runs counter-clockwise. */
export function area2(poly: readonly P2[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!,
      q = poly[(i + 1) % poly.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

const inTriangle = (p: P2, a: P2, b: P2, c: P2): boolean => {
  const s = (u: P2, v: P2, w: P2): number => (u[0] - w[0]) * (v[1] - w[1]) - (v[0] - w[0]) * (u[1] - w[1]);
  const d1 = s(p, a, b),
    d2 = s(p, b, c),
    d3 = s(p, c, a);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
};

/** Ear clipping for a simple polygon. Returns index triples into `poly`, counter-clockwise. */
export function triangulate(poly: readonly P2[]): number[] {
  const idx = poly.map((_, i) => i);
  if (area2(poly) < 0) idx.reverse();
  const out: number[] = [];
  while (idx.length > 3) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length]!,
        ib = idx[i]!,
        ic = idx[(i + 1) % idx.length]!;
      const a = poly[ia]!,
        b = poly[ib]!,
        c = poly[ic]!;
      if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) <= 1e-9) continue;
      if (idx.some((j) => j !== ia && j !== ib && j !== ic && inTriangle(poly[j]!, a, b, c))) continue;
      out.push(ia, ib, ic);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (idx.length === 3) out.push(idx[0]!, idx[1]!, idx[2]!);
  else for (let i = 1; i < idx.length - 1; i++) out.push(idx[0]!, idx[i]!, idx[i + 1]!);
  return out;
}

/**
 * A plane in the world that a 2D shape lives in: point = o + u*x + v*y, and the shape is pushed
 * along u x v.
 */
export interface Frame {
  o: V3;
  u: V3;
  v: V3;
}

/**
 * A wall facing the player: x runs east, y runs up, and the shape is pushed away from the camera.
 */
export const FRONT = (x: number, y: number, z: number): Frame => ({ o: [x, y, z], u: [1, 0, 0], v: [0, 0, 1] });
/** A wall facing east, seen edge on. */
export const SIDE = (x: number, y: number, z: number): Frame => ({ o: [x, y, z], u: [0, 1, 0], v: [0, 0, 1] });
/** A floor or roof plane: x runs east, y runs away from the camera, and the shape is pushed up. */
export const TOP = (x: number, y: number, z: number): Frame => ({ o: [x, y, z], u: [1, 0, 0], v: [0, 1, 0] });

export interface ExtrudeOpts {
  /**
   * Corners gentler than this many degrees share a normal, so a curved outline looks round. Default
   * 32.
   */
  smooth?: number;
  /** Which caps to draw. Default both. */
  caps?: 'both' | 'front' | 'back' | 'none';
}

/**
 * Pushes a flat polygon into a solid between two depths along the frame's normal. Positive depth is
 * toward the viewer for a FRONT frame's reverse: FRONT pushes toward +y (away), so pass negative
 * depths for a slab that comes out of a wall.
 */
export function extrude(mesh: Mesh, poly: readonly P2[], f: Frame, d0: number, d1: number, o: ExtrudeOpts = {}): void {
  const pts = area2(poly) > 0 ? poly : [...poly].reverse();
  const n = norm(cross(f.u, f.v));
  const at = (p: P2, d: number): V3 => [
    f.o[0] + f.u[0] * p[0] + f.v[0] * p[1] + n[0] * d,
    f.o[1] + f.u[1] * p[0] + f.v[1] * p[1] + n[1] * d,
    f.o[2] + f.u[2] * p[0] + f.v[2] * p[1] + n[2] * d,
  ];
  const m = pts.length;
  const edgeNormal = (i: number): V3 => {
    const p = pts[i]!,
      q = pts[(i + 1) % m]!;
    const ex = q[0] - p[0],
      ey = q[1] - p[1];
    return norm([f.u[0] * ey - f.v[0] * ex, f.u[1] * ey - f.v[1] * ex, f.u[2] * ey - f.v[2] * ex]);
  };
  const en = pts.map((_, i) => edgeNormal(i));
  const cosMax = Math.cos(((o.smooth ?? 32) * Math.PI) / 180);
  const blend = (a: V3, b: V3): V3 =>
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2] > cosMax ? norm([a[0] + b[0], a[1] + b[1], a[2] + b[2]]) : a;
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m;
    const mine = en[i]!;
    const nStart = blend(mine, en[(i + m - 1) % m]!);
    const nEnd = blend(mine, en[j]!);
    const p0 = at(pts[i]!, d0),
      p1 = at(pts[j]!, d0),
      p2 = at(pts[j]!, d1),
      p3 = at(pts[i]!, d1);
    const a = pushVertex(mesh, p0, nStart, p0, 0, 0);
    const b = pushVertex(mesh, p1, nEnd, p1, 1, 0);
    const c = pushVertex(mesh, p2, nEnd, p2, 1, 1);
    const d = pushVertex(mesh, p3, nStart, p3, 0, 1);
    mesh.idx.push(a, b, c, a, c, d);
  }
  const caps = o.caps ?? 'both';
  const tris = triangulate(pts);
  const cap = (d: number, nn: V3): void => {
    const base = mesh.pos.length / 3;
    for (const p of pts) {
      const q = at(p, d);
      pushVertex(mesh, q, nn, q, 0.5, 0.5);
    }
    for (const t of tris) mesh.idx.push(base + t);
  };
  if (caps === 'both' || caps === 'front') cap(d1, n);
  if (caps === 'both' || caps === 'back') cap(d0, [-n[0], -n[1], -n[2]]);
}

export interface LatheOpts {
  /** Center of the bottom of the axis. */
  c: V3;
  /** Radius and height pairs from the bottom up the outside and inward over the top. */
  profile: readonly P2[];
  segs?: number;
  /** Average the normals where the profile bends, so the surface is one rounded piece. */
  smooth?: boolean;
  /** Flat faces around the axis, for an octagonal or hexagonal tower. */
  faceted?: boolean;
  /** Turns the whole thing about the axis, in radians. */
  yaw?: number;
}

/**
 * A solid of revolution. The profile is walked in order and each step is a band: walk up the
 * outside so the band normals point outward, and walk inward across a top so they point up.
 */
export function lathe(mesh: Mesh, o: LatheOpts): void {
  const segs = o.segs ?? 20;
  const prof = o.profile;
  const yaw = o.yaw ?? 0;
  const bands = prof.length - 1;
  const bn: P2[] = [];
  for (let i = 0; i < bands; i++) {
    const tr = prof[i + 1]![0] - prof[i]![0],
      tz = prof[i + 1]![1] - prof[i]![1];
    const l = Math.hypot(tr, tz) || 1;
    bn.push([tz / l, -tr / l]);
  }
  const at = (r: number, z: number, a: number): V3 => [o.c[0] + Math.cos(a) * r, o.c[1] + Math.sin(a) * r, o.c[2] + z];
  const avg = (a: P2, b: P2): P2 => {
    const x = a[0] + b[0],
      y = a[1] + b[1],
      l = Math.hypot(x, y) || 1;
    return [x / l, y / l];
  };
  for (let i = 0; i < bands; i++) {
    const [r0, z0] = prof[i]!,
      [r1, z1] = prof[i + 1]!;
    const nLow: P2 = o.smooth && i > 0 ? avg(bn[i - 1]!, bn[i]!) : bn[i]!;
    const nHigh: P2 = o.smooth && i < bands - 1 ? avg(bn[i]!, bn[i + 1]!) : bn[i]!;
    for (let s = 0; s < segs; s++) {
      const a0 = yaw + (s / segs) * TAU,
        a1 = yaw + ((s + 1) / segs) * TAU;
      const ac = (a0 + a1) / 2;
      const dir = (a: number, nn: P2): V3 => [Math.cos(a) * nn[0], Math.sin(a) * nn[0], nn[1]];
      const n00 = o.faceted ? dir(ac, nLow) : dir(a0, nLow),
        n01 = o.faceted ? dir(ac, nLow) : dir(a1, nLow);
      const n10 = o.faceted ? dir(ac, nHigh) : dir(a0, nHigh),
        n11 = o.faceted ? dir(ac, nHigh) : dir(a1, nHigh);
      const p00 = at(r0, z0, a0),
        p01 = at(r0, z0, a1),
        p10 = at(r1, z1, a0),
        p11 = at(r1, z1, a1);
      const v00 = pushVertex(mesh, p00, norm(n00), p00, s / segs, i / bands);
      const v01 = pushVertex(mesh, p01, norm(n01), p01, (s + 1) / segs, i / bands);
      const v10 = pushVertex(mesh, p10, norm(n10), p10, s / segs, (i + 1) / bands);
      const v11 = pushVertex(mesh, p11, norm(n11), p11, (s + 1) / segs, (i + 1) / bands);
      mesh.idx.push(v00, v01, v11, v00, v11, v10);
    }
  }
}

/**
 * A circular arch outline: straight sides up to the springing line, then a half circle. Origin at
 * the bottom center.
 */
export function archShape(width: number, height: number, n = 14): P2[] {
  const r = width / 2;
  const spring = Math.max(0, height - r);
  const pts: P2[] = [
    [-r, 0],
    [r, 0],
    [r, spring],
  ];
  for (let i = 1; i < n; i++) {
    const a = (i / n) * Math.PI;
    pts.push([Math.cos(a) * r, spring + Math.sin(a) * r]);
  }
  pts.push([-r, spring]);
  return pts;
}

/** A pointed (gothic) arch: two arcs meeting above the center. Origin at the bottom center. */
export function pointedShape(width: number, height: number, n = 10): P2[] {
  const r = width / 2;
  const spring = Math.max(0, height - r * 1.35);
  const pts: P2[] = [
    [-r, 0],
    [r, 0],
    [r, spring],
  ];
  // Each side is an arc of radius `width` centered on the opposite springing point.
  for (let i = 1; i <= n; i++) {
    const a = (i / n) * (Math.PI / 3);
    pts.push([r - width * (1 - Math.cos(a)), spring + width * Math.sin(a)]);
  }
  for (let i = n - 1; i >= 1; i--) {
    const a = (i / n) * (Math.PI / 3);
    pts.push([-r + width * (1 - Math.cos(a)), spring + width * Math.sin(a)]);
  }
  pts.push([-r, spring]);
  return pts;
}

export const rectShape = (w: number, h: number): P2[] => [
  [-w / 2, 0],
  [w / 2, 0],
  [w / 2, h],
  [-w / 2, h],
];

/** A triangle with its base on the bottom, for a gable. Origin at the bottom center. */
export const triangleShape = (w: number, h: number): P2[] => [
  [-w / 2, 0],
  [w / 2, 0],
  [0, h],
];

/** A scalloped hem: the bottom edge of a banner or valance as a row of rounded points. */
export function scallopEdge(width: number, depth: number, count: number, n = 6): P2[] {
  const pts: P2[] = [];
  const w = width / count;
  for (let i = 0; i < count; i++) {
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      pts.push([-width / 2 + i * w + t * w, -Math.sin(t * Math.PI) * depth]);
    }
  }
  return pts;
}

/** A round column with a base, a slightly swelling shaft and a capital. */
export function column(mesh: Mesh, c: V3, height: number, radius: number, segs = 14): void {
  const r = radius;
  lathe(mesh, {
    c,
    segs,
    profile: [
      [r * 1.55, 0],
      [r * 1.55, height * 0.04],
      [r * 1.25, height * 0.06],
      [r * 1.1, height * 0.08],
      [r * 1.0, height * 0.12],
      [r * 1.04, height * 0.5],
      [r * 0.94, height * 0.86],
      [r * 1.15, height * 0.89],
      [r * 1.5, height * 0.92],
      [r * 1.6, height * 0.95],
      [r * 1.6, height],
      [0, height],
    ],
  });
}

/** A spire with a ball on it, for the top of a roof. */
export function finial(mesh: Mesh, c: V3, height: number, radius: number): void {
  const r = radius;
  lathe(mesh, {
    c,
    segs: 12,
    smooth: true,
    profile: [
      [r * 1.3, 0],
      [r * 1.3, height * 0.1],
      [r * 0.5, height * 0.18],
      [r * 0.45, height * 0.45],
      [r * 1.4, height * 0.55],
      [r * 1.9, height * 0.68],
      [r * 1.4, height * 0.82],
      [r * 0.5, height * 0.88],
      [r * 0.2, height * 0.97],
      [0, height],
    ],
  });
}

/**
 * A cone roof with an overhanging eave. `bow` above 1 bows the flank inward like a witch hat in a
 * storybook, 1 is a straight cone and below 1 swells like an onion.
 */
export function coneRoof(mesh: Mesh, c: V3, radius: number, height: number, segs = 24, bow = 1.2): void {
  const prof: P2[] = [
    [0, 0],
    [radius * 1.14, 0],
    [radius * 1.12, height * 0.03],
  ];
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    const s = i / steps;
    prof.push([radius * (1 - s) ** bow, height * (0.03 + 0.97 * s)]);
  }
  lathe(mesh, { c, segs, smooth: true, profile: prof });
}

/**
 * A flat-sided hip or gable roof as a set of planes. `ridge` runs along x when 'x', along y when
 * 'y'.
 */
export function gableRoof(mesh: Mesh, c: V3, w: number, d: number, h: number, ridge: 'x' | 'y', overhang = 8): void {
  const hw = w / 2 + overhang,
    hd = d / 2 + overhang;
  const plane = (a: V3, b: V3, cc: V3, dd: V3): void => {
    const nn = norm(cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [dd[0] - a[0], dd[1] - a[1], dd[2] - a[2]]));
    const up: V3 = nn[2] < 0 ? [-nn[0], -nn[1], -nn[2]] : nn;
    const vs = [a, b, cc, dd].map((p) => pushVertex(mesh, p, up, p, 0, 0));
    mesh.idx.push(vs[0]!, vs[1]!, vs[2]!, vs[0]!, vs[2]!, vs[3]!);
  };
  const P = (x: number, y: number, z: number): V3 => [c[0] + x, c[1] + y, c[2] + z];
  if (ridge === 'x') {
    plane(P(-hw, -hd, 0), P(hw, -hd, 0), P(hw, 0, h), P(-hw, 0, h));
    plane(P(-hw, hd, 0), P(hw, hd, 0), P(hw, 0, h), P(-hw, 0, h));
  } else {
    plane(P(-hw, -hd, 0), P(-hw, hd, 0), P(0, hd, h), P(0, -hd, h));
    plane(P(hw, -hd, 0), P(hw, hd, 0), P(0, hd, h), P(0, -hd, h));
  }
}

/**
 * A roof with four sloping planes. The ridge runs along x and is as long as the building is wide
 * minus its depth.
 */
export function hipRoof(mesh: Mesh, c: V3, w: number, d: number, h: number, overhang = 8): void {
  const hw = w / 2 + overhang,
    hd = d / 2 + overhang;
  const rl = Math.max(0, w - d) / 2;
  const P = (x: number, y: number, z: number): V3 => [c[0] + x, c[1] + y, c[2] + z];
  const face = (pts: V3[]): void => {
    const a = pts[0]!,
      b = pts[1]!,
      cc = pts[2]!;
    const nn = norm(cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [cc[0] - a[0], cc[1] - a[1], cc[2] - a[2]]));
    const up: V3 = nn[2] < 0 ? [-nn[0], -nn[1], -nn[2]] : nn;
    const vs = pts.map((p) => pushVertex(mesh, p, up, p, 0, 0));
    for (let i = 1; i < vs.length - 1; i++) mesh.idx.push(vs[0]!, vs[i]!, vs[i + 1]!);
  };
  face([P(-hw, -hd, 0), P(hw, -hd, 0), P(rl, 0, h), P(-rl, 0, h)]);
  face([P(hw, hd, 0), P(-hw, hd, 0), P(-rl, 0, h), P(rl, 0, h)]);
  face([P(-hw, hd, 0), P(-hw, -hd, 0), P(-rl, 0, h)]);
  face([P(hw, -hd, 0), P(hw, hd, 0), P(rl, 0, h)]);
}

/** A half sphere for a dome, built as a smooth lathe. */
export function dome(mesh: Mesh, c: V3, radius: number, height: number, segs = 22, rings = 10): void {
  const prof: P2[] = [[radius, 0]];
  for (let i = 1; i <= rings; i++) {
    const a = (i / rings) * (Math.PI / 2);
    prof.push([Math.cos(a) * radius, Math.sin(a) * height]);
  }
  lathe(mesh, { c, segs, smooth: true, profile: prof });
}
