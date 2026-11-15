import { Rng } from '../../../domain/rng';
import { css, darken, lighten, mix, type RGB } from '../../engine/color';
import { TAU } from '../../engine/ease';
import { glowAt, makeCloud, paintMoon, verticalGradient } from '../../engine/paint';
import type { Painter } from '../../engine/painter';
import type { Particles, Spec } from '../../engine/particles';
import type { FxName, VoiceName } from '../../sound';

/**
 * The eight worlds the statues come from, and what each looks like when its statue wakes and writes
 * home: the sky and the ground it stands on, what drifts in the air, what bursts when it wakes, and
 * the little tune and call that are its own. Everything here is a picture and a few particles, and
 * the postcard decides when each is used.
 */

export const STATUE_NAMES = [
  'star-whale',
  'crystal-fox',
  'moon-hare',
  'ember-drake',
  'coral-seahorse',
  'cloud-lion',
  'storm-bird',
  'glow-owl',
] as const;
export type StatueName = (typeof STATUE_NAMES)[number];
export const isStatue = (name: string): name is StatueName => (STATUE_NAMES as readonly string[]).includes(name);

/** Where the statue stands, and how big the picture is, in the view's units. */
export interface Ground {
  /** The middle of its base, on the floor. */
  readonly x: number;
  readonly y: number;
  /** How tall the statue's picture is on the screen. */
  readonly tall: number;
  readonly w: number;
  readonly h: number;
}

/** What a world may do in the middle of the show. */
export interface Moment {
  readonly fx: Particles;
  readonly rng: Rng;
  readonly ground: Ground;
  /** Washes the screen with light, held to what is safe. */
  flash(amount: number, color: RGB): void;
  /** Draws a bolt of lightning down from the sky at this x. */
  bolt(x: number): void;
}

export interface World {
  readonly glow: RGB;
  /**
   * How much of the aura round the statue a world with a bright sky can take, if less than all of
   * it.
   */
  readonly glowScale?: number;
  /** The colours of what bursts when it wakes. */
  readonly colors: readonly RGB[];
  readonly voice: VoiceName;
  readonly root: number;
  /** The steps of the world's own tune, above the root, in semitones. */
  readonly tune: readonly number[];
  readonly call: FxName;
  /** How many ambient particles a second. */
  readonly rate: number;
  /** The stamp's picture of the world. */
  glyph(g: CanvasRenderingContext2D, x: number, y: number, r: number): void;
  /** What never moves: the sky, the far places, the ground. */
  paint(g: CanvasRenderingContext2D, ground: Ground, rng: Rng): void;
  /**
   * What moves behind the statue, every frame. `lit` is 0 while the world is dark and 1 when it is
   * whole.
   */
  behind?(p: Painter, ground: Ground, lit: number): void;
  /** One drifting particle of the world's own air. */
  drift(fx: Particles, rng: Rng, ground: Ground): void;
  /**
   * What the world does when the statue wakes or is touched. `power` is 1 for waking, and less for
   * a touch.
   */
  burst(fx: Particles, rng: Rng, x: number, y: number, power: number): void;
  /**
   * The moments in the show, in seconds, when the world does something of its own: a shooting star,
   * a bolt, a flare.
   */
  readonly moments?: readonly number[];
  moment?(m: Moment, index: number): void;
}

const pick = <T>(rng: Rng, items: readonly T[]): T => items[rng.int(items.length)]!;

/** A burst of `n` particles in all directions, made by the same recipe for every world. */
function radial(
  fx: Particles,
  rng: Rng,
  x: number,
  y: number,
  n: number,
  speed: readonly [number, number],
  make: (angle: number, v: number) => Omit<Spec, 'x' | 'y' | 'vx' | 'vy'>,
): void {
  const count = fx.count(n);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + rng.range(-0.2, 0.2);
    const v = rng.range(speed[0], speed[1]);
    fx.emit({ ...make(a, v), x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v });
  }
}

/** A pool of the world's light on the floor, where the statue stands. */
function pool(g: CanvasRenderingContext2D, ground: Ground, color: RGB, strength = 0.55): void {
  g.save();
  g.translate(ground.x, ground.y);
  g.scale(1, 0.26);
  glowAt(g, 0, 0, ground.tall * 1.5, color, strength);
  g.restore();
}

function stars(
  g: CanvasRenderingContext2D,
  rng: Rng,
  w: number,
  bottom: number,
  count: number,
  tone: RGB = [255, 244, 224],
): void {
  for (let i = 0; i < count; i++) {
    const x = rng.range(0, w);
    const y = bottom * rng.next() ** 1.4;
    const r = rng.range(0.5, 1.5);
    g.fillStyle = css(tone, rng.range(0.4, 1));
    g.fillRect(x, y, r, r);
  }
}

/** A cloud with its flat base on `y`, as a prerendered picture stamped once. */
function cloud(
  g: CanvasRenderingContext2D,
  rng: Rng,
  x: number,
  y: number,
  w: number,
  h: number,
  top: RGB,
  bottom: RGB,
  alpha = 1,
): void {
  const c = makeCloud(w, h, rng, top, bottom, 6);
  const before = g.globalAlpha;
  g.globalAlpha = before * alpha;
  g.drawImage(c, x - w / 2, y - h * 0.86, w, h);
  g.globalAlpha = before;
}

/** A crystal standing on a point of the floor: a hexagonal prism with two lit faces. */
function crystal(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: RGB, lean = 0): void {
  const tipX = x + lean;
  const left = [x - w / 2, y];
  const shoulderL = [x - w / 2 + lean * 0.4, y - h * 0.68];
  const shoulderR = [x + w / 2 + lean * 0.4, y - h * 0.68];
  const right = [x + w / 2, y];
  g.beginPath();
  g.moveTo(left[0]!, left[1]!);
  g.lineTo(shoulderL[0]!, shoulderL[1]!);
  g.lineTo(tipX, y - h);
  g.lineTo(shoulderR[0]!, shoulderR[1]!);
  g.lineTo(right[0]!, right[1]!);
  g.closePath();
  const body = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  body.addColorStop(0, css(darken(color, 0.35)));
  body.addColorStop(0.5, css(lighten(color, 0.25)));
  body.addColorStop(1, css(color));
  g.fillStyle = body;
  g.fill();
  g.beginPath();
  g.moveTo(tipX, y - h);
  g.lineTo(x + lean * 0.2, y);
  g.lineTo(shoulderL[0]!, shoulderL[1]!);
  g.closePath();
  g.fillStyle = css(lighten(color, 0.7), 0.3);
  g.fill();
  g.strokeStyle = css(darken(color, 0.55), 0.8);
  g.lineWidth = 1.4;
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(left[0]!, left[1]!);
  g.lineTo(shoulderL[0]!, shoulderL[1]!);
  g.lineTo(tipX, y - h);
  g.lineTo(shoulderR[0]!, shoulderR[1]!);
  g.lineTo(right[0]!, right[1]!);
  g.stroke();
}

/** A branching coral, drawn as thick strokes that thin as they go. */
function coral(
  g: CanvasRenderingContext2D,
  rng: Rng,
  x: number,
  y: number,
  len: number,
  angle: number,
  width: number,
  color: RGB,
  depth = 4,
): void {
  if (depth === 0 || len < 4) return;
  const x1 = x + Math.cos(angle) * len;
  const y1 = y + Math.sin(angle) * len;
  g.strokeStyle = css(depth === 1 ? lighten(color, 0.25) : color);
  g.lineWidth = width;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x1, y1);
  g.stroke();
  coral(g, rng, x1, y1, len * rng.range(0.66, 0.8), angle - rng.range(0.3, 0.6), width * 0.72, color, depth - 1);
  coral(g, rng, x1, y1, len * rng.range(0.66, 0.8), angle + rng.range(0.3, 0.6), width * 0.72, color, depth - 1);
}

/** A row of dark hills or mountains that fills the bottom of the view up to a ragged top. */
function ridge(
  g: CanvasRenderingContext2D,
  rng: Rng,
  w: number,
  baseY: number,
  tall: number,
  color: RGB,
  steps = 14,
  jag = 0.5,
  rim?: RGB,
): void {
  g.fillStyle = css(color);
  g.beginPath();
  g.moveTo(0, baseY + 400);
  const tops: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const y = baseY - tall * (0.35 + jag * rng.next());
    tops.push(y);
    g.lineTo((i / steps) * w, y);
  }
  g.lineTo(w, baseY + 400);
  g.closePath();
  g.fill();
  if (rim) {
    // A thin line of the light that is behind the ridge, along its top.
    g.strokeStyle = css(rim, 0.75);
    g.lineWidth = 2;
    g.lineJoin = 'round';
    g.beginPath();
    tops.forEach((y, i) => {
      i === 0 ? g.moveTo(0, y) : g.lineTo((i / steps) * w, y);
    });
    g.stroke();
  }
}

/** Emits a particle somewhere along the width of the view. */
const fall = (fx: Particles, rng: Rng, ground: Ground, spec: Omit<Spec, 'x'>): void =>
  fx.emit({ ...spec, x: rng.range(0, ground.w) });

const SKY: World = {
  glow: [200, 190, 255],
  colors: [
    [255, 232, 255],
    [190, 210, 255],
    [255, 214, 150],
    [255, 170, 230],
  ],
  voice: 'glass',
  root: 69,
  tune: [0, 2, 4, 7, 9, 12, 9, 7, 4, 7, 9, 14],
  call: 'swell',
  rate: 15,
  glyph(g, x, y, r) {
    g.fillStyle = '#ffe27a';
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * TAU) / 10;
      const d = i % 2 === 0 ? r : r * 0.45;
      g.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
    }
    g.closePath();
    g.fill();
  },
  paint(g, ground, rng) {
    verticalGradient(g, 0, 0, ground.w, ground.h, [
      [0, [18, 24, 92]],
      [0.45, [74, 68, 188]],
      [0.8, [232, 138, 214]],
      [1, [255, 200, 214]],
    ]);
    stars(g, rng, ground.w, ground.h * 0.7, 110);
    cloud(
      g,
      rng,
      ground.w * 0.16,
      ground.h * 0.98,
      ground.w * 0.5,
      ground.h * 0.34,
      [255, 226, 246],
      [196, 146, 226],
      0.9,
    );
    cloud(
      g,
      rng,
      ground.w * 0.86,
      ground.h * 0.96,
      ground.w * 0.46,
      ground.h * 0.3,
      [255, 226, 246],
      [196, 146, 226],
      0.9,
    );
    cloud(g, rng, ground.x, ground.y + 14, ground.tall * 1.35, ground.tall * 0.4, [255, 240, 252], [214, 170, 236]);
    pool(g, ground, [255, 200, 255], 0.35);
  },
  drift(fx, rng, ground) {
    fall(fx, rng, ground, {
      y: rng.range(ground.h * 0.3, ground.h * 0.95),
      vy: -rng.range(8, 24),
      vx: rng.range(-8, 8),
      size: rng.range(5, 10),
      life: rng.range(2.6, 4),
      color: pick(rng, SKY.colors),
      shape: 'star4',
      twinkle: 1.1,
      fadeIn: 0.4,
      alpha: 0.9,
      sway: 10,
    });
  },
  burst(fx, rng, x, y, power) {
    radial(fx, rng, x, y, 22 * power, [50, 150], () => ({
      life: rng.range(1.2, 2.2),
      size: rng.range(6, 13),
      size1: 2,
      color: pick(rng, SKY.colors),
      shape: 'star4',
      drag: 1.3,
      twinkle: 1.5,
      spin: rng.range(-2, 2),
    }));
    radial(fx, rng, x, y, 10 * power, [20, 70], () => ({
      life: 1.6,
      size: 30,
      size1: 8,
      color: [200, 190, 255],
      alpha: 0.5,
      drag: 2,
    }));
  },
  moments: [1.9, 3.3],
  moment(m, i) {
    // A shooting star over the whole sky.
    const y = m.ground.h * (0.12 + 0.08 * i);
    m.fx.emit({
      x: m.ground.w * (i === 0 ? 0.08 : 0.3),
      y,
      vx: 340,
      vy: 120,
      life: 1.1,
      size: 7,
      shape: 'spark',
      color: [255, 244, 214],
      tail: 0.34,
      halo: 2.4,
      alpha: 1,
    });
  },
};

const CRYSTAL: World = {
  glow: [200, 130, 255],
  colors: [
    [214, 150, 255],
    [255, 150, 220],
    [140, 232, 255],
    [255, 255, 255],
  ],
  voice: 'bell',
  root: 72,
  tune: [0, 4, 7, 12, 7, 11, 14, 11, 7, 12, 16, 19],
  call: 'ding',
  rate: 13,
  glyph(g, x, y, r) {
    g.fillStyle = '#d6b0ff';
    g.beginPath();
    g.moveTo(x, y - r);
    g.lineTo(x + r * 0.8, y - r * 0.1);
    g.lineTo(x, y + r);
    g.lineTo(x - r * 0.8, y - r * 0.1);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath();
    g.moveTo(x, y - r);
    g.lineTo(x - r * 0.8, y - r * 0.1);
    g.lineTo(x, y);
    g.closePath();
    g.fill();
  },
  paint(g, ground, rng) {
    const { w, h } = ground;
    verticalGradient(g, 0, 0, w, h, [
      [0, [22, 10, 52]],
      [0.55, [56, 28, 110]],
      [1, [112, 54, 168]],
    ]);
    glowAt(g, ground.x, ground.y - ground.tall * 0.4, ground.tall * 2.6, [190, 110, 255], 0.35);
    const tones: RGB[] = [
      [170, 100, 255],
      [255, 120, 210],
      [90, 210, 255],
      [200, 130, 255],
    ];
    // Clusters of crystals leaning in from both sides, the big ones at the back.
    for (let side = -1; side <= 1; side += 2) {
      const edge = side < 0 ? 0 : w;
      for (let i = 0; i < 7; i++) {
        const x = edge + side * -rng.range(0, w * 0.3) * (i / 7 + 0.15);
        const big = h * rng.range(0.28, 0.7) * (1 - i * 0.07);
        crystal(
          g,
          x,
          h * rng.range(0.92, 1.02),
          big * 0.34,
          big,
          tones[rng.int(tones.length)]!,
          side * -rng.range(0, big * 0.14),
        );
      }
    }
    // The floor: a dark stone with a glow where the statue stands.
    g.fillStyle = css([34, 16, 70], 0.9);
    g.fillRect(0, ground.y + 6, w, h);
    pool(g, ground, [214, 150, 255], 0.7);
    stars(g, rng, w, h * 0.5, 40, [230, 200, 255]);
  },
  drift(fx, rng, ground) {
    const side = rng.next() < 0.5 ? -1 : 1;
    const x = side < 0 ? rng.range(0, ground.w * 0.3) : rng.range(ground.w * 0.7, ground.w);
    fx.emit({
      x,
      y: rng.range(ground.h * 0.35, ground.h * 0.95),
      size: rng.range(7, 14),
      life: rng.range(1.1, 2),
      color: pick(rng, CRYSTAL.colors),
      shape: 'spark',
      twinkle: 2.4,
      alpha: 0.9,
      fadeIn: 0.3,
      vy: -4,
    });
  },
  burst(fx, rng, x, y, power) {
    radial(fx, rng, x, y, 18 * power, [60, 170], () => ({
      life: rng.range(0.9, 1.6),
      size: rng.range(7, 13),
      size1: 3,
      color: pick(rng, CRYSTAL.colors),
      shape: 'star4',
      drag: 1.5,
      twinkle: 1.5,
    }));
    radial(fx, rng, x, y, 14 * power, [90, 210], () => ({
      life: rng.range(0.7, 1.2),
      size: 6,
      color: pick(rng, CRYSTAL.colors),
      shape: 'spark',
      tail: 0.22,
      drag: 1.6,
      gravity: 140,
    }));
    fx.emit({ x, y, life: 0.9, size: 20, size1: 150, shape: 'ring', width: 3, color: [220, 170, 255], alpha: 0.9 });
  },
};

const MOON: World = {
  glow: [230, 236, 255],
  colors: [
    [240, 244, 255],
    [200, 214, 255],
    [255, 244, 214],
  ],
  voice: 'harp',
  root: 70,
  tune: [0, 3, 7, 10, 12, 10, 7, 12, 15, 12, 10, 7],
  call: 'twinkle',
  rate: 9,
  glyph(g, x, y, r) {
    g.fillStyle = '#f2f4ff';
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    g.arc(x + r * 0.5, y - r * 0.2, r * 0.82, 0, TAU);
    g.fill();
    g.globalCompositeOperation = 'source-over';
  },
  paint(g, ground, rng) {
    const { w, h } = ground;
    verticalGradient(g, 0, 0, w, h, [
      [0, [8, 12, 38]],
      [0.6, [32, 38, 104]],
      [1, [78, 82, 160]],
    ]);
    stars(g, rng, w, h * 0.8, 120, [235, 240, 255]);
    paintMoon(g, ground.x, ground.y - ground.tall * 0.62, Math.min(ground.tall * 0.5, w * 0.3), [244, 244, 255]);
    cloud(g, rng, ground.w * 0.14, h * 1.0, w * 0.46, h * 0.28, [196, 204, 248], [96, 104, 176], 0.8);
    cloud(g, rng, ground.w * 0.88, h * 0.97, w * 0.5, h * 0.3, [196, 204, 248], [96, 104, 176], 0.8);
    cloud(g, rng, ground.x, ground.y + 12, ground.tall * 1.3, ground.tall * 0.38, [236, 238, 255], [150, 156, 214]);
  },
  drift(fx, rng, ground) {
    fall(fx, rng, ground, {
      y: rng.range(ground.h * 0.5, ground.h),
      vy: -rng.range(6, 16),
      vx: rng.range(-6, 6),
      size: rng.range(8, 18),
      life: rng.range(4, 7),
      color: [220, 228, 255],
      alpha: 0.5,
      fadeIn: 1,
      sway: 14,
    });
  },
  burst(fx, rng, x, y, power) {
    fx.emit({ x, y, life: 1.4, size: 30, size1: 190, shape: 'ring', width: 3, color: [230, 236, 255], alpha: 0.9 });
    radial(fx, rng, x, y, 18 * power, [30, 110], () => ({
      life: rng.range(1.5, 2.6),
      size: rng.range(8, 20),
      size1: 3,
      color: pick(rng, MOON.colors),
      drag: 1.6,
      alpha: 0.7,
    }));
    radial(fx, rng, x, y, 10 * power, [40, 120], () => ({
      life: rng.range(1.2, 2),
      size: rng.range(5, 9),
      color: [255, 255, 255],
      shape: 'star4',
      drag: 1.4,
      twinkle: 1.4,
    }));
  },
};

const EMBER: World = {
  glow: [255, 150, 70],
  colors: [
    [255, 190, 70],
    [255, 120, 40],
    [255, 70, 30],
    [255, 230, 150],
  ],
  voice: 'pluck',
  root: 55,
  tune: [0, 3, 7, 10, 12, 15, 12, 10, 7, 10, 12, 19],
  call: 'rumble',
  rate: 24,
  glyph(g, x, y, r) {
    g.fillStyle = '#ff8a3a';
    g.beginPath();
    g.moveTo(x, y - r);
    g.bezierCurveTo(x + r * 1.1, y - r * 0.1, x + r * 0.8, y + r, x, y + r);
    g.bezierCurveTo(x - r * 0.8, y + r, x - r * 1.1, y - r * 0.1, x, y - r);
    g.fill();
    g.fillStyle = '#ffe27a';
    g.beginPath();
    g.ellipse(x, y + r * 0.4, r * 0.4, r * 0.5, 0, 0, TAU);
    g.fill();
  },
  paint(g, ground, rng) {
    const { w, h } = ground;
    verticalGradient(g, 0, 0, w, h, [
      [0, [40, 10, 34]],
      [0.42, [150, 42, 36]],
      [0.74, [255, 128, 50]],
      [1, [255, 196, 96]],
    ]);
    glowAt(g, w * 0.5, h * 0.8, w * 1.1, [255, 160, 60], 0.5);
    ridge(g, rng, w, h * 0.74, h * 0.4, [96, 26, 34], 11, 0.6, [255, 170, 80]);
    ridge(g, rng, w, h * 0.88, h * 0.3, [52, 14, 26], 15, 0.5, [255, 130, 50]);
    // The ground is dark stone, cracked, with lava shining in the cracks.
    const floor = g.createLinearGradient(0, ground.y, 0, h);
    floor.addColorStop(0, css([54, 16, 24]));
    floor.addColorStop(1, css([120, 40, 24]));
    g.fillStyle = floor;
    g.fillRect(0, ground.y + 8, w, h);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const [width, alpha] of [
      [5, 0.25],
      [1.8, 0.95],
    ] as const) {
      g.strokeStyle = css([255, 150, 50], alpha);
      g.lineWidth = width;
      rng.next();
      const crack = new Rng(77);
      for (let i = 0; i < 8; i++) {
        let x = crack.range(0, w);
        let y = ground.y + crack.range(12, h - ground.y);
        g.beginPath();
        g.moveTo(x, y);
        for (let s = 0; s < 5; s++) {
          x += crack.range(-26, 26);
          y += crack.range(-4, 9);
          g.lineTo(x, y);
        }
        g.stroke();
      }
    }
    pool(g, ground, [255, 140, 60], 0.7);
  },
  behind(p, ground, lit) {
    // The glow at the foot of the mountains breathes.
    glowAt(
      p.light,
      ground.w * 0.5,
      ground.h,
      ground.w * (0.9 + 0.08 * Math.sin(p.t * 1.7)),
      [255, 120, 40],
      0.22 * lit,
    );
  },
  drift(fx, rng, ground) {
    fall(fx, rng, ground, {
      y: ground.h + 4,
      vy: -rng.range(40, 100),
      vx: rng.range(-6, 6),
      size: rng.range(2.5, 5.5),
      life: rng.range(2, 3.6),
      color: [255, 190, 70],
      color1: [255, 60, 20],
      shape: 'dot',
      twinkle: 1.6,
      sway: 30,
      alpha: 1,
    });
  },
  burst(fx, rng, x, y, power) {
    radial(fx, rng, x, y, 24 * power, [70, 220], () => ({
      life: rng.range(0.7, 1.4),
      size: rng.range(5, 8),
      size1: 1,
      color: pick(rng, EMBER.colors),
      shape: 'spark',
      tail: 0.2,
      halo: 2,
      gravity: 160,
      drag: 1,
    }));
    radial(fx, rng, x, y, 8 * power, [20, 80], () => ({
      life: 1.1,
      size: 34,
      size1: 6,
      color: [255, 120, 40],
      alpha: 0.5,
      drag: 2,
    }));
    fx.emit({ x, y, life: 0.8, size: 20, size1: 160, shape: 'ring', width: 3, color: [255, 160, 70], alpha: 0.9 });
  },
  moments: [2.1, 3.2],
  moment(m) {
    // A flare: a burst of embers up from the foot of the world.
    for (let i = 0; i < m.fx.count(16); i++)
      m.fx.emit({
        x: m.rng.range(0, m.ground.w),
        y: m.ground.h,
        vy: -m.rng.range(120, 260),
        vx: m.rng.range(-30, 30),
        size: m.rng.range(3, 6),
        life: m.rng.range(1.2, 2.2),
        color: [255, 200, 90],
        color1: [255, 60, 20],
        shape: 'dot',
        twinkle: 2,
        gravity: 90,
      });
  },
};

const OCEAN: World = {
  glow: [150, 240, 230],
  colors: [
    [190, 255, 250],
    [150, 220, 255],
    [255, 190, 210],
    [255, 255, 255],
  ],
  voice: 'marimba',
  root: 67,
  tune: [0, 2, 4, 7, 9, 7, 4, 2, 4, 7, 12, 9],
  call: 'splash',
  rate: 12,
  glyph(g, x, y, r) {
    g.strokeStyle = '#7cf0e4';
    g.lineWidth = r * 0.28;
    g.beginPath();
    g.arc(x, y, r * 0.78, 0, TAU);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.beginPath();
    g.arc(x - r * 0.28, y - r * 0.28, r * 0.2, 0, TAU);
    g.fill();
  },
  paint(g, ground, rng) {
    const { w, h } = ground;
    verticalGradient(g, 0, 0, w, h, [
      [0, [10, 74, 126]],
      [0.5, [20, 150, 180]],
      [1, [110, 226, 208]],
    ]);
    // Sand, with coral growing from it in pink and orange.
    g.fillStyle = css([236, 214, 168]);
    g.beginPath();
    g.moveTo(0, h);
    for (let i = 0; i <= 10; i++) g.lineTo((i / 10) * w, ground.y + 10 + Math.sin(i * 1.7) * 6);
    g.lineTo(w, h);
    g.closePath();
    g.fill();
    const tones: RGB[] = [
      [255, 130, 164],
      [255, 164, 96],
      [214, 120, 255],
      [255, 110, 120],
    ];
    for (let i = 0; i < 9; i++) {
      const left = i < 5;
      const x = left ? rng.range(-10, w * 0.28) : rng.range(w * 0.72, w + 10);
      coral(
        g,
        rng,
        x,
        h + 4,
        rng.range(h * 0.1, h * 0.2),
        -Math.PI / 2 + rng.range(-0.25, 0.25),
        rng.range(6, 10),
        tones[rng.int(tones.length)]!,
      );
    }
    pool(g, ground, [190, 255, 244], 0.45);
  },
  behind(p, ground, lit) {
    // Light comes down through the water in long soft rays that sway.
    const g = p.ctx;
    for (let i = 0; i < 6; i++) {
      const x = ground.w * ((i + 0.5) / 6) + Math.sin(p.t * 0.5 + i * 1.7) * 18;
      const wide = 26 + 14 * Math.sin(p.t * 0.7 + i);
      const grad = g.createLinearGradient(0, 0, 0, ground.h * 0.9);
      grad.addColorStop(0, `rgba(210,255,250,${(0.22 * lit).toFixed(3)})`);
      grad.addColorStop(1, 'rgba(210,255,250,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(x - wide * 0.3, 0);
      g.lineTo(x + wide * 0.3, 0);
      g.lineTo(x + wide * 1.4 + (i - 2.5) * 12, ground.h * 0.9);
      g.lineTo(x - wide * 1.4 + (i - 2.5) * 12, ground.h * 0.9);
      g.closePath();
      g.fill();
    }
  },
  drift(fx, rng, ground) {
    fall(fx, rng, ground, {
      y: ground.h + 6,
      vy: -rng.range(26, 58),
      size: rng.range(5, 16),
      life: rng.range(3, 5.5),
      color: [200, 255, 250],
      shape: 'bubble',
      sway: 16,
      alpha: 0.8,
    });
  },
  burst(fx, rng, x, y, power) {
    radial(fx, rng, x, y, 22 * power, [40, 140], () => ({
      life: rng.range(1.6, 2.8),
      size: rng.range(6, 18),
      color: pick(rng, OCEAN.colors),
      shape: 'bubble',
      drag: 1.5,
      gravity: -60,
      sway: 10,
    }));
    fx.emit({ x, y, life: 1, size: 20, size1: 170, shape: 'ring', width: 3, color: [190, 255, 250], alpha: 0.9 });
  },
};

const CLOUD: World = {
  glow: [255, 244, 200],
  glowScale: 0.45,
  colors: [
    [255, 255, 255],
    [190, 226, 255],
    [255, 236, 160],
  ],
  voice: 'flute',
  root: 72,
  tune: [0, 2, 4, 7, 4, 9, 7, 12, 9, 7, 4, 7],
  call: 'swell',
  rate: 7,
  glyph(g, x, y, r) {
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(x - r * 0.45, y + r * 0.15, r * 0.5, 0, TAU);
    g.arc(x + r * 0.1, y - r * 0.2, r * 0.6, 0, TAU);
    g.arc(x + r * 0.55, y + r * 0.2, r * 0.45, 0, TAU);
    g.fill();
    g.fillRect(x - r * 0.9, y + r * 0.2, r * 1.8, r * 0.45);
  },
  paint(g, ground, rng) {
    const { w, h } = ground;
    verticalGradient(g, 0, 0, w, h, [
      [0, [30, 104, 236]],
      [0.55, [84, 160, 250]],
      [1, [168, 214, 255]],
    ]);
    glowAt(g, w * 0.82, h * 0.16, h * 1.1, [255, 244, 190], 0.6);
    g.fillStyle = css([255, 250, 224]);
    g.beginPath();
    g.arc(w * 0.82, h * 0.16, h * 0.07, 0, TAU);
    g.fill();
    cloud(g, rng, ground.x, ground.y + 16, ground.tall * 1.5, ground.tall * 0.46, [240, 246, 255], [150, 182, 236]);
  },
  behind(p, ground, lit) {
    // Clouds drift by at three speeds, the near ones fast and big.
    const g = p.ctx;
    for (const [i, c] of CLOUD_LAYERS.entries()) {
      const cw = ground.w * c.size;
      const span = ground.w + cw * 2;
      const x = ((p.t * c.speed + i * span * 0.37) % span) - cw;
      g.globalAlpha = c.alpha * (0.4 + 0.6 * lit);
      g.drawImage(cloudPicture(i), x, ground.h * c.y, cw, cw * 0.38);
    }
    g.globalAlpha = 1;
  },
  drift(fx, rng, ground) {
    fall(fx, rng, ground, {
      y: rng.range(ground.h * 0.2, ground.h * 0.9),
      vx: rng.range(10, 24),
      vy: rng.range(-4, 4),
      size: rng.range(18, 40),
      life: rng.range(3, 5),
      color: [255, 255, 255],
      alpha: 0.35,
      fadeIn: 1,
    });
  },
  burst(fx, rng, x, y, power) {
    radial(fx, rng, x, y, 14 * power, [40, 120], () => ({
      life: rng.range(1.2, 2),
      size: rng.range(26, 50),
      size1: 14,
      color: [255, 255, 255],
      alpha: 0.7,
      drag: 1.8,
    }));
    radial(fx, rng, x, y, 14 * power, [60, 160], () => ({
      life: rng.range(0.9, 1.6),
      size: rng.range(6, 11),
      size1: 2,
      color: pick(rng, [
        [255, 236, 160],
        [255, 255, 255],
      ] as const),
      shape: 'star4',
      drag: 1.5,
      twinkle: 1.5,
    }));
    fx.emit({ x, y, life: 1, size: 20, size1: 170, shape: 'ring', width: 3, color: [255, 250, 220], alpha: 0.9 });
  },
};

const CLOUD_LAYERS = [
  { y: 0.1, size: 0.36, speed: 7, alpha: 0.55 },
  { y: 0.34, size: 0.5, speed: 12, alpha: 0.7 },
  { y: 0.62, size: 0.7, speed: 20, alpha: 0.9 },
] as const;

/** The three drifting clouds, made once. */
const cloudCache: HTMLCanvasElement[] = [];
function cloudPicture(i: number): HTMLCanvasElement {
  const cached = cloudCache[i];
  if (cached) return cached;
  const made = makeCloud(300, 114, new Rng(11 + i), [255, 255, 255], [200, 224, 250], 6);
  cloudCache[i] = made;
  return made;
}

const STORM: World = {
  glow: [190, 170, 255],
  colors: [
    [255, 244, 160],
    [210, 190, 255],
    [255, 255, 255],
  ],
  voice: 'glass',
  root: 64,
  tune: [0, 3, 7, 3, 10, 7, 12, 10, 7, 12, 15, 12],
  call: 'crackle',
  rate: 44,
  glyph(g, x, y, r) {
    g.fillStyle = '#fff04d';
    g.beginPath();
    g.moveTo(x + r * 0.2, y - r);
    g.lineTo(x - r * 0.6, y + r * 0.1);
    g.lineTo(x - r * 0.05, y + r * 0.1);
    g.lineTo(x - r * 0.3, y + r);
    g.lineTo(x + r * 0.65, y - r * 0.2);
    g.lineTo(x + r * 0.1, y - r * 0.2);
    g.closePath();
    g.fill();
  },
  paint(g, ground, rng) {
    const { w, h } = ground;
    verticalGradient(g, 0, 0, w, h, [
      [0, [16, 12, 40]],
      [0.55, [52, 40, 104]],
      [1, [96, 80, 158]],
    ]);
    for (let i = 0; i < 7; i++)
      cloud(
        g,
        rng,
        rng.range(0, w),
        rng.range(h * 0.1, h * 0.46),
        rng.range(w * 0.4, w * 0.7),
        h * rng.range(0.22, 0.34),
        [92, 80, 150],
        [28, 20, 66],
        0.85,
      );
    cloud(g, rng, ground.x, ground.y + 14, ground.tall * 1.4, ground.tall * 0.42, [150, 136, 214], [70, 58, 130]);
    pool(g, ground, [190, 170, 255], 0.4);
  },
  drift(fx, rng, ground) {
    fall(fx, rng, ground, {
      y: -10,
      vx: -50,
      vy: rng.range(360, 480),
      size: rng.range(9, 14),
      width: 1.4,
      life: rng.range(0.7, 1),
      shape: 'streak',
      color: [190, 210, 255],
      alpha: 0.55,
    });
  },
  burst(fx, rng, x, y, power) {
    radial(fx, rng, x, y, 16 * power, [90, 260], () => ({
      life: rng.range(0.4, 0.9),
      size: rng.range(5, 8),
      size1: 1,
      color: pick(rng, STORM.colors),
      shape: 'spark',
      tail: 0.18,
      halo: 2,
      drag: 1.2,
    }));
    fx.emit({ x, y, life: 0.7, size: 20, size1: 150, shape: 'ring', width: 3, color: [210, 190, 255], alpha: 0.9 });
  },
  moments: [1.8, 2.7, 3.45],
  moment(m, i) {
    m.bolt(m.ground.w * [0.2, 0.78, 0.38][i]!);
    m.flash(0.5, [220, 210, 255]);
  },
};

const WOOD: World = {
  glow: [150, 255, 190],
  colors: [
    [190, 255, 140],
    [150, 255, 200],
    [255, 244, 150],
  ],
  voice: 'marimba',
  root: 62,
  tune: [0, 2, 5, 7, 9, 12, 9, 7, 5, 7, 9, 14],
  call: 'wind',
  rate: 11,
  glyph(g, x, y, r) {
    g.fillStyle = '#7be08a';
    g.beginPath();
    g.moveTo(x - r, y + r * 0.6);
    g.quadraticCurveTo(x - r * 0.6, y - r, x + r, y - r * 0.8);
    g.quadraticCurveTo(x + r * 0.9, y + r * 0.8, x - r, y + r * 0.6);
    g.fill();
    g.strokeStyle = 'rgba(20,70,40,0.7)';
    g.lineWidth = r * 0.14;
    g.beginPath();
    g.moveTo(x - r * 0.8, y + r * 0.5);
    g.lineTo(x + r * 0.6, y - r * 0.5);
    g.stroke();
  },
  paint(g, ground, rng) {
    const { w, h } = ground;
    verticalGradient(g, 0, 0, w, h, [
      [0, [4, 16, 24]],
      [0.6, [10, 52, 56]],
      [1, [24, 96, 80]],
    ]);
    stars(g, rng, w, h * 0.4, 50, [210, 255, 230]);
    glowAt(g, ground.x, ground.y - ground.tall * 0.4, ground.tall * 2.2, [120, 255, 190], 0.28);
    // Trunks stand dark on both sides, with a few glowing mushrooms at their feet.
    for (let i = 0; i < 9; i++) {
      const left = i % 2 === 0;
      const x = left ? rng.range(-10, w * 0.3) : rng.range(w * 0.7, w + 10);
      const tw = rng.range(14, 38);
      g.fillStyle = css(mix([6, 24, 28], [14, 46, 44], rng.next()));
      g.fillRect(x - tw / 2, 0, tw, h);
    }
    g.fillStyle = css([8, 38, 36]);
    g.fillRect(0, ground.y + 8, w, h);
    pool(g, ground, [140, 255, 190], 0.6);
    for (let i = 0; i < 12; i++) {
      const left = i % 2 === 0;
      const x = left ? rng.range(0, w * 0.34) : rng.range(w * 0.66, w);
      const y = ground.y + rng.range(10, h - ground.y - 4);
      const r = rng.range(5, 11);
      glowAt(g, x, y - r * 0.4, r * 5, [140, 255, 190], 0.4);
      g.fillStyle = css([190, 255, 214]);
      g.beginPath();
      g.ellipse(x, y - r * 0.5, r, r * 0.6, 0, Math.PI, 0);
      g.fill();
      g.fillStyle = css([226, 255, 236]);
      g.fillRect(x - r * 0.2, y - r * 0.5, r * 0.4, r * 0.6);
    }
  },
  drift(fx, rng, ground) {
    if (rng.next() < 0.45) {
      fall(fx, rng, ground, {
        y: -8,
        vy: rng.range(20, 40),
        vx: rng.range(-12, 12),
        size: rng.range(8, 13),
        life: rng.range(4, 6),
        color: pick(rng, [
          [150, 255, 140],
          [255, 230, 120],
          [120, 240, 190],
        ] as const),
        shape: 'leaf',
        spin: rng.range(-1.5, 1.5),
        sway: 26,
        alpha: 0.9,
        add: false,
      });
      return;
    }
    fall(fx, rng, ground, {
      y: rng.range(ground.h * 0.3, ground.h * 0.95),
      vy: rng.range(-8, 4),
      size: rng.range(6, 11),
      life: rng.range(2.4, 4.2),
      color: [255, 244, 140],
      twinkle: 0.9,
      fadeIn: 0.6,
      sway: 30,
      alpha: 0.9,
    });
  },
  burst(fx, rng, x, y, power) {
    radial(fx, rng, x, y, 14 * power, [60, 160], () => ({
      life: rng.range(1.4, 2.4),
      size: rng.range(9, 14),
      color: pick(rng, WOOD.colors),
      shape: 'leaf',
      spin: rng.range(-4, 4),
      drag: 1.4,
      gravity: 70,
      add: false,
      alpha: 0.95,
    }));
    radial(fx, rng, x, y, 16 * power, [30, 120], () => ({
      life: rng.range(1.2, 2.2),
      size: rng.range(7, 12),
      size1: 2,
      color: [255, 244, 140],
      drag: 1.4,
      twinkle: 1.2,
      swirl: rng.range(-2, 2),
    }));
    fx.emit({ x, y, life: 1, size: 20, size1: 160, shape: 'ring', width: 3, color: [170, 255, 200], alpha: 0.9 });
  },
};

export const WORLDS: Readonly<Record<StatueName, World>> = {
  'star-whale': SKY,
  'crystal-fox': CRYSTAL,
  'moon-hare': MOON,
  'ember-drake': EMBER,
  'coral-seahorse': OCEAN,
  'cloud-lion': CLOUD,
  'storm-bird': STORM,
  'glow-owl': WOOD,
};

/** The colour a statue is washed with while it sleeps. */
export const ASLEEP: RGB = [96, 100, 140];
