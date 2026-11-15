import type { RGB } from '../core/color';
import type { SampleInfo } from '../core/render';
import { hash2, mulberry32, noise3 } from '../core/rng';
import { rotZ, TAU, type V3, v3 } from '../core/vec';
import { BARK, BLOOM, FOLIAGE, GEM, PAL, type Ramp } from './palette';
import { blendNormals, blob, blobAlong, ellipsoidAt, ribbon, tube } from './prims';
import { SceneBuilder } from './scene';
import type { FoliageName } from './trees';

export type BloomName = keyof typeof BLOOM;

const leafBias =
  (seed: number, amount = 0.22) =>
  (s: SampleInfo): number =>
    (hash2(s.px, s.py, seed) - 0.5) * amount +
    (noise3(s.rest[0] * 0.09, s.rest[1] * 0.09, s.rest[2] * 0.09, seed) - 0.5) * 0.14;

/** A low rounded shrub. Optional dots of color sit on its surface as flowers or berries. */
export function bush(o: {
  seed: number;
  foliage: FoliageName;
  scale?: number;
  dots?: BloomName;
  dotCount?: number;
}): SceneBuilder {
  const k = o.scale ?? 1;
  const rng = mulberry32(o.seed);
  const b = new SceneBuilder();
  const leaf = b.variant('leaf', FOLIAGE[o.foliage]);
  const leafMat = b.solid('leaf', leaf, leafBias(o.seed));
  const part = b.newPart();
  const R: V3 = v3(52 * k, 42 * k, 32 * k);
  const c: V3 = v3(0, 0, 30 * k);
  const m = b.mesh(leafMat, { part });
  const sample = (shell: boolean): V3 => {
    let x: number, y: number, z: number, d: number;
    do {
      x = rng() * 2 - 1;
      y = rng() * 2 - 1;
      z = rng();
      d = Math.hypot(x, y, z);
    } while (d > 1 || (shell && d < 0.7));
    return v3(c[0] + x * R[0], c[1] + y * R[1], c[2] + z * R[2]);
  };
  for (let i = 0; i < 14; i++) {
    const r = (15 + rng() * 9) * k;
    blob(m, sample(false), v3(r, r * 0.85, r * 0.8), rng() * 3, { rings: 6, segs: 9 });
  }
  for (let i = 0; i < 26; i++) {
    const r = (8 + rng() * 6) * k;
    blob(m, sample(true), v3(r, r * 0.85, r * 0.8), rng() * 3, { rings: 5, segs: 8 });
  }
  blendNormals(m, c, R, 0.5);
  if (o.dots) {
    const dot = b.variant('dot', BLOOM[o.dots], { protect: true, priority: 2 });
    const dm = b.solid('dot', dot);
    for (let i = 0; i < (o.dotCount ?? 12); i++) {
      const p = sample(true);
      const dmesh = b.mesh(dm, { noLines: true });
      blob(dmesh, v3(p[0], p[1] - 4 * k, p[2] + 2 * k), v3(4.2 * k, 3.6 * k, 4 * k), 0, { rings: 5, segs: 7 });
    }
  }
  return b;
}

/** A cluster of flowers on thin stems above a few leaves. */
export function flowerClump(o: {
  seed: number;
  bloom: BloomName;
  count?: number;
  scale?: number;
  bloom2?: BloomName;
}): SceneBuilder {
  const k = o.scale ?? 1;
  const rng = mulberry32(o.seed);
  const b = new SceneBuilder();
  const stem = b.variant('stem', FOLIAGE.emerald, { noLines: true });
  const stemMat = b.solid('stem', stem);
  const petals = b.variant('petal', BLOOM[o.bloom], { noLines: true });
  const petals2 = b.variant('petal2', BLOOM[o.bloom2 ?? o.bloom], { noLines: true });
  const center = b.variant('center', BLOOM.yellow, { noLines: true, priority: 2 });
  const petalMat = [b.solid('petal', petals), b.solid('petal2', petals2)];
  const centerMat = b.solid('center', center);
  // Leaves first: a rosette of pointed blades.
  const leaves = b.mesh(stemMat, { twoSided: true });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + rng();
    const len = (16 + rng() * 10) * k;
    ribbon(
      leaves,
      [
        { p: v3(Math.cos(a) * 2, Math.sin(a) * 2, 1), w: 3.6 * k, t: 1.2 * k },
        { p: v3(Math.cos(a) * len * 0.6, Math.sin(a) * len * 0.6, 7 * k), w: 3.2 * k, t: 1.2 * k },
        { p: v3(Math.cos(a) * len, Math.sin(a) * len, 5 * k), w: 1 * k, t: 0.8 * k },
      ],
      v3(0, 0, 1),
      5,
    );
  }
  const n = o.count ?? 5;
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU;
    const d = rng() * 20 * k;
    const x = Math.cos(a) * d,
      y = Math.sin(a) * d * 0.7;
    const h = (20 + rng() * 18) * k;
    const sm = b.mesh(stemMat, { noLines: true });
    tube(
      sm,
      [
        { p: v3(x * 0.6, y * 0.6, 0), r: 1.1 * k },
        { p: v3(x, y, h * 0.5), r: 1 * k },
        { p: v3(x * 1.1, y * 1.1, h), r: 0.9 * k },
      ],
      { segs: 5, n: 6 },
    );
    // Head: a ring of petals around a bright center, facing the camera.
    const pm = b.mesh(petalMat[i % 2 === 0 ? 0 : 1]!, { noLines: true });
    const hx = x * 1.1,
      hy = y * 1.1,
      hz = h;
    const pr = (5 + rng() * 1.6) * k;
    for (let p = 0; p < 6; p++) {
      const pa = (p / 6) * TAU;
      blob(
        pm,
        v3(hx + Math.cos(pa) * pr * 0.9, hy - 2 * k, hz + Math.sin(pa) * pr * 0.9),
        v3(pr * 0.62, pr * 0.4, pr * 0.62),
        0,
        { rings: 4, segs: 6 },
      );
    }
    const cm = b.mesh(centerMat, { noLines: true });
    blob(cm, v3(hx, hy - 3.4 * k, hz), v3(pr * 0.45, pr * 0.3, pr * 0.45), 0, { rings: 4, segs: 6 });
  }
  return b;
}

/** A boulder from a few rounded, flattened lumps, shaded in cut facets. */
export function rock(o: { seed: number; ramp?: Ramp; scale?: number; moss?: boolean }): SceneBuilder {
  const k = o.scale ?? 1;
  const rng = mulberry32(o.seed);
  const b = new SceneBuilder();
  const stone = b.variant('stone', o.ramp ?? PAL.stone, { bands: [0.2, 0.42, 0.62, 0.84] });
  const moss = b.variant('moss', FOLIAGE.emerald);
  const mat = b.material({
    name: 'rock',
    shade: (s) =>
      o.moss && s.n[2] > 0.55 && noise3(s.rest[0] * 0.06, s.rest[1] * 0.06, s.rest[2] * 0.06, o.seed) > 0.42
        ? moss
        : stone,
    bias: (s) =>
      (noise3(s.rest[0] * 0.22, s.rest[1] * 0.22, s.rest[2] * 0.22, o.seed) - 0.5) * 0.3 +
      (hash2(s.px, s.py, o.seed) - 0.5) * 0.07,
  });
  const part = b.newPart();
  const m = b.mesh(mat, { part });
  const lumps = 3 + Math.floor(rng() * 2);
  for (let i = 0; i < lumps; i++) {
    const a = rng() * TAU;
    const d = i === 0 ? 0 : (14 + rng() * 14) * k;
    const r = (i === 0 ? 34 : 18 + rng() * 14) * k;
    blob(m, v3(Math.cos(a) * d, Math.sin(a) * d * 0.8, r * 0.55), v3(r * 1.1, r * 0.9, r * 0.72), rng() * 3, {
      rings: 8,
      segs: 11,
    });
  }
  return b;
}

/**
 * A glowing crystal cluster: hexagonal prisms with pointed tips. `lit` brightens the whole cluster.
 */
export function crystals(o: {
  seed: number;
  hue: 'amethyst' | 'sapphire' | 'emerald' | 'topaz' | 'diamond';
  lit: boolean;
  scale?: number;
}): SceneBuilder {
  const k = o.scale ?? 1;
  const rng = mulberry32(o.seed);
  const b = new SceneBuilder();
  const ramp: Ramp = GEM[o.hue];
  const dim: Ramp = ramp.map((c): RGB => [c[0] * 0.55 + 52, c[1] * 0.55 + 52, c[2] * 0.55 + 66]);
  const v = b.variant('crystal', o.lit ? ramp : dim, {
    bands: [0.18, 0.4, 0.62, 0.84],
    ...(o.lit ? { emissive: 1.5 } : {}),
  });
  const glow = b.variant('glow', ramp, { emissive: 4, noLines: true });
  const mat = b.material({
    name: 'crystal',
    shade: (s) => (o.lit && s.u > 0.15 && s.u < 0.85 && s.v < 0.2 ? glow : v),
    bias: (s) => (hash2(s.px >> 1, s.py >> 1, o.seed) - 0.5) * 0.12,
  });
  const rock = b.variant('base', PAL.stone);
  const rockMat = b.solid('base', rock);
  const base = b.mesh(rockMat);
  blob(base, v3(0, 0, 4 * k), v3(40 * k, 30 * k, 11 * k), 0, { rings: 6, segs: 10 });
  const count = 5 + Math.floor(rng() * 3);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + rng() * 0.5;
    const d = (i === 0 ? 0 : 12 + rng() * 14) * k;
    const h = (i === 0 ? 62 : 28 + rng() * 26) * k;
    const lean = (0.12 + rng() * 0.22) * (rng() < 0.5 ? -1 : 1);
    const cx = Math.cos(a) * d,
      cy = Math.sin(a) * d * 0.8;
    const m = b.mesh(mat);
    const w = (8 + rng() * 4) * k;
    tube(
      m,
      [
        { p: v3(cx, cy, 2), r: w },
        { p: v3(cx + lean * h * 0.5, cy, h * 0.7), r: w * 0.92 },
        { p: v3(cx + lean * h, cy, h), r: 1.2 },
      ],
      { segs: 6, n: 8 },
    );
  }
  return b;
}

/** A small mushroom group. */
export function mushrooms(o: { seed: number; cap: Ramp; spots?: boolean; scale?: number }): SceneBuilder {
  const k = o.scale ?? 1;
  const rng = mulberry32(o.seed);
  const b = new SceneBuilder();
  const cap = b.variant('cap', o.cap);
  const stalk = b.variant('stalk', BLOOM.white);
  const spot = b.variant('spot', BLOOM.white, { protect: true, priority: 2, noLines: true });
  const capMat = b.material({
    name: 'cap',
    shade: (s) =>
      o.spots && s.n[2] > 0.25 && hash2(Math.floor(s.rest[0] / 5), Math.floor(s.rest[1] / 5), o.seed) > 0.78
        ? spot
        : cap,
  });
  const stalkMat = b.solid('stalk', stalk);
  const n = 3 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rng();
    const d = i === 0 ? 0 : (10 + rng() * 12) * k;
    const s = (i === 0 ? 1.2 : 0.65 + rng() * 0.4) * k;
    const x = Math.cos(a) * d,
      y = Math.sin(a) * d * 0.8;
    const sm = b.mesh(stalkMat);
    tube(
      sm,
      [
        { p: v3(x, y, 0), r: 5 * s },
        { p: v3(x, y, 9 * s), r: 4.2 * s },
        { p: v3(x, y, 16 * s), r: 4.6 * s },
      ],
      { segs: 8, n: 6 },
    );
    const cm = b.mesh(capMat);
    blob(cm, v3(x, y, 19 * s), v3(14 * s, 12 * s, 8 * s), 0, { rings: 7, segs: 11 });
  }
  return b;
}

/** A fern: arching fronds from one point. */
export function fern(o: { seed: number; scale?: number }): SceneBuilder {
  const k = o.scale ?? 1;
  const rng = mulberry32(o.seed);
  const b = new SceneBuilder();
  const leaf = b.variant('fern', FOLIAGE.lime, { noLines: true });
  const mat = b.solid('fern', leaf, (s) => (hash2(s.px, s.py, o.seed) - 0.5) * 0.2);
  const m = b.mesh(mat, { twoSided: true });
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rng() * 0.3;
    const len = (34 + rng() * 22) * k;
    const pts = [0, 0.33, 0.66, 1].map((t, j) => ({
      p: v3(Math.cos(a) * len * t, Math.sin(a) * len * t * 0.85, (24 * Math.sin(t * Math.PI * 0.85) + 2) * k),
      w: (7 - j * 1.6) * k,
      t: 1.4 * k,
    }));
    ribbon(m, pts, v3(0, 0, 1), 5);
  }
  return b;
}

/** Tall grass blades in a loose bunch. */
export function tallGrass(o: { seed: number; scale?: number; ramp?: Ramp }): SceneBuilder {
  const k = o.scale ?? 1;
  const rng = mulberry32(o.seed);
  const b = new SceneBuilder();
  const leaf = b.variant('grass', o.ramp ?? PAL.grass, { noLines: true });
  const mat = b.solid('grass', leaf, (s) => (hash2(s.px, s.py, o.seed) - 0.5) * 0.16);
  const m = b.mesh(mat, { twoSided: true });
  for (let i = 0; i < 12; i++) {
    const a = rng() * TAU;
    const d = rng() * 12 * k;
    const x = Math.cos(a) * d,
      y = Math.sin(a) * d * 0.6;
    const h = (22 + rng() * 22) * k;
    const bend = (rng() - 0.5) * 16 * k;
    ribbon(
      m,
      [
        { p: v3(x, y, 0), w: 2.6 * k, t: 0.8 * k },
        { p: v3(x + bend * 0.4, y, h * 0.55), w: 2.2 * k, t: 0.8 * k },
        { p: v3(x + bend, y, h), w: 0.6 * k, t: 0.5 * k },
      ],
      v3(0, -1, 0.1),
      4,
    );
  }
  return b;
}

/**
 * A tall flower on a bending stem with a pinwheel head. `sway` bends the whole plant, in radians,
 * for animation frames.
 */
export function windflower(o: {
  seed: number;
  bloom: BloomName;
  sway: number;
  count?: number;
  scale?: number;
}): SceneBuilder {
  const k = o.scale ?? 1;
  const rng = mulberry32(o.seed);
  const b = new SceneBuilder();
  const stem = b.variant('stem', FOLIAGE.emerald, { noLines: true });
  const stemMat = b.solid('stem', stem);
  const petals = b.variant('petal', BLOOM[o.bloom], { noLines: true });
  const petalMat = b.solid('petal', petals);
  const center = b.variant('center', BLOOM.yellow, { noLines: true, priority: 2 });
  const centerMat = b.solid('center', center);
  const leaves = b.mesh(stemMat, { twoSided: true });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + rng();
    const len = (14 + rng() * 8) * k;
    ribbon(
      leaves,
      [
        { p: v3(Math.cos(a) * 2, Math.sin(a) * 2, 1), w: 3.4 * k, t: 1.2 * k },
        { p: v3(Math.cos(a) * len * 0.6, Math.sin(a) * len * 0.6, 8 * k), w: 3 * k, t: 1.2 * k },
        { p: v3(Math.cos(a) * len, Math.sin(a) * len, 4 * k), w: 1 * k, t: 0.8 * k },
      ],
      v3(0, 0, 1),
      5,
    );
  }
  const n = o.count ?? 3;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rng() * 0.6;
    const d = (4 + rng() * 14) * k;
    const x0 = Math.cos(a) * d,
      y0 = Math.sin(a) * d * 0.7;
    const h = (46 + rng() * 26) * k;
    // Taller stems bend more, and each plant leads or trails the others a little.
    const bend = Math.sin(o.sway + i * 0.9) * 0.22 * (h / 60);
    const tipX = x0 + bend * h * 0.55,
      tipY = y0 + 4 * k;
    const sm = b.mesh(stemMat, { noLines: true });
    tube(
      sm,
      [
        { p: v3(x0, y0, 0), r: 1.2 * k },
        { p: v3(x0 + bend * h * 0.18, y0, h * 0.5), r: 1 * k },
        { p: v3(tipX, tipY, h), r: 0.9 * k },
      ],
      { segs: 5, n: 7 },
    );
    const pm = b.mesh(petalMat, { noLines: true });
    const spin = o.sway * 1.6 + i;
    const pr = (7 + rng() * 1.6) * k;
    for (let p = 0; p < 5; p++) {
      const pa = (p / 5) * TAU + spin;
      blob(
        pm,
        v3(tipX + Math.cos(pa) * pr * 0.85, tipY - 2.4 * k, h + Math.sin(pa) * pr * 0.85),
        v3(pr * 0.7, pr * 0.34, pr * 0.46),
        pa,
        { rings: 4, segs: 6 },
      );
    }
    const cm = b.mesh(centerMat, { noLines: true });
    blob(cm, v3(tipX, tipY - 3.8 * k, h), v3(pr * 0.38, pr * 0.28, pr * 0.38), 0, { rings: 4, segs: 6 });
  }
  return b;
}

/** Marsh reeds with brown cattail heads. */
export function reeds(o: { seed: number; scale?: number }): SceneBuilder {
  const k = o.scale ?? 1;
  const rng = mulberry32(o.seed);
  const b = new SceneBuilder();
  const blade = b.variant('reed', FOLIAGE.lime, { noLines: true });
  const bladeMat = b.solid('reed', blade, (s) => (hash2(s.px, s.py, o.seed) - 0.5) * 0.14);
  const head = b.variant('head', BARK);
  const headMat = b.solid('head', head);
  const m = b.mesh(bladeMat, { twoSided: true });
  const hm = b.mesh(headMat);
  for (let i = 0; i < 14; i++) {
    const a = rng() * TAU;
    const d = rng() * 18 * k;
    const x = Math.cos(a) * d,
      y = Math.sin(a) * d * 0.6;
    const h = (36 + rng() * 40) * k;
    const bend = (rng() - 0.5) * 18 * k;
    ribbon(
      m,
      [
        { p: v3(x, y, 0), w: 2.8 * k, t: 0.8 * k },
        { p: v3(x + bend * 0.4, y, h * 0.55), w: 2.4 * k, t: 0.8 * k },
        { p: v3(x + bend, y, h), w: 0.6 * k, t: 0.5 * k },
      ],
      v3(0, -1, 0.1),
      4,
    );
    if (i % 4 === 0)
      blobAlong(hm, v3(x + bend * 0.85, y, h * 0.86), v3(3 * k, 3 * k, 9 * k), v3(1, 0, 0), 0, { rings: 5, segs: 7 });
  }
  return b;
}

/** A floating pad with a pink flower. Flat, for ponds. */
export function lily(o: { seed: number; flower: boolean; scale?: number }): SceneBuilder {
  const k = o.scale ?? 1;
  const rng = mulberry32(o.seed);
  const b = new SceneBuilder();
  const pad = b.variant('pad', FOLIAGE.emerald, { noLines: true });
  const padMat = b.solid('pad', pad, (s) => (hash2(s.px, s.py, o.seed) - 0.5) * 0.1);
  const m = b.mesh(padMat);
  const n = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU;
    const d = i === 0 ? 0 : (22 + rng() * 10) * k;
    blob(
      m,
      v3(Math.cos(a) * d, Math.sin(a) * d * 0.8, 1.5),
      v3((15 + rng() * 5) * k, (13 + rng() * 4) * k, 2 * k),
      rng() * 3,
      { rings: 4, segs: 10 },
    );
  }
  if (o.flower) {
    const petal = b.variant('petal', BLOOM.pink, { noLines: true, priority: 2 });
    const pm = b.mesh(b.solid('petal', petal));
    for (let p = 0; p < 6; p++) {
      const pa = (p / 6) * TAU;
      blob(pm, v3(Math.cos(pa) * 5 * k, Math.sin(pa) * 4 * k, 6 * k), v3(4.4 * k, 3.4 * k, 4.4 * k), pa, {
        rings: 4,
        segs: 6,
      });
    }
    const center = b.variant('center', BLOOM.yellow, { noLines: true, priority: 3 });
    blob(b.mesh(b.solid('center', center)), v3(0, 0, 7.4 * k), v3(2.6 * k, 2.2 * k, 2.4 * k), 0, { rings: 4, segs: 6 });
  }
  return b;
}

/** Small stones scattered on the ground. */
export function pebbles(o: { seed: number; ramp?: Ramp }): SceneBuilder {
  const rng = mulberry32(o.seed);
  const b = new SceneBuilder();
  const stone = b.variant('stone', o.ramp ?? PAL.stone, { bands: [0.2, 0.42, 0.62, 0.84] });
  const m = b.mesh(b.solid('stone', stone, (s) => (hash2(s.px, s.py, o.seed) - 0.5) * 0.08));
  const n = 4 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU;
    const d = rng() * 26;
    const r = 4 + rng() * 5;
    blob(m, v3(Math.cos(a) * d, Math.sin(a) * d * 0.7, r * 0.4), v3(r, r * 0.8, r * 0.55), rng() * 3, {
      rings: 5,
      segs: 7,
    });
  }
  return b;
}

export { BARK, blobAlong, ellipsoidAt, rotZ };
