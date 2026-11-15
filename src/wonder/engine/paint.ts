import type { Rng } from '../../domain/rng';
import { COLORS, css, darken, lighten, mix, type RGB } from './color';
import { clamp, hump, TAU } from './ease';
import { pictureOf } from './particles';

/**
 * Code-drawn scenery shared by the games. Anything that does not change is drawn once into a canvas
 * and then only stamped.
 */

const INK = '#26183d';

/** A canvas of this size, drawn into once by `paint`. For scenery that never changes. */
export function prerender(
  w: number,
  h: number,
  paint: (g: CanvasRenderingContext2D, w: number, h: number) => void,
  scale = 2,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const g = canvas.getContext('2d')!;
  g.scale(scale, scale);
  paint(g, w, h);
  return canvas;
}

/** Draws a prerendered canvas with its top left at (x, y), at its own size in units. */
export function stamp(
  g: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  g.drawImage(canvas, x, y, w, h);
}

/** A soft pool of light. Use it on the light sheet, or on the picture with `lighter`. */
export function glowAt(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: RGB,
  alpha = 1,
  shape: 'glow' | 'spark' = 'glow',
): void {
  const img = pictureOf(shape, color[0], color[1], color[2]);
  if (!img || alpha <= 0.004) return;
  const before = g.globalAlpha;
  g.globalAlpha = before * clamp(alpha);
  g.drawImage(img, x - size / 2, y - size / 2, size, size);
  g.globalAlpha = before;
}

/** Adds a rounded rectangle to the path being built. */
export function addRoundedRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const k = Math.min(r, w / 2, h / 2);
  g.moveTo(x + k, y);
  g.arcTo(x + w, y, x + w, y + h, k);
  g.arcTo(x + w, y + h, x, y + h, k);
  g.arcTo(x, y + h, x, y, k);
  g.arcTo(x, y, x + w, y, k);
  g.closePath();
}

/** Starts a new path that is one rounded rectangle. */
export function roundedRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  addRoundedRect(g, x, y, w, h, r);
}

/**
 * Fills the whole view with a top to bottom gradient. `stops` run from the top (0) to the bottom
 * (1).
 */
export function verticalGradient(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  stops: readonly (readonly [number, RGB])[],
  alpha = 1,
): void {
  const grad = g.createLinearGradient(0, y, 0, y + h);
  for (const [at, c] of stops) grad.addColorStop(at, css(c, alpha));
  g.fillStyle = grad;
  g.fillRect(x, y, w, h);
}

/** Small twinkling stars over a part of the sky. Where they are is decided once. */
export class Starfield {
  private readonly stars: { x: number; y: number; r: number; phase: number; rate: number; tone: RGB; big: boolean }[] =
    [];

  constructor(count: number, rng: Rng, w: number, top: number, bottom: number) {
    const tones: RGB[] = [COLORS.white, [200, 220, 255], [255, 240, 200], [255, 215, 235]];
    for (let i = 0; i < count; i++) {
      this.stars.push({
        x: rng.range(0, w),
        // More of them high up, where the sky is darker.
        y: top + (bottom - top) * rng.next() ** 1.5,
        r: rng.range(0.5, 1.5),
        phase: rng.range(0, TAU),
        rate: rng.range(0.6, 2.4),
        tone: rng.pick(tones),
        big: rng.next() < 0.1,
      });
    }
  }

  draw(g: CanvasRenderingContext2D, t: number, calm: boolean, alpha = 1): void {
    const swing = calm ? 0.12 : 0.4;
    for (const s of this.stars) {
      const a = alpha * (1 - swing + swing * Math.sin(s.phase + t * s.rate));
      if (s.big) {
        glowAt(g, s.x, s.y, 9 + s.r * 4, s.tone, a * 0.9, 'spark');
        continue;
      }
      g.globalAlpha = clamp(a);
      g.fillStyle = css(s.tone);
      g.fillRect(s.x - s.r / 2, s.y - s.r / 2, s.r, s.r);
    }
    g.globalAlpha = 1;
  }
}

/**
 * A puffy cloud at night: a row of rounded lumps that swell in the middle, with a flat base and two
 * small puffs on its shoulders. It is lit from above, so its top is the light colour and its belly
 * the dark one.
 */
export function makeCloud(w: number, h: number, rng: Rng, top: RGB, bottom: RGB, bumps = 6): HTMLCanvasElement {
  return prerender(w, h, (g) => {
    const base = h * 0.86;
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, css(top));
    grad.addColorStop(0.55, css(mix(top, bottom, 0.5)));
    grad.addColorStop(1, css(bottom));
    g.fillStyle = grad;
    g.beginPath();
    for (let i = 0; i < bumps; i++) {
      const u = (i + 0.5) / bumps;
      const swell = Math.sin(u * Math.PI);
      const r = h * (0.17 + 0.3 * swell) * rng.range(0.82, 1.12);
      const x = w * (0.1 + 0.8 * u) + rng.range(-0.025, 0.025) * w;
      const y = base - r * rng.range(0.72, 0.98);
      g.moveTo(x + r, y);
      g.arc(x, y, r, 0, TAU);
    }
    for (const side of [0.3, 0.7]) {
      const r = h * rng.range(0.12, 0.18);
      g.moveTo(w * side + r, base - h * 0.5);
      g.arc(w * side, base - h * 0.5, r, 0, TAU);
    }
    addRoundedRect(g, w * 0.07, base - h * 0.17, w * 0.86, h * 0.17 + h * 0.08, h * 0.1);
    g.fill();
  });
}

/**
 * A long soft hill line for the far edge of the world, as a strip as wide as the view and `h` tall,
 * filled to its bottom.
 */
export function makeHills(w: number, h: number, rng: Rng, top: RGB, bottom: RGB, roll = 0.5): HTMLCanvasElement {
  return prerender(w, h, (g) => {
    const waves = [
      { a: rng.range(0.2, 0.34), f: rng.range(1.2, 2.2), p: rng.range(0, TAU) },
      { a: rng.range(0.12, 0.2), f: rng.range(2.8, 4.4), p: rng.range(0, TAU) },
      { a: rng.range(0.04, 0.09), f: rng.range(6, 9), p: rng.range(0, TAU) },
    ];
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += 6) {
      const u = x / w;
      let y = h * 0.5;
      for (const k of waves) y -= Math.sin(u * TAU * k.f + k.p) * k.a * h * roll;
      g.lineTo(x, y);
    }
    g.lineTo(w, h);
    g.closePath();
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, css(top));
    grad.addColorStop(1, css(bottom));
    g.fillStyle = grad;
    g.fill();
  });
}

/** A little palace on a hill, in silhouette, with its windows lit. Its base is at y = h. */
export function makePalace(w: number, h: number, body: RGB, window: RGB): HTMLCanvasElement {
  return prerender(w, h, (g) => {
    g.fillStyle = css(body);
    const tower = (x: number, width: number, top: number, roof: number): void => {
      g.fillRect(x, top, width, h - top);
      g.beginPath();
      g.moveTo(x - width * 0.12, top + 1);
      g.lineTo(x + width / 2, top - roof);
      g.lineTo(x + width * 1.12, top + 1);
      g.closePath();
      g.fill();
    };
    g.fillRect(w * 0.18, h * 0.5, w * 0.64, h * 0.5);
    tower(w * 0.08, w * 0.14, h * 0.28, h * 0.3);
    tower(w * 0.78, w * 0.14, h * 0.28, h * 0.3);
    tower(w * 0.42, w * 0.16, h * 0.08, h * 0.32);
    tower(w * 0.25, w * 0.1, h * 0.38, h * 0.2);
    tower(w * 0.65, w * 0.1, h * 0.38, h * 0.2);
    g.fillStyle = css(window);
    const lit = (x: number, y: number, ww: number, hh: number): void => {
      roundedRect(g, x, y, ww, hh, ww / 2);
      g.fill();
    };
    for (const [x, y] of [
      [0.115, 0.46],
      [0.815, 0.46],
      [0.46, 0.22],
      [0.275, 0.52],
      [0.675, 0.52],
      [0.36, 0.66],
      [0.56, 0.66],
    ] as const)
      lit(w * x, h * y, w * 0.022, h * 0.1);
  });
}

/** A moon with a halo. */
export function paintMoon(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  tint: RGB = [255, 247, 220],
): void {
  glowAt(g, x, y, r * 6.5, tint, 0.35);
  glowAt(g, x, y, r * 3.4, tint, 0.45);
  const body = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  body.addColorStop(0, css(lighten(tint, 0.6)));
  body.addColorStop(1, css(darken(tint, 0.06)));
  g.fillStyle = body;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
  g.fillStyle = css(darken(tint, 0.18), 0.35);
  for (const [dx, dy, rr] of [
    [-0.35, -0.1, 0.2],
    [0.25, 0.3, 0.15],
    [0.3, -0.35, 0.1],
    [-0.1, 0.45, 0.09],
  ] as const) {
    g.beginPath();
    g.arc(x + dx * r, y + dy * r, rr * r, 0, TAU);
    g.fill();
  }
}

/** A pointing hand that taps, to show where to touch. `x`, `y` is the tip of the finger. */
export function paintHand(g: CanvasRenderingContext2D, x: number, y: number, t: number, scale = 1): void {
  const phase = (t * 1.25) % 1;
  const press = hump(Math.min(1, phase * 1.6));
  const lift = (1 - press) * 10 * scale;
  g.save();
  // A ripple spreads from the tip as the finger lands.
  if (phase > 0.28 && phase < 0.9) {
    const u = (phase - 0.28) / 0.62;
    g.strokeStyle = `rgba(255,255,255,${(0.7 * (1 - u)).toFixed(3)})`;
    g.lineWidth = 3 * scale;
    g.beginPath();
    g.arc(x, y, (6 + u * 26) * scale, 0, TAU);
    g.stroke();
  }
  g.translate(x, y + lift + 4 * scale);
  g.scale(scale, scale);
  g.rotate(-0.12);
  g.shadowColor = 'rgba(0,0,0,0.35)';
  g.shadowBlur = 8;
  g.shadowOffsetY = 4;
  g.fillStyle = '#fff';
  g.strokeStyle = INK;
  g.lineWidth = 2.6;
  g.lineJoin = 'round';
  // Finger, palm and thumb as one outline.
  g.beginPath();
  g.moveTo(-6, 4);
  g.arc(0, 4, 6, Math.PI, 0);
  g.lineTo(6, 28);
  g.lineTo(13, 27);
  g.quadraticCurveTo(21, 28, 21, 36);
  g.lineTo(21, 46);
  g.quadraticCurveTo(21, 62, 6, 64);
  g.lineTo(-8, 64);
  g.quadraticCurveTo(-21, 62, -21, 48);
  g.lineTo(-21, 40);
  g.quadraticCurveTo(-21, 33, -14, 36);
  g.lineTo(-6, 40);
  g.closePath();
  g.fill();
  g.shadowColor = 'transparent';
  g.stroke();
  g.strokeStyle = 'rgba(38,24,61,0.35)';
  g.lineWidth = 1.8;
  g.beginPath();
  g.moveTo(-1, 30);
  g.lineTo(-1, 44);
  g.moveTo(8, 32);
  g.lineTo(8, 44);
  g.stroke();
  g.restore();
}

/** Bold rounded text with an outline, for the few numbers a game shows. */
export function label(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: RGB | string = '#fff',
  align: CanvasTextAlign = 'center',
): void {
  g.font = `700 ${size}px Fredoka, ui-rounded, 'SF Pro Rounded', system-ui, sans-serif`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = Math.max(3, size * 0.22);
  g.strokeStyle = INK;
  g.strokeText(text, x, y);
  g.fillStyle = typeof color === 'string' ? color : css(color);
  g.fillText(text, x, y);
}
