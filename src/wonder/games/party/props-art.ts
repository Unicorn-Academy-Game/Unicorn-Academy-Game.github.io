import type { Rng } from '../../../domain/rng';
import type { SpriteBank } from '../../engine/bank';
import { COLORS, css, darken, lighten, mix, type RGB } from '../../engine/color';
import { TAU } from '../../engine/ease';
import { pictureOfStone } from '../../engine/gems';
import { addRoundedRect, glowAt, prerender } from '../../engine/paint';
import type { Painter } from '../../engine/painter';
import type { Particles } from '../../engine/particles';
import { PARTY_COLORS } from '../balloons/pops';
import { type Cannon, type Cannons, HEIGHT, MOUTH } from './cannons';
import type { Kind, Pinata } from './pinata';
import { sharp } from './world-art';

/**
 * The things that are tossed about at a party. The cannons are the striped cone of the toy, large,
 * leaning in toward the middle of the floor. The pinata is a star, a heart or a ball covered in
 * fringes of paper, and cracks as it is hit. The sweets are what comes out of it.
 */

/**
 * How much of the picture of the cone is above the rim of its mouth, which is where the streamers
 * stick up.
 */
const RIM = 0.8;

export function paintCannons(p: Painter, bank: SpriteBank | null, cannons: Cannons, ox: number, t: number): void {
  const pic = bank?.sprite('playground', 'pg-popper', 0);
  for (const c of cannons.list) {
    const m = cannons.mouthOf(c);
    const g = p.ctx;
    const ready = c.wait <= 0;
    const color = c.colors[0]!;
    // A shadow on the grass.
    g.fillStyle = 'rgba(0,6,24,0.4)';
    g.beginPath();
    g.ellipse(c.x + ox, c.y + 2, 24 * c.scale, 5.5 * c.scale, 0, 0, TAU);
    g.fill();
    if (pic && bank) {
      // One cone is warm and the other is cool, as the confetti it throws is.
      const toned = bank.tinted(bank.shaded(pic, [225, 218, 245]), c.side < 0 ? [255, 150, 70] : [90, 160, 255], 0.22);
      const size = (HEIGHT * c.scale) / (RIM * (pic.sh - 8));
      const kick = Math.max(-0.4, Math.min(1, c.kick.x));
      g.save();
      g.translate(c.x + ox, c.y);
      g.rotate(c.lean);
      g.scale(size * (1 + 0.12 * kick), size * (1 - 0.22 * kick));
      g.drawImage(toned.image, toned.sx, toned.sy, toned.sw, toned.sh, -toned.ax, -toned.ay, toned.sw, toned.sh);
      g.restore();
    } else {
      paintPlainCone(g, c, ox);
    }
    // When it is loaded, its mouth glows gently; as it goes off, a flash.
    if (ready) glowAt(p.light, m.x + ox, m.y, m.width * 2.4, color, 0.18 + 0.1 * Math.sin(t * 4 + c.side));
    if (c.flare > 0.02) {
      glowAt(p.light, m.x + ox, m.y, m.width * 4.8 * c.flare + 20, COLORS.white, 0.8 * c.flare);
      glowAt(p.light, m.x + ox, m.y, m.width * 7 * c.flare + 30, color, 0.6 * c.flare);
    }
  }
}

/** A cone without the picture of one, for a world that has not loaded it. */
function paintPlainCone(g: CanvasRenderingContext2D, c: Cannon, ox: number): void {
  g.save();
  g.translate(c.x + ox, c.y);
  g.rotate(c.lean);
  const h = HEIGHT * c.scale;
  const w = MOUTH * c.scale;
  g.fillStyle = css(c.colors[0]!);
  g.beginPath();
  g.moveTo(-w * 0.18, 0);
  g.lineTo(w * 0.18, 0);
  g.lineTo(w * 0.5, -h);
  g.lineTo(-w * 0.5, -h);
  g.closePath();
  g.fill();
  g.fillStyle = css(c.colors[1]!);
  g.fillRect(-w * 0.34, -h * 0.55, w * 0.68, h * 0.12);
  g.restore();
}

/**
 * The fringe's colours, from the party's, and a softer one for each so a pinata is bright without
 * being hard.
 */
const FRINGE: readonly RGB[] = [
  PARTY_COLORS[0]!,
  PARTY_COLORS[1]!,
  PARTY_COLORS[2]!,
  PARTY_COLORS[3]!,
  PARTY_COLORS[4]!,
  PARTY_COLORS[6]!,
];

interface Body {
  readonly canvas: HTMLCanvasElement;
  /** The middle of the body in the canvas, in units. */
  readonly ox: number;
  readonly oy: number;
  readonly w: number;
  readonly h: number;
}

const bodies = new Map<string, Body>();

function shapePath(g: CanvasRenderingContext2D, kind: Kind, r: number): void {
  g.beginPath();
  switch (kind) {
    case 'star': {
      const outer = r * 1.16;
      const inner = outer * 0.54;
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const d = i % 2 === 0 ? outer : inner;
        if (i === 0) g.moveTo(Math.cos(a) * d, Math.sin(a) * d);
        else g.lineTo(Math.cos(a) * d, Math.sin(a) * d);
      }
      g.closePath();
      break;
    }
    case 'heart': {
      const s = r * 1.05;
      g.moveTo(0, s * 0.95);
      g.bezierCurveTo(-s * 1.5, s * 0.1, -s * 1.15, -s * 1.05, -s * 0.5, -s * 0.9);
      g.bezierCurveTo(-s * 0.2, -s * 0.84, 0, -s * 0.6, 0, -s * 0.4);
      g.bezierCurveTo(0, -s * 0.6, s * 0.2, -s * 0.84, s * 0.5, -s * 0.9);
      g.bezierCurveTo(s * 1.15, -s * 1.05, s * 1.5, s * 0.1, 0, s * 0.95);
      g.closePath();
      break;
    }
    case 'ball':
      g.arc(0, 0, r * 1.02, 0, TAU);
      break;
  }
}

function bodyOf(kind: Kind, r: number, k: number): Body {
  const scale = sharp(k);
  const key = `${kind}|${Math.round(r)}|${scale}`;
  const found = bodies.get(key);
  if (found) return found;
  const pad = 8;
  const w = r * 2.9 + pad * 2;
  const h = r * 2.9 + pad * 2;
  const ox = w / 2;
  const oy = h / 2;
  const canvas = prerender(
    w,
    h,
    (g) => {
      g.translate(ox, oy);
      g.save();
      shapePath(g, kind, r);
      g.clip();
      // The base, in two colours, under the fringe.
      const base = g.createLinearGradient(-r, -r, r, r);
      base.addColorStop(0, css(lighten(FRINGE[kind === 'star' ? 2 : kind === 'heart' ? 0 : 4]!, 0.2)));
      base.addColorStop(1, css(darken(FRINGE[kind === 'star' ? 1 : kind === 'heart' ? 5 : 3]!, 0.1)));
      g.fillStyle = base;
      g.fillRect(-r * 2, -r * 2, r * 4, r * 4);
      // Strips of paper, each row a colour, each overlapping the one above, like roof tiles.
      const rows = 9;
      const stripW = r * 0.34;
      for (let row = 0; row < rows; row++) {
        const y = -r * 1.3 + (row / (rows - 1)) * r * 2.5;
        const color = FRINGE[(row + (kind === 'heart' ? 1 : kind === 'star' ? 2 : 0)) % FRINGE.length]!;
        for (let x = -r * 1.5 - (row % 2) * stripW * 0.5; x < r * 1.5; x += stripW) {
          const grad = g.createLinearGradient(0, y, 0, y + r * 0.52);
          grad.addColorStop(0, css(lighten(color, 0.28)));
          grad.addColorStop(0.5, css(color));
          grad.addColorStop(1, css(darken(color, 0.22)));
          g.fillStyle = grad;
          g.beginPath();
          addRoundedRect(g, x, y, stripW * 0.92, r * 0.5, stripW * 0.4);
          g.fill();
          g.strokeStyle = css(darken(color, 0.45), 0.45);
          g.lineWidth = 0.7;
          g.stroke();
        }
      }
      // Light from the top left, and the far edge turned from it.
      const light = g.createRadialGradient(-r * 0.4, -r * 0.5, r * 0.1, 0, 0, r * 1.5);
      light.addColorStop(0, 'rgba(255,255,255,0.42)');
      light.addColorStop(0.45, 'rgba(255,255,255,0)');
      light.addColorStop(1, 'rgba(20,6,48,0.45)');
      g.fillStyle = light;
      g.fillRect(-r * 2, -r * 2, r * 4, r * 4);
      g.restore();
      shapePath(g, kind, r);
      g.lineJoin = 'round';
      g.strokeStyle = css([40, 20, 70], 0.6);
      g.lineWidth = Math.max(1.2, r * 0.07);
      g.stroke();
      // A small loop at the top for the rope.
      g.strokeStyle = css([40, 20, 70], 0.8);
      g.lineWidth = 2;
      g.beginPath();
      g.arc(0, -r * (kind === 'star' ? 1.18 : kind === 'heart' ? 0.52 : 1.02) - 2, 3.2, 0, TAU);
      g.stroke();
    },
    scale,
  );
  const body = { canvas, ox, oy, w, h };
  bodies.set(key, body);
  return body;
}

/**
 * Where on the body each crack is, as a spot and a short zigzag of steps from it. They appear one
 * after another as it is hit.
 */
const CRACKS: readonly (readonly [number, number, readonly (readonly [number, number])[]])[] = [
  [
    -0.2,
    -0.5,
    [
      [0.18, 0.16],
      [-0.1, 0.22],
      [0.16, 0.2],
    ],
  ],
  [
    0.35,
    -0.1,
    [
      [-0.12, 0.2],
      [0.14, 0.16],
      [-0.1, 0.22],
    ],
  ],
  [
    -0.4,
    0.2,
    [
      [0.2, 0.1],
      [-0.08, 0.22],
      [0.2, 0.14],
    ],
  ],
  [
    0.1,
    0.3,
    [
      [-0.16, 0.16],
      [0.12, 0.2],
      [-0.12, 0.16],
    ],
  ],
  [
    -0.05,
    -0.1,
    [
      [0.14, 0.2],
      [-0.14, 0.18],
      [0.12, 0.2],
    ],
  ],
];

export function paintPinata(p: Painter, pinata: Pinata, ox: number, t: number): void {
  if (pinata.state === 'broken') return;
  const g = p.ctx;
  const m = pinata.middle();
  const body = bodyOf(pinata.kind, pinata.r, p.k);
  const tilt = pinata.angle * 0.8;
  const topX = pinata.x + ox;
  // The rope, from where it is tied to the top of the pinata.
  const bx = m.x + ox - Math.sin(tilt) * pinata.r * 1.05;
  const by = m.y - Math.cos(tilt) * pinata.r * 1.05;
  g.strokeStyle = css([150, 112, 76]);
  g.lineWidth = 1.8;
  g.beginPath();
  g.moveTo(topX, pinata.top);
  g.lineTo(bx, by);
  g.stroke();
  g.save();
  g.translate(m.x + ox, m.y);
  g.rotate(tilt);
  // A little shine that runs across it, now and then.
  g.drawImage(body.canvas, -body.ox, -body.oy, body.w, body.h);
  // The cracks it has so far.
  const n = Math.ceil(pinata.crack * CRACKS.length - 0.001);
  if (n > 0) {
    const r = pinata.r;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (let i = 0; i < Math.min(n, CRACKS.length); i++) {
      const [sx, sy, steps] = CRACKS[i]!;
      for (const [color, width] of [
        [css([24, 8, 36], 0.85), 3.4],
        [css([255, 244, 220], 0.9), 1.5],
      ] as const) {
        g.strokeStyle = color;
        g.lineWidth = width;
        g.beginPath();
        let x = sx * r;
        let y = sy * r;
        g.moveTo(x, y);
        for (const [dx, dy] of steps) {
          x += dx * r;
          y += dy * r;
          g.lineTo(x, y);
        }
        g.stroke();
      }
    }
  }
  g.restore();
  glowAt(
    p.light,
    m.x + ox,
    m.y,
    pinata.r * 3.2,
    mix(FRINGE[Math.floor(t * 1.2) % FRINGE.length]!, COLORS.white, 0.4),
    0.1 + 0.05 * Math.sin(t * 3),
  );
}

const SWEET_KINDS = ['wrapped', 'lolly', 'star', 'drop'] as const;
type Sweet = (typeof SWEET_KINDS)[number];

const sweets = new Map<string, ReturnType<typeof pictureOfStone>>();

/** A sweet of a kind in a colour, drawn once. It is held by its middle. */
function sweetOf(kind: Sweet, color: RGB): ReturnType<typeof pictureOfStone> {
  const key = `${kind}|${color.join('.')}`;
  const found = sweets.get(key);
  if (found) return found;
  const canvas = prerender(
    32,
    32,
    (g) => {
      g.translate(16, 16);
      g.lineJoin = 'round';
      g.lineCap = 'round';
      const outline = css(darken(color, 0.55), 0.9);
      const shine = (x: number, y: number, rx: number, ry: number): void => {
        g.fillStyle = 'rgba(255,255,255,0.75)';
        g.beginPath();
        g.ellipse(x, y, rx, ry, -0.5, 0, TAU);
        g.fill();
      };
      switch (kind) {
        case 'wrapped': {
          // A sweet in a twist of paper: the paper's ends fan out either side.
          g.fillStyle = css(lighten(color, 0.35));
          for (const side of [-1, 1]) {
            g.beginPath();
            g.moveTo(side * 6, 0);
            g.lineTo(side * 14, -7);
            g.lineTo(side * 14, 7);
            g.closePath();
            g.fill();
            g.strokeStyle = outline;
            g.lineWidth = 1.2;
            g.stroke();
          }
          const grad = g.createRadialGradient(-3, -3, 1, 0, 0, 9);
          grad.addColorStop(0, css(lighten(color, 0.5)));
          grad.addColorStop(1, css(darken(color, 0.15)));
          g.fillStyle = grad;
          g.beginPath();
          g.ellipse(0, 0, 8, 6.8, 0, 0, TAU);
          g.fill();
          g.stroke();
          g.strokeStyle = 'rgba(255,255,255,0.6)';
          g.lineWidth = 1.6;
          g.beginPath();
          g.moveTo(-4, -4);
          g.lineTo(4, 4);
          g.stroke();
          shine(-3, -2.6, 2.4, 1.2);
          break;
        }
        case 'lolly': {
          g.strokeStyle = css([240, 236, 250]);
          g.lineWidth = 2.6;
          g.beginPath();
          g.moveTo(0, 4);
          g.lineTo(0, 14);
          g.stroke();
          const grad = g.createRadialGradient(-3, -6, 1, 0, -3, 10);
          grad.addColorStop(0, css(lighten(color, 0.5)));
          grad.addColorStop(1, css(darken(color, 0.12)));
          g.fillStyle = grad;
          g.beginPath();
          g.arc(0, -3, 9.4, 0, TAU);
          g.fill();
          g.strokeStyle = outline;
          g.lineWidth = 1.2;
          g.stroke();
          g.strokeStyle = 'rgba(255,255,255,0.85)';
          g.lineWidth = 1.7;
          g.beginPath();
          for (let a = 0; a < 11; a += 0.4) {
            const rr = a * 0.7;
            const x = Math.cos(a) * rr;
            const y = -3 + Math.sin(a) * rr;
            if (a === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
          }
          g.stroke();
          shine(-4, -7.4, 2.4, 1.3);
          break;
        }
        case 'star': {
          g.beginPath();
          for (let i = 0; i < 10; i++) {
            const a = -Math.PI / 2 + (i * Math.PI) / 5;
            const d = i % 2 === 0 ? 14 : 6.4;
            if (i === 0) g.moveTo(Math.cos(a) * d, Math.sin(a) * d);
            else g.lineTo(Math.cos(a) * d, Math.sin(a) * d);
          }
          g.closePath();
          const grad = g.createRadialGradient(-4, -5, 1, 0, 0, 14);
          grad.addColorStop(0, css(lighten(color, 0.55)));
          grad.addColorStop(1, css(darken(color, 0.1)));
          g.fillStyle = grad;
          g.fill();
          g.strokeStyle = outline;
          g.lineWidth = 1.3;
          g.stroke();
          shine(-3, -4.5, 2.6, 1.3);
          break;
        }
        case 'drop': {
          const grad = g.createRadialGradient(-3, -5, 1, 0, 0, 12);
          grad.addColorStop(0, css(lighten(color, 0.5)));
          grad.addColorStop(1, css(darken(color, 0.15)));
          g.fillStyle = grad;
          g.beginPath();
          g.moveTo(-10, 8);
          g.quadraticCurveTo(-11, -9, 0, -10);
          g.quadraticCurveTo(11, -9, 10, 8);
          g.closePath();
          g.fill();
          g.strokeStyle = outline;
          g.lineWidth = 1.2;
          g.stroke();
          g.fillStyle = 'rgba(255,255,255,0.8)';
          for (const [x, y] of [
            [-5, -2],
            [1, -5],
            [5, 1],
            [-2, 3],
            [4, 6],
            [-6, 5],
          ] as const) {
            g.beginPath();
            g.arc(x, y, 0.9, 0, TAU);
            g.fill();
          }
          shine(-4, -6, 2.4, 1.2);
          break;
        }
      }
    },
    3,
  );
  const made = pictureOfStone(canvas);
  sweets.set(key, made);
  return made;
}

/**
 * The sweets that come out of a pinata: they burst up and out, fall across the floor, bounce on it
 * and lie there for a moment before they fade. `floor` is where the floor is at the place they
 * fall.
 */
export function sweetsBurst(fx: Particles, rng: Rng, x: number, y: number, floor: number, count: number): void {
  for (let i = fx.count(count); i > 0; i--) {
    const a = -Math.PI / 2 + rng.range(-1.35, 1.35);
    const speed = rng.range(120, 380);
    const color = FRINGE[rng.int(FRINGE.length)]!;
    fx.emit({
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: rng.range(2.6, 3.8),
      size: rng.range(14, 20),
      shape: 'pic',
      pic: sweetOf(SWEET_KINDS[rng.int(SWEET_KINDS.length)]!, color),
      add: false,
      gravity: 560,
      drag: 0.25,
      rot: rng.range(0, TAU),
      spin: rng.range(-8, 8),
      floor: floor - rng.range(0, 24),
      bounce: 0.42,
      hold: 0.78,
      delay: rng.range(0, 0.1),
    });
  }
}
