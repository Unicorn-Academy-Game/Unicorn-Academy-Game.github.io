import type { Facing } from '../../../src/shared/ids';
import { hash2, mulberry32 } from '../../art/core/rng';

export interface Pt {
  x: number;
  y: number;
}

export const pt = (x: number, y: number): Pt => ({ x, y });
export const T = 64;
/** Tile coordinates to world units. */
export const tp = (x: number, y: number): Pt => ({ x: x * T, y: y * T });

/** Smooth 2D value noise in [0, 1]. */
function noise2(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x),
    y0 = Math.floor(y);
  const fx = x - x0,
    fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx),
    sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, seed),
    b = hash2(x0 + 1, y0, seed),
    c = hash2(x0, y0 + 1, seed),
    d = hash2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/**
 * A region of the map as a signed distance in world units, positive inside. Unions, cuts and
 * intersections are `max`, `min` of the other's negation, and `min`, so regions combine without
 * ever rasterizing until the end.
 */
export type Region = (x: number, y: number) => number;

/** A rectangle as a region: positive inside, by the distance to the nearest edge. */
export const rect =
  (x0: number, y0: number, x1: number, y1: number): Region =>
  (x, y) =>
    Math.min(x - x0, x1 - x, y - y0, y1 - y);
export const disc =
  (c: Pt, r: number): Region =>
  (x, y) =>
    r - Math.hypot(x - c.x, y - c.y);

/** A place to stand, for an object's approach list. */
export const stand = (x: number, y: number, facing: Facing): { x: number; y: number; facing: Facing } => ({
  x,
  y,
  facing,
});

/**
 * A tap region around a prop, `w` wide and `h` tall, reaching `up` units above the prop's ground
 * point.
 */
export const hitBox = (
  x: number,
  y: number,
  w: number,
  h: number,
  up = h * 0.8,
): { x: number; y: number; w: number; h: number } => ({ x: x - w / 2, y: y - up, w, h });

export const union =
  (...rs: Region[]): Region =>
  (x, y) =>
    Math.max(...rs.map((r) => r(x, y)));

/**
 * An ellipse whose outline wanders by up to `wobble` of its radius, so clearings look grown instead
 * of drawn.
 */
export function blob(
  c: Pt,
  rx: number,
  ry: number,
  o: { wobble?: number; seed?: number; lobes?: number } = {},
): Region {
  const wobble = o.wobble ?? 0.14,
    seed = o.seed ?? 1,
    lobes = o.lobes ?? 3;
  return (x, y) => {
    const dx = x - c.x,
      dy = y - c.y;
    const a = Math.atan2(dy, dx);
    const n = noise2(Math.cos(a) * lobes + 50, Math.sin(a) * lobes + 50, seed) - 0.5;
    const k = 1 + n * 2 * wobble;
    const d = Math.hypot(dx / (rx * k), dy / (ry * k));
    return (1 - d) * Math.min(rx, ry) * k;
  };
}

/** Catmull-Rom spline through `pts`, sampled about every `step` units. */
function spline(pts: readonly Pt[], step = 24): Pt[] {
  if (pts.length < 3) return [...pts];
  const out: Pt[] = [];
  const P = (i: number): Pt => pts[Math.max(0, Math.min(pts.length - 1, i))]!;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = P(i - 1),
      p1 = P(i),
      p2 = P(i + 1),
      p3 = P(i + 2);
    const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const n = Math.max(2, Math.ceil(len / step));
    for (let k = 0; k < n; k++) {
      const t = k / n,
        t2 = t * t,
        t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number): number =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  out.push(pts[pts.length - 1]!);
  return out;
}

function distToPolyline(line: readonly Pt[], x: number, y: number): number {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!,
      b = line[i]!;
    const ex = b.x - a.x,
      ey = b.y - a.y;
    const l2 = ex * ex + ey * ey;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * ex + (y - a.y) * ey) / l2));
    best = Math.min(best, Math.hypot(x - (a.x + ex * t), y - (a.y + ey * t)));
  }
  return best;
}

/**
 * A lane along a smoothed line with a width that breathes a little. Returns the region and the
 * sampled line.
 */
export function lane(
  points: readonly Pt[],
  halfWidth: number,
  o: { wobble?: number; seed?: number } = {},
): { region: Region; line: Pt[] } {
  const line = spline(points);
  const wobble = o.wobble ?? 0.12,
    seed = o.seed ?? 3;
  return {
    line,
    region: (x, y) => {
      const k = 1 + (noise2(x / 280, y / 280, seed) - 0.5) * 2 * wobble;
      return halfWidth * k - distToPolyline(line, x, y);
    },
  };
}

/**
 * Dart-throwing sampler with a minimum distance that may vary per point. Deterministic for a seed.
 */
export class Scatter {
  private readonly pts: { x: number; y: number; r: number }[] = [];
  private readonly grid = new Map<string, number[]>();
  private readonly cell = 96;
  readonly rng: () => number;

  constructor(seed: number) {
    this.rng = mulberry32(seed);
  }

  private key(x: number, y: number): string {
    return `${Math.floor(x / this.cell)},${Math.floor(y / this.cell)}`;
  }

  /**
   * True when a disc of `r` at (x, y) keeps at least `r` plus the other's radius from every
   * accepted point.
   */
  free(x: number, y: number, r: number, slack = 1): boolean {
    const reach = Math.ceil((r + 160) / this.cell);
    const cx = Math.floor(x / this.cell),
      cy = Math.floor(y / this.cell);
    for (let gy = cy - reach; gy <= cy + reach; gy++) {
      for (let gx = cx - reach; gx <= cx + reach; gx++) {
        for (const i of this.grid.get(`${gx},${gy}`) ?? []) {
          const p = this.pts[i]!;
          if (Math.hypot(p.x - x, p.y - y) < (p.r + r) * slack) return false;
        }
      }
    }
    return true;
  }

  add(x: number, y: number, r: number): void {
    const i = this.pts.push({ x, y, r }) - 1;
    const k = this.key(x, y);
    const list = this.grid.get(k);
    if (list) list.push(i);
    else this.grid.set(k, [i]);
  }

  /** Tries to place a disc. Returns whether it fit. */
  tryAdd(x: number, y: number, r: number, slack = 1): boolean {
    if (!this.free(x, y, r, slack)) return false;
    this.add(x, y, r);
    return true;
  }
}
