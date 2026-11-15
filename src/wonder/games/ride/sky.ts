import { Rng } from '../../../domain/rng';
import type { Camera } from '../../engine/camera';
import { COLORS, css, darken, lighten, mix, type RGB } from '../../engine/color';
import { clamp, lerp, TAU } from '../../engine/ease';
import { glowAt, makeCloud, makeHills, makePalace, prerender, verticalGradient } from '../../engine/paint';
import type { Painter, View } from '../../engine/painter';

/**
 * The day she rides through: a sky that is morning when she begins and is sunset by the time she is
 * done, with a sun, clouds in layers that drift past at different speeds so the world is deep,
 * islands in the haze, a sea of cloud far below, and birds. The sky takes its colours from how much
 * she has played, so a game that is going well looks like it is going somewhere.
 */

export interface Sky {
  top: RGB;
  mid: RGB;
  low: RGB;
  sun: RGB;
  /** How far down the screen the sun is, as a share of its height. */
  sunY: number;
  /** The colour of the haze far away. */
  haze: RGB;
}

/** Morning, noon, the golden afternoon and sunset, which a ride moves through in that order. */
const SKIES: readonly Sky[] = [
  {
    top: [104, 186, 255],
    mid: [172, 226, 255],
    low: [255, 238, 224],
    sun: [255, 246, 208],
    sunY: 0.2,
    haze: [236, 232, 250],
  },
  {
    top: [62, 156, 252],
    mid: [136, 208, 255],
    low: [212, 244, 255],
    sun: [255, 255, 238],
    sunY: 0.15,
    haze: [214, 236, 255],
  },
  {
    top: [98, 148, 238],
    mid: [255, 214, 188],
    low: [255, 234, 190],
    sun: [255, 228, 154],
    sunY: 0.3,
    haze: [255, 226, 210],
  },
  {
    top: [112, 96, 208],
    mid: [255, 148, 172],
    low: [255, 206, 152],
    sun: [255, 178, 122],
    sunY: 0.5,
    haze: [255, 190, 190],
  },
];

/** The sky `u` of the way through a ride, from 0 (morning) to 1 (sunset). */
function skyAt(
  u: number,
  out: Sky = { top: [0, 0, 0], mid: [0, 0, 0], low: [0, 0, 0], sun: [0, 0, 0], sunY: 0, haze: [0, 0, 0] },
): Sky {
  const f = clamp(u) * (SKIES.length - 1);
  const i = Math.min(SKIES.length - 2, Math.floor(f));
  const a = SKIES[i]!;
  const b = SKIES[i + 1]!;
  const t = f - i;
  out.top = mix(a.top, b.top, t);
  out.mid = mix(a.mid, b.mid, t);
  out.low = mix(a.low, b.low, t);
  out.sun = mix(a.sun, b.sun, t);
  out.sunY = lerp(a.sunY, b.sunY, t);
  out.haze = mix(a.haze, b.haze, t);
  return out;
}

/**
 * A number from 0 to 1 that is always the same for the same `i`, so a layer of things can go on
 * forever without remembering any of them.
 */
export function hash(i: number, salt = 0): number {
  const s = Math.sin(i * 127.1 + salt * 311.7 + 17.3) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * One cloud, drawn twice from the same numbers: once in the light of the day and once in the light
 * of the evening.
 */
export interface Variant {
  readonly day: HTMLCanvasElement;
  readonly dusk: HTMLCanvasElement;
  readonly w: number;
  readonly h: number;
}

const DAY = { top: [255, 255, 255], bottom: [201, 218, 246] } as const satisfies Record<string, RGB>;
const DUSK = { top: [255, 233, 214], bottom: [190, 150, 206] } as const satisfies Record<string, RGB>;

/** A cloud `w` wide of `bumps` lumps, in both lights. */
export function cloudVariant(rng: Rng, w: number, bumps = 6, flatness = 1): Variant {
  const h = w * rng.range(0.3, 0.42) * flatness;
  const seed = rng.int(0x7fffffff);
  return {
    day: makeCloud(w, h, new Rng(seed), DAY.top, DAY.bottom, bumps),
    dusk: makeCloud(w, h, new Rng(seed), DUSK.top, DUSK.bottom, bumps),
    w,
    h,
  };
}

/** Draws a cloud at a place, in the light between day and evening that `dusk` (0 to 1) says. */
export function stampCloud(
  g: CanvasRenderingContext2D,
  v: Variant,
  x: number,
  y: number,
  w: number,
  h: number,
  alpha: number,
  dusk: number,
): void {
  g.globalAlpha = alpha;
  if (dusk < 0.02) g.drawImage(v.day, x, y, w, h);
  else if (dusk > 0.98) g.drawImage(v.dusk, x, y, w, h);
  else {
    g.drawImage(v.day, x, y, w, h);
    g.globalAlpha = alpha * dusk;
    g.drawImage(v.dusk, x, y, w, h);
  }
  g.globalAlpha = 1;
}

/**
 * One depth of clouds. The nearer it is, the faster it passes and the more it follows the camera up
 * and down.
 */
interface Layer {
  /** How much of the camera's movement it follows. 1 would be in the world. */
  readonly factor: number;
  /** The spacing between its clouds, in the layer's own units. */
  readonly spacing: number;
  /** Where its clouds sit up and down the screen, as shares of its height. */
  readonly from: number;
  readonly to: number;
  readonly alpha: number;
  readonly variants: readonly Variant[];
  /** How much the layer is stretched, for nearer and bigger clouds. */
  readonly scale: number;
}

const LAYERS: readonly {
  factor: number;
  spacing: number;
  from: number;
  to: number;
  alpha: number;
  scale: number;
  width: [number, number];
  count: number;
}[] = [
  { factor: 0.1, spacing: 330, from: 0.2, to: 0.62, alpha: 0.7, scale: 0.8, width: [180, 260], count: 5 },
  { factor: 0.24, spacing: 380, from: 0.26, to: 0.72, alpha: 0.85, scale: 1, width: [200, 320], count: 6 },
  { factor: 0.46, spacing: 520, from: 0.4, to: 0.86, alpha: 0.95, scale: 1.2, width: [220, 340], count: 6 },
];

export class DaySky {
  private readonly layers: Layer[];
  private readonly sea: Variant[];
  private readonly wisps: Variant[];
  private readonly islands: { readonly image: HTMLCanvasElement; readonly w: number; readonly h: number }[];
  private readonly hills: HTMLCanvasElement;
  private readonly current: Sky = skyAt(0);

  constructor(
    rng: Rng,
    private readonly view: View,
  ) {
    const cloud = (w: number, bumps = 6): Variant => cloudVariant(rng, w, bumps);
    this.layers = LAYERS.map((l) => ({
      factor: l.factor,
      spacing: l.spacing,
      from: l.from,
      to: l.to,
      alpha: l.alpha,
      scale: l.scale,
      variants: Array.from({ length: l.count }, () => cloud(rng.range(l.width[0], l.width[1]), 5 + rng.int(3))),
    }));
    // The sea of cloud far below is made of big flat clouds close together, so it reads as a floor
    // of white.
    this.sea = Array.from({ length: 5 }, () => cloud(rng.range(300, 420), 8));
    // Wisps that pass in front of everything, long and low.
    this.wisps = Array.from({ length: 3 }, () => cloud(rng.range(260, 380), 4));
    this.hills = makeHills(900, 130, rng, [150, 170, 220], [200, 190, 235], 0.5);
    this.islands = [0, 1, 2].map((i) => {
      const w = 190 + i * 30;
      const h = 150;
      return { image: this.island(w, h, i, rng), w, h };
    });
  }

  /**
   * A little island in the sky, far off: a cap of grass and a few trees on a tapering rock, and a
   * palace on the first.
   */
  private island(w: number, h: number, i: number, rng: Rng): HTMLCanvasElement {
    return prerender(w, h, (g) => {
      const base = h * 0.46;
      // The rock hangs below the grass and narrows to a point.
      const rock = g.createLinearGradient(0, base, 0, h);
      rock.addColorStop(0, css([168, 150, 190]));
      rock.addColorStop(1, css([112, 100, 152]));
      g.fillStyle = rock;
      g.beginPath();
      g.moveTo(w * 0.06, base);
      g.bezierCurveTo(w * 0.12, base + h * 0.2, w * 0.38, h * 0.62, w * 0.5, h * 0.96);
      g.bezierCurveTo(w * 0.62, h * 0.62, w * 0.88, base + h * 0.2, w * 0.94, base);
      g.closePath();
      g.fill();
      // The grass on top.
      const top = g.createLinearGradient(0, base - 14, 0, base + 10);
      top.addColorStop(0, css([150, 224, 150]));
      top.addColorStop(1, css([88, 180, 120]));
      g.fillStyle = top;
      g.beginPath();
      g.ellipse(w / 2, base, w * 0.45, 13, 0, 0, TAU);
      g.fill();
      if (i === 0) g.drawImage(makePalace(96, 64, [124, 108, 168], [255, 232, 160]), w * 0.28, base - 58, 96, 64);
      // Round trees, a few of them.
      const count = i === 0 ? 3 : 5;
      for (let k = 0; k < count; k++) {
        const tx = w * (i === 0 ? [0.14, 0.82, 0.9][k]! : 0.18 + k * 0.16);
        const r = rng.range(8, 13);
        g.fillStyle = css([112, 84, 120]);
        g.fillRect(tx - 1.5, base - 10, 3, 12);
        g.fillStyle = css(k % 2 === 0 ? [86, 190, 130] : [120, 206, 134]);
        g.beginPath();
        g.arc(tx, base - 14 - r * 0.4, r, 0, TAU);
        g.fill();
      }
      // A waterfall of rainbow falls from the edge of the second one.
      if (i === 1) {
        for (let k = 0; k < 7; k++) {
          g.fillStyle = css(
            lighten(
              [COLORS.red, COLORS.orange, COLORS.gold, COLORS.green, COLORS.sky, COLORS.indigo, COLORS.violet][k]!,
              0.1,
            ),
            0.85,
          );
          g.fillRect(w * 0.7 + k * 2.2, base + 2, 2.2, h * 0.5);
        }
      }
    });
  }

  /** Puts the sky on the screen. `u` is how far along her game is, 0 to 1. */
  paint(p: Painter, cam: Camera, u: number): Sky {
    const g = p.ctx;
    const { w, h } = this.view;
    const sky = skyAt(u, this.current);
    const dusk = clamp((u - 0.45) / 0.45);
    verticalGradient(g, 0, 0, w, h + 2, [
      [0, sky.top],
      [0.52, sky.mid],
      [0.94, sky.low],
    ]);
    this.paintSun(p, sky);
    this.paintFar(p, cam);
    this.paintBirds(p, cam, sky);
    for (let i = 0; i < this.layers.length; i++) this.paintLayer(g, cam, this.layers[i]!, dusk, i);
    this.paintSea(g, cam, dusk);
    return sky;
  }

  private paintSun(p: Painter, sky: Sky): void {
    const g = p.ctx;
    const { w, h } = this.view;
    const x = w * 0.78;
    const y = h * sky.sunY;
    g.globalCompositeOperation = 'lighter';
    glowAt(g, x, y, Math.min(w, h * 2.2) * 0.9, sky.sun, 0.5);
    glowAt(g, x, y, 150, lighten(sky.sun, 0.4), 0.7);
    // Long soft rays that turn very slowly.
    const turn = p.t * 0.04;
    g.fillStyle = css(sky.sun, p.calm ? 0.05 : 0.08);
    const reach = Math.max(w, h) * 1.1;
    for (let i = 0; i < 9; i++) {
      const a = turn + (i / 9) * TAU;
      const half = 0.045;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a - half) * reach, y + Math.sin(a - half) * reach);
      g.lineTo(x + Math.cos(a + half) * reach, y + Math.sin(a + half) * reach);
      g.closePath();
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    const body = g.createRadialGradient(x - 6, y - 6, 3, x, y, 30);
    body.addColorStop(0, css(lighten(sky.sun, 0.7)));
    body.addColorStop(1, css(sky.sun));
    g.fillStyle = body;
    g.beginPath();
    g.arc(x, y, 30, 0, TAU);
    g.fill();
  }

  /** Islands and a ridge of hills in the haze, the farthest things there are. */
  private paintFar(p: Painter, cam: Camera): void {
    const g = p.ctx;
    const { w, h } = this.view;
    const factor = 0.05;
    const spacing = 1500;
    const first = Math.floor((cam.x * factor - w * 0.5) / spacing) - 1;
    const last = first + Math.ceil((w * 2) / spacing) + 2;
    g.globalAlpha = 0.5;
    for (let i = first; i <= last; i++) {
      const isl = this.islands[((i % 3) + 3) % 3]!;
      const x = i * spacing + hash(i, 1) * 600 - cam.x * factor + w * 0.5;
      const y = h * (0.18 + hash(i, 2) * 0.3) - cam.y * factor * 0.5 + 20;
      if (x > w + isl.w || x < -isl.w * 1.5) continue;
      g.drawImage(isl.image, x, y, isl.w * 1.2, isl.h * 1.2);
    }
    // A ridge far below, seen over the sea of cloud.
    g.globalAlpha = 0.45;
    const ridge = (cam.x * 0.03) % 900;
    for (let x = -ridge - 900; x < w + 900; x += 900) g.drawImage(this.hills, x, h * 0.86 - cam.y * 0.01, 900, 130);
    g.globalAlpha = 1;
  }

  private paintBirds(p: Painter, cam: Camera, sky: Sky): void {
    const g = p.ctx;
    const { w, h } = this.view;
    const ink = darken(mix(sky.haze, [90, 80, 140], 0.6), 0.05);
    g.strokeStyle = css(ink, 0.55);
    g.lineWidth = 1.6;
    g.lineCap = 'round';
    const count = 7;
    for (let i = 0; i < count; i++) {
      const speed = 18 + hash(i, 3) * 14;
      const x = ((hash(i, 4) * 2000 + p.t * speed - cam.x * 0.12) % (w + 400)) - 200;
      const y = h * (0.14 + hash(i, 5) * 0.38) - cam.y * 0.05 + Math.sin(p.t * 0.6 + i) * 6;
      const flap = Math.sin(p.t * (5 + hash(i, 6) * 2) + i * 2);
      const s = 4 + hash(i, 7) * 3;
      g.beginPath();
      g.moveTo(x - s * 1.7, y - flap * s * 0.7);
      g.quadraticCurveTo(x - s * 0.6, y - flap * s * 0.7 - s * 0.6, x, y);
      g.quadraticCurveTo(x + s * 0.6, y - flap * s * 0.7 - s * 0.6, x + s * 1.7, y - flap * s * 0.7);
      g.stroke();
    }
  }

  private paintLayer(g: CanvasRenderingContext2D, cam: Camera, layer: Layer, dusk: number, index: number): void {
    const { w, h } = this.view;
    const shift = cam.x * layer.factor;
    const first = Math.floor((shift - w * 0.5) / layer.spacing) - 1;
    const count = Math.ceil((w * 2) / layer.spacing) + 3;
    for (let n = 0; n < count; n++) {
      const i = first + n;
      const v = layer.variants[Math.floor(hash(i, 10 + index) * layer.variants.length)]!;
      const x = i * layer.spacing + hash(i, 11 + index) * layer.spacing * 0.6 - shift + w * 0.5;
      const width = v.w * layer.scale;
      if (x > w + 20 || x + width < -20) continue;
      const y =
        h * lerp(layer.from, layer.to, hash(i, 12 + index)) - cam.y * layer.factor * 0.35 - v.h * layer.scale * 0.5;
      stampCloud(g, v, x, y, width, v.h * layer.scale, layer.alpha, dusk);
    }
  }

  /**
   * The floor of cloud. It is low on the screen and follows the camera up and down a little, so a
   * long fall shows more of it.
   */
  private paintSea(g: CanvasRenderingContext2D, cam: Camera, dusk: number): void {
    const { w, h } = this.view;
    const factor = 0.34;
    const spacing = 250;
    const shift = cam.x * factor;
    const first = Math.floor((shift - w * 0.5) / spacing) - 1;
    const count = Math.ceil((w * 2) / spacing) + 3;
    const top = h * 1.02 - cam.y * 0.16 - 18;
    for (let row = 0; row < 2; row++) {
      for (let n = 0; n < count; n++) {
        const i = first + n;
        const v = this.sea[Math.floor(hash(i, 20 + row) * this.sea.length)]!;
        const x = i * spacing + hash(i, 21 + row) * 120 - shift * (1 + row * 0.35) + w * 0.5;
        if (x > w + 20 || x + v.w < -20) continue;
        const y = top + row * 26 + hash(i, 22 + row) * 14;
        stampCloud(g, v, x, y, v.w * 1.1, v.h * 1.1, 1, dusk);
      }
    }
  }

  /**
   * Wisps of cloud that pass close to the camera, very fast, so a rider feels how fast she goes.
   */
  paintFront(p: Painter, cam: Camera, speed: number, dusk: number): void {
    if (p.calm) return;
    const g = p.ctx;
    const { w, h } = this.view;
    const factor = 1.6;
    const spacing = 900;
    const shift = cam.x * factor;
    const first = Math.floor((shift - w * 0.5) / spacing) - 1;
    const count = Math.ceil((w * 2) / spacing) + 3;
    const strength = clamp((speed - 260) / 260) * 0.28;
    if (strength < 0.01) return;
    for (let n = 0; n < count; n++) {
      const i = first + n;
      const v = this.wisps[Math.floor(hash(i, 30) * this.wisps.length)]!;
      const x = i * spacing + hash(i, 31) * 300 - shift + w * 0.5;
      if (x > w + 20 || x + v.w * 1.6 < -20) continue;
      const y = h * (0.3 + hash(i, 32) * 0.55) - cam.y * 0.5;
      stampCloud(g, v, x, y, v.w * 1.6, v.h * 0.9, strength, dusk);
    }
  }
}
