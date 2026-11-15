import { hex, ramp } from '../core/color';
import { hash2, mulberry32 } from '../core/rng';
import { type V3, v3 } from '../core/vec';
import { FOLIAGE, type Ramp } from './palette';
import { blob, blobAlong, box } from './prims';
import type { SceneBuilder } from './scene';

/**
 * What the unicorns are fed in the stable: apples, sky berries and carrots, heaped in mangers and
 * bins, stacked in crates and loaded in the barrow. It is the same fruit as the farm grows, in the
 * same colours, so what a child picks in the garden is what they find waiting in the stalls.
 */

const tone = (base: string, shadowHue: number, lightHue: number): Ramp =>
  ramp(hex(base), { steps: 6, shadowHue, lightHue, lean: 1, lightness: [-0.32, -0.21, -0.1, 0, 0.09, 0.17] });

const APPLE = tone('#e8403f', 330, 50);
const BERRY = tone('#6fa8ff', 275, 190);
const CARROT = tone('#f2862b', 335, 60);
const CRATE_WOOD = tone('#b27c52', 320, 70);
const CRATE_PALE = tone('#d9b07a', 320, 80);
const DARK = tone('#6b4a36', 320, 60);

export type Feed = 'apple' | 'berry' | 'carrot';
/** How much of a heap is each kind. They add up to anything; only the shares matter. */
export type Mix = Readonly<Record<Feed, number>>;
export const APPLES: Mix = { apple: 1, berry: 0, carrot: 0 };
export const BERRIES: Mix = { apple: 0, berry: 1, carrot: 0 };
export const CARROTS: Mix = { apple: 0, berry: 0, carrot: 1 };
export const ORCHARD: Mix = { apple: 6, berry: 3, carrot: 2 };

/** Each kind's size in world units: apples and berries are balls, carrots are long and lie down. */
const SIZE: Record<Feed, V3> = { apple: v3(8.4, 8, 7.8), berry: v3(5.6, 5.4, 5.4), carrot: v3(4.2, 4.2, 15) };

interface Mats {
  fruit: Record<Feed, number>;
  tops: number;
  wood: number;
  slat: number;
  dark: number;
}
const cache = new WeakMap<SceneBuilder, Mats>();

/** One set of materials per scene, so a heap and a crate beside it share their colours. */
function mats(b: SceneBuilder): Mats {
  const known = cache.get(b);
  if (known) return known;
  const fruit = (name: string, r: Ramp): number =>
    b.solid(name, b.variant(name, r, { protect: true, priority: 2 }), (s) => (hash2(s.px, s.py, 6) - 0.5) * 0.06);
  const made: Mats = {
    fruit: { apple: fruit('apple', APPLE), berry: fruit('berry', BERRY), carrot: fruit('carrot', CARROT) },
    tops: b.solid('tops', b.variant('tops', FOLIAGE.lime, { protect: true, priority: 2 })),
    wood: b.solid('feed-wood', b.variant('feed-wood', CRATE_WOOD), (s) => (hash2(s.px >> 1, s.py, 4) - 0.5) * 0.12),
    slat: b.solid('feed-slat', b.variant('feed-slat', CRATE_PALE)),
    dark: b.solid('feed-dark', b.variant('feed-dark', DARK, { noLines: true })),
  };
  cache.set(b, made);
  return made;
}

const rotate = (x: number, y: number, yaw: number): [number, number] => [
  x * Math.cos(yaw) - y * Math.sin(yaw),
  x * Math.sin(yaw) + y * Math.cos(yaw),
];

export interface Heap {
  /** The middle of the heap's base. */
  at: V3;
  /** Half its width and depth. */
  rx: number;
  ry: number;
  /** How high the middle stands above the base. */
  h: number;
  count: number;
  mix: Mix;
  seed: number;
  yaw?: number;
  /** Carrots stand with their tops up, as they do in a crate, where otherwise they lie. */
  upright?: boolean;
}

/**
 * A mound of fruit: pieces scattered over an ellipse and lifted into a dome, so the middle is the
 * highest and nothing floats.
 */
export function heap(b: SceneBuilder, o: Heap): void {
  const m = mats(b);
  const rnd = mulberry32(o.seed);
  const yaw = o.yaw ?? 0;
  const kinds = (Object.keys(o.mix) as Feed[]).filter((k) => o.mix[k] > 0);
  const total = kinds.reduce((sum, k) => sum + o.mix[k], 0);
  const meshes = {
    apple: b.mesh(m.fruit.apple, { noLines: true }),
    berry: b.mesh(m.fruit.berry, { noLines: true }),
    carrot: b.mesh(m.fruit.carrot, { noLines: true }),
  };
  const tops = b.mesh(m.tops, { noLines: true });
  for (let i = 0; i < o.count; i++) {
    // A random spot in the ellipse, pulled outward a little so the rim is not bare.
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd());
    const u = Math.cos(a) * d,
      v = Math.sin(a) * d;
    let pick = rnd() * total;
    let kind = kinds[0]!;
    for (const k of kinds) {
      pick -= o.mix[k];
      if (pick <= 0) {
        kind = k;
        break;
      }
    }
    const [dx, dy] = rotate(u * o.rx, v * o.ry, yaw);
    const size = SIZE[kind];
    const c = v3(o.at[0] + dx, o.at[1] + dy, o.at[2] + size[2] * 0.6 + o.h * (1 - d * d));
    if (kind === 'carrot' && o.upright) {
      const up = v3(c[0], c[1], o.at[2] + 8 + o.h * (1 - d * d) * 0.5);
      blob(meshes.carrot, up, size, 0, { rings: 5, segs: 7 });
      blob(tops, v3(up[0], up[1], up[2] + 15), v3(3.4, 3.4, 5), rnd() * 3, { rings: 4, segs: 6 });
    } else if (kind === 'carrot') {
      const heading = rnd() * Math.PI * 2;
      const lean = 1.15 + rnd() * 0.3;
      // The long axis starts upright; tipping it about a horizontal axis lays it down pointing
      // along `dir`.
      blobAlong(meshes.carrot, c, size, v3(Math.cos(heading), Math.sin(heading), 0), lean, { rings: 5, segs: 7 });
      const dir = v3(Math.sin(heading) * Math.sin(lean), -Math.cos(heading) * Math.sin(lean), Math.cos(lean));
      blob(tops, v3(c[0] + dir[0] * 16, c[1] + dir[1] * 16, c[2] + dir[2] * 16), v3(3.6, 3.6, 3.2), heading, {
        rings: 4,
        segs: 6,
      });
    } else {
      blob(meshes[kind], c, size, rnd() * 3, { rings: 6, segs: 9 });
    }
  }
}

export interface FeedCrate {
  /** The middle of the crate's base. */
  at: V3;
  yaw?: number;
  kind: Feed;
  seed: number;
}

/** A wooden crate heaped with one kind, the same crate the farm stands in its yard. */
export function feedCrate(b: SceneBuilder, o: FeedCrate): void {
  const m = mats(b);
  const yaw = o.yaw ?? 0;
  const [w, d, h] = [74, 50, 28];
  const part = (x: number, y: number, z: number, sx: number, sy: number, sz: number, material = m.wood): void => {
    const [rx, ry] = rotate(x, y, yaw);
    box(b.mesh(material), v3(o.at[0] + rx, o.at[1] + ry, o.at[2] + z), v3(sx, sy, sz), yaw);
  };
  part(0, -d / 2 + 2, h / 2, w, 4, h);
  part(0, d / 2 - 2, h / 2, w, 4, h);
  for (const sx of [-1, 1]) part(sx * (w / 2 - 2), 0, h / 2, 4, d, h);
  part(0, 0, 2, w - 4, d - 4, 4);
  part(0, -d / 2 - 0.4, h * 0.5, w - 10, 1.6, 4, m.slat);
  part(0, 0, h - 5, w - 10, d - 10, 8, m.dark);
  heap(b, {
    at: v3(o.at[0], o.at[1], o.at[2] + h - 4),
    rx: w / 2 - 12,
    ry: d / 2 - 12,
    h: 11,
    upright: true,
    count: o.kind === 'berry' ? 44 : o.kind === 'carrot' ? 16 : 24,
    mix: { apple: 0, berry: 0, carrot: 0, [o.kind]: 1 },
    seed: o.seed,
    yaw,
  });
}
