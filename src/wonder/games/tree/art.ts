import type { Rng } from '../../../domain/rng';
import { css, darken, lighten, mix, type RGB } from '../../engine/color';
import { TAU } from '../../engine/ease';
import { makeHills, paintMoon, prerender, roundedRect, verticalGradient } from '../../engine/paint';
import type { Ornament, Plan } from './layout';
import { BOUGH, GIFT, TIERS, type Tier, TREE_HEIGHT, TREE_WIDTH, TRUNK } from './shape';

/** The size of an ornament's own picture, in units, and the point it hangs by. */
export const ORNAMENT_W = 56;
export const ORNAMENT_H = 66;
export const HANG = { x: ORNAMENT_W / 2, y: 3 } as const;

const GOLD: RGB = [244, 192, 62];
const RED: RGB = [226, 54, 66];
const BLUE: RGB = [62, 120, 226];
const GREEN: RGB = [34, 112, 64];

/** The outline of one bough: a point at the top, and a lower edge that scallops. */
function bough(g: CanvasRenderingContext2D, t: Tier, bumps: number): void {
  const span = t.bottom - t.apex;
  g.beginPath();
  const bendX = t.half * BOUGH.bend;
  const bendY = t.apex + span * BOUGH.drop;
  g.moveTo(0, t.apex);
  g.quadraticCurveTo(bendX, bendY, t.half, t.bottom - BOUGH.lip);
  const step = (t.half * 2) / bumps;
  for (let i = 0; i < bumps; i++)
    g.quadraticCurveTo(t.half - step * (i + 0.5), t.bottom + 8, t.half - step * (i + 1), t.bottom - BOUGH.lip);
  g.quadraticCurveTo(-bendX, bendY, 0, t.apex);
  g.closePath();
}

function paintBough(g: CanvasRenderingContext2D, t: Tier, k: number): void {
  const bumps = 3 + k;
  const grad = g.createLinearGradient(-t.half, 0, t.half, 0);
  grad.addColorStop(0, css(mix(GREEN, [90, 190, 110], 0.34)));
  grad.addColorStop(0.4, css(mix(GREEN, [90, 190, 110], 0.55)));
  grad.addColorStop(1, css(darken(GREEN, 0.3)));
  g.save();
  // Each bough throws a soft shadow on the one below, which was drawn before it.
  g.shadowColor = 'rgba(8, 24, 20, 0.5)';
  g.shadowBlur = 6;
  g.shadowOffsetY = 3;
  bough(g, t, bumps);
  g.fillStyle = grad;
  g.fill();
  g.restore();
  g.save();
  bough(g, t, bumps);
  g.clip();
  // The branches, pleated from the middle out to each scallop of the lower edge.
  const step = (t.half * 2) / bumps;
  g.lineCap = 'round';
  for (let i = 0; i <= bumps; i++) {
    const x = t.half - step * i;
    g.strokeStyle = css(darken(GREEN, 0.5), 0.34);
    g.lineWidth = 1.3;
    g.beginPath();
    g.moveTo(x * 0.12, t.apex + (t.bottom - t.apex) * 0.2);
    g.quadraticCurveTo(x * 0.6, t.apex + (t.bottom - t.apex) * 0.55, x, t.bottom - 1);
    g.stroke();
  }
  // The light edge of each scallop.
  for (let i = 0; i < bumps; i++) {
    g.strokeStyle = css([150, 220, 150], 0.4);
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(t.half - step * i - 1.5, t.bottom - 2);
    g.quadraticCurveTo(t.half - step * (i + 0.5), t.bottom + 6.4, t.half - step * (i + 1) + 1.5, t.bottom - 2);
    g.stroke();
  }
  g.restore();
  // Snow resting on the slopes and the tips of the bough.
  g.fillStyle = css([246, 250, 255], 0.92);
  for (const side of [-1, 1]) {
    for (const u of [0.34, 0.62, 0.9]) {
      const x = side * t.half * u * 0.92;
      const y = t.apex + (t.bottom - t.apex) * (u * 0.9 + 0.04);
      g.beginPath();
      g.ellipse(x, y, 4.4 + u * 1.6, 1.9 + u * 0.4, side * 0.5, 0, TAU);
      g.fill();
    }
  }
}

/** How much room the picture of the tree leaves round it, in its own units. */
const PAD = 8;

/** Where on the picture of the tree its tip is, in the tree's own units. */
export const TREE_PAD = { x: TREE_WIDTH / 2 + PAD, y: PAD / 2 + 3 } as const;

/** The size in units of the picture `makeTree` makes. */
export const treeBox = (scale: number): { readonly w: number; readonly h: number } => ({
  w: (TREE_WIDTH + PAD * 2) * scale,
  h: (TREE_HEIGHT + PAD) * scale,
});

/**
 * The tree itself, with its trunk, `scale` units to each of its own, in `pixels` device pixels to
 * the unit.
 */
export function makeTree(scale: number, pixels: number): HTMLCanvasElement {
  const box = treeBox(scale);
  return prerender(
    box.w,
    box.h,
    (g) => {
      g.scale(scale, scale);
      g.translate(TREE_PAD.x, TREE_PAD.y);
      const trunk = g.createLinearGradient(-TRUNK.half, 0, TRUNK.half, 0);
      trunk.addColorStop(0, css([120, 78, 48]));
      trunk.addColorStop(0.5, css([160, 108, 66]));
      trunk.addColorStop(1, css([86, 54, 36]));
      g.fillStyle = trunk;
      g.fillRect(-TRUNK.half, TRUNK.top, TRUNK.half * 2, TRUNK.bottom - TRUNK.top);
      for (let k = TIERS.length - 1; k >= 0; k--) paintBough(g, TIERS[k]!, k);
    },
    pixels,
  );
}

function capAndLoop(g: CanvasRenderingContext2D, string = 0): void {
  g.strokeStyle = css(GOLD);
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(HANG.x, HANG.y - 0.4, 2.6, Math.PI, 0);
  g.stroke();
  if (string > 0) {
    g.beginPath();
    g.moveTo(HANG.x, HANG.y + 2);
    g.lineTo(HANG.x, HANG.y + string);
    g.stroke();
  }
}

function paintBall(g: CanvasRenderingContext2D, color: RGB): void {
  const cx = HANG.x;
  const cy = 38;
  const r = 18;
  capAndLoop(g);
  g.fillStyle = css(GOLD);
  roundedRect(g, cx - 3.6, HANG.y + 1.6, 7.2, 6.4, 1.6);
  g.fill();
  const body = g.createRadialGradient(cx - r * 0.38, cy - r * 0.42, r * 0.08, cx, cy, r);
  body.addColorStop(0, css(lighten(color, 0.78)));
  body.addColorStop(0.32, css(lighten(color, 0.22)));
  body.addColorStop(1, css(darken(color, 0.4)));
  g.fillStyle = body;
  g.beginPath();
  g.arc(cx, cy, r, 0, TAU);
  g.fill();
  // A band of glitter round the middle.
  g.strokeStyle = css(lighten(color, 0.55), 0.55);
  g.lineWidth = 2.2;
  g.setLineDash([2.2, 3]);
  g.beginPath();
  g.ellipse(cx, cy + 1, r * 0.96, r * 0.3, 0, 0.1, Math.PI - 0.1);
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = 'rgba(255, 255, 255, 0.82)';
  g.beginPath();
  g.ellipse(cx - r * 0.4, cy - r * 0.46, r * 0.24, r * 0.15, -0.65, 0, TAU);
  g.fill();
}

function paintCane(g: CanvasRenderingContext2D): void {
  capAndLoop(g, 11);
  const path = (): void => {
    g.beginPath();
    g.moveTo(35, 62);
    g.lineTo(35, 27);
    g.arc(26.5, 27, 8.5, 0, Math.PI, true);
    g.lineTo(18, 33);
  };
  g.lineCap = 'round';
  g.lineJoin = 'round';
  path();
  g.strokeStyle = 'rgba(30, 20, 40, 0.28)';
  g.lineWidth = 11;
  g.stroke();
  path();
  g.strokeStyle = '#fff';
  g.lineWidth = 9;
  g.stroke();
  g.save();
  path();
  g.setLineDash([4.4, 4.4]);
  g.lineCap = 'butt';
  g.strokeStyle = css(RED);
  g.lineWidth = 9;
  g.stroke();
  g.restore();
  // A shine along the stick.
  g.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(33, 58);
  g.lineTo(33, 31);
  g.stroke();
  // A bow where it hangs.
  g.fillStyle = css(RED);
  for (const side of [-1, 1]) {
    g.beginPath();
    g.ellipse(HANG.x + side * 4.4, 15, 4.8, 2.8, side * -0.5, 0, TAU);
    g.fill();
  }
  g.beginPath();
  g.arc(HANG.x, 15, 2, 0, TAU);
  g.fillStyle = css(darken(RED, 0.25));
  g.fill();
}

function paintBell(g: CanvasRenderingContext2D): void {
  capAndLoop(g, 8);
  const grad = g.createLinearGradient(10, 0, 46, 0);
  grad.addColorStop(0, css(darken(GOLD, 0.18)));
  grad.addColorStop(0.35, css(lighten(GOLD, 0.62)));
  grad.addColorStop(1, css(darken(GOLD, 0.32)));
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(14, 46);
  g.bezierCurveTo(14, 26, 19, 17, 28, 17);
  g.bezierCurveTo(37, 17, 42, 26, 42, 46);
  g.quadraticCurveTo(46, 50, 51, 53);
  g.lineTo(5, 53);
  g.quadraticCurveTo(10, 50, 14, 46);
  g.closePath();
  g.fill();
  g.strokeStyle = css(darken(GOLD, 0.35), 0.55);
  g.lineWidth = 1.1;
  g.stroke();
  g.fillStyle = css(darken(GOLD, 0.12));
  g.beginPath();
  g.arc(28, 55, 4.2, 0, TAU);
  g.fill();
  g.fillStyle = css(RED);
  for (const side of [-1, 1]) {
    g.beginPath();
    g.ellipse(28 + side * 5.2, 14.5, 5.4, 3, side * -0.45, 0, TAU);
    g.fill();
  }
  g.fillStyle = css(darken(RED, 0.25));
  g.beginPath();
  g.arc(28, 14.5, 2.2, 0, TAU);
  g.fill();
}

/** A star of this many points, as a path round (x, y). */
export function starPath(g: CanvasRenderingContext2D, x: number, y: number, outer: number, inner: number): void {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? outer : inner;
    g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.closePath();
}

function paintStar(g: CanvasRenderingContext2D): void {
  capAndLoop(g, 14);
  const grad = g.createLinearGradient(10, 18, 46, 54);
  grad.addColorStop(0, css(lighten(GOLD, 0.7)));
  grad.addColorStop(1, css(darken(GOLD, 0.15)));
  starPath(g, 28, 38, 19, 8.4);
  g.fillStyle = grad;
  g.fill();
  g.lineJoin = 'round';
  g.strokeStyle = css(darken(GOLD, 0.35), 0.7);
  g.lineWidth = 1.2;
  g.stroke();
  g.fillStyle = 'rgba(255, 255, 255, 0.7)';
  g.beginPath();
  g.ellipse(24, 32, 3.2, 1.8, -0.7, 0, TAU);
  g.fill();
}

const PAINTERS: Readonly<Record<Ornament, (g: CanvasRenderingContext2D) => void>> = {
  'ball-red': (g) => paintBall(g, RED),
  'ball-blue': (g) => paintBall(g, BLUE),
  'ball-gold': (g) => paintBall(g, GOLD),
  cane: paintCane,
  bell: paintBell,
  star: paintStar,
};

/** The picture of one ornament, hanging from its point, in `pixels` device pixels to the unit. */
export const makeOrnament = (kind: Ornament, pixels: number): HTMLCanvasElement =>
  prerender(ORNAMENT_W, ORNAMENT_H, (g) => PAINTERS[kind](g), pixels);

/** The colour a spark from an ornament has. */
export const TINT: Readonly<Record<Ornament, RGB>> = {
  'ball-red': [255, 120, 130],
  'ball-blue': [130, 180, 255],
  'ball-gold': [255, 225, 130],
  cane: [255, 170, 180],
  bell: [255, 225, 130],
  star: [255, 240, 170],
};

/** A present: its base stands `GIFT.base` units down its picture, in the middle. */
export function makeGift(body: RGB, ribbon: RGB, pixels: number): HTMLCanvasElement {
  const w = 34;
  const h = 26;
  return prerender(
    GIFT.w,
    GIFT.h,
    (g) => {
      g.translate(GIFT.w / 2, GIFT.base);
      const front = g.createLinearGradient(-w / 2, 0, w / 2, 0);
      front.addColorStop(0, css(lighten(body, 0.18)));
      front.addColorStop(1, css(darken(body, 0.28)));
      g.fillStyle = front;
      roundedRect(g, -w / 2, -h, w, h, 3);
      g.fill();
      g.fillStyle = css(lighten(body, 0.1));
      roundedRect(g, -w / 2 - 2, -h - 5, w + 4, 8, 2.5);
      g.fill();
      g.fillStyle = css(ribbon);
      g.fillRect(-3.4, -h - 5, 6.8, h + 5);
      g.fillRect(-w / 2 - 2, -h * 0.5 - 3, w + 4, 6);
      g.beginPath();
      for (const side of [-1, 1]) {
        g.ellipse(side * 6.4, -h - 9, 6.8, 4, side * -0.5, 0, TAU);
      }
      g.fill();
      g.fillStyle = css(darken(ribbon, 0.25));
      g.beginPath();
      g.arc(0, -h - 7.5, 2.8, 0, TAU);
      g.fill();
    },
    pixels,
  );
}

/** The size of the picture of the star on top of the tree, in units. */
export const TOPPER = 44;

/** The star on top of the tree, lit or not, as a picture with its middle in its middle. */
export function makeTopStar(lit: boolean, pixels: number): HTMLCanvasElement {
  const size = TOPPER;
  return prerender(
    size,
    size,
    (g) => {
      g.translate(size / 2, size / 2 + 1);
      const grad = g.createLinearGradient(-16, -16, 16, 16);
      grad.addColorStop(0, css(lit ? [255, 250, 200] : [146, 138, 130]));
      grad.addColorStop(1, css(lit ? darken(GOLD, 0.08) : [100, 94, 92]));
      starPath(g, 0, 0, 19, 8.2);
      g.fillStyle = grad;
      g.fill();
      g.lineJoin = 'round';
      g.strokeStyle = css(lit ? darken(GOLD, 0.3) : [70, 64, 66], 0.8);
      g.lineWidth = 1.4;
      g.stroke();
      if (lit) {
        g.fillStyle = 'rgba(255, 255, 255, 0.7)';
        g.beginPath();
        g.ellipse(-4, -6, 3.4, 1.8, -0.7, 0, TAU);
        g.fill();
      }
    },
    pixels,
  );
}

/** The night, the hills and the snow that the tree stands in, the size of the screen. */
export function makeScene(w: number, h: number, plan: Plan, rng: Rng, pixels: number): HTMLCanvasElement {
  const horizon = plan.ground - plan.tree.scale * 22;
  return prerender(
    w,
    h,
    (g) => {
      verticalGradient(g, 0, 0, w, plan.ground, [
        [0, [14, 16, 52]],
        [0.55, [40, 38, 96]],
        [1, [92, 70, 130]],
      ]);
      paintMoon(g, w * 0.82, Math.max(96, plan.tree.top + 20), Math.min(26, h * 0.07));
      const far = makeHills(w, h * 0.3, rng, [104, 110, 170], [70, 76, 134], 0.7);
      g.drawImage(far, 0, horizon - h * 0.3 + 14, w, h * 0.3);
      const near = makeHills(w, h * 0.22, rng, [212, 224, 248], [170, 188, 228], 0.6);
      g.drawImage(near, 0, plan.ground - h * 0.22 + 10, w, h * 0.22);
      const snow = g.createLinearGradient(0, plan.ground, 0, h);
      snow.addColorStop(0, css([232, 240, 255]));
      snow.addColorStop(1, css([176, 194, 232]));
      g.fillStyle = snow;
      g.fillRect(0, plan.ground, w, h - plan.ground);
      // A few far pines, dark against the hills, and drifts of snow in front.
      g.fillStyle = css([34, 58, 78], 0.9);
      for (let i = 0; i < 9; i++) {
        const x = rng.range(0, w);
        if (Math.abs(x - plan.tree.x) < plan.tree.scale * 54) continue;
        const s = rng.range(0.55, 1) * plan.tree.scale * 0.55;
        const y = plan.ground - 2 - rng.range(0, 10);
        g.beginPath();
        g.moveTo(x, y - 62 * s);
        g.lineTo(x + 18 * s, y);
        g.lineTo(x - 18 * s, y);
        g.closePath();
        g.fill();
      }
      g.fillStyle = css([250, 252, 255], 0.9);
      for (let i = 0; i < 6; i++) {
        g.beginPath();
        g.ellipse(rng.range(0, w), plan.ground + rng.range(6, 24), rng.range(30, 80), rng.range(3, 6), 0, 0, TAU);
        g.fill();
      }
    },
    pixels,
  );
}
