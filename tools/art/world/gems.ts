import { type Mesh, pushVertex } from '../core/mesh';
import { applyM, axisAngle, cross, dot, norm, sub, TAU, type V3 } from '../core/vec';

/**
 * Flat-shaded triangles. Each is wound so its normal points away from `center`, whatever order the
 * caller gave.
 */
export function flatFacets(mesh: Mesh, tris: readonly (readonly [V3, V3, V3])[], center: V3): void {
  for (const [a, b0, c0] of tris) {
    let b = b0,
      c = c0;
    let n = norm(cross(sub(b, a), sub(c, a)));
    const mid: V3 = [
      (a[0] + b[0] + c[0]) / 3 - center[0],
      (a[1] + b[1] + c[1]) / 3 - center[1],
      (a[2] + b[2] + c[2]) / 3 - center[2],
    ];
    if (dot(n, mid) < 0) {
      [b, c] = [c, b];
      n = norm(cross(sub(b, a), sub(c, a)));
    }
    const i = pushVertex(mesh, a, n, a, 0, 0);
    pushVertex(mesh, b, n, b, 1, 0);
    pushVertex(mesh, c, n, c, 0, 1);
    mesh.idx.push(i, i + 1, i + 2);
  }
}

export interface GemOpts {
  /** Turn about the vertical axis, in radians. */
  yaw?: number;
  /** Facets around the girdle. Default 8. */
  sides?: number;
  /** Stretch along x and y, for an oval or an emerald cut. */
  stretch?: readonly [number, number];
  /** Table radius as a share of the girdle's. */
  table?: number;
  /** Crown height and pavilion depth as shares of the radius. */
  crown?: number;
  pavilion?: number;
}

/**
 * A brilliant-cut gem: a flat table, a ring of kite and triangle facets above the girdle and a
 * pavilion below it, every face flat, so each one catches the light on its own. `c` is the centre
 * of the girdle.
 */
export function gem(mesh: Mesh, c: V3, r: number, o: GemOpts = {}): void {
  const n = o.sides ?? 8;
  const yaw = o.yaw ?? 0;
  const [sx, sy] = o.stretch ?? [1, 1];
  const tr = r * (o.table ?? 0.56);
  const top = r * (o.crown ?? 0.34);
  const tip = r * (o.pavilion ?? 0.72);
  const at = (rad: number, a: number, z: number): V3 => [
    c[0] + Math.cos(a + yaw) * rad * sx,
    c[1] + Math.sin(a + yaw) * rad * sy,
    c[2] + z,
  ];
  const G = Array.from({ length: n }, (_, i) => at(r, (i / n) * Math.PI * 2, 0));
  const T = Array.from({ length: n }, (_, i) => at(tr, ((i + 0.5) / n) * Math.PI * 2, top));
  const mid: V3 = [c[0], c[1], c[2] + top * 0.1];
  const centreTop: V3 = [c[0], c[1], c[2] + top];
  const culet: V3 = [c[0], c[1], c[2] - tip];
  const tris: [V3, V3, V3][] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    tris.push([G[i]!, G[j]!, T[i]!], [G[j]!, T[i]!, T[j]!], [centreTop, T[i]!, T[j]!], [G[i]!, G[j]!, culet]);
  }
  flatFacets(mesh, tris, mid);
}

/**
 * One coin: a thin disc with a rim, turned by `angle` about `axis`. Flat faces, so the rim and the
 * face catch light separately.
 */
export function coin(mesh: Mesh, c: V3, r: number, axis: V3, angle: number, thick = 2.6, segs = 10): void {
  const rot = axisAngle(axis, angle);
  const at = (x: number, y: number, z: number): V3 => {
    const p = applyM(rot, [x, y, z]);
    return [c[0] + p[0], c[1] + p[1], c[2] + p[2]];
  };
  const top = Array.from({ length: segs }, (_, i) =>
    at(Math.cos((i / segs) * TAU) * r, Math.sin((i / segs) * TAU) * r, thick / 2),
  );
  const low = Array.from({ length: segs }, (_, i) =>
    at(Math.cos((i / segs) * TAU) * r, Math.sin((i / segs) * TAU) * r, -thick / 2),
  );
  const mid = at(0, 0, thick / 2);
  const tris: [V3, V3, V3][] = [];
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % segs;
    tris.push([mid, top[i]!, top[j]!], [top[i]!, top[j]!, low[j]!], [top[i]!, low[j]!, low[i]!]);
  }
  flatFacets(mesh, tris, at(0, 0, 0));
}

/**
 * A loose heap of coins: discs tilted every which way, the heap's height following a smooth dome.
 */
export function coinHeap(
  mesh: Mesh,
  c: V3,
  radius: number,
  height: number,
  count: number,
  rng: () => number,
  size = 7,
): void {
  const coins: { x: number; y: number; z: number; r: number; a: number; ax: V3 }[] = [];
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2;
    const d = radius * Math.sqrt(rng());
    const z = height * Math.max(0, 1 - (d / radius) * (d / radius)) ** 0.8 + (rng() - 0.5) * 2.2;
    coins.push({
      x: Math.cos(a) * d,
      y: Math.sin(a) * d,
      z,
      r: size * (0.9 + rng() * 0.2),
      a: 0.1 + rng() * 0.9,
      ax: norm([rng() - 0.5, rng() - 0.5, 0.0001]),
    });
  }
  // Lowest first, so a coin on top is drawn over the ones it rests on.
  coins.sort((p, q) => p.z - q.z);
  for (const k of coins) coin(mesh, [c[0] + k.x, c[1] + k.y, c[2] + k.z], k.r, k.ax, k.a);
}
