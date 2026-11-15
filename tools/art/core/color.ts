import { clamp } from '../../../src/shared/math';

export type RGB = readonly [number, number, number];

export function hex(s: string): RGB {
  const h = s.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
export function toHex(c: RGB): string {
  return (
    '#' +
    c
      .map((v) =>
        Math.round(clamp(v, 0, 255))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

const toLin = (c: number): number => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const fromLin = (v: number): number => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

export function toOklab(c: RGB): [number, number, number] {
  const r = toLin(c[0]),
    g = toLin(c[1]),
    b = toLin(c[2]);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToLinear(L: number, a: number, b: number): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function fromOklab(L: number, a: number, b: number): RGB {
  const [r, g, bl] = oklabToLinear(L, a, b);
  return [fromLin(clamp(r, 0, 1)), fromLin(clamp(g, 0, 1)), fromLin(clamp(bl, 0, 1))];
}

export function toOklch(c: RGB): [number, number, number] {
  const [L, a, b] = toOklab(c);
  return [L, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360];
}

function inGamut(L: number, C: number, h: number): boolean {
  const hr = (h * Math.PI) / 180;
  const [r, g, b] = oklabToLinear(L, C * Math.cos(hr), C * Math.sin(hr));
  const e = 1e-4;
  return r >= -e && r <= 1 + e && g >= -e && g <= 1 + e && b >= -e && b <= 1 + e;
}

/** OKLCH to sRGB, reducing chroma until the color fits the sRGB gamut. */
export function fromOklch(L: number, C: number, h: number): RGB {
  const Lc = clamp(L, 0, 1);
  let lo = 0,
    hi = Math.max(0, C);
  if (!inGamut(Lc, hi, h)) {
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(Lc, mid, h)) lo = mid;
      else hi = mid;
    }
    hi = lo;
  }
  const hr = (h * Math.PI) / 180;
  return fromOklab(Lc, hi * Math.cos(hr), hi * Math.sin(hr));
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  const A = toOklab(a),
    B = toOklab(b);
  return fromOklab(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}

/** Shortest signed angular difference b - a in degrees. */
const hueDelta = (a: number, b: number): number => ((((b - a) % 360) + 540) % 360) - 180;

export interface RampOpts {
  /** Number of colors, darkest first. Default 5. */
  steps?: number;
  /** Lightness offsets, one per step, darkest first. Overrides the default curve. */
  lightness?: readonly number[];
  /** Hue (degrees) that shadows lean toward. Default 285 (violet-blue). */
  shadowHue?: number;
  /** Hue (degrees) that highlights lean toward. Default 85 (warm yellow). */
  lightHue?: number;
  /** Scales the overall lightness spread. Default 1. */
  contrast?: number;
  /** Scales how far hues lean. Default 1. */
  lean?: number;
  /** Scales chroma. Default 1. */
  chroma?: number;
}

const DEFAULT_L: Record<number, readonly number[]> = {
  3: [-0.17, 0, 0.12],
  4: [-0.2, -0.08, 0.04, 0.14],
  5: [-0.24, -0.12, 0, 0.09, 0.18],
  6: [-0.28, -0.17, -0.07, 0.03, 0.12, 0.2],
};

/** Builds a hand-tunable ramp: cooler, slightly richer shadows; warmer, softer highlights. */
export function ramp(base: RGB | string, o: RampOpts = {}): RGB[] {
  const b = typeof base === 'string' ? hex(base) : base;
  const steps = o.steps ?? 5;
  const offs = o.lightness ?? DEFAULT_L[steps] ?? DEFAULT_L[5]!;
  const [L0, C0, h0] = toOklch(b);
  const contrast = o.contrast ?? 1;
  const lean = o.lean ?? 1;
  const shadowHue = o.shadowHue ?? 285;
  const lightHue = o.lightHue ?? 85;
  const out: RGB[] = [];
  const baseIdx = offs.indexOf(0);
  for (let i = 0; i < steps; i++) {
    const off = offs[i]! * contrast;
    const L = clamp(L0 + off, 0.1, 0.985);
    const k = off < 0 ? Math.min(1, -off / 0.26) : Math.min(1, off / 0.2);
    const target = off < 0 ? shadowHue : lightHue;
    const pull = off < 0 ? 0.42 * lean : 0.2 * lean;
    const h = h0 + hueDelta(h0, target) * pull * k;
    const chromaScale = (off < 0 ? 1 + 0.12 * k : 1 - 0.28 * k) * (o.chroma ?? 1);
    const floor = off < 0 ? 0.02 * k : 0;
    out.push(fromOklch(L, Math.max(C0 * chromaScale, C0 > 0.015 ? 0 : floor), h));
  }
  if (baseIdx >= 0) out[baseIdx] = b;
  return out;
}

/** Darkens toward a saturated shadow color for outlines. */
export function outlineOf(c: RGB, amount = 0.32, hue = 300): RGB {
  const [L, C, h] = toOklch(c);
  const nh = h + hueDelta(h, hue) * 0.45;
  return fromOklch(clamp(L - amount, 0.08, 0.5), Math.min(0.14, C * 0.9 + 0.025), nh);
}
