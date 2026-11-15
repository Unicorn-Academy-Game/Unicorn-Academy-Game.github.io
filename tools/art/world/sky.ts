import { hex, mix, type RGB } from '../core/color';
import { createRgba, type Rgba } from '../core/image';
import { hash2, mulberry32 } from '../core/rng';
import { bayer } from './noise';
import { Painter } from './paint';

/**
 * The backdrop behind the Fairy Palace: a sky that fades to a warm horizon, two rows of far hills,
 * puffy clouds and the rainbow. All of it is drawn straight onto pixels. The sky is a 64 px wide
 * strip the map repeats, so it can fill any width, and its gradient steps are dithered so they read
 * as soft light instead of banding.
 */

/**
 * The gradient runs down the rows below `cap`. The rows above hold the colour it starts from, so a
 * map that hangs the strip from its horizon has sky all the way up to the top of the map, however
 * high the camera looks.
 */
export const SKY_STRIP = { w: 64, h: 700, cap: 180 } as const;

const SKY_STOPS: { at: number; c: RGB }[] = [
  { at: 0, c: hex('#59aef5') },
  { at: 0.22, c: hex('#82c6f8') },
  { at: 0.45, c: hex('#aadbf9') },
  { at: 0.64, c: hex('#cfe9fb') },
  { at: 0.8, c: hex('#f0f2fa') },
  { at: 0.92, c: hex('#ffe9ee') },
  { at: 1, c: hex('#ffe3cf') },
];

/**
 * Sky colour at a height from 0 (top) to 1 (horizon): the band it sits in, and how far toward the
 * next one.
 */
function skyAt(t: number): { lo: RGB; hi: RGB; f: number } {
  for (let i = 0; i + 1 < SKY_STOPS.length; i++) {
    const a = SKY_STOPS[i]!,
      b = SKY_STOPS[i + 1]!;
    if (t <= b.at) return { lo: a.c, hi: b.c, f: (t - a.at) / (b.at - a.at) };
  }
  const last = SKY_STOPS[SKY_STOPS.length - 1]!.c;
  return { lo: last, hi: last, f: 0 };
}

/**
 * One column slice of sky. Dithers between the bands with a 4x4 pattern, which tiles in a 64 px
 * strip.
 */
export function skyStrip(): Rgba {
  const { w, h, cap } = SKY_STRIP;
  const img = createRgba(w, h);
  const p = new Painter(img);
  for (let y = 0; y < h; y++) {
    const s = skyAt(Math.max(0, y - cap) / (h - cap - 1));
    for (let x = 0; x < w; x++) {
      // Pick one of the two band colours by comparing the blend factor with the dither threshold.
      const c = s.f > bayer(x, y) ? s.hi : s.lo;
      p.px(x, y, [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])]);
    }
  }
  return img;
}

export interface HillsOpts {
  /** 'far' is pale and blue, 'near' is greener and nearer. */
  layer: 'far' | 'near';
  /**
   * Picks the shape. Different variants meet at the same height at both ends, so any order joins.
   */
  variant: number;
}

export const HILLS = { w: 512, h: 220 } as const;

/** A strip of rolling hills, periodic in x so neighbours join without a step. */
export function hills(o: HillsOpts): Rgba {
  const { w, h } = HILLS;
  const img = createRgba(w, h);
  const p = new Painter(img);
  const far = o.layer === 'far';
  const top = far ? hex('#c3cdf0') : hex('#a8dcae');
  const mid = far ? hex('#b2bde8') : hex('#8fcf9d');
  const low = far ? hex('#a4afe0') : hex('#79c08c');
  const rim = far ? hex('#d6def7') : hex('#c4efc6');
  const rng = mulberry32(o.variant * 131 + (far ? 7 : 19));
  // Every wave starts and ends at the baseline with a flat slope, so any two variants join without
  // a step or a kink.
  const waves = [1, 2, 3].map((k) => ({
    k: k + (far ? 0 : 1),
    a: ((far ? 40 : 34) / k) * (rng() < 0.5 ? -1 : 1) * (0.6 + 0.4 * rng()),
  }));
  const ridge = (x: number): number => {
    let y = far ? 100 : 122;
    for (const wv of waves) y += wv.a * (1 - Math.cos((x / w) * Math.PI * 2 * wv.k)) * 0.5;
    return y;
  };
  for (let x = 0; x < w; x++) {
    const r = Math.round(ridge(x));
    for (let y = r; y < h; y++) {
      const d = y - r;
      let c = d < 2 ? rim : d < 24 ? top : d < 70 ? mid : low;
      // A few soft darker tufts on the near hills, as if with trees too far to draw.
      if (!far && d > 8 && d < 34 && hash2(Math.floor(x / 7), Math.floor(d / 6), o.variant + 3) > 0.95) c = mid;
      p.px(x, y, [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])]);
    }
  }
  return img;
}

const CLOUD: Record<'outline' | 'shade' | 'mid' | 'light' | 'glow', RGB> = {
  outline: hex('#a9c2ec'),
  shade: hex('#c9daf6'),
  mid: hex('#e6effc'),
  light: hex('#f9fcff'),
  glow: hex('#ffffff'),
};

/** A cloud as a union of circles, lit from the upper left, flat underneath. */
export function cloud(seed: number, w: number, h: number): Rgba {
  const img = createRgba(w, h);
  const p = new Painter(img);
  const rng = mulberry32(seed);
  const circles: { x: number; y: number; r: number }[] = [];
  const n = Math.max(4, Math.round(w / 46));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const hump = Math.sin(Math.PI * t) ** 0.75;
    // The tallest puff just fits the canvas: its top stays 3 px from the edge.
    const r = ((h - 12) / 1.75) * (0.3 + 0.7 * hump) * (0.8 + 0.2 * rng());
    circles.push({ x: w * (0.08 + 0.84 * t) + (rng() - 0.5) * 8, y: h - 9 - r * 0.72, r });
  }
  const floorY = h - 9;
  const sdf = (x: number, y: number): number => {
    let d = Infinity;
    for (const c of circles) d = Math.min(d, Math.hypot(x - c.x, y - c.y) - c.r);
    return Math.max(d, y - floorY);
  };
  const light = ((): [number, number, number] => {
    const m = Math.hypot(-0.55, -0.7, 0.62);
    return [-0.55 / m, -0.7 / m, 0.62 / m];
  })();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = sdf(x + 0.5, y + 0.5);
      if (d > 0) continue;
      if (d > -1.4) {
        p.px(x, y, rgb(CLOUD.outline));
        continue;
      }
      // Each puff is a sphere; the visible surface is the highest one at this pixel, so lumps
      // overlap the way real ones do.
      let best = circles[0]!,
        bestZ = -1;
      for (const c of circles) {
        const dx = x + 0.5 - c.x,
          dy = y + 0.5 - c.y;
        const z2 = c.r * c.r - dx * dx - dy * dy;
        if (z2 > 0 && Math.sqrt(z2) > bestZ) {
          bestZ = Math.sqrt(z2);
          best = c;
        }
      }
      const nx = (x + 0.5 - best.x) / best.r,
        ny = (y + 0.5 - best.y) / best.r;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      let v = nx * light[0] + ny * light[1] + nz * light[2];
      v = 0.3 + 0.7 * Math.max(0, v);
      v -= Math.max(0, (y - (floorY - 14)) / 14) * 0.3;
      p.px(x, y, rgb(v > 0.9 ? CLOUD.glow : v > 0.68 ? CLOUD.light : v > 0.4 ? CLOUD.mid : CLOUD.shade));
    }
  }
  return img;
}

const rgb = (c: RGB): [number, number, number] => [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])];

export const RAINBOW_BANDS: RGB[] = [
  hex('#ff8a8a'),
  hex('#ffb877'),
  hex('#ffe27a'),
  hex('#9be28f'),
  hex('#86c8ff'),
  hex('#9a9cff'),
  hex('#c9a0ff'),
];

export interface RainbowOpts {
  /** Outer half-width and height of the arch, and the thickness of each of the seven bands. */
  a: number;
  b: number;
  band: number;
  /**
   * How far the two legs run straight down below the arch's centre line, where the palace and hills
   * hide their ends.
   */
  legs: number;
}

export const RAINBOW_GLOW = 22;

/** A pastel rainbow arch with a soft white glow around it, translucent so the sky shows through. */
export function rainbow(o: RainbowOpts): Rgba {
  const glow = RAINBOW_GLOW;
  const w = Math.ceil(o.a * 2 + glow * 2);
  const h = glow + o.b + o.legs;
  const img = createRgba(w, h);
  const cx = w / 2;
  const cy = glow + o.b;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - cx;
      // Below the centre line the arch carries straight on as two legs.
      const dy = Math.min(0, y + 0.5 - cy);
      const rad = (a: number, b: number): number => Math.hypot(dx / a, dy / b);
      const outer = rad(o.a, o.b);
      if (outer > 1) {
        // Glow outside the arch: distance in pixels from the outer edge, approximated along the
        // normal.
        const gap = (outer - 1) * Math.min(o.a, o.b);
        if (gap < glow) {
          const a = 0.2 * (1 - gap / glow) ** 2;
          if (a > 0.01) put(img, x, y, [255, 255, 255], a);
        }
        continue;
      }
      let band = -1;
      for (let k = 0; k < RAINBOW_BANDS.length; k++) {
        if (rad(o.a - k * o.band, o.b - k * o.band) <= 1) band = k;
      }
      const inner = rad(o.a - RAINBOW_BANDS.length * o.band, o.b - RAINBOW_BANDS.length * o.band) <= 1;
      if (inner || band < 0) continue;
      // Inside band k means inside ellipse k; the innermost ellipse that still contains the pixel
      // is the band it belongs to.
      const c = RAINBOW_BANDS[band]!;
      // A pale line at each band's outer edge and a soft sheen toward the crown make the colours
      // glow.
      const edge = rad(o.a - band * o.band, o.b - band * o.band);
      const sheen = edge > 1 - 1.6 / Math.min(o.a, o.b) ? 0.35 : 0;
      const lifted = mix(c, [255, 255, 255], sheen);
      put(img, x, y, lifted, 0.82);
    }
  }
  return img;
}

function put(img: Rgba, x: number, y: number, c: RGB, a: number): void {
  const i = (y * img.width + x) * 4;
  img.data[i] = Math.round(c[0]);
  img.data[i + 1] = Math.round(c[1]);
  img.data[i + 2] = Math.round(c[2]);
  img.data[i + 3] = Math.round(a * 255);
}
