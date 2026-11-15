import type { RGB } from '../core/color';
import type { Rgba } from '../core/image';
import { add, applyM, deg, dot, mulM, norm, rotZ, type V3 } from '../core/vec';
import { type Color, Painter } from '../world/paint';
import type { HumanPose, Joints } from './rig';

export interface FaceStyle {
  iris: RGB;
  white: RGB;
  brow: RGB;
  lip: RGB;
  mouthInside: RGB;
  blush: RGB;
  blushAlpha: number;
  lid: RGB;
  freckles?: RGB;
  /** Distance between the eyes' centres, in units. */
  eyeGap: number;
  /** Eye height above the head centre, in units (negative is below). */
  eyeZ: number;
  /** Cranium radii, to find the surface in front of the eyes. */
  cranium: V3;
  jaw: { r: V3; down: number; forward: number };
}

/**
 * A painter that leaves pixels alone unless the face is what the viewer sees there, so a hat brim
 * or a hand hides the features.
 */
class Guarded extends Painter {
  constructor(
    img: Rgba,
    private readonly ok: (x: number, y: number) => boolean,
  ) {
    super(img);
  }

  override px(x: number, y: number, c: Color): void {
    if (this.ok(x, y)) super.px(x, y, c);
  }

  override over(x: number, y: number, c: RGB, a: number): void {
    if (this.ok(x, y)) super.over(x, y, c, a);
  }
}

const PITCH = deg(27);
/** Unit vector from the scene toward the camera. */
const TO_CAMERA: V3 = [0, -Math.cos(PITCH), Math.sin(PITCH)];

/**
 * The surface of the head at head-local offsets (v, w): the cranium above, the jaw below, whichever
 * sticks out farther.
 */
function surface(style: FaceStyle, v: number, w: number): { p: V3; n: V3 } {
  const [rx, ry, rz] = style.cranium;
  const cx = rx * Math.sqrt(Math.max(0.02, 1 - (v / ry) ** 2 - (w / rz) ** 2));
  const [jx, jy, jz] = style.jaw.r;
  const jw = w + style.jaw.down;
  const jxs = style.jaw.forward + jx * Math.sqrt(Math.max(0.02, 1 - (v / jy) ** 2 - (jw / jz) ** 2));
  if (jxs > cx && Math.abs(jw) < jz)
    return { p: [jxs, v, w], n: norm([(jxs - style.jaw.forward) / jx ** 2, v / jy ** 2, jw / jz ** 2]) };
  return { p: [cx, v, w], n: norm([cx / rx ** 2, v / ry ** 2, w / rz ** 2]) };
}

/**
 * Paints eyes, brows, a mouth and cheeks onto a rendered figure. Every feature is placed on the 3D
 * head and projected, so it turns with the head, narrows toward the side view and disappears when
 * the face looks away from the viewer.
 */
export function paintFace(
  img: Rgba,
  at: (p: V3) => [number, number],
  j: Joints,
  pose: HumanPose,
  yaw: number,
  style: FaceStyle,
  canPaint: (x: number, y: number) => boolean,
): void {
  const paint = new Guarded(img, canPaint);
  const R = mulM(rotZ(yaw), j.headR);
  const c = applyM(rotZ(yaw), j.head);
  const place = (v: number, w: number): { x: number; y: number; vis: number } => {
    const s = surface(style, v, w);
    const at3 = (d: number): { x: number; y: number; vis: number } => {
      const turn = rotZ(d);
      const world = add(c, applyM(R, applyM(turn, s.p)));
      const [x, y] = at(world);
      return { x, y, vis: dot(applyM(R, applyM(turn, s.n)), TO_CAMERA) };
    };
    const straight = at3(0);
    // A feature on the near side of a head seen in profile sits on the edge of the silhouette and
    // would vanish. Slide it around the head toward the viewer until it shows, the way a drawn
    // profile does. A feature on the far side stays hidden.
    if (straight.vis >= 0.5 || straight.vis < 0.04) return straight;
    let best = straight;
    for (const d of [0.1, 0.2, 0.3, 0.4, 0.5]) {
      for (const sign of [-1, 1]) {
        const q = at3(sign * d);
        if (q.vis > best.vis) best = q;
      }
      if (best.vis >= 0.5) break;
    }
    return best;
  };
  const half = style.eyeGap / 2;

  // Cheeks first, so the features sit over them.
  for (const side of [-1, 1]) {
    const q = place(side * (half + 3.2), style.eyeZ - 6.6);
    if (q.vis < 0.2) continue;
    const rx = 2.8 * Math.min(1, q.vis / 0.7),
      ry = 1.9;
    for (let py = Math.floor(q.y - ry - 1); py <= Math.ceil(q.y + ry + 1); py++) {
      for (let px = Math.floor(q.x - rx - 1); px <= Math.ceil(q.x + rx + 1); px++) {
        const d = ((px + 0.5 - q.x) / rx) ** 2 + ((py + 0.5 - q.y) / ry) ** 2;
        if (d < 1) paint.over(px, py, style.blush, style.blushAlpha * (1 - d * 0.5));
      }
    }
  }

  if (style.freckles) {
    for (const side of [-1, 1]) {
      for (const [dv, dw] of [
        [3.2, -5.6],
        [5.4, -6.6],
        [4.2, -8.2],
        [6.6, -4.8],
      ] as const) {
        const q = place(side * (half + dv), style.eyeZ + dw);
        if (q.vis < 0.35) continue;
        const px = Math.round(q.x),
          py = Math.round(q.y);
        paint.px(px, py, style.freckles);
      }
    }
  }

  // The eyes. A closed eye is a lid line, an open one an oval with a bright spot.
  const open = 1 - pose.blink;
  const eyes: { x: number; y: number; vis: number }[] = [];
  for (const side of [-1, 1]) {
    const q = place(side * half + pose.look[0] * 0.4, style.eyeZ);
    eyes.push(q);
    if (q.vis < 0.18) continue;
    const squash = Math.min(1, q.vis / 0.72);
    const rx = 2.5 * squash + 0.3,
      ry = 3.7 * Math.max(0.12, open);
    const lookX = pose.look[0] * 0.5 * squash,
      lookY = -pose.look[1] * 0.6;
    if (open < 0.35) {
      for (let k = -2; k <= 2; k++)
        paint.px(Math.round(q.x + k * squash), Math.round(q.y + 1 + (Math.abs(k) === 2 ? -1 : 0)), style.lid);
      continue;
    }
    for (let py = Math.floor(q.y - ry - 1); py <= Math.ceil(q.y + ry + 1); py++) {
      for (let px = Math.floor(q.x - rx - 1); px <= Math.ceil(q.x + rx + 1); px++) {
        const d = ((px + 0.5 - q.x - lookX) / rx) ** 2 + ((py + 0.5 - q.y - lookY) / ry) ** 2;
        if (d <= 1) paint.px(px, py, d > 0.58 ? style.lid : style.iris);
      }
    }
    // A single bright spot, up and to the lit side.
    const hx = Math.round(q.x + lookX - rx * 0.35),
      hy = Math.round(q.y + lookY - ry * 0.45);
    if (squash > 0.5) paint.px(hx, hy, style.white);
  }

  // Brows: a short stroke above each eye, tilted with the expression.
  for (const [i, side] of ([-1, 1] as const).entries()) {
    const e = eyes[i]!;
    if (e.vis < 0.22) continue;
    const squash = Math.min(1, e.vis / 0.72);
    const lift = 5.2 + pose.brow * 1.6;
    const tilt = -pose.brow * 0.9 * side;
    const len = Math.max(2, Math.round(4 * squash));
    for (let k = 0; k < len; k++) {
      const t = len === 1 ? 0 : k / (len - 1) - 0.5;
      paint.px(Math.round(e.x + t * len), Math.round(e.y - lift + t * tilt * 2), style.brow);
    }
  }

  // The mouth: a smile that widens into an open grin.
  const m = place(0, style.eyeZ - 10.4);
  if (m.vis >= 0.25) {
    const squash = Math.min(1, m.vis / 0.72);
    const wide = (3.6 + pose.mouth * 0.8) * squash + 0.8;
    const cx = m.x;
    for (let k = Math.floor(-wide); k <= Math.ceil(wide); k++) {
      const t = k / wide;
      const dy = Math.round(t * t * (1.6 + pose.mouth * 0.6) - 0.6);
      paint.px(Math.round(cx + k), Math.round(m.y + dy), style.lip);
    }
    if (pose.mouth > 0.3) {
      const depth = Math.round(1 + pose.mouth * 2);
      for (let k = Math.floor(-wide + 1); k <= Math.ceil(wide - 1); k++) {
        const t = k / wide;
        const top = Math.round(t * t * (1.6 + pose.mouth * 0.6) - 0.6);
        for (let dy = 1; dy <= depth - Math.round(Math.abs(t) * depth * 0.7); dy++)
          paint.px(Math.round(cx + k), Math.round(m.y + top + dy), style.mouthInside);
      }
    }
  }
}
