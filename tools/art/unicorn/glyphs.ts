import type { V3 } from '../core/vec';
import type { Side } from './markings';
import { COAT_PARTS, PART } from './parts';
import type { Decal } from './spec';

/** A point in the side-view plane of the unposed model: x forward, z up. */
export type P2 = readonly [x: number, z: number];

/**
 * A stroked path. Widths are world units (one unit is one art pixel) and taper linearly along the
 * path.
 */
export interface Stroke {
  kind: 'stroke';
  pts: readonly P2[];
  w0: number;
  w1: number;
}

/** A filled polygon. */
export interface Fill {
  kind: 'fill';
  poly: readonly P2[];
}

export type Shape = Stroke | Fill;

export interface Placement {
  x: number;
  z: number;
  /** Radius of the canonical unit glyph, in world units. */
  size: number;
  /** Counter-clockwise rotation in the x/z plane, radians. */
  rot?: number;
  /** Mirror the glyph front to back before rotating. */
  flip?: boolean;
}

export const stroke = (pts: readonly P2[], w0: number, w1 = w0): Stroke => ({ kind: 'stroke', pts, w0, w1 });
const fill = (poly: readonly P2[]): Fill => ({ kind: 'fill', poly });

/** Catmull-Rom spline through the control points, sampled `per` times per span. */
export function curve(ctrl: readonly P2[], per = 8): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)]!,
      p1 = ctrl[i]!,
      p2 = ctrl[i + 1]!,
      p3 = ctrl[Math.min(ctrl.length - 1, i + 2)]!;
    for (let k = 0; k < per; k++) {
      const t = k / per,
        t2 = t * t,
        t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number): number =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(ctrl[ctrl.length - 1]!);
  return out;
}

/** A leaf blade from `a` to `b`, widest `width` in the middle, with a slight bend. */
export function leaf(a: P2, b: P2, width: number, bend = 0): Fill {
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  const n = Math.hypot(dx, dz) || 1;
  const nx = -dz / n,
    nz = dx / n;
  const left: P2[] = [],
    right: P2[] = [];
  const steps = 9;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const half = (width / 2) * Math.sin(Math.PI * t ** 0.85);
    const off = bend * Math.sin(Math.PI * t);
    const cx = a[0] + dx * t + nx * off,
      cz = a[1] + dz * t + nz * off;
    left.push([cx + nx * half, cz + nz * half]);
    right.push([cx - nx * half, cz - nz * half]);
  }
  return fill([...left, ...right.reverse()]);
}

/**
 * A variable-width ribbon along a centerline. `width(t)` is the full width at arc fraction t, in
 * glyph units.
 */
export function ribbon(center: readonly P2[], width: (t: number) => number): Fill {
  const cum = [0];
  for (let i = 1; i < center.length; i++)
    cum.push(cum[i - 1]! + Math.hypot(center[i]![0] - center[i - 1]![0], center[i]![1] - center[i - 1]![1]));
  const total = cum[cum.length - 1] || 1;
  const left: P2[] = [],
    right: P2[] = [];
  for (let i = 0; i < center.length; i++) {
    const a = center[Math.max(0, i - 1)]!,
      b = center[Math.min(center.length - 1, i + 1)]!;
    const dx = b[0] - a[0],
      dz = b[1] - a[1];
    const n = Math.hypot(dx, dz) || 1;
    const half = width(cum[i]! / total) / 2;
    const p = center[i]!;
    left.push([p[0] - (dz / n) * half, p[1] + (dx / n) * half]);
    right.push([p[0] + (dz / n) * half, p[1] - (dx / n) * half]);
  }
  return fill([...left, ...right.reverse()]);
}

/** Width profile that is pointed at both ends and fullest near `peak`. */
export const lens =
  (max: number, peak = 0.4) =>
  (t: number): number =>
    max * Math.sin(Math.PI * t ** (Math.log(0.5) / Math.log(peak))) ** 0.85;

/** Archimedean spiral from the center outward. */
export function spiral(
  cx: number,
  cz: number,
  r0: number,
  r1: number,
  turns: number,
  start: number,
  dir: 1 | -1 = 1,
  per = 14,
): P2[] {
  const pts: P2[] = [];
  const n = Math.max(2, Math.ceil(turns * per));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = start + dir * turns * Math.PI * 2 * t;
    const r = r0 + (r1 - r0) * t;
    pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return pts;
}

/**
 * Moves a canonical glyph (radius 1, centered on the origin) into model space. Widths stay
 * absolute.
 */
export function place(shapes: readonly Shape[], at: Placement): Shape[] {
  const c = Math.cos(at.rot ?? 0),
    s = Math.sin(at.rot ?? 0),
    k = at.size;
  const map = (p: P2): P2 => {
    const px = (at.flip ? -p[0] : p[0]) * k,
      pz = p[1] * k;
    return [at.x + px * c - pz * s, at.z + px * s + pz * c];
  };
  return shapes.map((sh) =>
    sh.kind === 'stroke' ? { ...sh, pts: sh.pts.map(map) } : { ...sh, poly: sh.poly.map(map) },
  );
}

interface Compiled {
  strokes: { pts: readonly P2[]; cum: number[]; total: number; w0: number; w1: number }[];
  fills: readonly (readonly P2[])[];
  box: [number, number, number, number];
}

function compile(shapes: readonly Shape[]): Compiled {
  let x0 = Infinity,
    x1 = -Infinity,
    z0 = Infinity,
    z1 = -Infinity;
  const grow = (p: P2, pad: number): void => {
    x0 = Math.min(x0, p[0] - pad);
    x1 = Math.max(x1, p[0] + pad);
    z0 = Math.min(z0, p[1] - pad);
    z1 = Math.max(z1, p[1] + pad);
  };
  const strokes: Compiled['strokes'] = [];
  const fills: P2[][] = [];
  for (const sh of shapes) {
    if (sh.kind === 'fill') {
      fills.push([...sh.poly]);
      for (const p of sh.poly) grow(p, 0.5);
    } else {
      const cum = [0];
      for (let i = 1; i < sh.pts.length; i++)
        cum.push(cum[i - 1]! + Math.hypot(sh.pts[i]![0] - sh.pts[i - 1]![0], sh.pts[i]![1] - sh.pts[i - 1]![1]));
      strokes.push({ pts: sh.pts, cum, total: cum[cum.length - 1] || 1, w0: sh.w0, w1: sh.w1 });
      for (const p of sh.pts) grow(p, Math.max(sh.w0, sh.w1) / 2 + 0.5);
    }
  }
  return { strokes, fills, box: [x0, x1, z0, z1] };
}

function inside(c: Compiled, x: number, z: number): boolean {
  if (x < c.box[0] || x > c.box[1] || z < c.box[2] || z > c.box[3]) return false;
  for (const st of c.strokes) {
    for (let i = 1; i < st.pts.length; i++) {
      const a = st.pts[i - 1]!,
        b = st.pts[i]!;
      const ex = b[0] - a[0],
        ez = b[1] - a[1];
      const l2 = ex * ex + ez * ez;
      const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / l2));
      const d = Math.hypot(x - (a[0] + ex * t), z - (a[1] + ez * t));
      const along = (st.cum[i - 1]! + Math.sqrt(l2) * t) / st.total;
      if (d <= (st.w0 + (st.w1 - st.w0) * along) / 2) return true;
    }
  }
  for (const poly of c.fills) {
    let odd = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i]!,
        b = poly[j]!;
      if (a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) odd = !odd;
    }
    if (odd) return true;
  }
  return false;
}

/**
 * A flank decal made of strokes and fills in the side-view plane. Painted on one side of the
 * unicorn only.
 */
export function glyph(
  paint: string,
  side: Side,
  shapes: readonly Shape[],
  parts: readonly number[] = COAT_PARTS,
): Decal {
  const c = compile(shapes);
  return {
    paint,
    test: (r: V3, part: number) =>
      Math.sign(r[1]) === side && Math.abs(r[1]) > 3 && parts.includes(part) && inside(c, r[0], r[2]),
  };
}

/**
 * A round spot centered on the chest's front, where it is seen from the front and, partly, from
 * both sides.
 */
export function chestSpot(paint: string, z: number, radius: number): Decal {
  return {
    paint,
    test: (r: V3, part: number) => part === PART.body && r[0] > 26 && Math.hypot(r[1] * 1.15, r[2] - z) < radius,
  };
}

const triangle = (t: number): number => Math.abs((((t % 2) + 2) % 2) - 1);

/** Pale feathering on the lower legs with a ragged top edge. */
export function socks(paint: string, height: number, jag: number): Decal {
  const legs: readonly number[] = [PART.foreL, PART.foreR, PART.hindL, PART.hindR];
  return {
    paint,
    test: (r: V3, part: number) =>
      legs.includes(part) && r[2] < height + jag * (triangle((r[0] + r[1] * 1.3) / 2.4) - 0.5),
  };
}

/** A horizontal band around a lower leg. */
export function legBand(paint: string, parts: readonly number[], z0: number, z1: number): Decal {
  return { paint, test: (r: V3, part: number) => parts.includes(part) && r[2] > z0 && r[2] < z1 };
}

// Canonical motifs. Radius 1, centered on the origin, up is +z. Line widths are given in world
// units.

/** Six-armed snowflake with two pairs of side branches per arm. */
export function snowflake(line: number): Shape[] {
  const out: Shape[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 + Math.PI / 6;
    const dx = Math.cos(a),
      dz = Math.sin(a);
    out.push(
      stroke(
        [
          [0, 0],
          [dx, dz],
        ],
        line,
      ),
    );
    for (const [t, len] of [
      [0.44, 0.34],
      [0.72, 0.22],
    ] as const) {
      const bx = dx * t,
        bz = dz * t;
      for (const sgn of [-1, 1]) {
        const ba = a + sgn * 0.9;
        out.push(
          stroke(
            [
              [bx, bz],
              [bx + Math.cos(ba) * len, bz + Math.sin(ba) * len],
            ],
            line * 0.9,
          ),
        );
      }
    }
  }
  return out;
}

/** A small, simple six-point flake for accents. */
export function flake(line: number): Shape[] {
  const out: Shape[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 + Math.PI / 6;
    out.push(
      stroke(
        [
          [0, 0],
          [Math.cos(a), Math.sin(a)],
        ],
        line,
      ),
    );
  }
  return out;
}

/**
 * A rising wave that curls over at the top, with a ripple line beside it. `line` is the ripple
 * width in world units.
 */
export function wave(line: number): Shape[] {
  const crest = curve(
    [
      [0.22, -1],
      [0.3, -0.45],
      [0.1, 0.15],
      [-0.28, 0.62],
      [-0.78, 0.64],
      [-0.94, 0.22],
      [-0.66, -0.04],
      [-0.4, 0.2],
    ],
    9,
  );
  return [
    ribbon(crest, lens(0.44, 0.35)),
    stroke(
      curve(
        [
          [0.7, -0.9],
          [0.68, -0.3],
          [0.5, 0.25],
          [0.2, 0.68],
          [-0.1, 0.86],
        ],
        8,
      ),
      line,
      line * 0.5,
    ),
    stroke(
      curve(
        [
          [-0.2, -0.95],
          [-0.12, -0.55],
        ],
        4,
      ),
      line * 0.9,
      line * 0.5,
    ),
  ];
}

/** Two nested scrolls, like breaking surf seen from the side. */
export function scroll(line: number): Shape[] {
  const swash = curve([
    [-0.95, -0.55],
    [-0.5, -0.8],
    [0.15, -0.72],
    [0.75, -0.3],
    [0.88, 0.1],
  ]);
  return [
    stroke(spiral(0.05, 0.1, 0.12, 0.62, 1.45, Math.PI * 0.2, 1), line, line * 0.8),
    stroke([...swash, [0.8, 0.45]], line, line * 0.6),
    stroke(spiral(-0.15, -0.05, 0.08, 0.3, 1.2, Math.PI * 1.1, -1), line * 0.85),
  ];
}

/** A fan of leaf blades on a curved stem. */
export function leafFan(line: number): Shape[] {
  const stem = curve([
    [-0.1, -1],
    [-0.05, -0.45],
    [0.1, 0.1],
    [0.3, 0.55],
  ]);
  return [
    stroke(stem, line * 1.1, line * 0.7),
    leaf([0.1, 0.0], [0.9, 0.38], 0.5, 0.06),
    leaf([0.05, 0.1], [0.55, 0.95], 0.46, -0.05),
    leaf([-0.04, -0.2], [-0.72, 0.28], 0.46, 0.05),
    leaf([0.0, -0.45], [0.62, -0.05], 0.4, -0.04),
    leaf([-0.08, -0.62], [-0.62, -0.2], 0.4, 0.04),
    leaf([0.28, 0.5], [0.34, 1.05], 0.36),
  ];
}

/** A curling vine with alternating leaves. */
export function vine(line: number): Shape[] {
  const stem = curve([
    [-0.95, -0.35],
    [-0.45, -0.55],
    [0.15, -0.3],
    [0.55, 0.15],
    [0.45, 0.6],
    [0.05, 0.62],
    [-0.05, 0.3],
  ]);
  return [
    stroke(stem, line, line * 0.7),
    leaf([-0.55, -0.5], [-0.8, 0.05], 0.38, 0.05),
    leaf([-0.15, -0.42], [-0.05, -0.98], 0.38, -0.05),
    leaf([0.3, -0.12], [0.85, -0.38], 0.4),
    leaf([0.55, 0.15], [1.0, 0.55], 0.38, 0.04),
    leaf([0.45, 0.6], [0.45, 1.1], 0.36),
  ];
}

/**
 * Flame tongues of different heights that lean together. `width` is the widest tongue in glyph
 * units.
 */
export function flames(width: number): Shape[] {
  const tongue = (x0: number, h: number, lean: number, w: number): Fill =>
    ribbon(
      curve(
        [
          [x0, -1],
          [x0 + lean * 0.1, -1 + h * 0.35],
          [x0 - lean * 0.3, -1 + h * 0.7],
          [x0 + lean, -1 + h],
        ],
        8,
      ),
      lens(w, 0.25),
    );
  return [tongue(-0.5, 1.25, 0.4, width * 0.8), tongue(0, 1.9, -0.22, width), tongue(0.5, 1.4, -0.42, width * 0.8)];
}

/** A single flame for accents. */
export function flame(width = 0.7): Shape[] {
  return [
    ribbon(
      curve(
        [
          [0, -1],
          [0.18, -0.35],
          [-0.16, 0.35],
          [0.12, 1],
        ],
        8,
      ),
      lens(width, 0.3),
    ),
  ];
}

/** A lightning vein: a jagged main line that thins out, with two forks. */
export function bolt(line: number): Shape[] {
  const main = stroke(
    [
      [0.3, 1],
      [-0.2, 0.55],
      [0.1, 0.42],
      [-0.34, -0.05],
      [0.0, -0.12],
      [-0.3, -0.58],
      [-0.08, -0.62],
      [-0.34, -1],
    ],
    line * 1.15,
    line * 0.35,
  );
  const fork = stroke(
    [
      [0.1, 0.42],
      [0.55, 0.2],
      [0.38, 0.1],
      [0.74, -0.2],
    ],
    line * 0.9,
    line * 0.35,
  );
  const spur = stroke(
    [
      [-0.34, -0.05],
      [-0.7, -0.12],
      [-0.6, -0.26],
    ],
    line * 0.8,
    line * 0.3,
  );
  return [main, fork, spur];
}
