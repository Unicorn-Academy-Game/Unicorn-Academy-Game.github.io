import type { Rng } from '../../domain/rng';

/**
 * The shapes a firework can make. Each is a set of points inside the unit circle: where one spark
 * should end up, how far along the shell's colours it is, and how long after the burst it lights.
 * The game turns a point into a spark with just the speed and drag that carry it there, so the
 * shape appears and holds as it grows, then falls.
 */

export const SHELL_KINDS = [
  'peony',
  'ring',
  'double-ring',
  'heart',
  'star',
  'butterfly',
  'flower',
  'smiley',
  'spiral',
  'crescent',
  'sun',
  'rainbow',
  'willow',
  'palm',
  'crackle',
] as const;
export type ShellKind = (typeof SHELL_KINDS)[number];

export interface Spark {
  /**
   * Where it ends up, with the shell's middle at 0, 0 and its edge at distance 1. y grows downward,
   * like the screen.
   */
  x: number;
  y: number;
  /** How far along the colours of the shell, from 0 to 1. */
  tone: number;
  /** Seconds after the burst before it lights, for shapes that draw themselves. */
  delay: number;
}

const TAU = Math.PI * 2;

const spark = (x: number, y: number, tone = 0, delay = 0): Spark => ({ x, y, tone, delay });

/**
 * Moves and scales points so their bounding box is centred on 0, 0 and the farthest is at distance
 * 1.
 */
function fit(points: Spark[]): Spark[] {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  let far = 0;
  for (const p of points) far = Math.max(far, Math.hypot(p.x - cx, p.y - cy));
  const k = far > 0 ? 1 / far : 1;
  for (const p of points) {
    p.x = (p.x - cx) * k;
    p.y = (p.y - cy) * k;
  }
  return points;
}

/** `n` points spread evenly along a closed or open polyline. */
function along(
  vertices: readonly (readonly [number, number])[],
  n: number,
  closed: boolean,
  tone: (u: number) => number = () => 0,
): Spark[] {
  const segs = closed ? vertices.length : vertices.length - 1;
  const lengths: number[] = [];
  let total = 0;
  for (let i = 0; i < segs; i++) {
    const a = vertices[i]!;
    const b = vertices[(i + 1) % vertices.length]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    lengths.push(len);
    total += len;
  }
  const out: Spark[] = [];
  // The points are asked for in order along the path, so one walk along it serves them all.
  let i = 0;
  let passed = 0;
  for (let k = 0; k < n; k++) {
    const u = closed ? k / n : n === 1 ? 0 : k / (n - 1);
    const at = u * total;
    while (i < segs - 1 && at > passed + lengths[i]!) {
      passed += lengths[i]!;
      i++;
    }
    const a = vertices[i]!;
    const b = vertices[(i + 1) % vertices.length]!;
    const f = lengths[i]! > 0 ? (at - passed) / lengths[i]! : 0;
    out.push(spark(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, tone(u)));
  }
  return out;
}

const arc = (
  cx: number,
  cy: number,
  r: number,
  from: number,
  to: number,
  n: number,
  tone: (u: number) => number = () => 0,
  delay: (u: number) => number = () => 0,
): Spark[] =>
  Array.from({ length: n }, (_, i) => {
    const u = n === 1 ? 0 : i / (n - 1);
    const a = from + (to - from) * u;
    return spark(cx + Math.cos(a) * r, cy + Math.sin(a) * r, tone(u), delay(u));
  });

type Path = readonly (readonly [number, number])[];
interface Part {
  readonly path: Path;
  readonly closed: boolean;
  readonly tone: number;
  readonly length: number;
}

/** Points along a cubic curve. */
function curve(
  p0: readonly [number, number],
  p1: readonly [number, number],
  p2: readonly [number, number],
  p3: readonly [number, number],
  steps = 24,
): [number, number][] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const u = 1 - t;
    const k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t] as const;
    return [
      k[0] * p0[0] + k[1] * p1[0] + k[2] * p2[0] + k[3] * p3[0],
      k[0] * p0[1] + k[1] * p1[1] + k[2] * p2[1] + k[3] * p3[1],
    ];
  });
}

const lengthOf = (path: Path): number =>
  path.reduce((sum, p, i) => (i === 0 ? 0 : sum + Math.hypot(p[0] - path[i - 1]![0], p[1] - path[i - 1]![1])), 0);

/** Shares `n` out in proportion to the weights, in whole numbers that add up to exactly `n`. */
function share(n: number, weights: readonly number[]): number[] {
  const total = weights.reduce((sum, w) => sum + w, 0);
  const exact = weights.map((w) => (n * w) / total);
  const counts = exact.map(Math.floor);
  const left = n - counts.reduce((sum, c) => sum + c, 0);
  const byRemainder = exact.map((e, i) => [e - Math.floor(e), i] as const).sort((a, b) => b[0] - a[0]);
  for (let k = 0; k < left; k++) counts[byRemainder[k % byRemainder.length]![1]]!++;
  return counts;
}

let butterflyMade: Part[] | null = null;

/** The butterfly as paths, with the right half mirrored onto the left. Made once. */
function butterflyParts(): readonly Part[] {
  if (butterflyMade) return butterflyMade;
  const upper: [number, number][] = [
    ...curve([0.04, -0.04], [0.2, -0.75], [0.55, -1], [0.85, -0.95]),
    ...curve([0.85, -0.95], [1.1, -0.9], [1.05, -0.35], [0.85, -0.15]),
    ...curve([0.85, -0.15], [0.65, 0.03], [0.3, 0.05], [0.04, 0.02]),
  ];
  const lower: [number, number][] = [
    ...curve([0.04, 0.04], [0.4, 0.1], [0.8, 0.25], [0.75, 0.62]),
    ...curve([0.75, 0.62], [0.7, 0.95], [0.3, 0.9], [0.12, 0.45]),
    ...curve([0.12, 0.45], [0.08, 0.3], [0.05, 0.15], [0.04, 0.04]),
  ];
  const spotAbove: [number, number][] = Array.from({ length: 24 }, (_, i) => [
    0.62 + Math.cos((i / 24) * TAU) * 0.14,
    -0.55 + Math.sin((i / 24) * TAU) * 0.14,
  ]);
  const spotBelow: [number, number][] = Array.from({ length: 20 }, (_, i) => [
    0.42 + Math.cos((i / 20) * TAU) * 0.09,
    0.47 + Math.sin((i / 20) * TAU) * 0.09,
  ]);
  const mirrored = (path: Path): [number, number][] => path.map(([x, y]) => [-x, y]);
  const wings: [Path, number][] = [
    [upper, 0],
    [lower, 0.4],
    [spotAbove, 1],
    [spotBelow, 1],
  ];
  const parts: Part[] = [];
  for (const [path, tone] of wings) {
    parts.push({ path, closed: true, tone, length: lengthOf(path) });
    parts.push({ path: mirrored(path), closed: true, tone, length: lengthOf(path) });
  }
  const body: Path = [
    [0, -0.32],
    [0, 0.55],
  ];
  const feeler: Path = curve([0, -0.32], [0.04, -0.5], [0.14, -0.62], [0.26, -0.7], 10);
  parts.push({ path: body, closed: false, tone: 0.7, length: lengthOf(body) });
  parts.push({ path: feeler, closed: false, tone: 0.7, length: lengthOf(feeler) });
  parts.push({ path: mirrored(feeler), closed: false, tone: 0.7, length: lengthOf(feeler) });
  butterflyMade = parts;
  return parts;
}

const makers: Record<ShellKind, (n: number, rng: Rng) => Spark[]> = {
  /**
   * A ball of light. Seen from the side, a ball's surface bunches toward its edge, which is what
   * makes it look round.
   */
  peony(n, rng) {
    // Points spread evenly over a ball by the golden angle, turned a random amount so no two bursts
    // are alike.
    const golden = Math.PI * (3 - Math.sqrt(5));
    const turn = rng.range(0, TAU);
    return Array.from({ length: n }, (_, i) => {
      const z = 1 - (2 * (i + 0.5)) / n;
      const a = turn + i * golden;
      const r = Math.sqrt(1 - z * z);
      return spark(Math.cos(a) * r, Math.sin(a) * r, rng.next());
    });
  },

  ring(n) {
    return arc(0, 0, 1, 0, TAU * (1 - 1 / n), n);
  },

  'double-ring'(n) {
    const outer = Math.ceil(n * 0.62);
    return [
      ...arc(0, 0, 1, 0, TAU * (1 - 1 / outer), outer, () => 0),
      ...arc(0, 0, 0.56, 0.3, 0.3 + TAU * (1 - 1 / (n - outer)), n - outer, () => 1),
    ];
  },

  heart(n) {
    const pts: Spark[] = [];
    const outline = Math.ceil(n * 0.78);
    for (let i = 0; i < outline; i++) {
      const t = (i / outline) * TAU;
      pts.push(
        spark(
          16 * Math.sin(t) ** 3,
          -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)),
          0,
        ),
      );
    }
    // A smaller heart inside, so it glows from the middle.
    for (let i = 0; i < n - outline; i++) {
      const t = (i / (n - outline)) * TAU;
      pts.push(
        spark(
          9 * Math.sin(t) ** 3,
          -(7.6 * Math.cos(t) - 2.9 * Math.cos(2 * t) - 1.2 * Math.cos(3 * t) - 0.6 * Math.cos(4 * t)) + 0.5,
          1,
        ),
      );
    }
    return fit(pts);
  },

  star(n) {
    const outline = Math.ceil(n * 0.8);
    const vertices: [number, number][] = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 === 0 ? 1 : 0.4;
      vertices.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    const inner: [number, number][] = vertices.map(([x, y]) => [x * 0.45, y * 0.45]);
    return fit([...along(vertices, outline, true, () => 0), ...along(inner, n - outline, true, () => 1)]);
  },

  /**
   * Two wings each side with a spot on each, a body, and two feelers: the butterfly a child draws.
   */
  butterfly(n) {
    const parts = butterflyParts();
    const counts = share(
      n,
      parts.map((part) => part.length),
    );
    const pts: Spark[] = [];
    parts.forEach((part, i) => {
      if (counts[i]! > 0) pts.push(...along(part.path, counts[i]!, part.closed, () => part.tone));
    });
    // It draws itself from the body outward.
    for (const p of pts) p.delay = Math.min(0.4, Math.hypot(p.x, p.y) * 0.3);
    return fit(pts);
  },

  /**
   * Five round petals around a middle, each drawn as an oval outline, so it reads as a flower and
   * not as a pinwheel.
   */
  flower(n) {
    const petals = 5;
    const middle = Math.max(6, Math.floor(n * 0.1));
    const per = Math.floor((n - middle) / petals);
    const pts: Spark[] = [];
    for (let k = 0; k < petals; k++) {
      // One petal points straight up, and the others are spaced evenly round.
      const phi = (k / petals) * TAU - Math.PI / 2;
      const ox = Math.cos(phi) * 0.55;
      const oy = Math.sin(phi) * 0.55;
      for (let i = 0; i < per; i++) {
        const a = (i / per) * TAU;
        const along = Math.cos(a) * 0.36;
        const across = Math.sin(a) * 0.26;
        pts.push(
          spark(
            ox + along * Math.cos(phi) - across * Math.sin(phi),
            oy + along * Math.sin(phi) + across * Math.cos(phi),
            0.05,
          ),
        );
      }
    }
    // A bright middle, which takes what the petals leave.
    const rest = n - per * petals;
    for (let i = 0; i < rest; i++) {
      const a = (i / rest) * TAU;
      pts.push(spark(Math.cos(a) * 0.15, Math.sin(a) * 0.15, 1));
    }
    return fit(pts);
  },

  smiley(n) {
    const face = Math.ceil(n * 0.5);
    const eye = Math.max(2, Math.floor(n * 0.07));
    const mouth = n - face - eye * 2;
    return [
      ...arc(0, 0, 1, 0, TAU * (1 - 1 / face), face, () => 0),
      ...arc(-0.36, -0.28, 0.07, 0, TAU * (1 - 1 / eye), eye, () => 1),
      ...arc(0.36, -0.28, 0.07, 0, TAU * (1 - 1 / eye), eye, () => 1),
      ...arc(0, 0.02, 0.6, 0.45, Math.PI - 0.45, mouth, () => 0.5),
    ];
  },

  spiral(n) {
    const half = Math.ceil(n / 2);
    const arm = (offset: number, count: number): Spark[] =>
      Array.from({ length: count }, (_, i) => {
        const u = count === 1 ? 0 : i / (count - 1);
        const a = offset + u * Math.PI * 3.2;
        const r = 0.12 + u * 0.88;
        // It draws itself outward: the middle lights first.
        return spark(Math.cos(a) * r, Math.sin(a) * r, u, u * 0.5);
      });
    return [...arm(0, half), ...arm(Math.PI, n - half)];
  },

  /** The moon: the edge of a big circle, and the edge of a smaller one that bites into it. */
  crescent(n) {
    const outer = Math.ceil(n * 0.58);
    const R = 1;
    const d = 0.5;
    const r = 0.8;
    // Where the two circles cross, as an angle round each of them.
    const ix = (R * R - r * r + d * d) / (2 * d);
    const iy = Math.sqrt(Math.max(0, R * R - ix * ix));
    const a = Math.atan2(iy, ix);
    const b = Math.atan2(iy, ix - d);
    const out = arc(0, 0, R, a, TAU - a, outer, () => 0);
    const inn = arc(d, 0, r, b, TAU - b, n - outer, () => 1);
    return fit([...out, ...inn]);
  },

  sun(n) {
    const ring = Math.ceil(n * 0.4);
    const rays = 12;
    const perRay = Math.max(2, Math.floor((n - ring) / rays));
    const pts = arc(0, 0, 0.5, 0, TAU * (1 - 1 / ring), ring, () => 0);
    for (let k = 0; k < rays; k++) {
      const a = (k / rays) * TAU;
      for (let j = 0; j < perRay; j++) {
        const r = 0.72 + (0.28 * j) / Math.max(1, perRay - 1);
        pts.push(spark(Math.cos(a) * r, Math.sin(a) * r, 1, 0.1 + 0.05 * j));
      }
    }
    return pts;
  },

  /** Arcs of a rainbow, from one side of the sky to the other, each band its own colour. */
  rainbow(n) {
    const bands = 6;
    const per = Math.ceil(n / bands);
    const pts: Spark[] = [];
    for (let b = 0; b < bands; b++) {
      pts.push(
        ...arc(
          0,
          0.45,
          1 - b * 0.15,
          Math.PI,
          TAU,
          per,
          () => b / (bands - 1),
          (u) => u * 0.25,
        ),
      );
    }
    return fit(pts.slice(0, n));
  },

  /** Long, slow, golden threads that droop like a willow tree. */
  willow(n, rng) {
    return Array.from({ length: n }, (_, i) => {
      const a = ((i + rng.range(-0.3, 0.3)) / n) * TAU;
      const r = rng.range(0.62, 1);
      return spark(Math.cos(a) * r, Math.sin(a) * r, rng.next() * 0.4);
    });
  },
  palm(n, rng) {
    const arms = 7;
    const per = Math.ceil(n / arms);
    const pts: Spark[] = [];
    for (let k = 0; k < arms; k++) {
      const a = (k / arms) * TAU + rng.range(-0.12, 0.12);
      for (let j = 0; j < per; j++) {
        const u = per === 1 ? 1 : j / (per - 1);
        const r = 0.3 + 0.7 * u;
        const side = rng.range(-0.05, 0.05);
        const x = Math.cos(a) * r - Math.sin(a) * side;
        const y = Math.sin(a) * r + Math.cos(a) * side;
        // A little off the arm, but never past the edge of the shell.
        const reach = Math.max(1, Math.hypot(x, y));
        pts.push(spark(x / reach, y / reach, u, u * 0.18));
      }
    }
    return pts.slice(0, n);
  },

  crackle(n, rng) {
    return Array.from({ length: n }, () => {
      const a = rng.range(0, TAU);
      const r = Math.sqrt(rng.next());
      return spark(Math.cos(a) * r, Math.sin(a) * r, rng.next());
    });
  },
};

/** The fewest points a shell is made of. Fewer would not read as its shape. */
export const MIN_SPARKS = 24;

/** About `n` points in the shape of a shell: shapes made of rays and bands round to whole ones. */
export function shell(kind: ShellKind, n: number, rng: Rng): Spark[] {
  return makers[kind](Math.max(MIN_SPARKS, Math.round(n)), rng);
}
