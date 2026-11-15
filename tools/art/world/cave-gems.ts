import { fromOklch, type RGB } from '../core/color';
import type { Rgba } from '../core/image';
import { type Mesh, newMesh } from '../core/mesh';
import { mulberry32 } from '../core/rng';
import { TAU, type V3, v3 } from '../core/vec';
import { flatFacets } from './gems';
import { Painter } from './paint';
import type { Ramp } from './palette';
import { blob } from './prims';
import { renderScene, SceneBuilder } from './scene';

/**
 * The gems and crystals of the cave. A crystal is a prism of flat sides that ends in a point, and a
 * cluster is a few of them standing out of a knob of rock, so every face catches the light on its
 * own. The colours come from one hue each, so the stones of one kind are one family, and the white
 * ramp is the one a prism takes any colour from when it is tinted.
 */

/**
 * Dark to light, five steps: a saturated shade, the body of the stone, a bright face, a pale face
 * and the shine.
 */
export function jewel(hue: number, chroma = 0.19): Ramp {
  const L = [0.34, 0.5, 0.64, 0.78, 0.92];
  const C = [0.62, 1, 1, 0.72, 0.2];
  const H = [-16, -7, 0, 7, 14];
  return L.map((l, i) => fromOklch(l, chroma * C[i]!, hue + H[i]!));
}

/** The hues of the stones that are one colour, by their name. */
export const STONE_HUE = {
  ruby: 15,
  topaz: 62,
  emerald: 152,
  sapphire: 258,
  amethyst: 305,
  diamond: 245,
  opal: 340,
  jade: 172,
  rose: 355,
} as const;
export type StoneName = keyof typeof STONE_HUE;

/**
 * The white a prism is drawn in when it is to be tinted: shades of a cool grey that every colour
 * can multiply.
 */
export const PRISM: Ramp = [
  [104, 100, 156],
  [146, 142, 200],
  [190, 188, 230],
  [228, 228, 250],
  [255, 255, 255],
];

/** Dark violet rock, the knob a cluster stands out of. */
export const KNOB: Ramp = [
  [26, 20, 48],
  [42, 34, 74],
  [60, 50, 100],
  [84, 72, 128],
  [110, 98, 154],
  [138, 126, 180],
];

export interface PrismOpts {
  /** Radius of the foot. */
  r: number;
  /** Height of the point above the base. */
  h: number;
  /** Share of the height taken by the point. */
  tip?: number;
  /** How far the point has leaned from the foot, per unit of height, along x and y. */
  lean?: readonly [number, number];
  /** Turn about the upright, in radians. */
  yaw?: number;
  sides?: number;
  /** Radius at the shoulder as a share of the foot's. */
  taper?: number;
}

/**
 * One crystal: a prism of flat sides that narrows a little and ends in a point. `base` is the
 * middle of its foot.
 */
export function prism(mesh: Mesh, base: V3, o: PrismOpts): void {
  const n = o.sides ?? 6;
  const yaw = o.yaw ?? 0;
  const [lx, ly] = o.lean ?? [0, 0];
  const shoulder = o.h * (1 - (o.tip ?? 0.28));
  const taper = o.taper ?? 0.86;
  const ring = (z: number, rad: number): V3[] =>
    Array.from({ length: n }, (_, i) =>
      v3(
        base[0] + Math.cos((i / n) * TAU + yaw) * rad + lx * z,
        base[1] + Math.sin((i / n) * TAU + yaw) * rad + ly * z,
        base[2] + z,
      ),
    );
  const foot = ring(0, o.r);
  const top = ring(shoulder, o.r * taper);
  const apex = v3(base[0] + lx * o.h, base[1] + ly * o.h, base[2] + o.h);
  const axis = v3(base[0] + lx * shoulder * 0.5, base[1] + ly * shoulder * 0.5, base[2] + shoulder * 0.5);
  const tris: [V3, V3, V3][] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    tris.push([foot[i]!, foot[j]!, top[i]!], [foot[j]!, top[j]!, top[i]!], [top[i]!, top[j]!, apex]);
  }
  flatFacets(mesh, tris, axis);
}

export interface ClusterOpts {
  seed: number;
  /** The crystals' colours. */
  stone: Ramp;
  /**
   * When there is more than one, the crystals take them in turn, so one cluster shines in several
   * colours.
   */
  stones?: readonly Ramp[];
  /** How big the whole cluster is. 1 is the middle size. */
  scale?: number;
  /** How many crystals stand out of the rock besides the tall one in the middle. */
  crowd?: number;
  /** Height of the tallest crystal at scale 1. */
  tall?: number;
  /**
   * What to draw. A cluster the game tints is two pictures, the rock that stays as it is and the
   * crystals that take the colour. Default both.
   */
  parts?: 'both' | 'rock' | 'crystals';
  /** Share of the cluster that leans outward. */
  spread?: number;
}

/**
 * The knob of rock the crystals stand out of: a lumpy heap of a few rounded stones, so it does not
 * read as a plate.
 */
function knob(mesh: Mesh, rng: () => number, k: number): void {
  blob(mesh, v3(0, 2 * k, 5 * k), v3(34 * k, 24 * k, 11 * k), 0.2, { rings: 7, segs: 11 });
  const stones = 4;
  for (let i = 0; i < stones; i++) {
    const a = (i / stones) * TAU + rng() * 0.8;
    const d = (20 + rng() * 9) * k;
    const r = (9 + rng() * 7) * k;
    blob(mesh, v3(Math.cos(a) * d, Math.sin(a) * d * 0.72, r * 0.45), v3(r * 1.15, r * 0.9, r * 0.8), rng() * 3, {
      rings: 5,
      segs: 8,
    });
  }
}

export const CLUSTER_CANVAS = { w: 160, h: 160, ox: 80, oy: 128 } as const;

/**
 * Crystals standing out of a knob of rock: one tall in the middle and a crowd of shorter ones
 * leaning away from it.
 */
export function cluster(o: ClusterOpts): SceneBuilder {
  const b = new SceneBuilder();
  const k = o.scale ?? 1;
  const rng = mulberry32(o.seed);
  const mats = (o.stones ?? [o.stone]).map((r, i) =>
    b.solid(`stone${i}`, b.variant(`stone${i}`, r, { bands: [0.16, 0.4, 0.64, 0.86], outlineLit: r[1]! })),
  );
  const rock = b.solid('rock', b.variant('rock', KNOB, { bands: [0.15, 0.32, 0.52, 0.74, 0.9] }));
  const parts = o.parts ?? 'both';
  // The rock is always worked out, so that the crystals stand in the same places whether or not it
  // is drawn.
  knob(parts === 'crystals' ? newMesh(0, 0) : b.mesh(rock), rng, k);
  if (parts === 'rock') return b;
  const crowd = o.crowd ?? 5;
  const meshes = mats.map((mat) => b.mesh(mat));
  const tall = (o.tall ?? 74) * k;
  // The ones behind first, so a crystal in front is drawn over the one it stands before.
  const pieces: { x: number; y: number; r: number; h: number; lx: number; ly: number; yaw: number }[] = [];
  pieces.push({ x: 0, y: -2 * k, r: 13 * k, h: tall, lx: (rng() - 0.5) * 0.08, ly: (rng() - 0.5) * 0.06, yaw: rng() });
  for (let i = 0; i < crowd; i++) {
    const a = (i / crowd) * TAU + rng() * 0.6 + 0.3;
    const d = (13 + rng() * 14) * k;
    const x = Math.cos(a) * d,
      y = Math.sin(a) * d * 0.7;
    const spread = o.spread ?? 0.34;
    pieces.push({
      x,
      y,
      r: (7.5 + rng() * 5) * k,
      h: tall * (0.34 + rng() * 0.38),
      lx: Math.cos(a) * spread * (0.6 + rng() * 0.6),
      ly: Math.sin(a) * spread * 0.7 * (0.6 + rng() * 0.6),
      yaw: rng() * 2,
    });
  }
  pieces.sort((p, q) => p.y - q.y);
  pieces.forEach((p, i) => {
    prism(meshes[i % meshes.length]!, v3(p.x, p.y, 8 * k), { r: p.r, h: p.h, lean: [p.lx, p.ly], yaw: p.yaw });
  });
  return b;
}

/** A small four-point glint, the kind that makes a cut stone look cut. */
export function sparkle(img: Rgba, x: number, y: number, size: number, color: RGB = [255, 255, 255]): void {
  const p = new Painter(img);
  p.px(x, y, color);
  for (let k = 1; k <= size; k++)
    for (const [dx, dy] of [
      [k, 0],
      [-k, 0],
      [0, k],
      [0, -k],
    ] as const)
      p.over(x + dx, y + dy, color, k === size ? 0.45 : 0.9);
}

export function renderCluster(
  o: ClusterOpts,
  canvas: { w: number; h: number; ox: number; oy: number } = CLUSTER_CANVAS,
): { rgba: Rgba; at: (p: V3) => [number, number] } {
  const r = renderScene(cluster(o), {
    width: canvas.w,
    height: canvas.h,
    originX: canvas.ox,
    originY: canvas.oy,
    ss: 4,
    aoRadius: 8,
    lineDepth: 5,
  });
  return { rgba: r.rgba, at: r.at };
}

/**
 * The stones the cave gives, in the order the basket lists them. They are the cut gems of the
 * treasure house, so a stone she gathers is a stone she has seen.
 */
export const GEM_STONES = [
  'ruby',
  'topaz',
  'emerald',
  'sapphire',
  'amethyst',
  'diamond',
  'opal',
  'jade',
  'onyx',
] as const;
export type GemStone = (typeof GEM_STONES)[number];

/** A pale pearly ramp of one hue, for the stone that shines in every colour at once. */
const pastel = (hue: number): Ramp =>
  [0.6, 0.72, 0.82, 0.91, 0.98].map((l, i) =>
    fromOklch(l, 0.085 * [0.9, 1, 1, 0.8, 0.3][i]!, hue + [-10, -4, 0, 5, 10][i]!),
  );

const ICE: Ramp = [
  [142, 158, 204],
  [188, 206, 240],
  [222, 236, 254],
  [244, 250, 255],
  [255, 255, 255],
];
const ONYX: Ramp = [
  [8, 6, 16],
  [22, 18, 36],
  [44, 38, 66],
  [78, 70, 110],
  [156, 146, 192],
];
const OPAL: readonly Ramp[] = [pastel(350), pastel(160), pastel(280), pastel(70), pastel(210)];

/**
 * One of two clusters of a stone, a big one and a small one, so a row of them does not look
 * stamped.
 */
export function gemCluster(stone: GemStone, variant: 0 | 1): ClusterOpts {
  const base = {
    seed: 21 + GEM_STONES.indexOf(stone) * 7 + variant * 4,
    scale: variant === 0 ? 1.25 : 1,
    crowd: variant === 0 ? 5 : 4,
  };
  switch (stone) {
    case 'diamond':
      return { ...base, stone: ICE };
    case 'opal':
      return { ...base, stone: OPAL[0]!, stones: OPAL };
    case 'onyx':
      return { ...base, stone: ONYX };
    case 'jade':
      return { ...base, stone: jewel(STONE_HUE.jade, 0.11) };
    default:
      return { ...base, stone: jewel(STONE_HUE[stone]) };
  }
}

/**
 * The rainbow stone's cluster: every crystal is a colour of its own, and from one frame to the next
 * each takes the colour of the next, so the whole cluster shimmers round the rainbow.
 */
export const RAINBOW_CLUSTER_FRAMES = 8;
const RAINBOW_HUES = [20, 82, 150, 215, 275, 335] as const;

export function rainbowCluster(frame: number): ClusterOpts {
  const turn = (360 / RAINBOW_CLUSTER_FRAMES) * (frame % RAINBOW_CLUSTER_FRAMES);
  const stones = RAINBOW_HUES.map((hue) => jewel(hue + turn, 0.2));
  return { seed: 77, scale: 1.25, crowd: 5, stone: stones[0]!, stones };
}
