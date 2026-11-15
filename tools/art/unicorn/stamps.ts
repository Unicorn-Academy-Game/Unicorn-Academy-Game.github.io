import { clamp } from '../../../src/shared/math';
import { cidOf, projectPoint, type RenderConfig, type Sprite } from '../core/render';
import { dot, type V3 } from '../core/vec';
import type { Kit } from './kit';
import type { FacePoint, UnicornModel } from './model';
import { PART } from './parts';
import type { Pose } from './pose';

/** Camera-space helpers shared by the stamps. */
function camera(cfg: RenderConfig): { toCam: V3; depthOf: (p: V3) => number } {
  const sp = Math.sin(cfg.pitch),
    cp = Math.cos(cfg.pitch);
  return { toCam: [0, -cp, sp], depthOf: (p) => p[1] * cp - p[2] * sp };
}

interface Visible {
  x: number;
  y: number;
  /** 0..1, how squarely the feature faces the camera. */
  facing: number;
  depth: number;
}

function locate(cfg: RenderConfig, fp: FacePoint): Visible | null {
  const cam = camera(cfg);
  const facing = dot(fp.normal, cam.toCam);
  if (facing < 0.1) return null;
  const [x, y] = projectPoint(cfg, fp.pos);
  return { x, y, facing, depth: cam.depthOf(fp.pos) };
}

const HEADISH = new Set<number>([PART.head, PART.jaw]);

/** Writes a pixel only where the head is the visible surface at about the expected depth. */
function put(s: Sprite, px: number, py: number, cid: number, depth: number): boolean {
  if (px < 0 || py < 0 || px >= s.width || py >= s.height) return false;
  const i = py * s.width + px;
  if (s.cid[i] === 0 || !HEADISH.has(s.part[i]! - 1)) return false;
  if (s.depth[i]! < depth - 5) return false;
  s.cid[i] = cid;
  return true;
}

interface EyeStyle {
  rx: number;
  ry: number;
}

function drawEye(
  s: Sprite,
  kit: Kit,
  v: Visible,
  style: EyeStyle,
  look: [number, number],
  blink: number,
  flip: 1 | -1,
): void {
  const lid = kit.spec.eye.lid ?? 0;
  const ring = cidOf(kit.vi.eyeRing!, 0);
  const irisDark = cidOf(kit.vi.eyeIris!, 0);
  const irisLight = cidOf(kit.vi.eyeIris!, 1);
  const glint = cidOf(kit.vi.eyeGlint!, 0);
  // Narrow the eye as it turns away from the camera.
  const w = clamp(v.facing / 0.8, 0.5, 1);
  const rx = style.rx * w;
  const ry = style.ry;
  const cx = v.x;
  const cy = v.y;
  const x0 = Math.floor(cx - rx - 2),
    x1 = Math.ceil(cx + rx + 2);
  const y0 = Math.floor(cy - ry - 2),
    y1 = Math.ceil(cy + ry + 2);
  if (blink > 0.55) {
    // Closed lid: a short curved lash line.
    for (let px = x0; px <= x1; px++) {
      const u = (px + 0.5 - cx) / Math.max(rx, 1);
      if (Math.abs(u) > 1.05) continue;
      const py = Math.round(cy + 0.6 + u * u * 0.9 * (ry / 3.5));
      put(s, px, py, ring, v.depth);
    }
    put(s, Math.round(cx - flip * (rx + 0.6)), Math.round(cy - 0.6), ring, v.depth);
    return;
  }
  const lidDrop = Math.max(clamp(blink * 2, 0, 1), lid);
  const lidT = -1 + lidDrop * 1.3;
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const u = (px + 0.5 - cx) / rx;
      const t = (py + 0.5 - cy) / ry;
      const r2 = u * u + t * t;
      if (r2 > 1.08) continue;
      if (t < lidT) continue;
      let cid: number;
      if (r2 > 0.64 || t < lidT + 0.34) cid = ring;
      else {
        // Pupil follows the look offset; the iris is darker toward the lid.
        const pu = u - look[0] * 0.28 * flip,
          pt = t + look[1] * 0.3;
        if (Math.abs(pu) < 0.28 && Math.abs(pt) < 0.44) cid = ring;
        else cid = t < -0.05 ? irisDark : irisLight;
      }
      put(s, px, py, cid, v.depth);
    }
  }
  // Catch-light up and toward the light, then a lash flick at the outer top corner.
  const gx = Math.round(cx - 0.45 * rx - 0.5),
    gy = Math.round(cy - 0.5 * ry - 0.4);
  put(s, gx, gy, glint, v.depth);
  put(s, gx + 1, gy, glint, v.depth);
  put(s, gx, gy + 1, glint, v.depth);
  put(s, Math.round(cx + 0.55 * rx), Math.round(cy + 0.55 * ry), irisLight, v.depth);
  if (kit.spec.eye.lash) {
    put(s, Math.round(cx - flip * (rx + 0.4)), Math.round(cy - ry * 0.55), ring, v.depth);
    put(s, Math.round(cx - flip * (rx + 1.2)), Math.round(cy - ry * 0.9), ring, v.depth);
  }
}

function line(s: Sprite, x0: number, y0: number, x1: number, y1: number, cid: number, depth: number): void {
  const dx = Math.abs(x1 - x0),
    dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1,
    sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0,
    y = y0;
  for (let n = 0; n < 64; n++) {
    put(s, x, y, cid, depth);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

/** Eyes, nostrils and the mouth line, placed from 3D anchors so they follow every head pose. */
export function faceStamps(kit: Kit, model: UnicornModel, pose: Pose, cfg: RenderConfig): (s: Sprite) => void {
  return (s) => {
    const style: EyeStyle = { rx: 3.4 * kit.spec.eye.size, ry: 4.2 * kit.spec.eye.size };
    const eyes = model.face.eyes;
    const sides: (1 | -1)[] = [1, -1];
    eyes.forEach((fp, i) => {
      const v = locate(cfg, fp);
      if (!v) return;
      // Which way the lash flicks: away from the muzzle on screen.
      const muzzle = locate(cfg, { pos: model.anchors.muzzle, normal: fp.normal });
      const flip: 1 | -1 = muzzle ? (muzzle.x >= v.x ? 1 : -1) : sides[i]!;
      drawEye(s, kit, v, style, pose.look, pose.blink, flip);
    });
    const nostril = cidOf(kit.vi.nostril!, 0);
    for (const fp of model.face.nostrils) {
      const v = locate(cfg, fp);
      if (!v) continue;
      const px = Math.round(v.x - 0.5),
        py = Math.round(v.y - 0.5);
      put(s, px, py, nostril, v.depth);
      put(s, px, py + 1, nostril, v.depth);
    }
    const mouth = cidOf(kit.vi.mouth!, 0);
    // The tip faces forward and is edge-on from the side, so only the cheek-side corners decide
    // visibility.
    const [tx, ty] = projectPoint(cfg, model.face.mouthTip.pos);
    for (const fp of model.face.mouthCorners) {
      const v = locate(cfg, fp);
      if (v) line(s, Math.round(v.x), Math.round(v.y), Math.round(tx), Math.round(ty), mouth, v.depth);
    }
  };
}
