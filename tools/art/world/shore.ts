import { hex, type RGB, ramp } from '../core/color';
import type { Rgba } from '../core/image';
import type { Mesh } from '../core/mesh';
import type { SampleInfo } from '../core/render';
import { hash2, mulberry32, noise3 } from '../core/rng';
import { TAU, type V3, v3 } from '../core/vec';
import { lathe } from './arch';
import { BARK, BLOOM, FOLIAGE, GEM, PAL, type Ramp } from './palette';
import { blendNormals, blob, ribbon, tube } from './prims';
import { renderScene, SceneBuilder } from './scene';
import type { FoliageName } from './trees';

/**
 * The shore: what lies on the sand and stands in the water. Palms with pink or green fronds, shells
 * that stand up to be seen, a clam that opens on a pearl, a mound to dig in, a sand castle, flat
 * stones to cross the river on, and boulders with crystals growing from their tops. Everything is
 * built in round numbers and drawn with the same camera and light as the herd, so a unicorn
 * standing among them belongs.
 */

export interface Canvas {
  w: number;
  h: number;
  ox: number;
  oy: number;
}

const r6 = (
  base: string,
  shadowHue: number,
  lightHue: number,
  lightness: readonly number[] = [-0.3, -0.2, -0.1, 0, 0.08, 0.16],
): Ramp => ramp(hex(base), { steps: 6, shadowHue, lightHue, lean: 0.95, lightness });

const SAND = r6('#ecd49a', 335, 90, [-0.26, -0.17, -0.09, 0, 0.06, 0.12]);
const TRUNK = r6('#b98a62', 325, 75, [-0.3, -0.2, -0.1, 0, 0.08, 0.15]);
const NUT = r6('#7a4b3a', 320, 60, [-0.3, -0.2, -0.1, 0, 0.07, 0.14]);
const PEARL: Ramp = [
  [200, 184, 232],
  [226, 212, 246],
  [244, 234, 255],
  [255, 248, 255],
  [255, 255, 255],
];
const NACRE = r6('#f3b8d4', 320, 70, [-0.22, -0.14, -0.07, 0, 0.07, 0.13]);
const SHELL_PINK = r6('#f2a0b8', 330, 60, [-0.26, -0.17, -0.09, 0, 0.08, 0.15]);
const SHELL_CREAM = r6('#f7e6c8', 330, 85, [-0.24, -0.15, -0.08, 0, 0.06, 0.1]);
const SHELL_LILAC = r6('#b8a0ec', 275, 330, [-0.28, -0.19, -0.1, 0, 0.08, 0.15]);
const SHELL_GOLD = r6('#f2c25a', 20, 90, [-0.3, -0.2, -0.1, 0, 0.09, 0.17]);
const STAR_ORANGE = r6('#ff8a5c', 330, 70, [-0.3, -0.2, -0.1, 0, 0.09, 0.17]);
const CANVAS_WHITE = r6('#fff6ec', 290, 85, [-0.2, -0.13, -0.07, -0.02, 0.03, 0.06]);
const STRIPE_PINK = r6('#f0668f', 325, 55, [-0.3, -0.2, -0.1, 0, 0.08, 0.15]);
const STRIPE_TEAL = r6('#3cc4c0', 245, 130, [-0.3, -0.2, -0.1, 0, 0.09, 0.17]);
const STRIPE_YELLOW = r6('#ffcf48', 20, 95, [-0.3, -0.2, -0.1, 0, 0.09, 0.17]);
const DRIFT = r6('#d8cdbd', 290, 80, [-0.3, -0.2, -0.1, 0, 0.06, 0.11]);
const RIVER_STONE = r6('#a7a4c6', 285, 80, [-0.3, -0.19, -0.09, 0, 0.09, 0.16]);
const WET_ROCK = r6('#6f6e98', 275, 100, [-0.3, -0.2, -0.1, 0, 0.08, 0.15]);
const TOWER_RED = r6('#e8506a', 330, 45, [-0.3, -0.2, -0.1, 0, 0.08, 0.15]);
const LAMP_GLOW = r6('#fff0a0', 30, 95, [-0.12, -0.06, 0, 0.05, 0.09, 0.13]);

const leafBias =
  (seed: number, amount = 0.2) =>
  (s: SampleInfo): number =>
    (hash2(s.px, s.py, seed) - 0.5) * amount +
    (noise3(s.rest[0] * 0.09, s.rest[1] * 0.09, s.rest[2] * 0.09, seed) - 0.5) * 0.12;

const grain =
  (seed: number, amount = 0.07) =>
  (s: SampleInfo): number =>
    (hash2(s.px, s.py, seed) - 0.5) * amount +
    (noise3(s.rest[0] * 0.2, s.rest[1] * 0.2, s.rest[2] * 0.2, seed) - 0.5) * 0.12;

/**
 * Tips a mesh forward about the x axis through (0, 0, pivot), so a thing built flat can lean back
 * on the sand. A positive angle lifts the front (toward the viewer) edge.
 */
export function tilt(m: Mesh, phi: number, pivot = 0): void {
  const c = Math.cos(phi),
    s = Math.sin(phi);
  for (let i = 0; i < m.pos.length; i += 3) {
    for (const arr of [m.pos, m.rest]) {
      const y = arr[i + 1]!,
        z = arr[i + 2]! - pivot;
      arr[i + 1] = y * c - z * s;
      arr[i + 2] = y * s + z * c + pivot;
    }
    const ny = m.nor[i + 1]!,
      nz = m.nor[i + 2]!;
    m.nor[i + 1] = ny * c - nz * s;
    m.nor[i + 2] = ny * s + nz * c;
  }
}

/** A palm tree. Its crown of fronds droops, and its trunk leans and is ringed like a pineapple. */
export function palm(o: {
  seed: number;
  lean: number;
  fronds: FoliageName;
  scale?: number;
  nuts?: boolean;
}): SceneBuilder {
  const k = o.scale ?? 1;
  const rng = mulberry32(o.seed);
  const b = new SceneBuilder();
  const bark = b.variant('trunk', TRUNK, { bands: [0.2, 0.42, 0.62, 0.84] });
  const trunkMat = b.material({
    name: 'trunk',
    shade: () => bark,
    bias: (s) => Math.sin(s.rest[2] * 0.42) * 0.1 + (hash2(s.px, s.py, o.seed) - 0.5) * 0.06,
  });
  const H = 232 * k;
  const bend = (t: number): V3 => v3(o.lean * H * t ** 1.7, Math.sin(t * 2.4) * 6 * k, H * t);
  const pts = Array.from({ length: 9 }, (_, i) => {
    const t = i / 8;
    return { p: bend(t), r: (11.5 - 5.2 * t) * k };
  });
  tube(b.mesh(trunkMat), pts, { segs: 10, n: 30 });
  const top = bend(1);

  const leaf = b.variant('frond', FOLIAGE[o.fronds]);
  const leafMat = b.solid('frond', leaf, leafBias(o.seed));
  const rib = b.variant('rib', TRUNK, { noLines: true });
  const ribMat = b.solid('rib', rib);
  const fronds = 11;
  const blades = b.mesh(leafMat, { twoSided: true, noLines: true });
  const ribs = b.mesh(ribMat, { noLines: true });
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * TAU + rng() * 0.4;
    const dx = Math.cos(a),
      dy = Math.sin(a) * 0.8;
    const rise = i % 3 === 0;
    const len = ((rise ? 78 : 104) + rng() * 34) * k;
    const lift = ((rise ? 74 : 34) + rng() * 24) * k;
    const droop = ((rise ? 62 : 92) + rng() * 40) * k;
    const at = (t: number): V3 =>
      v3(top[0] + dx * len * t, top[1] + dy * len * t, top[2] + lift * t - droop * t * t + 6 * k);
    const spine = Array.from({ length: 7 }, (_, j) => at(j / 6));
    ribbon(
      ribs,
      spine.map((p, j) => ({ p, w: (2.4 - 1.2 * (j / 6)) * k, t: 1.1 * k })),
      v3(0, 0, 1),
      4,
    );
    // Leaflets on both sides, long in the middle and short at the tip, hanging a little.
    const nx = -dy,
      ny = dx;
    for (let t = 0.1; t < 0.98; t += 0.065) {
      const p = at(t);
      const reach = (29 * Math.sin(Math.PI * Math.min(1, t * 1.05)) ** 0.7 + 6) * k;
      for (const side of [-1, 1]) {
        const hang = (10 + 20 * t) * k;
        ribbon(
          blades,
          [
            { p, w: 3 * k, t: 0.9 * k },
            {
              p: v3(p[0] + nx * side * reach * 0.55, p[1] + ny * side * reach * 0.55, p[2] - hang * 0.25),
              w: 3.4 * k,
              t: 0.9 * k,
            },
            { p: v3(p[0] + nx * side * reach, p[1] + ny * side * reach, p[2] - hang), w: 0.8 * k, t: 0.6 * k },
          ],
          v3(0, 0, 1),
          3,
        );
      }
    }
  }
  if (o.nuts !== false) {
    const nut = b.variant('nut', NUT);
    const nutMat = b.solid('nut', nut);
    const nm = b.mesh(nutMat);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.6;
      blob(
        nm,
        v3(top[0] + Math.cos(a) * 8 * k, top[1] + Math.sin(a) * 6 * k, top[2] - 9 * k - (i % 2) * 3),
        v3(7.4 * k, 7.4 * k, 8.4 * k),
        0,
        {
          rings: 6,
          segs: 9,
        },
      );
    }
  }
  return b;
}

export type ShellKind = 'scallop' | 'turret' | 'conch';

const SHELL_RAMPS = { pink: SHELL_PINK, cream: SHELL_CREAM, lilac: SHELL_LILAC, gold: SHELL_GOLD } as const;
export type ShellColor = keyof typeof SHELL_RAMPS;

/** A scallop that stands on its edge, a spiral turret, or a conch, in one of four colours. */
export function seashell(o: { kind: ShellKind; color: ShellColor; seed: number; scale?: number }): SceneBuilder {
  const k = o.scale ?? 1;
  const b = new SceneBuilder();
  const base = SHELL_RAMPS[o.color];
  const light = b.variant('light', base, { bands: [0.2, 0.4, 0.6, 0.8] });
  const dark = b.variant('dark', ramp(hex('#c46c8e'), { steps: 6, shadowHue: 320, lightHue: 60, lean: 0.9 }), {
    bands: [0.2, 0.4, 0.6, 0.8],
  });
  const inside = b.variant('inside', NACRE);
  const rng = mulberry32(o.seed);
  if (o.kind === 'scallop') {
    // A fan of ribs from a hinge: each rib is a flat blade, so the fan reads as ridged.
    const ribsN = 13;
    const mat = b.material({
      name: 'ribs',
      shade: (s) => (Math.round(Math.atan2(s.rest[0], s.rest[2] - 6 * k) * 14) % 2 === 0 ? light : dark),
      bias: grain(o.seed, 0.05),
    });
    const m = b.mesh(mat, { twoSided: true });
    for (let i = 0; i < ribsN; i++) {
      const a = (-0.5 + i / (ribsN - 1)) * Math.PI * 0.86;
      const reach = (30 - Math.abs(a) * 3.2) * k;
      const x = Math.sin(a),
        z = Math.cos(a);
      ribbon(
        m,
        [
          { p: v3(x * 3 * k, 0, 6 * k + z * 3 * k), w: 1.3 * k, t: 1.2 * k },
          { p: v3(x * reach * 0.55, 0, 6 * k + z * reach * 0.55), w: 3.3 * k, t: 1.5 * k },
          { p: v3(x * reach, 0.2 * k, 6 * k + z * reach), w: 2.8 * k, t: 1.1 * k },
        ],
        v3(0, -1, 0),
        4,
      );
    }
    const ear = b.mesh(b.solid('ear', light));
    blob(ear, v3(0, 0, 5.5 * k), v3(12 * k, 3 * k, 5.5 * k), 0, { rings: 5, segs: 8 });
    for (const m2 of b.meshes) tilt(m2, -0.28, 4 * k);
  } else if (o.kind === 'turret') {
    const mat = b.material({
      name: 'turret',
      shade: (s) =>
        Math.floor(s.rest[2] / (4.2 * k) + Math.atan2(s.rest[1], s.rest[0]) * 0.9) % 2 === 0 ? light : dark,
      bias: grain(o.seed, 0.05),
    });
    const m = b.mesh(mat);
    // A stack of whorls that shrink and turn, tipped so the point leans away.
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      const r = (13.5 - t * 10.4) * k;
      const a = i * 0.75;
      blob(m, v3(Math.cos(a) * 1.8 * k, Math.sin(a) * 1.8 * k, (5.5 + i * 7.4) * k), v3(r, r * 0.95, r * 0.7), a, {
        rings: 6,
        segs: 10,
      });
    }
    const lip = b.mesh(b.solid('lip', inside));
    blob(lip, v3(0, -9 * k, 7 * k), v3(6.2 * k, 3 * k, 5 * k), 0, { rings: 4, segs: 7 });
    for (const m2 of b.meshes) tilt(m2, 0.34, 0);
  } else {
    // A conch: a fat spiral body with a flared pink mouth turned toward the viewer.
    const mat = b.material({
      name: 'conch',
      shade: (s) => (Math.floor(s.rest[2] / (5 * k) + Math.atan2(s.rest[1], s.rest[0]) * 0.8) % 3 === 0 ? dark : light),
      bias: grain(o.seed, 0.05),
    });
    const m = b.mesh(mat);
    blob(m, v3(0, 0, 14 * k), v3(20 * k, 17 * k, 14 * k), 0.4, { rings: 8, segs: 12 });
    for (let i = 0; i < 4; i++) {
      const t = (i + 1) / 4;
      const r = (14 - t * 8) * k;
      blob(m, v3(-3 * k * t, 0, (22 + i * 8) * k), v3(r, r * 0.92, r * 0.78), i, { rings: 6, segs: 10 });
    }
    const mouth = b.mesh(b.solid('mouth', inside));
    blob(mouth, v3(5 * k, -13 * k, 11 * k), v3(9.5 * k, 5.5 * k, 8.5 * k), 0, { rings: 5, segs: 9 });
    const spikes = b.mesh(b.solid('spikes', light));
    for (let i = 0; i < 5; i++) {
      const a = -0.9 + i * 0.5 + rng() * 0.1;
      blob(
        spikes,
        v3(Math.sin(a) * 15 * k, -Math.cos(a) * 8 * k, (20 + i * 0.5) * k),
        v3(3.3 * k, 3.3 * k, 4.4 * k),
        0,
        {
          rings: 4,
          segs: 6,
        },
      );
    }
    for (const m2 of b.meshes) tilt(m2, 0.12, 0);
  }
  return b;
}

/** A starfish with five arms and rows of small bumps, propped on its tips. */
export function starfish(o: { seed: number; scale?: number }): SceneBuilder {
  const k = o.scale ?? 1;
  const rng = mulberry32(o.seed);
  const b = new SceneBuilder();
  const v = b.variant('star', STAR_ORANGE, { bands: [0.2, 0.4, 0.62, 0.84] });
  const dot = b.variant('dot', ramp(hex('#ffe1a0'), { steps: 4, shadowHue: 20, lightHue: 90 }), {
    noLines: true,
    priority: 2,
  });
  const mat = b.solid('star', v, grain(o.seed, 0.06));
  const dots = b.solid('dot', dot);
  const m = b.mesh(mat);
  const spin = rng() * 1.2;
  const d = b.mesh(dots, { noLines: true });
  for (let i = 0; i < 5; i++) {
    const a = spin + (i / 5) * TAU;
    const ca = Math.cos(a),
      sa = Math.sin(a);
    tube(
      m,
      [
        { p: v3(0, 0, 4 * k), r: 8.5 * k },
        { p: v3(ca * 14 * k, sa * 14 * k, 3.6 * k), r: 6.6 * k },
        { p: v3(ca * 26 * k, sa * 26 * k, 3 * k), r: 4.4 * k },
        { p: v3(ca * 38 * k, sa * 38 * k, 3.4 * k), r: 2 * k },
      ],
      { segs: 8, n: 12 },
    );
    for (let j = 1; j <= 4; j++) {
      blob(d, v3(ca * j * 8.4 * k, sa * j * 8.4 * k, (8.4 - j * 0.6) * k), v3(1.8 * k, 1.8 * k, 1.5 * k), 0, {
        rings: 3,
        segs: 5,
      });
    }
  }
  blob(m, v3(0, 0, 4 * k), v3(12 * k, 12 * k, 6.6 * k), 0, { rings: 6, segs: 10 });
  for (const m2 of b.meshes) tilt(m2, 0.16, 0);
  return b;
}

/** Moves, and squashes along y, a mesh built round the origin. */
function put(m: Mesh, at: V3, squash = 1): void {
  for (let i = 0; i < m.pos.length; i += 3) {
    m.pos[i + 1] = m.pos[i + 1]! * squash;
    m.pos[i] = m.pos[i]! + at[0];
    m.pos[i + 1] = m.pos[i + 1]! + at[1];
    m.pos[i + 2] = m.pos[i + 2]! + at[2];
    m.rest[i] = m.pos[i]!;
    m.rest[i + 1] = m.pos[i + 1]!;
    m.rest[i + 2] = m.pos[i + 2]!;
  }
}

/**
 * A clam on the sand: two ridged valves. Shut, it is a plump shell with a seam. Open, the top valve
 * stands back on its hinge, the inside of both is pink nacre and a pearl glows in the bottom one.
 */
export function clam(o: { open: boolean; seed: number }): SceneBuilder {
  const b = new SceneBuilder();
  const outer = b.variant('outer', r6('#cdbfe8', 275, 330), { bands: [0.2, 0.4, 0.62, 0.84] });
  const ridge = b.variant('ridge', r6('#a290d6', 275, 330), { bands: [0.2, 0.4, 0.62, 0.84] });
  const nacre = b.variant('nacre', NACRE, { bands: [0.15, 0.32, 0.5, 0.7, 0.88] });
  const pearl = b.variant('pearl', PEARL, { bands: [0.12, 0.3, 0.55, 0.82], emissive: 0.8 });
  const shine = b.variant('shine', [[255, 255, 255]], { emissive: 5, protect: true, noLines: true, priority: 3 });
  const sand = b.variant('sand', SAND);
  blob(b.mesh(b.solid('sand', sand, grain(o.seed, 0.06))), v3(0, 2, 3), v3(54, 36, 6), 0, { rings: 6, segs: 12 });

  const shell = b.material({
    name: 'valve',
    shade: (s) => (Math.round(Math.atan2(s.rest[1], s.rest[0]) * 7) % 2 === 0 ? outer : ridge),
    bias: grain(o.seed, 0.05),
  });
  const lining = b.material({ name: 'lining', shade: () => nacre, bias: grain(o.seed + 3, 0.04) });
  const dish: [number, number][] = [
    [0, 0],
    [12, 0.5],
    [24, 4],
    [31, 10],
    [32, 17],
    [29, 19],
  ];
  const inner: [number, number][] = [
    [29, 19],
    [24, 16],
    [14, 10],
    [0, 8],
  ];
  const valve = (): { outside: Mesh; inside: Mesh } => {
    const outside = b.mesh(shell);
    lathe(outside, { c: v3(0, 0, 0), profile: dish, segs: 22, smooth: true });
    const inside = b.mesh(lining);
    lathe(inside, { c: v3(0, 0, 0), profile: inner, segs: 22, smooth: true });
    return { outside, inside };
  };
  const lower = valve();
  for (const m of [lower.outside, lower.inside]) put(m, v3(0, 2, 4), 0.72);
  if (o.open) {
    const pm = b.mesh(b.solid('pearl', pearl), { noLines: true });
    blob(pm, v3(0, -2, 31), v3(13, 13, 13), 0, { rings: 9, segs: 14 });
    blob(b.mesh(b.solid('shine', shine), { noLines: true }), v3(-4.8, -13.4, 37), v3(3.2, 1.6, 2.6), 0, {
      rings: 3,
      segs: 6,
    });
    const upper = valve();
    for (const m of [upper.outside, upper.inside]) {
      put(m, v3(0, 0, 0), 0.72);
      tilt(m, 0.9, 0);
      put(m, v3(0, 22, 33));
    }
  }
  return b;
}

/** A shut clam: one plump pillow with a seam round its middle. */
export function shutClam(o: { seed: number }): SceneBuilder {
  const b = new SceneBuilder();
  const outer = b.variant('outer', r6('#cdbfe8', 275, 330), { bands: [0.2, 0.4, 0.62, 0.84] });
  const ridge = b.variant('ridge', r6('#a290d6', 275, 330), { bands: [0.2, 0.4, 0.62, 0.84] });
  const seam = b.variant('seam', r6('#6f5aa8', 275, 330), { flat: 0 });
  const sand = b.variant('sand', SAND);
  blob(b.mesh(b.solid('sand', sand, grain(o.seed, 0.06))), v3(0, 2, 3), v3(54, 36, 6), 0, { rings: 6, segs: 12 });
  const shell = b.material({
    name: 'pillow',
    shade: (s) =>
      Math.abs(s.rest[2] - 21) < 1.9
        ? seam
        : Math.round(Math.atan2(s.rest[1], s.rest[0]) * 7) % 2 === 0
          ? outer
          : ridge,
    bias: grain(o.seed, 0.05),
  });
  const m = b.mesh(shell);
  lathe(m, {
    c: v3(0, 0, 0),
    profile: [
      [0, 0],
      [13, 0.5],
      [25, 3],
      [32, 9],
      [35, 17],
      [35, 21],
      [35, 25],
      [32, 33],
      [25, 39],
      [13, 43],
      [0, 44],
    ],
    segs: 24,
    smooth: true,
  });
  put(m, v3(0, 2, 4), 0.72);
  return b;
}

/** A sand castle with a keep, four round towers with cone roofs, walls between and a flag. */
export function sandCastle(o: { grand: boolean; seed: number }): SceneBuilder {
  const k = o.grand ? 1 : 0.62;
  const rng = mulberry32(o.seed);
  const b = new SceneBuilder();
  const wet = b.variant('sand', SAND, { bands: [0.2, 0.42, 0.64, 0.86] });
  const dry = b.variant('dry', ramp(hex('#f6e6b8'), { steps: 6, shadowHue: 335, lightHue: 95, lean: 0.9 }), {
    bands: [0.2, 0.42, 0.64, 0.86],
  });
  const dark = b.variant('door', r6('#7a5a48', 320, 60), { flat: 0 });
  const wetMat = b.solid('sand', wet, grain(o.seed, 0.09));
  const dryMat = b.solid('dry', dry, grain(o.seed + 1, 0.09));
  const doorMat = b.solid('door', dark);
  const flag = b.variant('flag', STRIPE_PINK, { noLines: true });
  const flagMat = b.solid('flag', flag);
  const pole = b.variant('pole', DRIFT);
  const poleMat = b.solid('pole', pole);

  blob(b.mesh(wetMat), v3(0, 0, 4 * k), v3(150 * k, 96 * k, 12 * k), 0, { rings: 6, segs: 14 });
  const keepR = 34 * k,
    keepH = 82 * k;
  lathe(b.mesh(dryMat), {
    c: v3(0, -6 * k, 8 * k),
    profile: [
      [0, 0],
      [keepR * 1.12, 0],
      [keepR * 1.02, keepH * 0.55],
      [keepR * 0.92, keepH],
      [keepR * 0.7, keepH],
      [0, keepH],
    ],
    segs: 16,
  });
  // Notches on top of the keep.
  const notches = b.mesh(dryMat);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    blob(
      notches,
      v3(Math.cos(a) * keepR * 0.82, -6 * k + Math.sin(a) * keepR * 0.82, (8 + keepH + 4) * k),
      v3(6.4 * k, 6.4 * k, 7.4 * k),
      0,
      {
        rings: 4,
        segs: 6,
      },
    );
  }
  // Round towers at the corners with a cone each.
  const corners: [number, number][] = [
    [-92, -26],
    [92, -26],
    [-70, 44],
    [70, 44],
  ];
  for (const [cx, cy] of corners) {
    const tr = 17 * k,
      th = (46 + rng() * 10) * k;
    lathe(b.mesh(wetMat), {
      c: v3(cx * k, cy * k, 8 * k),
      profile: [
        [0, 0],
        [tr * 1.1, 0],
        [tr, th],
        [tr * 1.1, th],
        [tr * 1.12, th + 5 * k],
        [tr * 0.2, th + 5 * k],
        [0, th + 5 * k],
      ],
      segs: 12,
    });
    lathe(b.mesh(dryMat), {
      c: v3(cx * k, cy * k, (8 + th + 5) * k),
      profile: [
        [0, 0],
        [tr * 1.15, 0],
        [tr * 0.75, 10 * k],
        [tr * 0.3, 26 * k],
        [0, 34 * k],
      ],
      segs: 12,
    });
    const slit = b.mesh(doorMat, { noLines: true });
    blob(slit, v3(cx * k, (cy - tr - 0.5) * k, (8 + th * 0.62) * k), v3(2.6 * k, 1.6 * k, 6.4 * k), 0, {
      rings: 4,
      segs: 6,
    });
  }
  // The walls, with the gate in the front one.
  const wall = b.mesh(wetMat);
  const wallBlob = (x: number, y: number, rx: number, ry: number): void => {
    blob(wall, v3(x * k, y * k, 26 * k), v3(rx * k, ry * k, 20 * k), 0, { rings: 5, segs: 10 });
  };
  wallBlob(-46, -31, 52, 9);
  wallBlob(46, -31, 52, 9);
  wallBlob(0, 48, 82, 8);
  wallBlob(-81, 9, 8, 40);
  wallBlob(81, 9, 8, 40);
  const gate = b.mesh(doorMat, { noLines: true });
  blob(gate, v3(0, -39.5 * k, 20 * k), v3(15 * k, 2.4 * k, 20 * k), 0, { rings: 6, segs: 10 });
  // Shells pushed into the walls.
  const shells = b.mesh(b.solid('shell', b.variant('shell', SHELL_PINK)), { noLines: true });
  for (let i = 0; i < (o.grand ? 9 : 4); i++) {
    const x = (-90 + rng() * 180) * k;
    blob(shells, v3(x, -41 * k, (14 + rng() * 22) * k), v3(3.6 * k, 1.8 * k, 3 * k), 0, { rings: 4, segs: 6 });
  }
  // The flag on the keep.
  const top = (8 + keepH + 9) * k;
  tube(b.mesh(poleMat), [
    { p: v3(0, -6 * k, top), r: 1.2 * k },
    { p: v3(0, -6 * k, top + 34 * k), r: 0.9 * k },
  ]);
  ribbon(
    b.mesh(flagMat, { twoSided: true, noLines: true }),
    [
      { p: v3(1 * k, -6 * k, top + 33 * k), w: 6.6 * k, t: 0.9 * k },
      { p: v3(12 * k, -6 * k, top + 31 * k), w: 6.2 * k, t: 0.9 * k },
      { p: v3(22 * k, -6 * k, top + 33 * k), w: 3 * k, t: 0.9 * k },
    ],
    v3(0, -1, 0),
    4,
  );
  blendNormals(wall, v3(0, 0, 20 * k), v3(100 * k, 60 * k, 40 * k), 0.12);
  return b;
}

/** A low heap of sand with a little spade standing in it: dig here. */
export function digMound(o: { seed: number }): SceneBuilder {
  const rng = mulberry32(o.seed);
  const b = new SceneBuilder();
  const wet = b.variant('sand', r6('#d9b87c', 325, 80, [-0.3, -0.2, -0.1, 0, 0.07, 0.14]));
  const mat = b.solid('sand', wet, grain(o.seed, 0.1));
  const m = b.mesh(mat);
  blob(m, v3(0, 0, 10), v3(40, 26, 14), 0, { rings: 7, segs: 12 });
  blob(m, v3(-22, 6, 6), v3(18, 12, 8), 0.4, { rings: 5, segs: 9 });
  blob(m, v3(22, 8, 5), v3(15, 10, 7), -0.3, { rings: 5, segs: 9 });
  const hole = b.variant('hole', r6('#8a6a48', 320, 60), { flat: 0 });
  blob(b.mesh(b.solid('hole', hole), { noLines: true }), v3(2, 8, 18), v3(10, 5, 3), 0, { rings: 4, segs: 8 });
  // The spade: a wooden handle and a red blade, leaning on the mound.
  const wood = b.variant('handle', TRUNK);
  const blade = b.variant('blade', STRIPE_TEAL);
  const hm = b.mesh(b.solid('handle', wood));
  const sx = 26 + rng() * 6;
  tube(hm, [
    { p: v3(sx, 4, 14), r: 1.7 },
    { p: v3(sx + 9, 2, 42), r: 1.7 },
  ]);
  blob(hm, v3(sx + 10, 2, 45), v3(5.5, 1.8, 1.8), 0.2, { rings: 4, segs: 6 });
  const bm = b.mesh(b.solid('blade', blade));
  blob(bm, v3(sx, 4, 14), v3(6.5, 1.8, 8), 0, { rings: 5, segs: 8 });
  // A glint of something in the sand.
  const glint = b.variant('glint', PEARL, { emissive: 0.8, protect: true, noLines: true });
  blob(b.mesh(b.solid('glint', glint), { noLines: true }), v3(-14, 10, 21), v3(2.6, 2.6, 2.2), 0, {
    rings: 4,
    segs: 6,
  });
  return b;
}

/**
 * A flat stone to cross the river on: a low rounded slab, mossy on top and dark where the water
 * wets it, with specks of crystal. `r` is the radius it covers on the ground, in world units.
 */
export function riverStone(o: { seed: number; r: number }): SceneBuilder {
  const rng = mulberry32(o.seed);
  const b = new SceneBuilder();
  const stone = b.variant('stone', RIVER_STONE, { bands: [0.2, 0.42, 0.62, 0.84] });
  const wet = b.variant('wet', WET_ROCK, { bands: [0.2, 0.42, 0.62, 0.84] });
  const moss = b.variant('moss', FOLIAGE.emerald);
  const mat = b.material({
    name: 'stone',
    shade: (s) =>
      s.rest[2] < 6
        ? wet
        : s.n[2] > 0.7 && noise3(s.rest[0] * 0.045, s.rest[1] * 0.045, s.rest[2] * 0.045, o.seed) > 0.56
          ? moss
          : stone,
    bias: (s) =>
      (noise3(s.rest[0] * 0.2, s.rest[1] * 0.2, s.rest[2] * 0.2, o.seed) - 0.5) * 0.24 +
      (hash2(s.px, s.py, o.seed) - 0.5) * 0.06,
  });
  const m = b.mesh(mat);
  const R = o.r * 0.94;
  blob(m, v3(0, 0, 13), v3(R * 0.95, R * 1.3, 15), (rng() - 0.5) * 0.3, { rings: 8, segs: 18 });
  blob(m, v3(-R * 0.4, R * 0.2, 11), v3(R * 0.5, R * 0.7, 12), (rng() - 0.5) * 0.4, { rings: 6, segs: 12 });
  blob(m, v3(R * 0.42, -R * 0.15, 10), v3(R * 0.46, R * 0.66, 11), (rng() - 0.5) * 0.4, { rings: 6, segs: 12 });
  const specks = b.variant('speck', [...GEM.diamond], { emissive: 0.6, protect: true, noLines: true, priority: 2 });
  const sm = b.mesh(b.solid('speck', specks), { noLines: true });
  for (let i = 0; i < 7; i++) {
    const a = rng() * TAU,
      d = rng() * R * 0.62;
    blob(sm, v3(Math.cos(a) * d, Math.sin(a) * d * 1.2, 24), v3(2.4, 2.4, 1.8), 0, { rings: 3, segs: 5 });
  }
  return b;
}

/** A tall boulder in the water with crystals growing from its top. */
export function crystalBoulder(o: {
  seed: number;
  gem: 'amethyst' | 'sapphire' | 'emerald' | 'topaz' | 'diamond';
  scale?: number;
}): SceneBuilder {
  const k = o.scale ?? 1;
  const rng = mulberry32(o.seed);
  const b = new SceneBuilder();
  const stone = b.variant('stone', RIVER_STONE, { bands: [0.2, 0.42, 0.62, 0.84] });
  const wet = b.variant('wet', WET_ROCK, { bands: [0.2, 0.42, 0.62, 0.84] });
  const moss = b.variant('moss', FOLIAGE.emerald);
  const mat = b.material({
    name: 'boulder',
    shade: (s) =>
      s.rest[2] < 9 * k
        ? wet
        : s.n[2] > 0.55 && noise3(s.rest[0] * 0.05, s.rest[1] * 0.05, s.rest[2] * 0.05, o.seed) > 0.46
          ? moss
          : stone,
    bias: (s) =>
      (noise3(s.rest[0] * 0.2, s.rest[1] * 0.2, s.rest[2] * 0.2, o.seed) - 0.5) * 0.28 +
      (hash2(s.px, s.py, o.seed) - 0.5) * 0.06,
  });
  const m = b.mesh(mat);
  blob(m, v3(0, 0, 24 * k), v3(48 * k, 38 * k, 32 * k), rng() * 3, { rings: 8, segs: 14 });
  blob(m, v3(-26 * k, 10 * k, 16 * k), v3(26 * k, 22 * k, 20 * k), rng() * 3, { rings: 6, segs: 11 });
  blob(m, v3(24 * k, -6 * k, 14 * k), v3(22 * k, 20 * k, 17 * k), rng() * 3, { rings: 6, segs: 11 });
  const ramp5 = GEM[o.gem];
  const g = b.variant('crystal', ramp5, { bands: [0.18, 0.4, 0.62, 0.84], emissive: 0.55 });
  const glow = b.variant('glow', ramp5, { emissive: 1.4, noLines: true });
  const cm = b.material({ name: 'crystal', shade: (s) => (s.u > 0.15 && s.u < 0.85 && s.v < 0.2 ? glow : g) });
  const n = 4 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rng() * 0.6;
    const d = i === 0 ? 0 : (10 + rng() * 14) * k;
    const h = (i === 0 ? 46 : 22 + rng() * 20) * k;
    const lean = (0.1 + rng() * 0.2) * (rng() < 0.5 ? -1 : 1);
    const cx = Math.cos(a) * d,
      cy = Math.sin(a) * d * 0.8;
    const w = (8 + rng() * 4) * k;
    tube(
      b.mesh(cm),
      [
        { p: v3(cx, cy, 44 * k), r: w },
        { p: v3(cx + lean * h * 0.5, cy, 44 * k + h * 0.7), r: w * 0.9 },
        { p: v3(cx + lean * h, cy, 44 * k + h), r: 1.1 },
      ],
      { segs: 6, n: 8 },
    );
  }
  return b;
}

/** A beach umbrella with a striped canopy, tipped a little toward the sun. */
export function umbrella(o: { stripes: 'pink' | 'teal' | 'yellow'; seed: number }): SceneBuilder {
  const b = new SceneBuilder();
  const colour = o.stripes === 'pink' ? STRIPE_PINK : o.stripes === 'teal' ? STRIPE_TEAL : STRIPE_YELLOW;
  const a = b.variant('a', colour, { bands: [0.2, 0.42, 0.64, 0.86], flat: 0.5 });
  const w = b.variant('w', CANVAS_WHITE, { bands: [0.2, 0.42, 0.64, 0.86], flat: 0.5 });
  const mat = b.material({
    name: 'canopy',
    shade: (s) => (Math.floor(((Math.atan2(s.rest[1], s.rest[0]) + Math.PI) / TAU) * 10) % 2 === 0 ? a : w),
    bias: (s) => (hash2(s.px, s.py, o.seed) - 0.5) * 0.05 + 0.34,
  });
  const pole = b.variant('pole', DRIFT);
  tube(b.mesh(b.solid('pole', pole)), [
    { p: v3(0, 0, 0), r: 2.8 },
    { p: v3(0, 0, 124), r: 2.3 },
  ]);
  const sandPile = b.variant('sand', SAND);
  blob(b.mesh(b.solid('sand', sandPile), { noLines: true }), v3(0, 0, 3), v3(22, 14, 5), 0, { rings: 5, segs: 9 });
  const canopy = b.mesh(mat);
  lathe(canopy, {
    c: v3(0, 0, 112),
    profile: [
      [0, 0],
      [18, -2],
      [44, -12],
      [58, -26],
      [52, -24],
      [34, -13],
      [0, -5],
    ],
    segs: 10,
  });
  blob(canopy, v3(0, 0, 118), v3(3.6, 3.6, 5), 0, { rings: 4, segs: 6 });
  tilt(canopy, -0.38, 112);
  return b;
}

/** A bucket with a spade and a heap of shells in it. */
export function bucket(o: { seed: number; colour: 'pink' | 'teal' | 'yellow' }): SceneBuilder {
  const b = new SceneBuilder();
  const ramp0 = o.colour === 'pink' ? STRIPE_PINK : o.colour === 'teal' ? STRIPE_TEAL : STRIPE_YELLOW;
  const body = b.variant('bucket', ramp0, { bands: [0.2, 0.42, 0.64, 0.86] });
  const inside = b.variant('inside', ramp(hex('#8a8ab0'), { steps: 4, shadowHue: 270, lightHue: 90 }));
  const mat = b.material({ name: 'bucket', shade: (s) => (s.n[2] > 0.7 ? inside : body), bias: grain(o.seed, 0.03) });
  lathe(b.mesh(mat), {
    c: v3(0, 0, 3),
    profile: [
      [0, 0],
      [13, 0],
      [19, 28],
      [20, 29],
      [18, 29],
      [12, 26],
      [0, 26],
    ],
    segs: 16,
  });
  const handle = b.variant('handle', DRIFT);
  const hm = b.mesh(b.solid('handle', handle));
  tube(
    hm,
    [
      { p: v3(-19, 0, 28), r: 1.5 },
      { p: v3(-13, 0, 42), r: 1.5 },
      { p: v3(0, 0, 47), r: 1.5 },
      { p: v3(13, 0, 42), r: 1.5 },
      { p: v3(19, 0, 28), r: 1.5 },
    ],
    { segs: 5, n: 14 },
  );
  const sh = b.variant('shell', SHELL_PINK);
  const sm = b.mesh(b.solid('shell', sh));
  const rng = mulberry32(o.seed);
  for (let i = 0; i < 7; i++) {
    const a = rng() * TAU,
      d = rng() * 9;
    blob(sm, v3(Math.cos(a) * d, Math.sin(a) * d * 0.8, 29 + rng() * 3), v3(4.4, 3.4, 3), a, { rings: 4, segs: 7 });
  }
  return b;
}

/** A twisted branch of bleached driftwood. */
export function driftwood(o: { seed: number; scale?: number }): SceneBuilder {
  const k = o.scale ?? 1;
  const rng = mulberry32(o.seed);
  const b = new SceneBuilder();
  const v = b.variant('wood', DRIFT, { bands: [0.2, 0.42, 0.62, 0.84] });
  const mat = b.solid('wood', v, grain(o.seed, 0.1));
  const m = b.mesh(mat);
  tube(
    m,
    [
      { p: v3(-52 * k, 0, 7 * k), r: 5.6 * k },
      { p: v3(-26 * k, 3 * k, 13 * k), r: 6.6 * k },
      { p: v3(2 * k, -2 * k, 9 * k), r: 6 * k },
      { p: v3(30 * k, 3 * k, 16 * k), r: 5 * k },
      { p: v3(52 * k, 0, 22 * k), r: 3.2 * k },
    ],
    { segs: 8, n: 16 },
  );
  for (let i = 0; i < 2; i++) {
    const x = (-10 + i * 28 + rng() * 6) * k;
    tube(
      m,
      [
        { p: v3(x, 0, 12 * k), r: 3.2 * k },
        { p: v3(x + 7 * k, -4 * k, 26 * k), r: 2.4 * k },
        { p: v3(x + 10 * k, -6 * k, 38 * k), r: 1.2 * k },
      ],
      { segs: 6, n: 8 },
    );
  }
  return b;
}

/** A lighthouse with red and white bands, a gallery and a lamp that glows. */
export function lighthouse(o: { lit: boolean }): SceneBuilder {
  const b = new SceneBuilder();
  const white = b.variant('white', CANVAS_WHITE, { bands: [0.2, 0.42, 0.64, 0.86] });
  const red = b.variant('red', TOWER_RED, { bands: [0.2, 0.42, 0.64, 0.86] });
  const stripe = b.material({
    name: 'tower',
    shade: (s) => (Math.floor(s.rest[2] / 44) % 2 === 0 ? red : white),
    bias: grain(5, 0.03),
  });
  const rockV = b.variant('rock', RIVER_STONE, { bands: [0.2, 0.42, 0.62, 0.84] });
  const rockMat = b.solid('rock', rockV, grain(8, 0.18));
  const rock = b.mesh(rockMat);
  blob(rock, v3(0, 0, 20), v3(96, 72, 24), 0.2, { rings: 7, segs: 14 });
  blob(rock, v3(-56, 22, 12), v3(40, 30, 16), 0.5, { rings: 6, segs: 10 });
  blob(rock, v3(58, 18, 11), v3(36, 26, 14), -0.4, { rings: 6, segs: 10 });
  lathe(b.mesh(stripe), {
    c: v3(0, 0, 36),
    profile: [
      [0, 0],
      [40, 0],
      [30, 330],
      [0, 330],
    ],
    segs: 20,
  });
  const gal = b.variant('gal', DRIFT);
  const galMat = b.solid('gal', gal);
  lathe(b.mesh(galMat), {
    c: v3(0, 0, 366),
    profile: [
      [0, 0],
      [44, 0],
      [44, 7],
      [30, 7],
      [30, 7],
      [0, 7],
    ],
    segs: 20,
  });
  const lamp = b.variant('lamp', LAMP_GLOW, { emissive: o.lit ? 4 : 0.8, protect: true, noLines: true });
  lathe(b.mesh(b.solid('lamp', lamp)), {
    c: v3(0, 0, 373),
    profile: [
      [0, 0],
      [24, 0],
      [24, 26],
      [0, 26],
    ],
    segs: 14,
  });
  lathe(b.mesh(b.solid('cap', red)), {
    c: v3(0, 0, 399),
    profile: [
      [0, 0],
      [32, 0],
      [20, 12],
      [8, 26],
      [0, 36],
    ],
    segs: 14,
  });
  const door = b.variant('door', r6('#7a5a48', 320, 60), { flat: 0 });
  blob(b.mesh(b.solid('door', door), { noLines: true }), v3(0, -39, 62), v3(11, 3, 17), 0, { rings: 5, segs: 8 });
  void BARK;
  void BLOOM;
  void PAL;
  return b;
}

const sprite = (scene: SceneBuilder, canvas: Canvas, ss = 4): Rgba =>
  renderScene(scene, { width: canvas.w, height: canvas.h, originX: canvas.ox, originY: canvas.oy, ss }).rgba;

export type { RGB };
export { sprite as renderShore };
