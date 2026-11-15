import { fromOklch, type RGB } from '../core/color';
import type { Rgba } from '../core/image';
import { hash2, mulberry32 } from '../core/rng';
import { TAU, type V3, v3 } from '../core/vec';
import { KNOB, sparkle } from './cave-gems';
import { mushrooms } from './flora';
import { underGlow } from './glow';
import type { Ramp } from './palette';
import { blob, ribbon, tube } from './prims';
import { renderScene, SceneBuilder } from './scene';

/**
 * What grows in the dark: mushrooms and ferns that shine by themselves, and the beds a witch would
 * keep, whose flowers open in the glow of her own light. Every plant here gives off a little colour
 * of its own, so a cave of them is lit from the ground up.
 */

/**
 * Dark to bright, five steps, kept light so a plant looks lit from within and not only from above.
 */
export function glow(hue: number, chroma = 0.15): Ramp {
  const L = [0.42, 0.58, 0.72, 0.85, 0.96];
  const C = [0.7, 1, 1, 0.7, 0.2];
  const H = [-12, -4, 0, 6, 12];
  return L.map((l, i) => fromOklch(l, chroma * C[i]!, hue + H[i]!));
}

export const GLOW_HUE = { cyan: 195, rose: 352, gold: 82, lilac: 300, mint: 160 } as const;
export type GlowName = keyof typeof GLOW_HUE;

const colourOf = (hue: number): RGB => fromOklch(0.82, 0.14, hue);

interface Canvas {
  w: number;
  h: number;
  ox: number;
  oy: number;
}
export const FLORA_CANVAS: Canvas = { w: 150, h: 130, ox: 75, oy: 104 };

const draw = (b: SceneBuilder, c: Canvas): { rgba: Rgba; at: (p: V3) => [number, number] } => {
  const r = renderScene(b, { width: c.w, height: c.h, originX: c.ox, originY: c.oy, ss: 4, aoRadius: 7, lineDepth: 5 });
  return { rgba: r.rgba, at: r.at };
};

/** How much a light that breathes shines at a frame: 0 to 1, so the loop is exact. */
const breath = (frame: number, frames: number): number => 0.5 + 0.5 * Math.sin((frame / frames) * TAU);

/**
 * A clump of glowing mushrooms. Each frame the glow under it swells and fades, so the loop is a
 * slow breath.
 */
export function renderMushrooms(name: GlowName, frame = 0, frames = 4): Rgba {
  const hue = GLOW_HUE[name];
  const { rgba, at } = draw(
    mushrooms({ seed: 11 + Math.round(hue / 10), cap: glow(hue), spots: true, scale: 1.75 }),
    FLORA_CANVAS,
  );
  const [cx, cy] = at(v3(0, 0, 14));
  const t = breath(frame, frames);
  const lit = underGlow(rgba, cx, cy - 6, 70 + t * 6, 52 + t * 5, colourOf(hue), 0.5 + t * 0.16);
  sparkle(lit, Math.round(cx) + 26, Math.round(cy) - 40 + Math.round(t * 2), 2, colourOf(hue));
  return lit;
}

/**
 * Glow bulbs: thin stalks that lean out of a tuft of leaves, each ending in a round bulb that
 * shines.
 */
export function bulbs(o: { seed: number; hues: readonly number[]; scale?: number }): SceneBuilder {
  const k = o.scale ?? 1;
  const rng = mulberry32(o.seed);
  const b = new SceneBuilder();
  const leaf = b.solid(
    'leaf',
    b.variant('leaf', glow(165, 0.12), { noLines: true }),
    (s) => (hash2(s.px, s.py, o.seed) - 0.5) * 0.18,
  );
  const stalk = b.mesh(b.solid('stalk', b.variant('stalk', glow(150, 0.1), { noLines: true })), { noLines: true });
  const leaves = b.mesh(leaf, { twoSided: true });
  for (let j = 0; j < 6; j++) {
    const a = (j / 6) * TAU + rng() * 0.6;
    const len = (22 + rng() * 12) * k;
    ribbon(
      leaves,
      [
        { p: v3(0, 0, 3), w: 9 * k, t: 1.4 },
        { p: v3(Math.cos(a) * len * 0.5, Math.sin(a) * len * 0.35, 20 * k), w: 8 * k, t: 1.4 },
        { p: v3(Math.cos(a) * len, Math.sin(a) * len * 0.5, 14 * k), w: 1.6, t: 1 },
      ],
      v3(0, 0, 1),
      5,
    );
  }
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rng() * 0.5;
    const lean = (6 + rng() * 14) * k;
    const h = (46 + rng() * 34) * k;
    const x = Math.cos(a) * lean,
      y = Math.sin(a) * lean * 0.7;
    tube(
      stalk,
      [
        { p: v3(0, 0, 6), r: 2.2 * k },
        { p: v3(x * 0.5, y * 0.5, h * 0.55), r: 1.8 * k },
        { p: v3(x, y, h), r: 1.5 * k },
      ],
      { segs: 5, n: 5 },
    );
    const hue = o.hues[i % o.hues.length]!;
    const bulb = b.mesh(b.solid(`bulb${i}`, b.variant(`bulb${i}`, glow(hue, 0.17), { noLines: true })), {
      noLines: true,
    });
    const core = b.mesh(
      b.solid(
        `core${i}`,
        b.variant(
          `core${i}`,
          [
            [255, 255, 255],
            [255, 255, 255],
          ] as Ramp,
          { flat: 1, noLines: true, priority: 2 },
        ),
      ),
      { noLines: true, noShadow: true },
    );
    blob(bulb, v3(x, y, h + 6 * k), v3(8.4 * k, 7.8 * k, 9.6 * k), 0, { rings: 5, segs: 9 });
    blob(core, v3(x, y - 2.6 * k, h + 8 * k), v3(3 * k, 2.8 * k, 3.6 * k), 0, { rings: 3, segs: 6 });
  }
  return b;
}

export function renderBulbs(seed: number, hues: readonly number[], frame = 0, frames = 4): Rgba {
  const { rgba, at } = draw(bulbs({ seed, hues, scale: 1.15 }), FLORA_CANVAS);
  const [cx, cy] = at(v3(0, 0, 40));
  const t = breath(frame, frames);
  const lit = underGlow(rgba, cx, cy - 6, 56 + t * 5, 62 + t * 4, colourOf(hues[0]!), 0.38 + t * 0.14);
  sparkle(lit, Math.round(cx) + 24, Math.round(cy) - 34 + Math.round(t * 2), 2, colourOf(hues[1] ?? hues[0]!));
  return lit;
}

export type CaveBedLook = 'long' | 'round';
export const BED_CANVAS: Canvas = { w: 230, h: 170, ox: 115, oy: 118 };

/**
 * The petals' hues: a bed has three kinds of glowing flower in it, and the same three whether it is
 * open or not.
 */
const BED_BLOOMS: Record<CaveBedLook, readonly number[]> = { long: [215, 345, 85], round: [300, 195, 60] };

function bed(o: { look: CaveBedLook; flowering: boolean }): SceneBuilder {
  const b = new SceneBuilder();
  const rng = mulberry32(o.look === 'long' ? 71 : 83);
  const rock = b.solid('rock', b.variant('rock', KNOB, { bands: [0.15, 0.32, 0.52, 0.74, 0.9] }));
  const soil = b.solid(
    'soil',
    b.variant('soil', [
      [30, 22, 52],
      [46, 36, 74],
      [62, 50, 94],
    ] as Ramp),
    (s) => (hash2(s.px, s.py, 31) - 0.5) * 0.14,
  );
  const leaf = b.solid(
    'leaf',
    b.variant('leaf', glow(165, 0.12), { noLines: true }),
    (s) => (hash2(s.px, s.py, 5) - 0.5) * 0.18,
  );
  const w = o.look === 'long' ? 170 : 124,
    d = o.look === 'long' ? 62 : 112;
  // A rim of rough stones round a bed of dark soil.
  const rim = b.mesh(rock);
  const count = o.look === 'long' ? 14 : 12;
  for (let i = 0; i < count; i++) {
    const t = (i / count) * TAU;
    const x = Math.cos(t) * (w / 2),
      y = Math.sin(t) * (d / 2);
    const r = 12 + rng() * 6;
    blob(rim, v3(x, y, r * 0.6), v3(r * 1.15, r * 0.95, r * 0.85), rng() * 3, { rings: 5, segs: 8 });
  }
  blob(b.mesh(soil), v3(0, 0, 4), v3(w / 2 - 4, d / 2 - 4, 5), 0, { rings: 5, segs: 14 });
  const leaves = b.mesh(leaf, { twoSided: true });
  const tufts = o.look === 'long' ? 7 : 6;
  const spots: [number, number][] = [];
  for (let i = 0; i < tufts; i++) {
    const x =
      o.look === 'long' ? -w / 2 + 18 + (i / (tufts - 1)) * (w - 36) : Math.cos((i / tufts) * TAU + 0.5) * (w / 2 - 26);
    const y = o.look === 'long' ? (i % 2 === 0 ? -8 : 9) : Math.sin((i / tufts) * TAU + 0.5) * (d / 2 - 26);
    spots.push([x, y]);
    for (let j = 0; j < 6; j++) {
      const a = (j / 6) * TAU + rng() * 0.8;
      const len = 18 + rng() * 12;
      ribbon(
        leaves,
        [
          { p: v3(x, y, 7), w: 7, t: 1.4 },
          { p: v3(x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.35, 24), w: 6.4, t: 1.4 },
          { p: v3(x + Math.cos(a) * len, y + Math.sin(a) * len * 0.5, 20), w: 1.4, t: 1 },
        ],
        v3(0, 0, 1),
        5,
      );
    }
  }
  if (o.flowering) {
    const stem = b.mesh(b.solid('stem', b.variant('stem', glow(150, 0.1), { noLines: true })), { noLines: true });
    const hues = BED_BLOOMS[o.look];
    spots.forEach(([x, y], i) => {
      const hue = hues[i % hues.length]!;
      const head = b.mesh(b.solid(`bell${i}`, b.variant(`bell${i}`, glow(hue, 0.17), { noLines: true })), {
        noLines: true,
      });
      const core = b.mesh(
        b.solid(
          `core${i}`,
          b.variant(
            `core${i}`,
            [
              [255, 255, 255],
              [255, 255, 255],
            ] as Ramp,
            { flat: 1, noLines: true, priority: 2 },
          ),
        ),
        { noLines: true, noShadow: true },
      );
      const h = 38 + (i % 3) * 10;
      tube(
        stem,
        [
          { p: v3(x, y, 8), r: 2 },
          { p: v3(x + 2, y, h * 0.6), r: 1.8 },
          { p: v3(x, y, h), r: 1.5 },
        ],
        { segs: 5, n: 5 },
      );
      blob(head, v3(x, y, h + 8), v3(10.5, 9.6, 12), 0, { rings: 5, segs: 9 });
      blob(core, v3(x, y - 3, h + 9), v3(3.8, 3.4, 4.4), 0, { rings: 3, segs: 6 });
    });
  }
  return b;
}

/** The bed in a look, leafy or with its flowers open. `frame` makes the open one breathe. */
export function renderBed(look: CaveBedLook, flowering: boolean, frame = 0, frames = 1): Rgba {
  const { rgba, at } = draw(bed({ look, flowering }), BED_CANVAS);
  if (!flowering) return rgba;
  const [cx, cy] = at(v3(0, 0, 24));
  const t = frames > 1 ? breath(frame, frames) : 0.5;
  const hues = BED_BLOOMS[look];
  const lit = underGlow(
    rgba,
    cx,
    cy - 10,
    look === 'long' ? 112 + t * 5 : 88 + t * 4,
    look === 'long' ? 64 + t * 3 : 76 + t * 3,
    colourOf(hues[0]!),
    0.42 + t * 0.12,
  );
  sparkle(lit, Math.round(cx) + 24, Math.round(cy) - 26 - Math.round(t * 2), 2, colourOf(hues[1]!));
  sparkle(lit, Math.round(cx) - 30, Math.round(cy) - 18 + Math.round(t * 2), 2, colourOf(hues[2]!));
  return lit;
}
