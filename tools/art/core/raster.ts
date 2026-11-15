import type { Mesh } from './mesh';
import type { V3 } from './vec';

/**
 * Affine orthographic projection: screenX = ax.P + bx, screenY = ay.P + by, depth = az.P + bz
 * (smaller is nearer).
 */
export interface Projection {
  readonly ax: V3;
  readonly ay: V3;
  readonly az: V3;
  readonly bx: number;
  readonly by: number;
  readonly bz: number;
}

export interface Camera {
  pitch: number;
  /** Supersampled buffer pixels per world unit. */
  scale: number;
  /** Buffer pixel of the world origin. */
  cx: number;
  cy: number;
  width: number;
  height: number;
}

export function cameraProjection(cam: Camera): Projection {
  const s = cam.scale;
  const sp = Math.sin(cam.pitch),
    cp = Math.cos(cam.pitch);
  return { ax: [s, 0, 0], ay: [0, -s * sp, -s * cp], az: [0, cp, -sp], bx: cam.cx, by: cam.cy, bz: 0 };
}

/** Inverse of the camera projection: world position of a buffer pixel with a given depth. */
export function unproject(cam: Camera, sx: number, sy: number, depth: number): V3 {
  const sp = Math.sin(cam.pitch),
    cp = Math.cos(cam.pitch);
  const X = (sx - cam.cx) / cam.scale;
  const up = (cam.cy - sy) / cam.scale;
  return [X, up * sp + depth * cp, up * cp - depth * sp];
}

export interface GBuffer {
  readonly width: number;
  readonly height: number;
  readonly depth: Float32Array;
  readonly mat: Uint16Array;
  readonly part: Uint16Array;
  readonly nx: Float32Array;
  readonly ny: Float32Array;
  readonly nz: Float32Array;
  readonly rx: Float32Array;
  readonly ry: Float32Array;
  readonly rz: Float32Array;
  readonly u: Float32Array;
  readonly v: Float32Array;
  readonly flags: Uint8Array;
}

export const FLAG_NO_LINES = 1;

export function createGBuffer(width: number, height: number): GBuffer {
  const n = width * height;
  return {
    width,
    height,
    depth: new Float32Array(n).fill(Infinity),
    mat: new Uint16Array(n),
    part: new Uint16Array(n),
    nx: new Float32Array(n),
    ny: new Float32Array(n),
    nz: new Float32Array(n),
    rx: new Float32Array(n),
    ry: new Float32Array(n),
    rz: new Float32Array(n),
    u: new Float32Array(n),
    v: new Float32Array(n),
    flags: new Uint8Array(n),
  };
}

const EPS = -1e-7;

/** Rasterizes meshes into the G-buffer. Material ids are stored +1 so zero means empty. */
export function rasterizeGBuffer(g: GBuffer, meshes: readonly Mesh[], proj: Projection, viewDir: V3): void {
  const { width: W, height: H } = g;
  for (const m of meshes) {
    const pos = m.pos;
    const vcount = pos.length / 3;
    const sx = new Float64Array(vcount);
    const sy = new Float64Array(vcount);
    const sd = new Float64Array(vcount);
    for (let i = 0; i < vcount; i++) {
      const x = pos[i * 3]!,
        y = pos[i * 3 + 1]!,
        z = pos[i * 3 + 2]!;
      sx[i] = proj.ax[0] * x + proj.ax[1] * y + proj.ax[2] * z + proj.bx;
      sy[i] = proj.ay[0] * x + proj.ay[1] * y + proj.ay[2] * z + proj.by;
      sd[i] = proj.az[0] * x + proj.az[1] * y + proj.az[2] * z + proj.bz;
    }
    const idx = m.idx;
    const flag = m.noLines ? FLAG_NO_LINES : 0;
    const matId = m.mat + 1;
    for (let t = 0; t < idx.length; t += 3) {
      const i0 = idx[t]!,
        i1 = idx[t + 1]!,
        i2 = idx[t + 2]!;
      const x0 = sx[i0]!,
        y0 = sy[i0]!,
        x1 = sx[i1]!,
        y1 = sy[i1]!,
        x2 = sx[i2]!,
        y2 = sy[i2]!;
      const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
      if (Math.abs(area) < 1e-9) continue;
      const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
      const maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
      const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
      const maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
      const inv = 1 / area;
      const d0 = sd[i0]!,
        d1 = sd[i1]!,
        d2 = sd[i2]!;
      for (let py = minY; py <= maxY; py++) {
        const cy = py + 0.5;
        for (let px = minX; px <= maxX; px++) {
          const cx = px + 0.5;
          const w0 = ((x1 - cx) * (y2 - cy) - (x2 - cx) * (y1 - cy)) * inv;
          const w1 = ((x2 - cx) * (y0 - cy) - (x0 - cx) * (y2 - cy)) * inv;
          const w2 = 1 - w0 - w1;
          if (w0 < EPS || w1 < EPS || w2 < EPS) continue;
          const d = w0 * d0 + w1 * d1 + w2 * d2;
          const o = py * W + px;
          if (d >= g.depth[o]!) continue;
          g.depth[o] = d;
          g.mat[o] = matId;
          g.part[o] = m.part + 1;
          g.flags[o] = flag;
          let nx = w0 * m.nor[i0 * 3]! + w1 * m.nor[i1 * 3]! + w2 * m.nor[i2 * 3]!;
          let ny = w0 * m.nor[i0 * 3 + 1]! + w1 * m.nor[i1 * 3 + 1]! + w2 * m.nor[i2 * 3 + 1]!;
          let nz = w0 * m.nor[i0 * 3 + 2]! + w1 * m.nor[i1 * 3 + 2]! + w2 * m.nor[i2 * 3 + 2]!;
          const nl = Math.hypot(nx, ny, nz) || 1;
          nx /= nl;
          ny /= nl;
          nz /= nl;
          if (m.twoSided && nx * viewDir[0] + ny * viewDir[1] + nz * viewDir[2] > 0) {
            nx = -nx;
            ny = -ny;
            nz = -nz;
          }
          g.nx[o] = nx;
          g.ny[o] = ny;
          g.nz[o] = nz;
          g.rx[o] = w0 * m.rest[i0 * 3]! + w1 * m.rest[i1 * 3]! + w2 * m.rest[i2 * 3]!;
          g.ry[o] = w0 * m.rest[i0 * 3 + 1]! + w1 * m.rest[i1 * 3 + 1]! + w2 * m.rest[i2 * 3 + 1]!;
          g.rz[o] = w0 * m.rest[i0 * 3 + 2]! + w1 * m.rest[i1 * 3 + 2]! + w2 * m.rest[i2 * 3 + 2]!;
          g.u[o] = w0 * m.uv[i0 * 2]! + w1 * m.uv[i1 * 2]! + w2 * m.uv[i2 * 2]!;
          g.v[o] = w0 * m.uv[i0 * 2 + 1]! + w1 * m.uv[i1 * 2 + 1]! + w2 * m.uv[i2 * 2 + 1]!;
        }
      }
    }
  }
}

/** Depth-only pass used for the shadow map. */
export function rasterizeDepth(
  depth: Float32Array,
  W: number,
  H: number,
  meshes: readonly Mesh[],
  proj: Projection,
): void {
  for (const m of meshes) {
    if (m.noShadow) continue;
    const pos = m.pos;
    const vcount = pos.length / 3;
    const sx = new Float64Array(vcount);
    const sy = new Float64Array(vcount);
    const sd = new Float64Array(vcount);
    for (let i = 0; i < vcount; i++) {
      const x = pos[i * 3]!,
        y = pos[i * 3 + 1]!,
        z = pos[i * 3 + 2]!;
      sx[i] = proj.ax[0] * x + proj.ax[1] * y + proj.ax[2] * z + proj.bx;
      sy[i] = proj.ay[0] * x + proj.ay[1] * y + proj.ay[2] * z + proj.by;
      sd[i] = proj.az[0] * x + proj.az[1] * y + proj.az[2] * z + proj.bz;
    }
    const idx = m.idx;
    for (let t = 0; t < idx.length; t += 3) {
      const i0 = idx[t]!,
        i1 = idx[t + 1]!,
        i2 = idx[t + 2]!;
      const x0 = sx[i0]!,
        y0 = sy[i0]!,
        x1 = sx[i1]!,
        y1 = sy[i1]!,
        x2 = sx[i2]!,
        y2 = sy[i2]!;
      const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
      if (Math.abs(area) < 1e-9) continue;
      const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
      const maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
      const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
      const maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
      const inv = 1 / area;
      const d0 = sd[i0]!,
        d1 = sd[i1]!,
        d2 = sd[i2]!;
      for (let py = minY; py <= maxY; py++) {
        const cy = py + 0.5;
        for (let px = minX; px <= maxX; px++) {
          const cx = px + 0.5;
          const w0 = ((x1 - cx) * (y2 - cy) - (x2 - cx) * (y1 - cy)) * inv;
          const w1 = ((x2 - cx) * (y0 - cy) - (x0 - cx) * (y2 - cy)) * inv;
          const w2 = 1 - w0 - w1;
          if (w0 < EPS || w1 < EPS || w2 < EPS) continue;
          const d = w0 * d0 + w1 * d1 + w2 * d2;
          const o = py * W + px;
          if (d < depth[o]!) depth[o] = d;
        }
      }
    }
  }
}
