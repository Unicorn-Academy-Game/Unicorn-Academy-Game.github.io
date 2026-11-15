import { clamp } from '../../../src/shared/math';
import type { RGB } from './color';
import type { Mesh } from './mesh';
import {
  type Camera,
  cameraProjection,
  createGBuffer,
  type GBuffer,
  type Projection,
  rasterizeDepth,
  rasterizeGBuffer,
  unproject,
} from './raster';
import { cross, dot, norm, type V3 } from './vec';

export const BANDS_PER_VARIANT = 16;
export const BAND_OUTLINE_LIT = 13;
export const BAND_LINE = 14;
export const BAND_OUTLINE = 15;

export interface Variant {
  name: string;
  /** Darkest to lightest. At most 12 entries. */
  ramp: readonly RGB[];
  /** Ascending lit thresholds, one fewer than the ramp length. */
  bands?: readonly number[];
  /** Outline on the shaded side. */
  outline: RGB;
  /** Outline on the lit side (defaults to `outline`). */
  outlineLit?: RGB;
  /** Inner line color (defaults to `outline`). */
  line?: RGB;
  /** Ignores lighting and shows ramp[emissive]. */
  emissive?: number;
  /** Fixed ramp index regardless of lighting. */
  flat?: number;
  /** Vote weight when several surfaces share a final pixel. Default 1. */
  priority?: number;
  /** Survives despeckle (eye highlights, sparkles). */
  protect?: boolean;
  /** Does not grow a silhouette outline. */
  noOutline?: boolean;
  /** Does not take part in inner-line detection. */
  noLines?: boolean;
}

export interface SampleInfo {
  /** Rest-space position. */
  rest: V3;
  /** World normal. */
  n: V3;
  u: number;
  v: number;
  part: number;
  /** Final-resolution pixel the sample falls in. */
  px: number;
  py: number;
}

export interface MaterialDef {
  name: string;
  /** Returns a variant index for this surface sample. */
  shade: (s: SampleInfo) => number;
  /** Optional additive bias on the lit value, for streaks and fur variation. */
  bias?: (s: SampleInfo) => number;
}

export interface SceneSpec {
  meshes: readonly Mesh[];
  materials: readonly MaterialDef[];
  variants: readonly Variant[];
}

export interface RenderConfig {
  /** Final sprite size in pixels. */
  width: number;
  height: number;
  /** Pixel of the world origin in the final sprite. */
  originX: number;
  originY: number;
  /** Camera pitch in radians. */
  pitch: number;
  /** Supersampling factor. */
  ss?: number;
  /**
   * Final pixels per world unit. Defaults to 1; below 1 draws the whole model smaller without
   * changing its construction.
   */
  unit?: number;
  /** Vector pointing toward the light, in world space. */
  light: V3;
  /** Wrap term for the diffuse lobe. */
  wrap?: number;
  shadowStrength?: number;
  aoStrength?: number;
  /**
   * How far a surface must sit behind the nearest occluder, in world units, before it counts as
   * shadowed. Large flat walls seen at a slant need more than the default, or the shadow map breaks
   * them into stripes.
   */
  shadowBias?: number;
  /**
   * Size the shadow map to the model instead of the sprite. Needed when the model reaches well past
   * the sprite's pixel box.
   */
  shadowFit?: boolean;
  /** AO radius in world units. */
  aoRadius?: number;
  /** Minimum share of covered samples for a pixel to exist. */
  coverage?: number;
  /** Depth gap (world units) that creates an inner line between different parts. */
  lineDepth?: number;
  /** Disable the silhouette outline. */
  noOutline?: boolean;
}

export interface Sprite {
  width: number;
  height: number;
  /** 0 is transparent, otherwise 1 + variant * 16 + band. */
  cid: Uint16Array;
  /** Camera depth of the visible surface (Infinity when empty). */
  depth: Float32Array;
  /** Mesh part id + 1 of the visible surface (0 when empty). */
  part: Uint16Array;
  variants: readonly Variant[];
  camera: Camera;
  config: RenderConfig;
}

const viewDir = (pitch: number): V3 => [0, Math.cos(pitch), -Math.sin(pitch)];

export interface RenderHooks {
  /**
   * Runs after cleanup and inner lines, before the silhouette outline: hand-placed details go here.
   */
  afterLines?: (s: Sprite) => void;
}

export function renderSprite(spec: SceneSpec, cfg: RenderConfig, hooks: RenderHooks = {}): Sprite {
  const ss = cfg.ss ?? 4;
  const W = cfg.width * ss;
  const H = cfg.height * ss;
  const cam: Camera = {
    pitch: cfg.pitch,
    scale: ss * (cfg.unit ?? 1),
    cx: cfg.originX * ss,
    cy: cfg.originY * ss,
    width: W,
    height: H,
  };
  const g = createGBuffer(W, H);
  rasterizeGBuffer(g, spec.meshes, cameraProjection(cam), viewDir(cfg.pitch));

  const light = norm(cfg.light);
  const wrap = cfg.wrap ?? 0.3;
  const shadowStrength = cfg.shadowStrength ?? 0.5;
  const aoStrength = cfg.aoStrength ?? 0.55;

  const shadow = buildShadowMap(spec.meshes, cam, light, cfg.shadowBias ?? 1.1, cfg.shadowFit === true);
  const ao = computeAo(g, cam, cfg.aoRadius ?? 7);

  const ssVariant = new Uint16Array(W * H);
  const ssLit = new Float32Array(W * H);
  const info: SampleInfo = { rest: [0, 0, 0], n: [0, 0, 1], u: 0, v: 0, part: 0, px: 0, py: 0 };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = y * W + x;
      const m = g.mat[o]!;
      if (m === 0) continue;
      const n: V3 = [g.nx[o]!, g.ny[o]!, g.nz[o]!];
      info.rest = [g.rx[o]!, g.ry[o]!, g.rz[o]!];
      info.n = n;
      info.u = g.u[o]!;
      info.v = g.v[o]!;
      info.part = g.part[o]! - 1;
      info.px = Math.floor(x / ss);
      info.py = Math.floor(y / ss);
      const material = spec.materials[m - 1]!;
      const vi = material.shade(info);
      const variant = spec.variants[vi]!;
      let lit: number;
      if (variant.emissive !== undefined || variant.flat !== undefined) {
        lit = 1;
      } else {
        lit = clamp((dot(n, light) + wrap) / (1 + wrap), 0, 1);
        lit *= 1 - (1 - shadow.sample(g.depth[o]!, x + 0.5, y + 0.5)) * shadowStrength;
        lit *= 1 - (1 - ao[o]!) * aoStrength;
        if (material.bias) lit = clamp(lit + material.bias(info), 0, 1);
      }
      ssVariant[o] = vi + 1;
      ssLit[o] = lit;
    }
  }

  const sprite = downsample(spec, cfg, cam, g, ssVariant, ssLit, ss);
  cleanup(sprite);
  innerLines(sprite, cfg.lineDepth ?? 4);
  hooks.afterLines?.(sprite);
  if (!cfg.noOutline) outline(sprite, light, cfg.pitch);
  return sprite;
}

interface ShadowMap {
  sample: (cameraDepth: number, sx: number, sy: number) => number;
}

function buildShadowMap(meshes: readonly Mesh[], cam: Camera, light: V3, bias: number, fit: boolean): ShadowMap {
  const up: V3 = Math.abs(light[2]) > 0.95 ? [0, 1, 0] : [0, 0, 1];
  const u = norm(cross(up, light));
  const v = norm(cross(light, u));
  const ax: V3 = [u[0] * cam.scale, u[1] * cam.scale, u[2] * cam.scale];
  const ay: V3 = [-v[0] * cam.scale, -v[1] * cam.scale, -v[2] * cam.scale];
  let mapW = Math.max(cam.width, cam.height);
  let mapH = mapW;
  let bx = mapW / 2;
  let by = mapH / 2;
  if (fit) {
    // Cover every vertex. A map sized to the sprite leaves the top of a tall model outside it, and
    // that part never gets shadowed.
    let x0 = Infinity,
      x1 = -Infinity,
      y0 = Infinity,
      y1 = -Infinity;
    for (const m of meshes) {
      if (m.noShadow) continue;
      for (let i = 0; i < m.pos.length; i += 3) {
        const x = m.pos[i]!,
          y = m.pos[i + 1]!,
          z = m.pos[i + 2]!;
        const lx = ax[0] * x + ax[1] * y + ax[2] * z;
        const ly = ay[0] * x + ay[1] * y + ay[2] * z;
        if (lx < x0) x0 = lx;
        if (lx > x1) x1 = lx;
        if (ly < y0) y0 = ly;
        if (ly > y1) y1 = ly;
      }
    }
    bx = 4 - x0;
    by = 4 - y0;
    mapW = Math.ceil(x1 - x0) + 8;
    mapH = Math.ceil(y1 - y0) + 8;
  }
  const proj: Projection = { ax, ay, az: [-light[0], -light[1], -light[2]], bx, by, bz: 0 };
  const depth = new Float32Array(mapW * mapH).fill(Infinity);
  rasterizeDepth(depth, mapW, mapH, meshes, proj);
  return {
    sample(cameraDepth, sx, sy) {
      const P = unproject(cam, sx, sy, cameraDepth);
      const lx = proj.ax[0] * P[0] + proj.ax[1] * P[1] + proj.ax[2] * P[2] + proj.bx;
      const ly = proj.ay[0] * P[0] + proj.ay[1] * P[1] + proj.ay[2] * P[2] + proj.by;
      const ld = proj.az[0] * P[0] + proj.az[1] * P[1] + proj.az[2] * P[2] + proj.bz;
      let lit = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ix = Math.floor(lx) + dx * 2;
          const iy = Math.floor(ly) + dy * 2;
          if (ix < 0 || iy < 0 || ix >= mapW || iy >= mapH) continue;
          count++;
          if (ld <= depth[iy * mapW + ix]! + bias) lit++;
        }
      }
      return count === 0 ? 1 : lit / count;
    },
  };
}

/**
 * Normal-oriented hemispheric AO from the supersampled G-buffer, evaluated on a half-resolution
 * lattice. Returns 1 for unoccluded.
 */
function computeAo(g: GBuffer, cam: Camera, worldRadius: number): Float32Array {
  const { width: W, height: H, depth } = g;
  const out = new Float32Array(W * H).fill(1);
  const radiusPx = worldRadius * cam.scale;
  const dirs: [number, number][] = [];
  for (let i = 0; i < 8; i++) dirs.push([Math.cos((i / 8) * Math.PI * 2 + 0.3), Math.sin((i / 8) * Math.PI * 2 + 0.3)]);
  const rings = [0.45, 1];
  const maxDist = worldRadius * 2.4;
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x += 2) {
      const o = y * W + x;
      const d = depth[o]!;
      if (d === Infinity) continue;
      const pc = unproject(cam, x + 0.5, y + 0.5, d);
      const nx = g.nx[o]!,
        ny = g.ny[o]!,
        nz = g.nz[o]!;
      let occ = 0;
      let n = 0;
      for (const r of rings) {
        for (const [dx, dy] of dirs) {
          const sx = Math.round(x + dx * radiusPx * r);
          const sy = Math.round(y + dy * radiusPx * r);
          if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
          n++;
          const nd = depth[sy * W + sx]!;
          if (nd === Infinity) continue;
          const pn = unproject(cam, sx + 0.5, sy + 0.5, nd);
          const vx = pn[0] - pc[0],
            vy = pn[1] - pc[1],
            vz = pn[2] - pc[2];
          const dist = Math.hypot(vx, vy, vz);
          if (dist < 0.4 || dist > maxDist) continue;
          const cosA = (nx * vx + ny * vy + nz * vz) / dist;
          if (cosA > 0.18) occ += ((cosA - 0.18) / 0.82) * (1 - dist / maxDist);
        }
      }
      const val = n === 0 ? 1 : 1 - clamp((occ / n) * 2.2, 0, 1);
      out[o] = val;
      if (x + 1 < W) out[o + 1] = val;
      if (y + 1 < H) {
        out[o + W] = val;
        if (x + 1 < W) out[o + W + 1] = val;
      }
    }
  }
  return out;
}

function bandOf(lit: number, v: Variant): number {
  if (v.flat !== undefined) return v.flat;
  if (v.emissive !== undefined) return v.emissive;
  const bands = v.bands ?? defaultBands(v.ramp.length);
  let b = 0;
  while (b < bands.length && lit >= bands[b]!) b++;
  return b;
}

const DEFAULT_BANDS: Record<number, readonly number[]> = {
  2: [0.5],
  3: [0.36, 0.7],
  4: [0.3, 0.55, 0.84],
  5: [0.26, 0.46, 0.7, 0.9],
  6: [0.22, 0.4, 0.58, 0.78, 0.93],
};
function defaultBands(n: number): readonly number[] {
  return DEFAULT_BANDS[n] ?? Array.from({ length: n - 1 }, (_, i) => (i + 1) / n);
}

function downsample(
  spec: SceneSpec,
  cfg: RenderConfig,
  cam: Camera,
  g: GBuffer,
  ssVariant: Uint16Array,
  ssLit: Float32Array,
  ss: number,
): Sprite {
  const w = cfg.width,
    h = cfg.height;
  const cid = new Uint16Array(w * h);
  const depth = new Float32Array(w * h).fill(Infinity);
  const part = new Uint16Array(w * h);
  const nv = spec.variants.length;
  const votes = new Float32Array(nv);
  const litSum = new Float32Array(nv);
  const cnt = new Uint16Array(nv);
  const dSum = new Float32Array(nv);
  const dMin = new Float32Array(nv).fill(Infinity);
  const dPart = new Uint16Array(nv);
  const touched: number[] = [];
  const W = w * ss;
  const need = (cfg.coverage ?? 0.42) * ss * ss;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let covered = 0;
      touched.length = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const o = (y * ss + sy) * W + x * ss + sx;
          const vi = ssVariant[o]!;
          if (vi === 0) continue;
          covered++;
          const k = vi - 1;
          if (cnt[k] === 0) touched.push(k);
          votes[k]! += spec.variants[k]!.priority ?? 1;
          litSum[k]! += ssLit[o]!;
          const d = g.depth[o]!;
          dSum[k]! += d;
          if (d < dMin[k]!) {
            dMin[k] = d;
            dPart[k] = g.part[o]!;
          }
          cnt[k]!++;
        }
      }
      if (covered > 0) {
        let best = -1;
        let bestVotes = -1;
        for (const k of touched) {
          if (votes[k]! > bestVotes) {
            bestVotes = votes[k]!;
            best = k;
          }
        }
        const bv = spec.variants[best]!;
        const strong = (bv.priority ?? 1) > 1.5 && cnt[best]! >= 2;
        if (covered >= need || strong) {
          const band = bandOf(litSum[best]! / cnt[best]!, bv);
          cid[y * w + x] = 1 + best * BANDS_PER_VARIANT + band;
          depth[y * w + x] = dSum[best]! / cnt[best]!;
          part[y * w + x] = dPart[best]!;
        }
      }
      for (const k of touched) {
        votes[k] = 0;
        litSum[k] = 0;
        cnt[k] = 0;
        dSum[k] = 0;
        dMin[k] = Infinity;
      }
    }
  }
  return { width: w, height: h, cid, depth, part, variants: spec.variants, camera: cam, config: cfg };
}

export const variantOf = (c: number): number => Math.floor((c - 1) / BANDS_PER_VARIANT);
export const bandIn = (c: number): number => (c - 1) % BANDS_PER_VARIANT;
/** Packs a variant index and band into a sprite color id. */
export const cidOf = (variant: number, band: number): number => 1 + variant * BANDS_PER_VARIANT + band;

const N4: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const N8: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
];

/** Removes orphan pixels, fills pinholes and calms ragged band edges. */
function cleanup(s: Sprite): void {
  const { width: w, height: h, cid, depth, part, variants } = s;
  const get = (x: number, y: number): number => (x < 0 || y < 0 || x >= w || y >= h ? 0 : cid[y * w + x]!);
  for (let pass = 0; pass < 2; pass++) {
    const next = cid.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const c = cid[i]!;
        if (c === 0) {
          let filled = 0;
          let pick = 0;
          let pickDepth = Infinity;
          let pickPart = 0;
          for (const [dx, dy] of N4) {
            const nc = get(x + dx, y + dy);
            if (nc === 0) continue;
            filled++;
            const j = (y + dy) * w + (x + dx);
            if (depth[j]! < pickDepth) {
              pickDepth = depth[j]!;
              pick = nc;
              pickPart = part[j]!;
            }
          }
          if (filled >= 3) {
            next[i] = pick;
            depth[i] = pickDepth;
            part[i] = pickPart;
          }
          continue;
        }
        if (variants[variantOf(c)]!.protect) continue;
        let same = 0;
        let opaque = 0;
        const tally = new Map<number, number>();
        for (const [dx, dy] of N8) {
          const nc = get(x + dx, y + dy);
          if (nc === 0) continue;
          opaque++;
          if (nc === c) same++;
          tally.set(nc, (tally.get(nc) ?? 0) + 1);
        }
        if (opaque === 0) {
          next[i] = 0;
          part[i] = 0;
          continue;
        }
        if (same <= 1 && opaque >= 5) {
          let best = c;
          let bestN = 0;
          for (const [k, n] of tally) {
            if (n > bestN && !variants[variantOf(k)]!.protect) {
              best = k;
              bestN = n;
            }
          }
          if (bestN >= 5) next[i] = best;
        }
      }
    }
    cid.set(next);
  }
}

function innerLines(s: Sprite, lineDepth: number): void {
  const { width: w, height: h, cid, depth, part, variants } = s;
  const next = cid.slice();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const c = cid[i]!;
      if (c === 0) continue;
      const v = variants[variantOf(c)]!;
      if (v.noLines || v.protect) continue;
      for (const [dx, dy] of N4) {
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        const nc = cid[j]!;
        if (nc === 0) continue;
        const nvv = variants[variantOf(nc)]!;
        if (nvv.noLines && !nvv.protect) continue;
        const gap = depth[i]! - depth[j]!;
        const differentPart = part[i] !== part[j];
        if ((differentPart && gap > lineDepth) || gap > lineDepth * 4) {
          next[i] = 1 + variantOf(c) * BANDS_PER_VARIANT + BAND_LINE;
          break;
        }
      }
    }
  }
  cid.set(next);
}

function outline(s: Sprite, light: V3, pitch: number): void {
  const { width: w, height: h, cid, depth, part, variants } = s;
  // Screen-space direction toward the light: +x right, +y down.
  const lx = light[0];
  const ly = -(light[1] * Math.sin(pitch) + light[2] * Math.cos(pitch));
  const next = cid.slice();
  const nextDepth = depth.slice();
  const nextPart = part.slice();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (cid[y * w + x] !== 0) continue;
      let pick = 0;
      let pickDepth = Infinity;
      let pickPart = 0;
      let px = 0,
        py = 0;
      for (const [dx, dy] of N4) {
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        const nc = cid[j]!;
        if (nc === 0 || variants[variantOf(nc)]!.noOutline) continue;
        if (depth[j]! < pickDepth) {
          pickDepth = depth[j]!;
          pick = nc;
          pickPart = part[j]!;
          px = dx;
          py = dy;
        }
      }
      if (pick === 0) continue;
      // The body pixel sits at (+px,+py) from this outline pixel; the outline is on the lit side
      // when that offset points away from the light.
      const litSide = px * lx + py * ly < -0.05;
      const band = litSide && variants[variantOf(pick)]!.outlineLit ? BAND_OUTLINE_LIT : BAND_OUTLINE;
      next[y * w + x] = 1 + variantOf(pick) * BANDS_PER_VARIANT + band;
      nextDepth[y * w + x] = pickDepth;
      nextPart[y * w + x] = pickPart;
    }
  }
  cid.set(next);
  depth.set(nextDepth);
  part.set(nextPart);
}

export function colorOf(variants: readonly Variant[], c: number): RGB {
  const v = variants[variantOf(c)]!;
  const b = bandIn(c);
  if (b === BAND_OUTLINE) return v.outline;
  if (b === BAND_OUTLINE_LIT) return v.outlineLit ?? v.outline;
  if (b === BAND_LINE) return v.line ?? v.outline;
  return v.ramp[Math.min(b, v.ramp.length - 1)]!;
}

export function spriteToRgba(s: Sprite): Uint8Array {
  const out = new Uint8Array(s.width * s.height * 4);
  for (let i = 0; i < s.cid.length; i++) {
    const c = s.cid[i]!;
    if (c === 0) continue;
    const rgb = colorOf(s.variants, c);
    out[i * 4] = Math.round(rgb[0]);
    out[i * 4 + 1] = Math.round(rgb[1]);
    out[i * 4 + 2] = Math.round(rgb[2]);
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** Final-pixel position of a world point under the sprite's camera. */
export function projectPoint(
  cfg: Pick<RenderConfig, 'originX' | 'originY' | 'pitch' | 'unit'>,
  p: V3,
): [number, number] {
  const u = cfg.unit ?? 1;
  return [cfg.originX + p[0] * u, cfg.originY - (p[1] * Math.sin(cfg.pitch) + p[2] * Math.cos(cfg.pitch)) * u];
}
