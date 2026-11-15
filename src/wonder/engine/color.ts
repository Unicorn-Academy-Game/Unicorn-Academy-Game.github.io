import { clamp, lerp, wrap } from './ease';

/** A colour as red, green and blue from 0 to 255. */
export type RGB = readonly [number, number, number];

/** From a `#rrggbb` string. Only the form the games write down is accepted. */
export function hex(value: string): RGB {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
  if (!m) throw new Error(`not a colour: ${value}`);
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}

/** Hue in turns (0 to 1), saturation and lightness from 0 to 1. */
export function hsl(h: number, s: number, l: number): RGB {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => {
    const k = wrap(n + h * 12, 12);
    return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
  };
  return [Math.round(f(0)), Math.round(f(8)), Math.round(f(4))];
}

export const mix = (a: RGB, b: RGB, t: number): RGB => [
  Math.round(lerp(a[0], b[0], t)),
  Math.round(lerp(a[1], b[1], t)),
  Math.round(lerp(a[2], b[2], t)),
];

export const lighten = (c: RGB, t: number): RGB => mix(c, [255, 255, 255], t);
export const darken = (c: RGB, t: number): RGB => mix(c, [0, 0, 0], t);

/** A CSS colour string. Alpha is held to 0 and 1. */
export const css = (c: RGB, a = 1): string => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${clamp(a).toFixed(3)})`;

/**
 * One shade in sixteen of each channel, so a picture made for a colour can be shared by every
 * colour near it.
 */
export const bucket = (r: number, g: number, b: number): number =>
  (Math.round(clamp(r, 0, 255) / 17) << 8) |
  (Math.round(clamp(g, 0, 255) / 17) << 4) |
  Math.round(clamp(b, 0, 255) / 17);

/** The colour a bucket stands for. Black, white and every grey in between come out exactly. */
export const unbucket = (key: number): RGB => [((key >> 8) & 15) * 17, ((key >> 4) & 15) * 17, (key & 15) * 17];

/** Named colours the games share, so the same pink is the same pink everywhere. */
export const COLORS = {
  white: [255, 255, 255],
  cream: [255, 244, 214],
  gold: [255, 213, 94],
  amber: [255, 170, 60],
  orange: [255, 140, 70],
  coral: [255, 111, 105],
  red: [255, 82, 96],
  rose: [255, 122, 200],
  pink: [255, 160, 214],
  magenta: [226, 96, 226],
  violet: [155, 107, 255],
  indigo: [96, 96, 238],
  blue: [90, 160, 255],
  sky: [128, 214, 255],
  cyan: [95, 227, 215],
  mint: [124, 236, 176],
  lime: [190, 240, 110],
  green: [96, 214, 120],
} as const satisfies Record<string, RGB>;

/** The seven bands of a rainbow, outside to inside. */
export const RAINBOW: readonly RGB[] = [
  COLORS.red,
  COLORS.orange,
  COLORS.gold,
  COLORS.green,
  COLORS.sky,
  COLORS.indigo,
  COLORS.violet,
];
