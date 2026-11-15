import { outlineOf, type RGB } from '../core/color';
import { createRgba, type Rgba } from '../core/image';

/**
 * A small 2D pixel-art toolkit for effects. Shapes are inside-tests on continuous coordinates, so a
 * drawing can be described by geometry and still land on hard pixels: each pixel is covered or not
 * (coverage of at least half, from a 4x4 sample grid). Fills are cel-shaded from a dome profile, so
 * a heart or a droplet has a lit side and a shade side like the rest of the art, and an outline in
 * a dark tone of its own hue closes the shape.
 */
export type Shape = (x: number, y: number) => boolean;
export type Pt = readonly [number, number];

export const ellipse =
  (cx: number, cy: number, rx: number, ry: number, rot = 0): Shape =>
  (x, y) => {
    const dx = x - cx,
      dy = y - cy;
    const c = Math.cos(rot),
      s = Math.sin(rot);
    const u = (dx * c + dy * s) / rx,
      v = (-dx * s + dy * c) / ry;
    return u * u + v * v <= 1;
  };

export const polygon =
  (pts: readonly Pt[]): Shape =>
  (x, y) => {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i]!,
        [xj, yj] = pts[j]!;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };

/** A thick segment with round ends, radius easing from r0 to r1. */
export const capsule =
  (x0: number, y0: number, x1: number, y1: number, r0: number, r1 = r0): Shape =>
  (x, y) => {
    const dx = x1 - x0,
      dy = y1 - y0;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / len2));
    const r = r0 + (r1 - r0) * t;
    return Math.hypot(x - (x0 + dx * t), y - (y0 + dy * t)) <= r;
  };

export const union =
  (...shapes: Shape[]): Shape =>
  (x, y) =>
    shapes.some((s) => s(x, y));
export const minus =
  (a: Shape, b: Shape): Shape =>
  (x, y) =>
    a(x, y) && !b(x, y);
export const both =
  (a: Shape, b: Shape): Shape =>
  (x, y) =>
    a(x, y) && b(x, y);

/** The classic implicit heart, scaled so `size` is half its width and about half its height. */
export const heart =
  (cx: number, cy: number, size: number): Shape =>
  (x, y) => {
    const k = size * 0.88;
    const u = (x - cx) / k,
      v = -(y - cy) / k + 0.125;
    const a = u * u + v * v - 1;
    return a * a * a - u * u * v * v * v <= 0;
  };

/** A star or compass shape from alternating outer and inner radii. */
export function starPoints(
  cx: number,
  cy: number,
  points: number,
  outer: number,
  inner: number,
  rot = -Math.PI / 2,
): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rot + (i * Math.PI) / points;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

/**
 * A ring of width `w` centered on radius `r`, squashed vertically by `squash` (the ground plane's
 * tilt).
 */
export const ring =
  (cx: number, cy: number, r: number, w: number, squash = 1): Shape =>
  (x, y) => {
    const d = Math.hypot(x - cx, (y - cy) / squash);
    return d <= r + w / 2 && d >= r - w / 2;
  };

export interface FillOptions {
  /**
   * Direction the light comes from on screen, pointing toward the light. Default up and to the
   * left.
   */
  light?: readonly [number, number];
  /** Width of the rounded edge in pixels. Larger gives a rounder look. Default 3. */
  bevel?: number;
  /** How strongly the dome shifts the tone. Default 1. */
  gain?: number;
  /** Which ramp step flat areas take, as a fraction of the ramp. Default 0.62. */
  base?: number;
  /** Fraction of coverage a pixel needs. Default 0.5. */
  cover?: number;
}

const SS = 4;

export class Canvas2D {
  readonly px: Uint8Array;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.px = new Uint8Array(w * h * 4);
  }

  /** Which pixels a shape covers. */
  mask(shape: Shape, cover = 0.5): Uint8Array {
    const out = new Uint8Array(this.w * this.h);
    const need = Math.ceil(cover * SS * SS);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        let hit = 0;
        for (let sy = 0; sy < SS && hit < need; sy++)
          for (let sx = 0; sx < SS; sx++) if (shape(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS)) hit++;
        if (hit >= need) out[y * this.w + x] = 1;
      }
    }
    return out;
  }

  private set(x: number, y: number, c: RGB, a = 255): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.px[i] = Math.round(c[0]);
    this.px[i + 1] = Math.round(c[1]);
    this.px[i + 2] = Math.round(c[2]);
    this.px[i + 3] = a;
  }

  /** Flat color, no shading. */
  flat(shape: Shape, color: RGB, alpha = 255): this {
    const m = this.mask(shape);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) if (m[y * this.w + x]) this.set(x, y, color, alpha);
    return this;
  }

  /** Fills a shape with a dome-shaded ramp (darkest first). */
  fill(shape: Shape, ramp: readonly RGB[], o: FillOptions = {}): this {
    const { w, h } = this;
    const m = this.mask(shape, o.cover ?? 0.5);
    const bevel = o.bevel ?? 3;
    const gain = o.gain ?? 1;
    const L = norm3([(o.light ?? [-0.62, -0.78])[0], (o.light ?? [-0.62, -0.78])[1], 0.9]);
    const flat = dot3([0, 0, 1], L);

    // Distance from each covered pixel to the nearest uncovered one, capped at the bevel.
    const reach = Math.ceil(bevel) + 1;
    const height = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!m[y * w + x]) continue;
        let best = reach;
        for (let dy = -reach; dy <= reach; dy++) {
          for (let dx = -reach; dx <= reach; dx++) {
            const xx = x + dx,
              yy = y + dy;
            const covered = xx >= 0 && yy >= 0 && xx < w && yy < h && m[yy * w + xx];
            if (!covered) best = Math.min(best, Math.hypot(dx, dy) - 0.5);
          }
        }
        const t = Math.min(1, Math.max(0, best) / bevel);
        height[y * w + x] = Math.sqrt(1 - (1 - t) * (1 - t));
      }
    }
    const hAt = (x: number, y: number): number => (x < 0 || y < 0 || x >= w || y >= h ? 0 : height[y * w + x]!);

    const n = ramp.length;
    const baseIdx = (o.base ?? 0.62) * (n - 1);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!m[y * w + x]) continue;
        const k = bevel * 0.9;
        const nx = -(hAt(x + 1, y) - hAt(x - 1, y)) * k;
        const ny = -(hAt(x, y + 1) - hAt(x, y - 1)) * k;
        const N = norm3([nx, ny, 1]);
        const delta = dot3(N, L) - flat;
        const idx = Math.max(0, Math.min(n - 1, Math.round(baseIdx + delta * gain * (n - 1) * 1.15)));
        this.set(x, y, ramp[idx]!);
      }
    }
    return this;
  }

  /** A hard one-pixel line of flat color. */
  line(x0: number, y0: number, x1: number, y1: number, color: RGB, width = 1): this {
    return this.flat(capsule(x0, y0, x1, y1, width / 2), color);
  }

  pixel(x: number, y: number, color: RGB, alpha = 255): this {
    this.set(Math.floor(x), Math.floor(y), color, alpha);
    return this;
  }

  /** Paints `color` over every covered pixel where `where` is true, keeping shading elsewhere. */
  recolor(shape: Shape, tone: (c: RGB) => RGB): this {
    const m = this.mask(shape);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const i = (y * this.w + x) * 4;
        if (m[y * this.w + x] && this.px[i + 3]! > 0)
          this.set(x, y, tone([this.px[i]!, this.px[i + 1]!, this.px[i + 2]!]), this.px[i + 3]!);
      }
    }
    return this;
  }

  /**
   * Closes the drawing with an outline on the transparent pixels beside it. By default each outline
   * pixel takes a dark tone of the color it touches, so a pink heart gets a plum edge and a leaf
   * gets a deep green one.
   */
  outline(color?: RGB | ((neighbor: RGB) => RGB), diagonals = false): this {
    const { w, h } = this;
    const edge: { x: number; y: number; c: RGB }[] = [];
    const around = diagonals
      ? ([
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
          [1, 1],
          [-1, 1],
          [1, -1],
          [-1, -1],
        ] as const)
      : ([
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (this.px[(y * w + x) * 4 + 3]! > 0) continue;
        let source: RGB | null = null;
        let lightest = -1;
        for (const [dx, dy] of around) {
          const xx = x + dx,
            yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const i = (yy * w + xx) * 4;
          if (this.px[i + 3]! === 0) continue;
          const c: RGB = [this.px[i]!, this.px[i + 1]!, this.px[i + 2]!];
          const lum = c[0] + c[1] + c[2];
          // Prefer the darkest neighbor so the outline reads as the shape's own shade, not a
          // highlight's.
          if (lightest < 0 || lum < lightest) {
            lightest = lum;
            source = c;
          }
        }
        if (source)
          edge.push({ x, y, c: typeof color === 'function' ? color(source) : (color ?? outlineOf(source, 0.3)) });
      }
    }
    for (const e of edge) this.set(e.x, e.y, e.c);
    return this;
  }

  rgba(): Rgba {
    return { width: this.w, height: this.h, data: this.px };
  }
}

/**
 * A glow: concentric bands of one color, each fading, with a checker dither between bands so the
 * edge stays pixel art.
 */
export function glowDisc(size: number, color: RGB, bands = 5, peak = 0.9): Rgba {
  const img = createRgba(size, size);
  const c = (size - 1) / 2;
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c) / (size / 2);
      if (d >= 1) continue;
      const f = (1 - d) ** 1.6 * bands;
      const level = Math.floor(f);
      const frac = f - level;
      const threshold = (bayer[(y & 3) * 4 + (x & 3)]! + 0.5) / 16;
      const step = level + (frac > threshold ? 1 : 0);
      const a = Math.min(1, step / bands) * peak;
      if (a <= 0) continue;
      const i = (y * size + x) * 4;
      img.data[i] = color[0];
      img.data[i + 1] = color[1];
      img.data[i + 2] = color[2];
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  return img;
}

const dot3 = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const norm3 = (a: readonly [number, number, number]): [number, number, number] => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
